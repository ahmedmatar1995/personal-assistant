/**
 * Telegram Chat Agent
 *
 * One durable chat.agent session per Telegram chat (keyed by chatId).
 * Transcript persistence is the built-in platform default: Trigger.dev writes
 * the conversation as a snapshot to object storage after every turn and reads
 * it back when the run continues — no database needed.
 *
 * The `chat.channels.custom()` connector:
 *   - Receives a verified Telegram Update from the telegramEndpoint
 *   - Maps it to a text message (inbound)
 *   - Keys each session to the Telegram chatId so each chat is isolated
 *   - Posts the agent reply back to Telegram (send)
 *   - Posts a user-friendly error message if the turn fails (errorMessage)
 */

import { chat } from '@trigger.dev/sdk/ai';
import { stepCountIs } from 'ai';
import { google } from '@ai-sdk/google';
import { telegramEndpoint, type TelegramUpdate } from './telegram-webhook.js';
import { webSearchTool } from './tools/web-search.js';

// ---------------------------------------------------------------------------
// Gemini model fallback list (free-tier, tested)
// ---------------------------------------------------------------------------
const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<void> {
  const res = await fetch(`${TG_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    console.error('Telegram sendMessage failed:', await res.text());
  }
}

// ---------------------------------------------------------------------------
// Custom channel connector for Telegram
// ---------------------------------------------------------------------------

const telegramChannel = chat.channels.custom({
  id: 'telegram',
  endpoint: telegramEndpoint,

  // Each Telegram chat gets its own durable session.
  key: '{event.message.chat.id}',

  // Map the Telegram Update to the message text the agent receives.
  // Return '' to skip non-text updates — the runtime skips turns for empty messages.
  inbound: (event) => {
    if (!event.message?.text) return '';
    return event.message.text;
  },

  // Bind the session so replies still work after the event is gone.
  bind: (event) => ({ chatId: event.message!.chat.id }),

  // Post the reply back to Telegram.
  send: async (message, ctx) => {
    if (!message.text) return {};
    // ctx.handle is populated on bound turns; ctx.event on direct channel turns.
    const chatId: number | undefined =
      ctx.handle?.chatId ?? ctx.event?.message?.chat.id;
    if (!chatId) {
      console.error('telegram-agent: could not determine chatId for reply');
      return {};
    }
    await sendTelegramMessage(chatId, message.text);
    return {};
  },

  // User-friendly error message when a turn fails.
  errorMessage: ({ error }) => {
    const msg = (error as Error)?.message ?? '';
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return "I've run out of AI quota for now. Please try again in a few minutes.";
    }
    return 'Something went wrong. Please try again.';
  },
});

// ---------------------------------------------------------------------------
// Chat agent
// ---------------------------------------------------------------------------

// Define tools once, reuse across turns
const tools = {
  webSearch: webSearchTool,
};

export const telegramAgent = chat.agent({
  id: 'telegram-agent',

  // Wire the Telegram channel.
  channels: [telegramChannel],

  // Declare tools on the agent so toModelOutput survives across turns
  tools,

  // Built-in transcript storage (zero config). Trigger.dev writes the full
  // UIMessage[] conversation to object storage after every turn and reads it
  // back on continuation runs — survives crashes, deploys, and idle gaps.
  // Visible in the Trigger.dev dashboard under Sessions.

  run: async ({ messages, tools, signal, streamText }) => {
    // Try each Gemini model in order. If one is out of quota or overloaded
    // (429/503), fall through to the next. The managed `streamText` from
    // the run argument connects compaction and telemetry, and its result is
    // auto-piped back to the channel connector's `send` callback.
    let lastError: unknown;

    for (const modelId of GEMINI_MODELS) {
      try {
        return streamText({
          model: google(modelId),
          messages,
          tools,
          abortSignal: signal,
          stopWhen: stepCountIs(10),
          maxRetries: 0,
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
- Never mention "Firecrawl" or technical implementation details to users`,
        });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        lastError = error;
        console.warn(
          `telegram-agent: ${modelId} failed (status ${status ?? 'n/a'})`
        );
        // Only continue the fallback for quota / overload / unknown model.
        if (status !== 429 && status !== 503 && status !== 404) throw error;
      }
    }

    // All models exhausted — throw so the channel posts the errorMessage.
    throw lastError ?? new Error('All Gemini models are out of quota');
  },
});
