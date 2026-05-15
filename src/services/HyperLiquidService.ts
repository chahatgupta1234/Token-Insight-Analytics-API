import axios from "axios";
import { config } from "../config.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import type {
    HyperLiquidCandle,
    HyperLiquidClearinghouseState,
    HyperLiquidFill,
    HyperLiquidFunding,
    HyperLiquidPnlResponse,
    HyperLiquidPosition,
} from "../types/hyperliquid.js";
import { buildClosePricesByCoinDay, calculateHyperLiquidPnl, endOfUtcDayMs, startOfUtcDayMs } from "../utils/pnlCalculator.js";
import { retryOnce } from "../utils/retryOnce.js";

class HyperLiquidService {
    private baseUrl = config.HYPERLIQUID_BASE_URL.replace(/\/$/, "");
    private maxFillPages = 5;

    async getDailyPnl(wallet: string, start: string, end: string): Promise<HyperLiquidPnlResponse> {
        const startTime = startOfUtcDayMs(start);
        const endTime = endOfUtcDayMs(end);
        const lastApiCall = new Date().toISOString();

        try {
            const [fills, funding, clearinghouseState] = await Promise.all([
                this.fetchFillsForReconstruction(wallet, endTime),
                this.postInfo<HyperLiquidFunding[]>({
                    type: "userFunding",
                    user: wallet,
                    startTime,
                    endTime,
                }),
                this.postInfo<HyperLiquidClearinghouseState>({
                    type: "clearinghouseState",
                    user: wallet,
                }),
            ]);

            const positions = clearinghouseState.assetPositions ?? [];
            const candlesByCoin = await this.fetchCandlesForPnl(fills, positions, startTime, endTime);
            logger.info(
                {
                    wallet,
                    fillsFetched: Array.isArray(fills) ? fills.length : 0,
                    fundingEvents: Array.isArray(funding) ? funding.length : 0,
                    currentPositions: positions.length,
                    candleCoins: Object.keys(candlesByCoin).length,
                },
                "HyperLiquid source data fetched"
            );

            return calculateHyperLiquidPnl({
                wallet,
                start,
                end,
                fills: Array.isArray(fills) ? fills : [],
                funding: Array.isArray(funding) ? funding : [],
                positions,
                closePricesByCoinDay: buildClosePricesByCoinDay(candlesByCoin),
                lastApiCall,
            });
        } catch (error) {
            throw this.toAppError(error);
        }
    }

    private async fetchFillsForReconstruction(wallet: string, endTime: number): Promise<HyperLiquidFill[]> {
        const fills: HyperLiquidFill[] = [];
        let startTime = 0;

        for (let page = 0; page < this.maxFillPages; page += 1) {
            const batch = await this.postInfo<HyperLiquidFill[]>({
                type: "userFillsByTime",
                user: wallet,
                startTime,
                endTime,
                aggregateByTime: false,
            });

            const batchFills = Array.isArray(batch) ? batch : [];
            if (batchFills.length === 0) {
                break;
            }

            fills.push(...batchFills);

            if (batchFills.length < 2000) {
                break;
            }

            const lastTime = Math.max(...batchFills.map((fill) => fill.time ?? startTime));
            if (lastTime < startTime) {
                break;
            }

            startTime = lastTime + 1;
        }

        const unique = new Map<string, HyperLiquidFill>();
        for (const fill of fills) {
            const key = fill.hash || `${fill.coin}:${fill.time}:${fill.tid ?? ""}:${fill.px ?? ""}:${fill.sz ?? ""}:${fill.side ?? ""}`;
            unique.set(key, fill);
        }

        return Array.from(unique.values()).sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    }

    private async fetchCandlesForPnl(
        fills: HyperLiquidFill[],
        positions: HyperLiquidPosition[],
        startTime: number,
        endTime: number
    ): Promise<Record<string, HyperLiquidCandle[]>> {
        const coins = Array.from(new Set(
            [
                ...fills.map((fill) => fill.coin),
                ...positions
                    .map((assetPosition) => assetPosition.position)
                    .filter((position) => position?.coin && Number(position.szi) !== 0)
                    .map((position) => position?.coin),
            ]
                .filter((coin): coin is string => Boolean(coin && !coin.startsWith("@")))
        ));

        const candlePairs = await Promise.all(coins.map(async (coin) => {
            const candles = await this.postInfo<HyperLiquidCandle[]>({
                type: "candleSnapshot",
                req: {
                    coin,
                    interval: "1d",
                    startTime,
                    endTime,
                },
            });

            return [coin, Array.isArray(candles) ? candles : []] as const;
        }));

        return Object.fromEntries(candlePairs);
    }

    private async postInfo<T>(body: Record<string, unknown>): Promise<T> {
        logger.info({ provider: "hyperliquid", type: body.type }, "HyperLiquid request started");

        const response = await retryOnce(() =>
            axios.post(`${this.baseUrl}/info`, body, {
                headers: {
                    "Content-Type": "application/json",
                },
                timeout: 10000,
            })
        );

        logger.info({ provider: "hyperliquid", type: body.type, status: response.status }, "HyperLiquid request completed");

        return response.data as T;
    }

    private toAppError(error: unknown): AppError {
        if (error instanceof AppError) {
            return error;
        }

        if (!axios.isAxiosError(error)) {
            logger.error(error, "Unexpected HyperLiquid error");
            return new AppError("HYPERLIQUID_API_ERROR", 502, "HyperLiquid API request failed");
        }

        const status = error.response?.status;
        const retryAfter = error.response?.headers["retry-after"];
        logger.error({ status, retryAfter, message: error.message }, "HyperLiquid API request failed");

        if (status === 429) {
            return new AppError(
                "HYPERLIQUID_RATE_LIMITED",
                429,
                retryAfter
                    ? `HyperLiquid rate limit exceeded. Retry after ${retryAfter} seconds`
                    : "HyperLiquid rate limit exceeded"
            );
        }

        return new AppError("HYPERLIQUID_API_ERROR", 502, "HyperLiquid API request failed");
    }
}

export const hyperLiquidService = new HyperLiquidService();
