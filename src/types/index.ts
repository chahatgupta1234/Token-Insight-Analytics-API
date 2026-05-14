export interface TokenData {
    id: string;
    symbol: string;
    name: string;
    current_price: number;
    market_cap: number;
    total_volume: number;
    price_change_24h: number;
}

export interface LLMInsight {
  reasoning: string;
  sentiment: 'Bullish' | 'Neutral' | 'Bearish';
}

export interface TokenInsightResponse {
  success: true;
  data: {
    source: string;
    token: TokenData;
    insight: LLMInsight;
    model: {
      provider: string;
      model: string;
    };
  };
}