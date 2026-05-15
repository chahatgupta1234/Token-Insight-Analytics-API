export interface HyperLiquidPnlDailyRow {
    date: string;
    realized_pnl_usd: number;
    unrealized_pnl_usd: number;
    fees_usd: number;
    funding_usd: number;
    net_pnl_usd: number;
    equity_usd: number;
}

export interface HyperLiquidPnlResponse {
    wallet: string;
    start: string;
    end: string;
    daily: HyperLiquidPnlDailyRow[];
    summary: {
        total_realized_usd: number;
        total_unrealized_usd: number;
        total_fees_usd: number;
        total_funding_usd: number;
        net_pnl_usd: number;
    };
    diagnostics: {
        data_source: "hyperliquid_api";
        last_api_call: string;
        raw_counts: {
            fills_fetched: number;
            fills_in_range: number;
            funding_events: number;
            current_open_positions: number;
            candle_coins: number;
            close_price_points: number;
        };
        warnings: string[];
        notes: string;
    };
}

export interface HyperLiquidFill {
    coin?: string;
    px?: string;
    sz?: string;
    side?: "B" | "A" | string;
    dir?: string;
    startPosition?: string;
    closedPnl?: string;
    fee?: string;
    time?: number;
    hash?: string;
    tid?: number;
}

export interface HyperLiquidFunding {
    time?: number;
    coin?: string;
    usdc?: string;
    funding?: string;
    amount?: string;
    delta?: {
        usdc?: string;
    };
}

export interface HyperLiquidPosition {
    position?: {
        coin?: string;
        szi?: string;
        entryPx?: string;
        unrealizedPnl?: string;
    };
}

export interface HyperLiquidClearinghouseState {
    assetPositions?: HyperLiquidPosition[];
}

export interface HyperLiquidCandle {
    t?: number;
    T?: number;
    c?: string;
}
