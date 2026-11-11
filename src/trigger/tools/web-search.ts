/**
 * Web Search Tool using Firecrawl
 *
 * Provides semantic web search capability to the Telegram agent.
 * Uses Firecrawl's free tier (no API key required for basic usage).
 */

import { tool } from 'ai';
import { z } from 'zod';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

export const webSearchTool = tool({
  description: `Search the web for current information, facts, news, or data that you don't have in your training data.
Use this when:
- User asks about current events, news, or recent happenings
- User asks "what is X" and X is a product, company, or technology you're unsure about
- User asks for weather, prices, stock data, or other real-time information
- User asks about specific URLs or websites
- The question requires up-to-date or verified information from the internet

Do NOT use this for:
- General knowledge questions you can answer confidently
- Math or reasoning problems
- Casual conversation
- Questions about yourself or the bot`,

  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'The search query. Be specific and concise. Example: "weather in Paris today" or "latest iPhone release date"'
      ),
    limit: z
      .number()
      .min(1)
      .max(10)
      .default(5)
      .describe('Number of results to return (1-10)'),
  }),

  execute: async ({ query, limit = 5 }) => {
    try {
      // Use Firecrawl's search endpoint
      const response = await fetch(`${FIRECRAWL_API}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(FIRECRAWL_API_KEY && {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          }),
        },
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: {
            formats: ['markdown', 'html'],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Firecrawl search failed:', response.status, errorText);

        // Handle rate limits gracefully
        if (response.status === 429) {
          return {
            error: 'Rate limit reached. Please try again in a moment.',
            results: [],
          };
        }

        // Handle auth issues
        if (response.status === 401 || response.status === 403) {
          return {
            error:
              'Web search is temporarily unavailable. Please try a different query.',
            results: [],
          };
        }

        return {
          error: `Search failed with status ${response.status}`,
          results: [],
        };
      }

      const data = await response.json();

      // Extract and format results
      const results = (data.data || []).map((item: any) => ({
        title: item.title || 'Untitled',
        url: item.url || '',
        content:
          item.markdown?.substring(0, 500) ||
          item.description ||
          'No content available',
      }));

      if (results.length === 0) {
        return {
          message: `No results found for "${query}". Try rephrasing your search.`,
          results: [],
        };
      }

      return {
        query,
        count: results.length,
        results,
      };
    } catch (error) {
      console.error('Web search tool error:', error);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
        results: [],
      };
    }
  },
});
