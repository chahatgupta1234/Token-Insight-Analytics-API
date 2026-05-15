export interface TokenData {
    id: string;
    symbol: string;
    name: string;
    vs_currency: string;
    market_data: {
        current_price: number;
        market_cap: number;
        total_volume: number;
        price_change_percentage_24h: number;
    };
    history: {
        days: number;
        start_price: number;
        end_price: number;
        price_change_percentage: number;
    };
}

export interface LLMInsight {
  reasoning: string;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
}

export interface TokenInsightResponse {
  source: string;
  token: {
    id: string;
    symbol: string;
    name: string;
    market_data: Record<string, number | string>;
    history: TokenData["history"];
  };
  insight: LLMInsight;
  model: {
    provider: string;
    model: string;
  };
}
