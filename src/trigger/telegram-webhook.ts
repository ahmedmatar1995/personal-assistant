/**
 * Trigger.dev webhook endpoint for Telegram.
 *
 * Telegram posts updates to the hosted URL that Trigger.dev assigns to this
 * endpoint after `trigger dev` / `trigger deploy`. That URL is what you give
 * to setWebhook — NOT the Hono app URL.
 *
 * Verification: Telegram doesn't sign requests with HMAC. Instead it embeds a
 * shared secret in the webhook URL path as `X-Telegram-Bot-Api-Secret-Token`
 * header (optional but recommended). We use `url-secret` / `shared-secret`
 * with the `secret_token` query approach.
 *
 * For the simplest setup we skip signature verification (Telegram's IPs are
 * publicly documented and the bot token already in the URL is the secret).
 * We use a `shared-secret` check on the `X-Telegram-Bot-Api-Secret-Token`
 * header which Telegram sets when you pass `secret_token` to setWebhook.
 */

import { webhooks } from '@trigger.dev/sdk';

// --- Telegram Update shape (minimal — only fields we use) ---
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name: string; username?: string };
    text?: string;
    date: number;
  };
}

// Telegram sends the bot secret token in this header when you configure
// secret_token on setWebhook.  We verify it as a shared secret so only
// real Telegram requests pass through.
export const telegramEndpoint = webhooks.endpoint.define({
  id: 'telegram',
  source: webhooks.custom<TelegramUpdate>(
    {
      scheme: 'shared-secret',
      placement: 'header',
      fieldName: 'x-telegram-bot-api-secret-token',
    },
    {
      setupPrompt:
        'Register the webhook URL with Telegram by calling setWebhook with this URL and the same string as secret_token.',
    }
  ),
});
