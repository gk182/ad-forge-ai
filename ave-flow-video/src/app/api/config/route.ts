import { NextResponse } from 'next/server';
import { serverConfig } from '@/config/env';

export async function GET() {
  return NextResponse.json({
    hasGeminiApiKey: !!serverConfig.geminiApiKey,
    hasFirecrawlApiKey: !!serverConfig.firecrawlApiKey,
    hasDidApiKey: !!serverConfig.didApiKey,
  });
}
