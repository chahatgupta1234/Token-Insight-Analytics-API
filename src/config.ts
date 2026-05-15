import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Define a schema for the expected environment variables
export const configSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive("Port number must be a positive integer").default(3000),
    HYPERLIQUID_BASE_URL: z.string().nonempty("Hyperliquid base URL is required"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    LLM_MODEL: z.string().default("gemini-2.5-flash"),
    GEMINI_API_KEY: z.string().nonempty("GEMINI_API_KEY is required"),
    LLM_PROVIDER: z.enum(["gemini"]).default("gemini"),
});

//parse env variables and validate them
export const config = configSchema.parse(process.env);
