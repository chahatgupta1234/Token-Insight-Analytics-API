import axios from "axios";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import { llmInsightSchema } from "../schemas/tokenSchema.js";
import type { LLMInsight, TokenData } from "../types/index.js";
import { config } from "../config.js";
import { buildTokenInsightPrompt, tokenInsightPromptVersion } from "../prompts/tokenInsightPrompt.js";
import { retryOnce } from "../utils/retryOnce.js";


export class LLMInsightService {
    private model = config.LLM_MODEL;
    private provider = config.LLM_PROVIDER;

    async generateInsight(token: TokenData): Promise<LLMInsight> {
        const startedAt = Date.now();
        const prompt = buildTokenInsightPrompt(token);
        try {
            const content = await this.generateCompletion(prompt, token, startedAt);

            const parsed = JSON.parse(content);

            return llmInsightSchema.parse(parsed);

        } catch (error) {
            if(axios.isAxiosError(error)){  
            throw this.toAppError(error);
            }

            logger.error(error, "Error parsing LLM response");
            throw new AppError("LLM_INVALID_RESPONSE", 500, "LLM response was not valid JSON");
        }
    }

    private async generateCompletion(prompt: string, token: TokenData, startedAt: number): Promise<string> {
        logger.info(
            {
                provider: this.provider,
                model: this.model,
                tokenId: token.id,
                symbol: token.symbol,
                promptVersion: tokenInsightPromptVersion,
            },
            "Gemini request started"
        );

        const response = await retryOnce(() =>
            axios.post(
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
            )
        );

        logger.info(
            {
                provider: this.provider,
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

    private toAppError(error: unknown): AppError {
        if (error instanceof AppError) {
            return error;
        }

        if (!axios.isAxiosError(error)) {
            logger.error(error, "Error generating insight");
            return new AppError("LLM_INSIGHT_ERROR", 500, "Failed to generate insight from LLM");
        }

        const status = error.response?.status;
        const retryAfter = error.response?.headers["retry-after"];
        logger.error({ status, retryAfter, provider: this.provider, model: this.model, message: error.message }, "Error generating insight");

        if (status === 401 || status === 403) {
            return new AppError("LLM_UNAUTHORIZED", status, "Gemini rejected the API key");
        }

        if (status === 429) {
            const message = retryAfter
                ? `Gemini rate limit exceeded. Retry after ${retryAfter} seconds`
                : "Gemini rate limit exceeded";
            return new AppError("LLM_RATE_LIMITED", 429, message);
        }

        return new AppError("LLM_INSIGHT_ERROR", 500, "Failed to generate insight from LLM");
    }
}

export const llmInsightService = new LLMInsightService();
