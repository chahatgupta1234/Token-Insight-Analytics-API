# Token-Insight-Analytics-API

## Docker Setup

### 1. Install Docker

Install Docker Desktop for your operating system and start it.

Check Docker is working:

```bash
docker --version
docker compose version
```

### 2. Create `.env`

Copy the example file:

```bash
cp .env.example .env
```

Edit `.env` and set your Gemini key:

```bash
GEMINI_API_KEY=your-real-gemini-key
```

Keep this value private. Do not commit `.env`.

### 3. Build And Run

From the project root:

```bash
docker compose up --build
```

The API will run at:

```text
http://localhost:3000
```

### 4. Test The API

Health check:

```bash
curl http://localhost:3000/health
```

Token insight:

```bash
curl --location --request POST 'http://localhost:3000/api/token/bitcoin/insight' \
  --header 'Content-Type: application/json' \
  --data '{"vs_currency":"usd","history_days":10}'
```

HyperLiquid PnL:

```bash
curl --location 'http://localhost:3000/api/hyperliquid/0xab11bfc2e491378b79675dc3e996ed01ea034d5f/pnl?start=2025-09-25&end=2025-09-30'
```

### 5. Stop The App

Press `Ctrl+C`, then run:

```bash
docker compose down
```

### Useful Docker Commands

Rebuild after code changes:

```bash
docker compose up --build
```

Run in background:

```bash
docker compose up --build -d
```

See logs:

```bash
docker compose logs -f api
```

Stop background container:

```bash
docker compose down
```
