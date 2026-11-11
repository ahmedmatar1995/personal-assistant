# Telegram AI Agent with Web Search

A production-ready Telegram bot powered by Google Gemini and Firecrawl web search, built on Trigger.dev's durable agent framework.

## Features

- **Conversational AI** — Natural language understanding via Google Gemini
- **Web Search** — Real-time information from the internet via Firecrawl
- **Durable Sessions** — Conversation history persists across restarts
- **Smart Tool Use** — Agent decides when to search vs. answer from knowledge
- **Multi-Model Fallback** — Automatic retry with backup models on quota exhaustion
- **Production Ready** — Deployed on Vercel + Trigger.dev

## How It Works

```
User sends message to Telegram bot
         ↓
Telegram webhook → Vercel endpoint
         ↓
Trigger.dev runs durable agent
         ↓
Agent decides: answer directly or search web?
         ↓
   ┌─────────────┬─────────────┐
   ↓ Direct      ↓ Web Search
Gemini model   Firecrawl API → Gemini synthesizes
   └─────────────┴─────────────┘
         ↓
Agent response → Telegram → User
```

**Key capabilities:**
- The agent maintains conversation context across turns
- Web search is transparent — users don't see tool calls
- All interactions are logged in Trigger.dev dashboard

## Quick Start

### 1. Prerequisites

- Node.js 24+
- Telegram account
- [Trigger.dev account](https://cloud.trigger.dev) (free tier available)
- Optional: [Firecrawl API key](https://firecrawl.dev) for higher rate limits

### 2. Clone & Install

```bash
git clone <your-repo-url>
cd ai-agent
npm install
```

### 3. Set Up Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Create a new bot: `/newbot`
3. Follow prompts to set a name and username
4. Copy the bot token (looks like `123456789:ABCdefGHI...`)

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-vercel-app.vercel.app

# Optional (for higher rate limits)
FIRECRAWL_API_KEY=fc-your_api_key_here
```

### 5. Set Up Trigger.dev

```bash
npx trigger.dev@latest login
npx trigger.dev@latest init
```

Follow the prompts to connect your Trigger.dev account. This adds `TRIGGER_SECRET_KEY` to `.env`.

### 6. Run Locally

Terminal 1 — Start Trigger.dev dev server:

```bash
npm run dev
```

Terminal 2 — Expose via ngrok (for Telegram webhook):

```bash
ngrok http 3000
```

Copy the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`) and register it:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://abc123.ngrok.io/webhook/telegram"}'
```

Now message your bot on Telegram — it should respond!

### 7. Deploy to Production

```bash
# Deploy Trigger.dev agent
npx trigger.dev@latest deploy

# Deploy Vercel webhook endpoint
vercel --prod
```

Set environment variables in Vercel:

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_WEBHOOK_URL  # Your vercel app URL
vercel env add FIRECRAWL_API_KEY     # Optional
```

Register the production webhook:

```bash
curl -X POST "https://webhooks.trigger.dev/webhooks/v1/ingest/<YOUR_PROD_KEY>" \
  -H "Content-Type: application/json" \
  -H "x-trigger-secret: <WEBHOOK_SECRET>" \
  -d '{
    "event": { "message": { "chat": { "id": 123 }, "text": "Hello" } }
  }'
```

Alternatively, use the `/setup-webhook` endpoint (see `docs/TELEGRAM_WEBHOOK_ARCHITECTURE.md`).

## Usage Examples

**General knowledge:**
```
User: What is photosynthesis?
Bot:  Photosynthesis is the process by which plants...
```

**Real-time data (uses web search):**
```
User: What's the weather in Paris today?
Bot:  [searches web] It's currently 18°C and partly cloudy in Paris...
```

**Current events (uses web search):**
```
User: Latest news about SpaceX
Bot:  [searches web] According to Space.com, SpaceX recently...
```

**Math (no web search):**
```
User: What's 15% of 200?
Bot:  15% of 200 is 30.
```

## Architecture

```
src/
├── index.ts                      # Hono server (webhook endpoint)
├── trigger/
│   ├── telegram-agent.ts         # Main agent definition
│   ├── telegram-webhook.ts       # Trigger.dev webhook endpoint
│   └── tools/
│       └── web-search.ts         # Firecrawl search tool
└── ...

docs/
├── TELEGRAM_WEBHOOK_ARCHITECTURE.md  # Full system design
├── WEB_SEARCH_SETUP.md               # Web search configuration
└── AGENT_INSTRUCTIONS.md             # Agent behavior & customization
```

**Key components:**

| File | Purpose |
|------|---------|
| `index.ts` | Hono server that receives Telegram webhooks and forwards to Trigger.dev |
| `telegram-agent.ts` | Durable chat agent with Gemini model and tool definitions |
| `telegram-webhook.ts` | Trigger.dev webhook endpoint that handles Telegram updates |
| `web-search.ts` | Tool definition for Firecrawl web search |

## Documentation

- **[Telegram Webhook Architecture](docs/TELEGRAM_WEBHOOK_ARCHITECTURE.md)** — Full system flow, webhook setup, troubleshooting
- **[Web Search Setup](docs/WEB_SEARCH_SETUP.md)** — How web search works, Firecrawl configuration, rate limits
- **[Agent Instructions](docs/AGENT_INSTRUCTIONS.md)** — Agent behavior, tool selection logic, customization guide

## Monitoring

View agent runs, tool calls, and logs:

1. Go to [https://cloud.trigger.dev](https://cloud.trigger.dev)
2. Select your project
3. Click **Sessions** → Find the chat by `chatId`
4. Inspect:
   - User messages
   - Agent decisions (tool calls)
   - Web search queries and results
   - Final responses

## Troubleshooting

### Bot doesn't respond

**Check webhook registration:**
```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

Should show your production URL. If not, re-register with `/setup-webhook`.

**Check Trigger.dev logs:**
Go to dashboard → Latest Runs → Look for errors

### "Rate limit reached" messages

**Cause:** Using Firecrawl free tier or low quota.

**Fix:** Add `FIRECRAWL_API_KEY` from [firecrawl.dev](https://firecrawl.dev).

### Agent doesn't use web search

**Cause:** System prompt may be unclear or tool description too restrictive.

**Fix:** Edit `system` prompt in `src/trigger/telegram-agent.ts` or test with explicit queries like "Search for X".

### "AI quota exhausted" errors

**Cause:** Google Gemini free tier rate limit hit.

**Fix:**
- Wait a few minutes (quota resets hourly)
- Add Google AI API key for higher limits
- Switch to paid tier

See `docs/TELEGRAM_WEBHOOK_ARCHITECTURE.md` for detailed troubleshooting.

## Customization

### Change Agent Personality

Edit the `system` prompt in `src/trigger/telegram-agent.ts`:

```typescript
system: `You are a professional research assistant.
Always cite sources. Use formal language.`
```

### Add More Tools

Create new tools in `src/trigger/tools/`:

```typescript
// calculator.ts
export const calculatorTool = tool({
  description: 'Perform math calculations',
  inputSchema: z.object({ expression: z.string() }),
  execute: async ({ expression }) => ({ result: evaluate(expression) }),
});

// Add to telegram-agent.ts
const tools = {
  webSearch: webSearchTool,
  calculator: calculatorTool,
};
```

### Adjust Web Search Behavior

Edit `src/trigger/tools/web-search.ts`:

```typescript
// Change result count
limit: z.number().default(3), // Down from 5

// Truncate content snippets
content: item.markdown?.substring(0, 300) // Shorter
```

See `docs/AGENT_INSTRUCTIONS.md` for detailed customization guide.

## Tech Stack

- **Runtime:** Node.js 24 + TypeScript
- **Web Framework:** Hono (deployed on Vercel)
- **Agent Framework:** Trigger.dev Chat SDK
- **LLM:** Google Gemini (free tier)
- **Web Search:** Firecrawl API
- **Deployment:** Vercel (webhooks) + Trigger.dev (agents)

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

- **Trigger.dev Docs:** [https://trigger.dev/docs](https://trigger.dev/docs)
- **AI SDK Docs:** [https://ai-sdk.dev](https://ai-sdk.dev)
- **Firecrawl Docs:** [https://docs.firecrawl.dev](https://docs.firecrawl.dev)
- **Telegram Bot API:** [https://core.telegram.org/bots/api](https://core.telegram.org/bots/api)
