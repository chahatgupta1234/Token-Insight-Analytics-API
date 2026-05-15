import { z } from "zod";

export const tokenSchema = z.object({
    vs_currency: z.string().default("usd"),
    history_days: z.coerce.number().int().min(1).max(365).default(30),
});

export const tokenResponseSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  market_data: z.object({
    current_price: z.record(z.string(),z.number()),
    market_cap: z.record(z.string(), z.number().nullable()),
    total_volume: z.record(z.string(), z.number().nullable()),
    price_change_percentage_24h: z.number(),
  })    
})

export const llmInsightSchema = z.object({
  reasoning: z.string(),
  sentiment: z.enum(['Bullish', 'Neutral', 'Bearish'])
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;
