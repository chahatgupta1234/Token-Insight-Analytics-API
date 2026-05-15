import type { TokenData } from "../types/index.js";

export const tokenInsightPromptVersion = "token-insight-v1";

export function buildTokenInsightPrompt(token: TokenData): string {
    return `You are a crypto market analysis assistant.

Analyze the following token market data and produce a concise sentiment assessment.

Token:
- Name: ${token.name}
- Symbol: ${token.symbol}
- Quote Currency: ${token.vs_currency}
- Current Price: ${token.market_data.current_price}
- Market Cap: ${token.market_data.market_cap}
- 24h Trading Volume: ${token.market_data.total_volume}
- 24h Price Change Percentage: ${token.market_data.price_change_percentage_24h}
- History Window Days: ${token.history.days}
- Historical Start Price: ${token.history.start_price}
- Historical End Price: ${token.history.end_price}
- Historical Price Change Percentage: ${token.history.price_change_percentage}

Analysis Guidelines:
- Use only the provided data.
- Consider both 24h movement and the historical window trend.
- Do not invent news, events, partnerships, or future predictions.
- Base reasoning on momentum, liquidity, market capitalization, and recent price movement.
- Keep reasoning concise and professional (max 2 sentences).
- Sentiment must be exactly one of:
  - "Bullish"
  - "Neutral"
  - "Bearish"

Return ONLY valid raw JSON.
Do not include markdown, explanations, or code fences.

Expected JSON format:
{
  "reasoning": "string",
  "sentiment": "Bullish | Neutral | Bearish"
}`;
}
