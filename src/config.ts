import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const optionalSecret = z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().optional()
);

// Define a schema for the expected environment variables
export const configSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive("Port number must be a positive integer").default(3000),
    HYPERLIQUID_BASE_URL: z.string().nonempty("Hyperliquid base URL is required"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    LLM_PROVIDER: z.enum(["openrouter", "gemini"]).default("openrouter"),
    LLM_MODEL: z.string().default("meta-llama/llama-3.3-70b-instruct:free"),
    GEMINI_API_KEY: optionalSecret,
});

//parse env variables and validate them
export const config = configSchema.parse(process.env);
