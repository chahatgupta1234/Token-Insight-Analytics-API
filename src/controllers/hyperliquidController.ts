import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { logger } from "../logger.js";
import { hyperliquidPnlQuerySchema, hyperliquidWalletParamsSchema } from "../schemas/hyperliquidSchema.js";
import { hyperLiquidService } from "../services/HyperLiquidService.js";

const validationMessage = (error: unknown): string => {
    if (typeof error === "object" && error !== null && "issues" in error) {
        const issues = error.issues as Array<{ message?: string }>;
        return issues.map((issue) => issue.message).filter(Boolean).join("; ");
    }

    return "Invalid request";
};

export async function getWalletPnl(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();

    try {
        const params = hyperliquidWalletParamsSchema.safeParse(req.params);
        const query = hyperliquidPnlQuerySchema.safeParse(req.query);

        if (!params.success) {
            throw new AppError("VALIDATION_ERROR", 400, validationMessage(params.error));
        }

        if (!query.success) {
            throw new AppError("VALIDATION_ERROR", 400, validationMessage(query.error));
        }

        logger.info(
            {
                wallet: params.data.wallet,
                start: query.data.start,
                end: query.data.end,
            },
            "HyperLiquid PnL request started"
        );

        const pnl = await hyperLiquidService.getDailyPnl(
            params.data.wallet.toLowerCase(),
            query.data.start,
            query.data.end
        );

        logger.info(
            {
                wallet: pnl.wallet,
                start: pnl.start,
                end: pnl.end,
                days: pnl.daily.length,
                durationMs: Date.now() - startedAt,
            },
            "HyperLiquid PnL request completed"
        );

        res.json(pnl);
    } catch (error) {
        next(error);
    }
}
