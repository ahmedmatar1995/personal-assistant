# Telegram Echo Bot Setup

This bot echoes back any message you send to it.

## Prerequisites

1. Create a Telegram bot and get the token:
   - Open Telegram and search for `@BotFather`
   - Send `/newbot` and follow the instructions
   - Copy the bot token you receive

2. Deploy your Hono app to a public URL (Vercel, Railway, Fly.io, etc.)

## Environment Variables

Create a `.env` file with:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_WEBHOOK_URL=https://your-domain.com
```

- `TELEGRAM_BOT_TOKEN`: Your bot token from BotFather
- `TELEGRAM_WEBHOOK_URL`: Your deployed app's public URL (no trailing slash)

## Setup Steps

### 1. Deploy Your App

Deploy to Vercel, Railway, or any platform that gives you a public HTTPS URL.

```bash
# Example: Deploy to Vercel
npm install -g vercel
vercel --prod
```

### 2. Set Environment Variables

In your deployment platform, set:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_URL`

### 3. Register the Webhook

Once deployed, call the setup endpoint:

```bash
curl -X POST https://your-domain.com/setup-webhook
```

You should see a response like:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### 4. Test Your Bot

1. Open Telegram and search for your bot by username
2. Start a chat and send any message
3. The bot should echo it back immediately

## API Endpoints

### `POST /webhook/telegram`
Receives updates from Telegram and echoes text messages back.

### `POST /setup-webhook`
Registers your webhook URL with Telegram. Call this once after deployment.

### `GET /webhook-info`
Check your current webhook configuration.

```bash
curl https://your-domain.com/webhook-info
```

## Troubleshooting

### Bot doesn't respond
1. Check webhook status: `GET /webhook-info`
2. Verify environment variables are set correctly
3. Check deployment logs for errors
4. Ensure your webhook URL is HTTPS (Telegram requires it)

### "Webhook not set" error
Run the setup endpoint again: `POST /setup-webhook`

### Local Development

For local testing with webhooks, use a tool like [ngrok](https://ngrok.com/):

```bash
# Terminal 1: Start your app
npm run dev

# Terminal 2: Expose it publicly
ngrok http 3000

# Terminal 3: Set webhook to ngrok URL
curl -X POST http://localhost:3000/setup-webhook \
  -H "Content-Type: application/json"
```

Make sure to set `TELEGRAM_WEBHOOK_URL` to your ngrok URL (e.g., `https://abc123.ngrok.io`).

## How It Works

1. User sends a message to your bot on Telegram
2. Telegram sends an HTTP POST request to `/webhook/telegram` with the update
3. Your bot extracts the message text and chat ID
4. Your bot calls Telegram's `sendMessage` API to echo the text back
5. User receives the echoed message

## Next Steps

- Add command handling (`/start`, `/help`)
- Store user data
- Add inline keyboards
- Handle photos, stickers, and other media types
