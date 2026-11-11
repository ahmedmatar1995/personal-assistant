# Web Search Setup Guide

This document explains how the Telegram bot uses web search via Firecrawl to provide real-time information.

## Overview

The bot includes a **web search tool** that allows the AI agent to search the internet for current information, news, facts, and data that may not be in its training data.

**Key features:**
- Automatic — the agent decides when to search based on the user's question
- Seamless — users don't need to know about "Firecrawl" or technical details
- Smart — the agent is instructed when to search vs. answer from knowledge

## How It Works

When a user sends a message to the bot:

1. The AI agent reads the message and determines whether it needs web search
2. If yes, it calls the `webSearch` tool with an appropriate query
3. Firecrawl searches the web and returns relevant results (titles, URLs, snippets)
4. The agent reads the results and synthesizes a natural response
5. The response is sent back to the user via Telegram

**The user experience is conversational** — they don't see tool calls or technical details, just helpful answers backed by current web data.

## When the Agent Uses Web Search

The agent is instructed to use web search for:

- **Current events** — "What's happening in the election today?"
- **Real-time data** — "What's the weather in Tokyo?" or "Bitcoin price right now"
- **Product information** — "What's the latest iPhone model?"
- **Verification** — "Is X company still operating?"
- **Specific URLs** — "What does example.com say about their pricing?"
- **Uncertain facts** — anything the agent isn't confident about from training data

## When the Agent Does NOT Use Web Search

The agent answers directly for:

- General knowledge questions — "What is photosynthesis?"
- Math and logic — "What's 15% of 200?"
- Programming help — "How do I write a for loop in Python?"
- Casual conversation — "Hello!" or "How are you?"
- Questions about itself — "What can you do?"

## Setup

### Option 1: Free Tier (No API Key)

The bot works out of the box with Firecrawl's free tier. No configuration needed.

**Limitations:**
- Lower rate limits (around 10 searches per minute)
- May hit quota during high usage

### Option 2: Firecrawl API Key (Recommended for Production)

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Get your API key from the dashboard
3. Add it to your environment variables:

```bash
# In Vercel (Production)
vercel env add FIRECRAWL_API_KEY

# In .env (Local Development)
FIRECRAWL_API_KEY=fc-your_api_key_here
```

4. Redeploy:

```bash
npx trigger.dev@latest deploy
```

**Benefits:**
- Higher rate limits
- More reliable service
- Access to advanced features (maps, crawl, etc.)

## Testing Locally

1. Start the Trigger.dev dev server:

```bash
npm run dev
```

2. In a separate terminal, send a test webhook event:

```bash
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "chat": { "id": 123456789 },
      "text": "What is the weather in Paris today?"
    }
  }'
```

3. Watch the console logs to see:
   - The agent deciding to use the web search tool
   - The Firecrawl API call
   - The search results
   - The final response

## Monitoring

### Trigger.dev Dashboard

View agent runs, tool calls, and search results at:
- Development: [https://cloud.trigger.dev](https://cloud.trigger.dev) → Your Project → Sessions
- Production: Same dashboard, filter by environment

### Logs

The web search tool logs:
- Search queries
- API responses
- Errors (rate limits, auth issues, etc.)

Check logs in:
- **Local:** Terminal running `npm run dev`
- **Production:** Trigger.dev dashboard → Run details → Logs

## Error Handling

The tool gracefully handles common issues:

| Error | User sees | Agent action |
|---|---|---|
| Rate limit (429) | "Rate limit reached. Please try again in a moment." | Continues conversation |
| Auth error (401/403) | "Web search is temporarily unavailable." | Falls back to knowledge |
| No results | "No results found for [query]. Try rephrasing." | Suggests different query |
| Network error | "An unexpected error occurred." | Continues conversation |

The agent never crashes — it always attempts to answer the user, even if web search fails.

## Advanced: Customizing the Tool

The web search tool is defined in `src/trigger/tools/web-search.ts`. You can customize:

### Search Result Limit

```ts
// In web-search.ts
limit: z.number().min(1).max(10).default(3) // Change from 5 to 3
```

### Content Length

```ts
// Truncate content snippets
content: item.markdown?.substring(0, 300) // Shorter snippets
```

### Search Options

```ts
// In the Firecrawl API call body
scrapeOptions: {
  formats: ['markdown'],           // Only markdown, not HTML
  onlyMainContent: true,            // Skip boilerplate
  includeTags: ['article', 'main'], // Focus on content areas
}
```

### Agent Instructions

Edit the `system` prompt in `src/trigger/telegram-agent.ts` to change when and how the agent uses web search.

## Troubleshooting

### "No results found" for most searches

**Cause:** Firecrawl API key is invalid or rate limit exceeded.

**Fix:**
1. Check your API key is correct in environment variables
2. Verify it's set in the deployed environment (not just `.env`)
3. Check Firecrawl dashboard for usage/quota

### Agent never uses web search

**Cause:** System prompt or tool description may be unclear.

**Fix:**
1. Read the current prompt in `src/trigger/telegram-agent.ts`
2. Verify the `webSearch` tool description is clear
3. Test with explicit queries like "Search for X"

### "Rate limit reached" frequently

**Cause:** Using free tier or low quota API key.

**Fix:**
1. Add a paid Firecrawl API key
2. Implement caching for common queries (future enhancement)
3. Reduce `limit` parameter in tool definition

## Next Steps

- **Add more tools:** Weather API, calculator, database lookup
- **Caching:** Store common search results to reduce API calls
- **Analytics:** Track which queries trigger web search
- **Human-in-the-loop:** Require approval for expensive searches

See `docs/TELEGRAM_WEBHOOK_ARCHITECTURE.md` for the full system architecture.
