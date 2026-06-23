import { NextResponse } from 'next/server';
import { serverConfig } from '@/config/env';

export async function GET() {
  return NextResponse.json({
    hasGeminiApiKey: !!serverConfig.geminiApiKey,
    hasElevenLabsApiKey: !!serverConfig.elevenLabsApiKey,
    hasFirecrawlApiKey: !!serverConfig.firecrawlApiKey,
    hasDidApiKey: !!serverConfig.didApiKey,
  });
}
