import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
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
            const text = await generateReply(userText);
            // Send AI response back to the user
            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: text,
                }),
            });
            if (!response.ok) {
                console.error('Telegram API error:', await response.text());
            }
        }
    }
    catch (error) {
        console.error('Webhook error:', error);
    }
    // Always answer 200: a non-2xx makes Telegram redeliver the same update
    // over and over, which burns Gemini quota and floods the logs.
    return c.json({ ok: true });
});
// Free-tier Gemini quotas are per model (~20 requests/day each), and some
// models are intermittently overloaded (503). Try models in order and fall
// through to the next one when a model is out of quota or unavailable.
const GEMINI_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
];
async function generateReply(prompt) {
    for (const modelId of GEMINI_MODELS) {
        try {
            const { text } = await generateText({
                model: google(modelId),
                prompt,
                maxRetries: 0,
            });
            console.log(`Gemini (${modelId}) replied`);
            return text || '(empty reply)';
        }
        catch (error) {
            const status = error.statusCode;
            console.warn(`Gemini ${modelId} failed (status ${status ?? 'n/a'})`);
            // Anything other than quota / overload / unknown model is a real bug.
            if (status !== 429 && status !== 503 && status !== 404)
                throw error;
        }
    }
    return 'Sorry, the AI is out of free quota right now. Please try again later.';
}
// Endpoint to set up the webhook (call this once to register your webhook with Telegram)
app.post('/setup-webhook', async (c) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) {
        return c.json({
            error: 'Missing environment variables',
            required: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_URL'],
        }, 400);
    }
    try {
        const webhookUrl = `${TELEGRAM_WEBHOOK_URL}/webhook/telegram`;
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl }),
        });
        const result = await response.json();
        return c.json(result);
    }
    catch (error) {
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
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
        const result = await response.json();
        return c.json(result);
    }
    catch (error) {
        console.error('Get webhook info error:', error);
        return c.json({ error: 'Failed to get webhook info' }, 500);
    }
});
// Start a local server only when not running on Vercel (Vercel serves the app
// via its Hono serverless preset, which imports the default export below).
if (!process.env.VERCEL) {
    serve({
        fetch: app.fetch,
        port: Number(process.env.PORT) || 3000,
    }, (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
    });
}
export default app;
