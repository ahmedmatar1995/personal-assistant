# Gemini AI Integration Setup

Your Telegram bot now uses Google's Gemini AI instead of echoing messages.

## ✅ What's Already Done

1. ✅ Code updated to use `ai` SDK with `@ai-sdk/google`
2. ✅ Google API key already in `.env` file
3. ✅ Using `gemini-2.0-flash-exp` (free, fast model)

## 🚀 Next Steps

### Step 1: Install Dependencies

Run this command:

```bash
npm install ai @ai-sdk/google
```

### Step 2: Test Locally

Start your server:

```bash
npm run dev
```

Test with a fake webhook request:

```bash
curl -X POST http://localhost:3000/webhook/telegram \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "chat": {"id": 12345},
      "text": "What is artificial intelligence?"
    }
  }'
```

You should see:
- `Gemini response: [AI-generated answer]` in your server logs
- No errors

### Step 3: Deploy to Vercel

Make sure your Vercel environment has the Google API key:

```bash
# Add the env var to Vercel
vercel env add GOOGLE_GENERATIVE_AI_API_KEY

# Deploy
vercel --prod
```

Or add it via the Vercel dashboard:
1. Go to your project settings
2. Environment Variables
3. Add `GOOGLE_GENERATIVE_AI_API_KEY` with your key
4. Redeploy

### Step 4: Test with Your Real Bot

1. Open Telegram
2. Find your bot
3. Send it a message like "Tell me a joke"
4. The bot should respond with AI-generated text from Gemini

## 🔧 Configuration

### Change the Model

In `src/index.ts`, line ~35:

```typescript
model: google('gemini-2.0-flash-exp'),
```

You can swap to:
- `gemini-1.5-flash` — stable, fast
- `gemini-1.5-flash-8b` — fastest, simple tasks
- `gemini-1.5-pro` — slower but smarter

### Free Tier Limits

- Flash models: 15 requests/minute, 1M requests/day
- Pro models: 2 requests/minute, 50 requests/day

For a Telegram bot, Flash models are perfect.

## 🐛 Troubleshooting

### "Cannot find module 'ai'"
Run: `npm install ai @ai-sdk/google`

### "GOOGLE_GENERATIVE_AI_API_KEY not found"
Check your `.env` file has the key, and restart your server.

### "403: API key not valid"
Get a new key from https://aistudio.google.com/app/apikey

### "429: Resource exhausted"
You hit the rate limit. Wait 1 minute.

### Bot doesn't respond
- Check Vercel logs for errors
- Verify the env var is set in Vercel
- Check webhook status: `curl https://your-domain.vercel.app/webhook-info`

## 📝 What Changed

### Before (Echo Bot)
```typescript
text: userText,  // Just echo back
```

### After (AI Bot)
```typescript
const { text } = await generateText({
  model: google('gemini-2.0-flash-exp'),
  prompt: userText,
});
// Send AI-generated response
```

## 🎯 Next Enhancements

Once this works, you can add:

1. **Conversation history** — Remember past messages
2. **System prompts** — Give the bot a personality
3. **Streaming responses** — Use `streamText()` for long replies
4. **Tool calling** — Let the bot search, calculate, etc.
5. **Image generation** — Add multimodal capabilities

See the AI SDK docs: https://sdk.vercel.ai/docs
