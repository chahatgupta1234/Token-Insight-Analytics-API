import type { Request, Response, NextFunction } from "express";
import {tokenSchema} from "../schemas/tokenSchema.js";
import { coinGeckoService } from "../services/CoinGeckoService.js";
import { llmInsightService } from "../services/LLMInsightService.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import { config } from "../config.js";



export async function getTokenInsight(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    try {
        const {id} = req.params;
        if(!id || Array.isArray(id)){
            throw new AppError('VALIDATION_ERROR', 400, 'Token id is required in the path parameters');
        }

        //validating the query parameters
        const queryParams = tokenSchema.parse(req.query);

        logger.info(
            {
                tokenId: id,
                vsCurrency: queryParams.vs_currency,
            },
            "Token insight request started"
        );

        //fetching token data
        const tokenData = await coinGeckoService.getTokenData(id, queryParams.vs_currency);
        logger.info(
            {
                tokenId: id,
                symbol: tokenData.symbol,
                price: tokenData.current_price,
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
            success: true,
            data:{
                source: 'coingecko',
                token: tokenData,
                insight: llmInsight,
                model:{
                    provider: config.LLM_PROVIDER,
                    model: config.LLM_MODEL,
                }
            }
        });
    } catch (error){
        next(error);
    }
}
