import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { runs, tasks } from '@trigger.dev/sdk';
import { generateReply } from './lib/ai.js';
import type { generateTextTask } from './trigger/generate-text.js'; // type-only: keeps the task out of the app bundle

const app = new Hono();

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/marco', (c) => {
  return c.text('polo');
});

// ---------------------------------------------------------------------------
// TEMPORARY public test endpoint — remove before launch (also delete
// src/trigger/generate-text.ts). Unauthenticated: anyone can spend Gemini
// quota through it, so keep it short-lived.
//
//   GET /test/ai?prompt=Tell%20me%20a%20joke
//
// Triggers the "generate-text" Trigger.dev task and waits for its output.
// ---------------------------------------------------------------------------
const TEST_PROMPT_MAX_LENGTH = 500;

app.get('/test/ai', async (c) => {
  const prompt = (
    c.req.query('prompt') ?? 'Say hello in one short sentence.'
  ).trim();
  if (!prompt) return c.json({ error: 'prompt must not be empty' }, 400);
  if (prompt.length > TEST_PROMPT_MAX_LENGTH) {
    return c.json(
      { error: `prompt must be at most ${TEST_PROMPT_MAX_LENGTH} characters` },
      400
    );
  }
  if (!process.env.TRIGGER_SECRET_KEY) {
    return c.json({ error: 'TRIGGER_SECRET_KEY not configured' }, 500);
  }

  try {
    const handle = await tasks.trigger<typeof generateTextTask>(
      'generate-text',
      { prompt }
    );

    // Wait up to ~50s for the run to finish (Vercel functions time out after 60s).
    const deadline = Date.now() + 50_000;
    while (Date.now() < deadline) {
      const run = await runs.retrieve<typeof generateTextTask>(handle.id);
      if (run.isCompleted) {
        if (run.isSuccess && run.output) {
          return c.json({
            prompt,
            text: run.output.text,
            model: run.output.model,
            runId: run.id,
          });
        }
        return c.json(
          { error: `Run finished with status ${run.status}`, runId: run.id },
          502
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Still queued/running (e.g. `trigger dev` isn't running): hand back the id.
    return c.json(
      {
        status: 'pending',
        runId: handle.id,
        message: 'Run has not finished yet',
      },
      202
    );
  } catch (error) {
    console.error('Test AI endpoint error:', error);
    return c.json({ error: 'Failed to trigger the task' }, 500);
  }
});

// Telegram webhook endpoint - uses Gemini AI to respond
app.post('/webhook/telegram', async (c) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500);
  }

  try {
    const update = await c.req.json();

    // Handle text messages
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const userText = update.message.text;

      const { text } = await generateReply(userText);

      // Send AI response back to the user
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
          }),
        }
      );

      if (!response.ok) {
        console.error('Telegram API error:', await response.text());
      }
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }

  // Always answer 200: a non-2xx makes Telegram redeliver the same update
  // over and over, which burns Gemini quota and floods the logs.
  return c.json({ ok: true });
});

// Endpoint to set up the webhook (call this once to register your webhook with Telegram)
app.post('/setup-webhook', async (c) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) {
    return c.json(
      {
        error: 'Missing environment variables',
        required: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_URL'],
      },
      400
    );
  }

  try {
    const webhookUrl = `${TELEGRAM_WEBHOOK_URL}/webhook/telegram`;
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );

    const result = await response.json();
    return c.json(result);
  } catch (error) {
    console.error('Setup webhook error:', error);
    return c.json({ error: 'Failed to set webhook' }, 500);
  }
});

// Check webhook status
app.get('/webhook-info', async (c) => {
  if (!TELEGRAM_BOT_TOKEN) {
    return c.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500);
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
    );
    const result = await response.json();
    return c.json(result);
  } catch (error) {
    console.error('Get webhook info error:', error);
    return c.json({ error: 'Failed to get webhook info' }, 500);
  }
});

// Start a local server only when not running on Vercel (Vercel serves the app
// via its Hono serverless preset, which imports the default export below).
if (!process.env.VERCEL) {
  serve(
    {
      fetch: app.fetch,
      port: Number(process.env.PORT) || 3000,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    }
  );
}

export default app;
