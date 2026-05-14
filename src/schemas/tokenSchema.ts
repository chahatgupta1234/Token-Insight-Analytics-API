import { z } from "zod";

export const tokenSchema = z.object({
    vs_currency: z.string().default("usd"),
    days: z.string().optional(),
});

export const tokenResponseSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  market_data: z.object({
    current_price: z.record(z.string(),z.number()),
    market_cap: z.record(z.string(), z.number().nullable()),
    total_volume: z.record(z.string(), z.number().nullable()),
    price_change_percentage_24h: z.number()
  })    
})

export const llmInsightSchema = z.object({
  reasoning: z.string(),
  sentiment: z.enum(['Bullish', 'Neutral', 'Bearish'])
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;
