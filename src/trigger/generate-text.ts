import { AbortTaskRunError, logger, task } from '@trigger.dev/sdk';
import { generateReply } from '../lib/ai.js';

// TEMPORARY: backs the public GET /test/ai endpoint. Remove together with it.
export const generateTextTask = task({
  id: 'generate-text',
  maxDuration: 120,
  run: async (payload: { prompt: string }) => {
    const prompt = payload.prompt?.trim();
    if (!prompt) throw new AbortTaskRunError('prompt is required'); // no retry

    const { text, model } = await generateReply(prompt);
    logger.log('Generated text', { model, length: text.length });

    return { text, model };
  },
});
