/**
 * Application environment configurations.
 * Loaded on server-side Next.js environment.
 */

export const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export const serverConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || '',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || '',
  didApiKey: process.env.DID_API_KEY || '',
};
