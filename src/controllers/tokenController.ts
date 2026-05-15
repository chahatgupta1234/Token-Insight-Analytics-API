import type { Request, Response, NextFunction } from "express";
import {tokenSchema} from "../schemas/tokenSchema.js";
import { coinGeckoService } from "../services/CoinGeckoService.js";
import { llmInsightService } from "../services/LLMInsightService.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import type { TokenData } from "../types/index.js";

const validationMessage = (error: unknown): string => {
    if (typeof error === "object" && error !== null && "issues" in error) {
        const issues = error.issues as Array<{ path?: Array<string | number>; message?: string }>;
        return issues
            .map((issue) => {
                const path = issue.path?.join(".");
                return path ? `${path}: ${issue.message}` : issue.message;
            })
            .filter(Boolean)
            .join("; ");
    }

    return "Invalid request";
};

const tokenResponse = (tokenData: TokenData) => {
    const currency = tokenData.vs_currency.toLowerCase();

    return {
        id: tokenData.id,
        symbol: tokenData.symbol,
        name: tokenData.name,
        market_data: {
            [`current_price_${currency}`]: tokenData.market_data.current_price,
            [`market_cap_${currency}`]: tokenData.market_data.market_cap,
            [`total_volume_${currency}`]: tokenData.market_data.total_volume,
            price_change_percentage_24h: tokenData.market_data.price_change_percentage_24h,
        },
        history: tokenData.history,
    };
};

export async function getTokenInsight(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    try {
        const {id} = req.params;
        if(!id || Array.isArray(id)){
            throw new AppError('VALIDATION_ERROR', 400, 'Token id is required in the path parameters');
        }

        const requestParams = tokenSchema.safeParse({
            ...req.query,
            ...(req.body ?? {}),
        });

        if (!requestParams.success) {
            throw new AppError("VALIDATION_ERROR", 400, validationMessage(requestParams.error));
        }

        logger.info(
            {
                tokenId: id,
                vsCurrency: requestParams.data.vs_currency,
            },
            "Token insight request started"
        );

        //fetching token data
        const tokenData = await coinGeckoService.getTokenData(
            id,
            requestParams.data.vs_currency,
            requestParams.data.history_days
        );
        logger.info(
            {
                tokenId: id,
                symbol: tokenData.symbol,
                price: tokenData.market_data.current_price,
                historyDays: tokenData.history.days,
                durationMs: Date.now() - startedAt,
            },
            "Token data fetched"
        );

        //generating llm insights
        const llmInsight = await llmInsightService.generateInsight(tokenData);
        logger.info(
            {
                tokenId: id,
                sentiment: llmInsight.sentiment,
                durationMs: Date.now() - startedAt,
            },
            "Token insight generated"
        );

        res.json({
            source: 'coingecko',
            token: tokenResponse(tokenData),
            insight: llmInsight,
            model:{
                provider: config.LLM_PROVIDER,
                model: config.LLM_MODEL,
            }
        });
    } catch (error){
        next(error);
    }
}
