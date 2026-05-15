import { z } from "zod";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const isValidUtcDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const daysBetweenInclusive = (start: string, end: string) => {
    const startMs = Date.parse(`${start}T00:00:00.000Z`);
    const endMs = Date.parse(`${end}T00:00:00.000Z`);
    return Math.floor((endMs - startMs) / 86_400_000) + 1;
};

export const hyperliquidWalletParamsSchema = z.object({
    wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Wallet must be a 42-character 0x-prefixed hex address"),
});

export const hyperliquidPnlQuerySchema = z.object({
    start: z.string().regex(dateRegex, "start must use YYYY-MM-DD format").refine(isValidUtcDate, "start must be a valid date"),
    end: z.string().regex(dateRegex, "end must use YYYY-MM-DD format").refine(isValidUtcDate, "end must be a valid date"),
}).superRefine((query, ctx) => {
    const rangeDays = daysBetweenInclusive(query.start, query.end);

    if (rangeDays < 1) {
        ctx.addIssue({
            code: "custom",
            path: ["end"],
            message: "end must be on or after start",
        });
    }

    if (rangeDays > 90) {
        ctx.addIssue({
            code: "custom",
            path: ["end"],
            message: "Date range must not exceed 90 days",
        });
    }
});
