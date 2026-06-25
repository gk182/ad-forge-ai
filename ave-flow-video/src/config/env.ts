/**
 * Application environment configurations.
 * Loaded on server-side Next.js environment.
 */

export const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

export const serverConfig = {
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || '',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY || '',
  didApiKey: process.env.DID_API_KEY || '',
};

export const r2Config = {
  accountId: process.env.ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicBaseUrl: normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL || ''),
};

export const hasR2UploadConfig = Boolean(
  r2Config.accountId &&
    r2Config.accessKeyId &&
    r2Config.secretAccessKey &&
    r2Config.bucket &&
    r2Config.publicBaseUrl
);

export function isAllowedR2PublicUrl(url: string): boolean {
  if (!r2Config.publicBaseUrl) {
    return false;
  }

  const normalizedUrl = normalizeBaseUrl(url);
  return (
    normalizedUrl === r2Config.publicBaseUrl ||
    normalizedUrl.startsWith(`${r2Config.publicBaseUrl}/`)
  );
}
