import type {
    HyperLiquidCandle,
    HyperLiquidFill,
    HyperLiquidFunding,
    HyperLiquidPnlDailyRow,
    HyperLiquidPnlResponse,
    HyperLiquidPosition,
} from "../types/hyperliquid.js";

const MS_PER_DAY = 86_400_000;

const toNumber = (value: unknown): number => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
};

const roundUsd = (value: number): number => Math.round(value * 100) / 100;

export const toUtcDay = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

export const startOfUtcDayMs = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

export const endOfUtcDayMs = (date: string): number => startOfUtcDayMs(date) + MS_PER_DAY - 1;

export const enumerateUtcDays = (start: string, end: string): string[] => {
    const days: string[] = [];
    for (let current = startOfUtcDayMs(start); current <= startOfUtcDayMs(end); current += MS_PER_DAY) {
        days.push(toUtcDay(current));
    }
    return days;
};

export const buildClosePricesByCoinDay = (candlesByCoin: Record<string, HyperLiquidCandle[]>): Record<string, Record<string, number>> => {
    const result: Record<string, Record<string, number>> = {};

    for (const [coin, candles] of Object.entries(candlesByCoin)) {
        result[coin] = {};
        for (const candle of candles) {
            const timestamp = candle.T ?? candle.t;
            if (timestamp === undefined) {
                continue;
            }

            result[coin][toUtcDay(timestamp)] = toNumber(candle.c);
        }
    }

    return result;
};

const fundingAmount = (event: HyperLiquidFunding): number => {
    return toNumber(event.delta?.usdc ?? event.usdc ?? event.funding ?? event.amount);
};

const currentOpenPositionCount = (positions: HyperLiquidPosition[]): number => {
    return positions.filter((assetPosition) => toNumber(assetPosition.position?.szi) !== 0).length;
};

interface ReconstructedPosition {
    size: number;
    entryPx: number;
}

const fillDelta = (fill: HyperLiquidFill): number => {
    const size = toNumber(fill.sz);
    if (fill.side === "B") {
        return size;
    }

    if (fill.side === "A") {
        return -size;
    }

    if (fill.dir?.includes("Open Long") || fill.dir?.includes("Close Short")) {
        return size;
    }

    if (fill.dir?.includes("Open Short") || fill.dir?.includes("Close Long")) {
        return -size;
    }

    return 0;
};

const updatePosition = (
    current: ReconstructedPosition | undefined,
    fill: HyperLiquidFill
): ReconstructedPosition | undefined => {
    const price = toNumber(fill.px);
    const delta = fillDelta(fill);
    if (!fill.coin || price === 0 || delta === 0) {
        return current;
    }

    const currentSize = current?.size ?? toNumber(fill.startPosition);
    const currentEntry = current?.entryPx ?? price;
    const nextSize = currentSize + delta;

    if (Math.abs(nextSize) < 1e-12) {
        return undefined;
    }

    const sameDirection = currentSize === 0 || Math.sign(currentSize) === Math.sign(delta);
    const increasedPosition = sameDirection && Math.abs(nextSize) > Math.abs(currentSize);

    if (increasedPosition) {
        const nextEntry =
            currentSize === 0
                ? price
                : ((currentEntry * Math.abs(currentSize)) + (price * Math.abs(delta))) / Math.abs(nextSize);

        return {
            size: nextSize,
            entryPx: nextEntry,
        };
    }

    if (Math.sign(nextSize) !== Math.sign(currentSize)) {
        return {
            size: nextSize,
            entryPx: price,
        };
    }

    return {
        size: nextSize,
        entryPx: currentEntry,
    };
};

const reconstructPositionsThrough = (
    positionsByCoin: Map<string, ReconstructedPosition>,
    fills: HyperLiquidFill[],
    cursor: { index: number },
    throughMs: number
): void => {
    while (cursor.index < fills.length) {
        const fill = fills[cursor.index];
        if (!fill) {
            break;
        }

        if (fill.time === undefined || fill.time > throughMs) {
            break;
        }

        if (fill.coin) {
            const updated = updatePosition(positionsByCoin.get(fill.coin), fill);
            if (updated) {
                positionsByCoin.set(fill.coin, updated);
            } else {
                positionsByCoin.delete(fill.coin);
            }
        }

        cursor.index += 1;
    }
};

const calculateUnrealized = (
    positionsByCoin: Map<string, ReconstructedPosition>,
    closePricesByCoinDay: Record<string, Record<string, number>>,
    day: string
): number => {
    let total = 0;

    for (const [coin, position] of positionsByCoin.entries()) {
        const closePrice = closePricesByCoinDay[coin]?.[day];
        if (closePrice === undefined) {
            continue;
        }

        total += (closePrice - position.entryPx) * position.size;
    }

    return total;
};

export function calculateHyperLiquidPnl(input: {
    wallet: string;
    start: string;
    end: string;
    fills: HyperLiquidFill[];
    funding: HyperLiquidFunding[];
    positions: HyperLiquidPosition[];
    closePricesByCoinDay: Record<string, Record<string, number>>;
    lastApiCall: string;
}): HyperLiquidPnlResponse {
    const sortedFills = [...input.fills].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    const positionsByCoin = new Map<string, ReconstructedPosition>();
    const fillCursor = { index: 0 };
    const rangeStartMs = startOfUtcDayMs(input.start);
    const rangeEndMs = endOfUtcDayMs(input.end);
    const fillsInRange = input.fills.filter(
        (fill) => fill.time !== undefined && fill.time >= rangeStartMs && fill.time <= rangeEndMs
    );
    const fundingInRange = input.funding.filter(
        (event) => event.time !== undefined && event.time >= rangeStartMs && event.time <= rangeEndMs
    );
    const candleCoins = Object.keys(input.closePricesByCoinDay);
    const closePricePoints = Object.values(input.closePricesByCoinDay)
        .reduce((total, pricesByDay) => total + Object.keys(pricesByDay).length, 0);
    const openPositionCount = currentOpenPositionCount(input.positions);
    const warnings: string[] = [];
    let syntheticEquity = 0;

    if (fillsInRange.length === 0 && fundingInRange.length === 0 && openPositionCount === 0) {
        warnings.push("No HyperLiquid fills, funding events, or current open positions were returned for this wallet/date range.");
    }

    const daily: HyperLiquidPnlDailyRow[] = enumerateUtcDays(input.start, input.end).map((day) => {
        reconstructPositionsThrough(positionsByCoin, sortedFills, fillCursor, endOfUtcDayMs(day));

        const fillsForDay = input.fills.filter((fill) => fill.time !== undefined && toUtcDay(fill.time) === day);
        const fundingForDay = input.funding.filter((event) => event.time !== undefined && toUtcDay(event.time) === day);

        const realized = fillsForDay.reduce((sum, fill) => sum + toNumber(fill.closedPnl), 0);
        const fees = fillsForDay.reduce((sum, fill) => sum + toNumber(fill.fee), 0);
        const funding = fundingForDay.reduce((sum, event) => sum + fundingAmount(event), 0);
        const unrealized = calculateUnrealized(positionsByCoin, input.closePricesByCoinDay, day);
        const net = realized + unrealized - fees + funding;

        syntheticEquity += net;

        return {
            date: day,
            realized_pnl_usd: roundUsd(realized),
            unrealized_pnl_usd: roundUsd(unrealized),
            fees_usd: roundUsd(fees),
            funding_usd: roundUsd(funding),
            net_pnl_usd: roundUsd(net),
            equity_usd: roundUsd(syntheticEquity),
        };
    });

    const summary = daily.reduce(
        (totals, row) => ({
            total_realized_usd: roundUsd(totals.total_realized_usd + row.realized_pnl_usd),
            total_unrealized_usd: roundUsd(totals.total_unrealized_usd + row.unrealized_pnl_usd),
            total_fees_usd: roundUsd(totals.total_fees_usd + row.fees_usd),
            total_funding_usd: roundUsd(totals.total_funding_usd + row.funding_usd),
            net_pnl_usd: roundUsd(totals.net_pnl_usd + row.net_pnl_usd),
        }),
        {
            total_realized_usd: 0,
            total_unrealized_usd: 0,
            total_fees_usd: 0,
            total_funding_usd: 0,
            net_pnl_usd: 0,
        }
    );

    return {
        wallet: input.wallet,
        start: input.start,
        end: input.end,
        daily,
        summary,
        diagnostics: {
            data_source: "hyperliquid_api",
            last_api_call: input.lastApiCall,
            raw_counts: {
                fills_fetched: input.fills.length,
                fills_in_range: fillsInRange.length,
                funding_events: fundingInRange.length,
                current_open_positions: openPositionCount,
                candle_coins: candleCoins.length,
                close_price_points: closePricePoints,
            },
            warnings,
            notes: "PnL calculated using UTC daily grouping. Realized PnL, fees, and funding come from HyperLiquid wallet events. Unrealized PnL is reconstructed from fills up to each daily close and marked with 1d candle close prices; if older fills are unavailable from HyperLiquid limits, historical open positions before the returned fill history cannot be fully reconstructed. Equity is a synthetic cumulative net PnL curve, not historical account balance.",
        },
    };
}
