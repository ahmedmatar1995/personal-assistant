import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

// Free-tier Gemini quotas are per model (~20 requests/day each), and some
// models are intermittently overloaded (503). Try models in order and fall
// through to the next one when a model is out of quota or unavailable.
export const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];

export const QUOTA_FALLBACK_REPLY =
  'Sorry, the AI is out of free quota right now. Please try again later.';

export async function generateReply(
  prompt: string
): Promise<{ text: string; model: string | null }> {
  for (const modelId of GEMINI_MODELS) {
    try {
      const { text } = await generateText({
        model: google(modelId),
        prompt,
        maxRetries: 0,
      });
      console.log(`Gemini (${modelId}) replied`);
      return { text: text || '(empty reply)', model: modelId };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      console.warn(`Gemini ${modelId} failed (status ${status ?? 'n/a'})`);
      // Anything other than quota / overload / unknown model is a real bug.
      if (status !== 429 && status !== 503 && status !== 404) throw error;
    }
  }
  return { text: QUOTA_FALLBACK_REPLY, model: null };
}
