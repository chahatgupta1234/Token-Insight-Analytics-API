Now let me finalize and show you the updated plan with all 3 changes applied to the main document:

---

## **Plan: Token Insight & HyperLiquid PnL Backend (Production-Ready) — UPDATED**

### **TL;DR**
Build a clean, strongly-typed Node.js/Express backend with real HyperLiquid integration, provider-agnostic LLM support (OpenRouter free models), comprehensive Zod validation at all layers, and structured error handling. Focus on correctness and maintainability over infrastructure. Two APIs deliver token insights and precise daily PnL calculations with request correlation IDs, in-memory caching, and production-grade logging.

---

### **Steps**

**Phase 1: Project Foundation & Core Architecture**

1. Initialize Node.js/Express + TypeScript with strict mode (`tsconfig.json`: `strict: true`, `noImplicitAny: true`)
2. Setup Pino logger with JSON output, request correlation IDs (auto-generated UUID per request via middleware)
3. Create typed architecture layers:
   - `src/schemas/` — Zod schemas for all inputs/outputs (validation at boundaries)
   - `src/types/` — TypeScript interfaces (Token, WalletActivity, DailyPnL, LLMInsight)
   - `src/errors/` — Custom `AppError` class with code + message + HTTP status
   - `src/utils/` — Pure utility functions (PnL calculations, formatters, validators)
   - `src/services/` — External API clients (CoinGeckoService, HyperLiquidService, LLMInsightService)
   - `src/middleware/` — Express middleware (logging, error handling, validation)
   - `src/controllers/` — Route handlers
   - `src/routes/` — Route definitions
4. Setup in-memory caching with NodeCache (options: `stdTTL: 300` for 5min)
5. Docker: Single alpine Node image, multi-stage build, expose 3000
6. Environment: `.env.example` with OPENROUTER_API_KEY, HYPERLIQUID_BASE_URL (if needed)

**Phase 2: Validation & Error Handling Infrastructure** *(parallel with Phase 1)*

7. Create Zod schemas:
   - `RequestSchemas` — Token request (`vs_currency`, `history_days` params), HyperLiquid query (wallet, date range)
   - `ResponseSchemas` — Both API responses (token insight, daily PnL breakdown)
   - `ExternalSchemas` — CoinGecko response, HyperLiquid data, LLM JSON output
8. Create `AppError` class:
   - Properties: `code` (NOT_FOUND, VALIDATION_ERROR, AI_ERROR, etc.), `message`, `statusCode`
   - Factory methods: `AppError.badRequest()`, `AppError.notFound()`, `AppError.validationError()`, `AppError.externalFailure()`
9. Middleware: Request validation (parse + Zod), error boundary (catch all errors, log with requestId, return structured response)
10. Response formatter: Wrap all responses in `{ success: true/false, data: {...}, error: {...} }`

**Phase 3: Token Insight API (CoinGecko + LLM)**

11. Implement `CoinGeckoService`:
    - `getTokenData(id: string, vs_currency: string): Promise<TokenData>`
    - Fetch from `/coins/{id}` (market cap, current price, 24h volume, price_change_24h)
    - Validate response with Zod `ExternalSchemas.coinGeckoResponse`
    - Throw `AppError.externalFailure({ code: "COINGECKO_API_ERROR" })` on failure
    - Pino log: requestId, token ID, response latency
12. Implement in-memory caching layer for CoinGecko:
    - Key format: `coingecko:bitcoin:usd`
    - TTL: 5 minutes
    - Bypass cache with `?bypassCache=true` query param (optional)
13. Implement `LLMInsightService` (provider-agnostic):
    - `generateInsight(tokenData: TokenData): Promise<LLMInsight>`
    - Build structured prompt: "Given token: {name} ({symbol}), current price: ${price}, market cap: ${cap}, 24h volume: ${volume}, price change: {change}%. Return ONLY valid JSON: { reasoning: string, sentiment: 'Bullish'|'Neutral'|'Bearish' }"
    - Use OpenRouter API with free model: `meta-llama/llama-3.3-70b-instruct:free` or `mistralai/mistral-7b-instruct:free`
    - Timeout: 10 seconds, max 1 retry on timeout
    - Parse response, validate with Zod `LLMInsight` schema
    - Log: requestId, prompt, response time, retry count
    - Throw `AppError.externalFailure({ code: "LLM_ERROR" })` if invalid JSON or timeout
14. Implement `POST /api/token/:id/insight` controller:
    - Validate request body (Zod RequestSchemas)
    - Call CoinGeckoService (with cache check)
    - If token not found → throw `AppError.notFound({ code: "TOKEN_NOT_FOUND" })` → **404**
    - Call LLMInsightService
    - Assemble response: { source, token, insight, model: { provider: "openrouter", model: "..." } }
    - Validate final response with Zod ResponseSchemas before returning
    - Comprehensive error handling per step

**Phase 4: HyperLiquid PnL API (Core Business Logic)**

15. Design highly testable pure utility functions (`src/utils/pnlCalculator.ts`):
    - `calculateRealizedPnL(trades: Trade[]): number` — Sum PnL from closed trades
    - `calculateUnrealizedPnL(positions: Position[], dailyClosePrice: Record<string, number>): number` — Mark-to-market open positions
    - `aggregateDailyPnL(activity: WalletActivityData, dateRange: DateRange): DailyPnL[]` — Group by date, calculate realized + unrealized + fees + funding
    - `calculateEquityCurve(dailyPnL: DailyPnL[], startingEquity: number): EquityCurve` — Running equity sum
    - All functions: pure (no side effects), highly testable
16. Implement `HyperLiquidService`:
    - `getWalletActivity(wallet: string, startDate: Date, endDate: Date): Promise<WalletActivityData>`
    - Query HyperLiquid API (determine endpoint; no wallet key assumption unless API requires)
    - Validate response with Zod `ExternalSchemas.hyperLiquidResponse`
    - Transform to typed `WalletActivityData` (trades, positions, funding, fees)
    - Handle rate limits: 429 response → throw `AppError.externalFailure()` with retry-after
    - Log: requestId, wallet, date range, data points fetched, API latency
    - Throw `AppError.notFound()` if wallet invalid or no data
17. Implement `GET /api/hyperliquid/:wallet/pnl?start=YYYY-MM-DD&end=YYYY-MM-DD` controller:
    - Validate params: wallet format, date range parsing, start < end, date range < 365 days (reasonable limit)
    - If wallet invalid or not found → throw `AppError.notFound({ code: "WALLET_NOT_FOUND" })` → **404**
    - Call HyperLiquidService
    - Call PnL calculator functions in sequence
    - Assemble response: daily breakdown, summary (total_realized, total_unrealized, total_fees, total_funding, net_pnl), diagnostics (last_api_call, data_source, notes on calculations)
    - Validate response structure with Zod before returning
18. Logging: requestId in all logs, trace each calculation step, final result summary

**Phase 5: Shared Infrastructure & Health**

19. Implement `GET /health` endpoint:
    - Returns `{ success: true, status: "ok", timestamp: ISO8601 }`
    - Used for liveness checks
20. Request middleware:
    - Generate `requestId` (UUID or short ID)
    - Add to res.locals for logging
    - Log HTTP method, path, status, duration (in ms)
21. Comprehensive logging:
    - Start request: `{ level: "info", requestId, method, path }`
    - External API calls: `{ level: "info", requestId, service: "coingecko", latency_ms, status }`
    - Errors: `{ level: "error", requestId, error.code, error.message, status_code }`
    - Response: `{ level: "info", requestId, status, duration_ms }`

**Phase 6: Testing & Documentation**

22. Unit tests (Jest fixtures):
    - `__tests__/utils/pnlCalculator.test.ts` — Test pure functions:
      - Realized PnL: closed trades, multiple days, zero fees
      - Unrealized PnL: mark-to-market logic, price changes
      - Daily aggregation: gap dates, multiple transactions per day
      - Equity curve: running sum correctness
    - `__tests__/services/CoinGeckoService.test.ts` — Mock axios/fetch, test caching, rate limits
    - `__tests__/services/LLMInsightService.test.ts` — Mock HTTP, test JSON parsing, timeout/retry
    - `__tests__/services/HyperLiquidService.test.ts` — Mock data, test transformation
    - `__tests__/schemas/validation.test.ts` — Test Zod schemas with valid/invalid inputs
23. Integration tests:
    - `__tests__/integration/token-insight.test.ts` — Full flow, mock external APIs
    - `__tests__/integration/hyperliquid-pnl.test.ts` — Full flow, verify response structure
24. Swagger/OpenAPI documentation:
    - Auto-generate via JSDoc or swagger.yaml
    - Document both endpoints, request/response examples, error codes (400, 404, 422, 502, 500)
    - Available at `GET /api/docs`
25. README with sections:
    - **Quick Start:** npm install, npm run dev
    - **Docker:** docker build, docker run
    - **API Reference:** Both endpoints, curl examples
    - **Architecture Decisions:** Explain why no database/Redis/queues (scope doesn't require distributed workloads or persistence)
    - **Environment Variables:** List all required + optional
    - **Testing:** npm test command
    - **Troubleshooting:** Common errors (rate limits, invalid wallet, LLM timeout)

**Phase 7: Docker Deployment & Final Polish**

26. Dockerfile:
    - Multi-stage: build (node:20), prod (node:20-alpine)
    - COPY only necessary files (package*.json, src, tsconfig.json)
    - RUN npm run build → produces dist/
    - CMD ["node", "dist/index.js"]
    - HEALTHCHECK: curl /health
    - Expose 3000
27. .gitignore: .env, node_modules/, dist/, .DS_Store, *.log
28. GitHub: Clean initial commit, meaningful messages
29. Final verification checklist:
    - `npm test` — All tests pass, >80% coverage
    - `npm run lint` — ESLint clean (no unused vars, proper typing)
    - `npm run build` — TypeScript compiles without errors
    - `docker build && docker run` — Starts successfully, health check passes
    - Manual: Both endpoints work, error handling tested, logs visible

---

### **Error Handling — HTTP Status Codes (Updated)**

| Case | Status | Code | Rationale |
|------|--------|------|-----------|
| Malformed JSON/syntax | **400** | `BAD_REQUEST` | Request format invalid |
| Semantic validation fails (invalid date range, unknown token in schema) | **422** | `VALIDATION_ERROR` | Parsed OK, but semantically wrong |
| Token ID doesn't exist | **404** | `TOKEN_NOT_FOUND` | Resource doesn't exist (valid request format) |
| Wallet address doesn't exist | **404** | `WALLET_NOT_FOUND` | Resource doesn't exist (valid request format) |
| CoinGecko/HyperLiquid/LLM API fails | **502** | `[SERVICE]_API_ERROR` | External provider failure |
| Unexpected internal error | **500** | `INTERNAL_ERROR` | Bug or programming error |

---

### **LLM Integration (Updated)**

- **Service:** `LLMInsightService` (provider-agnostic)
- **Provider:** OpenRouter free models
  - Option 1: `meta-llama/llama-3.3-70b-instruct:free`
  - Option 2: `mistralai/mistral-7b-instruct:free`
- **Validation:** Zod schema on AI response before returning
- **Timeout:** 10s max, 1 retry on timeout
- **Prompt:** "Return ONLY valid JSON. No markdown or explanations."

---

### **Verification Checklist**

✅ **Local Development:**
- `npm install && npm run dev` → Backend runs on :3000
- `curl http://localhost:3000/health` → `{ "success": true, "status": "ok" }`
- `POST /api/token/bitcoin/insight` → Valid insight response with structured JSON
- `GET /api/hyperliquid/:wallet/pnl?start=...&end=...` → Daily breakdown + summary
- Invalid token ID → **404** `{ success: false, error: { code: "TOKEN_NOT_FOUND" } }`
- Invalid date format → **422** `{ success: false, error: { code: "VALIDATION_ERROR" } }`
- LLM timeout → **502** `{ success: false, error: { code: "LLM_ERROR" } }`

✅ **Testing:**
- `npm test` — All tests pass, PnL calculator logic verified with fixtures
- `npm run lint` — Clean ESLint output
- `npm run build` — TypeScript compiles without errors

✅ **Docker:**
- `docker build -t backend . && docker run -p 3000:3000 --env-file .env backend`
- Health check: `curl http://docker:3000/health` ✓
- Logs visible in container output (structured JSON)

✅ **Documentation:**
- README with architecture decisions section
- Swagger UI at `/api/docs` with both endpoints documented
- .env.example complete and up-to-date
- GitHub repo clean, .gitignore proper

---

## **Summary of Changes**

✅ **LLM Model Updated:**  
`meta-llama/llama-3.3-70b-instruct:free` or `mistralai/mistral-7b-instruct:free` (removed outdated Llama 2)

✅ **HTTP Status Codes Clarified:**  
- 400 → malformed request  
- 422 → semantic validation failure  
- **404 → token/wallet not found** (changed from 400)  
- 502 → external API failure  
- 500 → internal error

✅ **Language Adjusted:**  
"highly testable pure business logic" (replaced "100% testable")

---

**Ready to proceed with Phase 1 implementation?** ✨