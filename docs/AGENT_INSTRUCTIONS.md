# Agent Instructions & Behavior

This document explains how the Telegram bot agent is configured to behave and when it uses different capabilities.

## Agent Personality

The agent is designed to be:

- **Helpful and conversational** — friendly tone, not robotic
- **Concise** — responses fit in messaging app context (not long essays)
- **Honest** — admits when it doesn't know something
- **Transparent** — cites sources when using web search
- **Smart** — chooses the right tool for the job

## System Prompt

The agent's behavior is controlled by the `system` prompt in `src/trigger/telegram-agent.ts`:

```typescript
system: `You are a helpful AI assistant with access to real-time web information.

Your capabilities:
- Answer general questions using your training knowledge
- Search the web when you need current information, facts, or verification

When to use web search:
- Current events, news, or recent happenings
- Real-time data (weather, stock prices, sports scores)
- Information about specific websites or URLs
- Product information, pricing, or availability
- Facts you're uncertain about or that may have changed
- When the user explicitly asks you to "search" or "look up" something

When NOT to use web search:
- General knowledge questions you can answer confidently
- Mathematical calculations or reasoning problems
- Programming questions or code help
- Casual conversation or greetings
- Questions about yourself

Important guidelines:
- Be conversational and friendly
- If search results are empty or irrelevant, acknowledge it and offer to try a different query
- Cite sources when using web search results: mention the website or page title
- Keep responses concise - this is a messaging app, not a document
- Never mention "Firecrawl" or technical implementation details to users`
```

## Tool Selection Logic

The agent uses **Gemini's tool calling** to decide when to invoke the `webSearch` tool. The decision is based on:

1. **Tool description** — tells the model what the tool is for
2. **System prompt** — provides high-level guidance
3. **User message** — the actual question content

### Example Decision Flow

| User message | Agent decision | Reasoning |
|---|---|---|
| "What is photosynthesis?" | Answer directly | General knowledge, confident |
| "What's the weather in Paris today?" | Call `webSearch` | Real-time data required |
| "Who won the game last night?" | Call `webSearch` | Current event, needs verification |
| "Calculate 15% of 200" | Answer directly | Math, no web needed |
| "Hello!" | Answer directly | Greeting, casual |
| "Search for the latest iPhone" | Call `webSearch` | Explicit search request |

## Multi-Turn Conversations

The agent maintains conversation context across turns:

```
User:  "What's the weather in Paris?"
Agent: [calls webSearch] "It's currently 18°C and partly cloudy in Paris..."

User:  "What about London?"
Agent: [calls webSearch] "In London, it's 15°C with light rain..."

User:  "Which one is warmer?"
Agent: [no tool call] "Paris is warmer — 18°C compared to London's 15°C."
```

**Key behaviors:**
- The agent remembers previous answers (context is preserved)
- It doesn't re-search for data it already has
- Follow-up questions don't require full context repetition

## Tool Call Limit

The agent is configured with `stopWhen: stepCountIs(10)`, meaning:

- Maximum 10 tool calls per conversation turn
- Prevents infinite loops or runaway API usage
- After 10 steps, the agent must respond with what it has

**Example scenario:**
```
User: "Search for Apple, Microsoft, and Google stock prices"
Agent:
  1. Call webSearch("Apple stock price")
  2. Call webSearch("Microsoft stock price")
  3. Call webSearch("Google stock price")
  4. Synthesize results into response
```

This completes in 3 steps, well under the limit.

## Error Handling & Fallbacks

The agent gracefully handles tool failures:

### Web Search Fails

```
User:  "What's the weather in Tokyo?"
Agent: [webSearch fails with rate limit]
Response: "I tried to search for current weather data but hit a rate limit. 
           Based on typical patterns, Tokyo is usually [general info]. 
           Please try again in a moment for live data."
```

### No Results Found

```
User:  "Search for xyzabc123 nonexistent thing"
Agent: [webSearch returns empty]
Response: "I couldn't find any results for 'xyzabc123 nonexistent thing'. 
           Could you provide more context or try rephrasing?"
```

### Model Quota Exhausted

The agent tries multiple Gemini models in fallback order:

```typescript
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',    // Try this first
  'gemini-3.1-flash-lite',    // If quota exhausted, try this
  'gemini-flash-lite-latest', // Then this
  'gemini-flash-latest',      // Last resort
];
```

If all models fail, the user sees: "I've run out of AI quota for now. Please try again in a few minutes."

## Customizing Agent Behavior

### Change Personality

Edit the system prompt to adjust tone:

```typescript
system: `You are a professional research assistant.

Provide detailed, well-structured answers.
Always cite sources with [1], [2] notation.
Use formal language.`
```

### Change Tool Usage Threshold

Make the agent more/less likely to search:

**More aggressive (search more often):**
```typescript
description: `Search the web whenever you need ANY external information.
Use this liberally for verification, even if you think you know the answer.`
```

**Less aggressive (search less often):**
```typescript
description: `Search the web ONLY when absolutely necessary.
Use this as a last resort when your training data cannot answer the question.`
```

### Add Tool Approval (Human-in-the-Loop)

Require user confirmation before searching:

```typescript
export const telegramAgent = chat.agent({
  id: 'telegram-agent',
  tools,
  toolApproval: {
    webSearch: 'user-approval', // Pause before searching
  },
  // ... rest of config
});
```

See [Trigger.dev Human-in-the-Loop docs](https://trigger.dev/docs/ai-chat/patterns/human-in-the-loop) for details.

### Add More Tools

Define additional tools in `src/trigger/tools/`:

```typescript
// src/trigger/tools/calculator.ts
export const calculatorTool = tool({
  description: 'Perform mathematical calculations',
  inputSchema: z.object({
    expression: z.string(),
  }),
  execute: async ({ expression }) => {
    return { result: eval(expression) }; // Use a real math library
  },
});

// Add to telegram-agent.ts
const tools = {
  webSearch: webSearchTool,
  calculator: calculatorTool,
};
```

## Observability

Monitor agent decisions in the Trigger.dev dashboard:

1. Go to [https://cloud.trigger.dev](https://cloud.trigger.dev)
2. Select your project
3. Click **Sessions** → Find the chat session
4. View the run timeline:
   - **Blue boxes:** Agent thinking / model calls
   - **Green boxes:** Tool calls (with inputs/outputs)
   - **Purple boxes:** User messages
   - **Orange boxes:** Errors

Each tool call shows:
- Input parameters (e.g., search query)
- Output (search results)
- Execution time
- Whether it succeeded or failed

## Testing Agent Behavior

### Test Web Search Decision

Send these messages and verify the agent uses `webSearch`:

```
"What's the weather in London today?"
"Latest news about SpaceX"
"Search for Python tutorials"
"What's the price of Bitcoin right now?"
```

### Test Direct Answering

Send these messages and verify the agent answers WITHOUT web search:

```
"What is 2+2?"
"Explain how photosynthesis works"
"Write a Python function to reverse a string"
"Hello, how are you?"
```

### Test Multi-Turn Context

```
Turn 1: "What's the capital of France?"
  → Expect: "Paris" (direct answer)

Turn 2: "What's the population?"
  → Expect: [webSearch "Paris population"] "Paris has approximately X million people..."

Turn 3: "Is that more than London?"
  → Could be: [webSearch "London population"] or direct comparison if already known
```

## Production Considerations

### Rate Limiting

The agent can make many web searches if users ask rapid-fire questions. Consider:

1. **Per-user rate limits** — track searches per `chatId`
2. **Caching** — store common queries (weather, stock prices) for a few minutes
3. **Paid Firecrawl tier** — higher quotas

### Cost Management

Each tool call costs:
- **Model inference** — Gemini API call (free tier available)
- **Web search** — Firecrawl API call (free tier: limited, paid: $X per search)

Monitor costs in:
- Google AI Studio (Gemini usage)
- Firecrawl dashboard (search usage)

### Quality Monitoring

Track these metrics:
- **Tool call success rate** — how often web search succeeds
- **Response latency** — time from user message to bot reply
- **User satisfaction** — thumbs up/down reactions (implement separately)

## Next Steps

- **Add more tools:** Weather API, calculator, database queries
- **Implement caching:** Reduce redundant web searches
- **Fine-tune instructions:** Adjust based on user feedback
- **Add approval flows:** For expensive or sensitive operations

See `docs/WEB_SEARCH_SETUP.md` for web search configuration details.
