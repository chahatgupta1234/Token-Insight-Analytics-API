import axios from "axios";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import { llmInsightSchema } from "../schemas/tokenSchema.js";
import type { LLMInsight, TokenData } from "../types/index.js";
import { config } from "../config.js";

export class LLMInsightService {
    private provider = config.LLM_PROVIDER;
    private model = config.LLM_MODEL;

    async generateInsight(token: TokenData): Promise<LLMInsight> {
        const startedAt = Date.now();
        const prompt = `Given the token: ${token.name} (${token.symbol})
        Current price: $${token.current_price}
        Market cap: $${token.market_cap}
        24h volume: $${token.total_volume}
        24h price change: ${token.price_change_24h}%

Return ONLY valid JSON (no markdown): {"reasoning": "brief analysis", "sentiment": "Bullish|Neutral|Bearish"}`;

        try {
            const content = await this.generateWithGemini(prompt, token, startedAt);

            const jsonMatch = content.match(/\{.*\}/s);
            if (!jsonMatch) {
                throw new AppError("LLM_INVALID_RESPONSE", 502, "LLM response did not contain valid JSON");
            }

            return llmInsightSchema.parse(JSON.parse(jsonMatch[0]));
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (axios.isAxiosError(error)) {
                const retryAfter = error.response?.headers["retry-after"];
                logger.error(
                    {
                        status: error.response?.status,
                        retryAfter,
                        provider: this.provider,
                        model: this.model,
                        message: error.message,
                    },
                    "Error generating insight"
                );

                if (error.response?.status === 401 || error.response?.status === 403) {
                    throw new AppError(
                        "LLM_UNAUTHORIZED",
                        error.response.status,
                        `${this.provider} rejected the API key`
                    );
                }

                if (error.response?.status === 429) {
                    throw new AppError(
                        "LLM_RATE_LIMITED",
                        429,
                        retryAfter
                            ? `${this.provider} rate limit exceeded. Retry after ${retryAfter} seconds`
                            : `${this.provider} rate limit exceeded`
                    );
                }
            } else {
                logger.error(error, "Error generating insight");
            }

            throw new AppError("LLM_INSIGHT_ERROR", 500, "Failed to generate insight from LLM");
        }
    }


    private async generateWithGemini(prompt: string, token: TokenData, startedAt: number): Promise<string> {
        logger.info(
            {
                provider: "gemini",
                model: this.model,
                tokenId: token.id,
                symbol: token.symbol,
            },
            "Gemini request started"
        );

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
            {
                contents: [
                    {
                        parts: [
                            {
                                text: prompt,
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.5,
                    responseMimeType: "application/json",
                },
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": config.GEMINI_API_KEY,
                },
                timeout: 10000,
            }
        );

        logger.info(
            {
                provider: "gemini",
                model: this.model,
                tokenId: token.id,
                status: response.status,
                durationMs: Date.now() - startedAt,
            },
            "Gemini request completed"
        );

        const parts = response.data.candidates?.[0]?.content?.parts ?? [];
        return parts.map((part: { text?: string }) => part.text ?? "").join("\n");
    }
}

export const llmInsightService = new LLMInsightService();
