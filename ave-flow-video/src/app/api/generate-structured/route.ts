import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, serverConfig } from '@/config/env';

const BACKEND_BASE_URL = BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    const {
      title,
      description,
      markdown,
      image,
      screenshots,
      videos,
      tone,
      targetDuration,
      geminiApiKey: reqGeminiApiKey,
      geminiModel,
      elevenLabsApiKey: reqElevenLabsApiKey,
      useFreeTTS,
      customNotes,
    } = await req.json();

    const geminiApiKey = reqGeminiApiKey || serverConfig.geminiApiKey;
    const elevenLabsApiKey = reqElevenLabsApiKey || serverConfig.elevenLabsApiKey;

    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Gemini API key is required. Please set it in Settings or system .env.' },
        { status: 400 }
      );
    }

    if (!useFreeTTS && !elevenLabsApiKey) {
      return NextResponse.json(
        { error: 'ElevenLabs API key is required when not using Free TTS. Please set it in Settings or system .env.' },
        { status: 400 }
      );
    }

    console.log('[Structured] Calling backend render-structured endpoint');

    const response = await fetch(`${BACKEND_BASE_URL}/render-structured`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        markdown,
        image: image || '',
        screenshots: screenshots || [],
        videos: videos || [],
        tone: tone || 'fun',
        target_duration: targetDuration || 30,
        gemini_api_key: geminiApiKey,
        gemini_model: geminiModel || 'gemini-2.5-flash',
        elevenlabs_api_key: elevenLabsApiKey || '',
        use_free_tts: useFreeTTS || false,
        custom_notes: customNotes || '',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Backend error: ${response.status}`);
    }

    const data = await response.json();

    let videoUrl = data.videoUrl;
    if (videoUrl && videoUrl.includes('/outputs/renders/')) {
      const filename = videoUrl.split('/').pop();
      videoUrl = `/api/renders/${filename}`;
    }

    return NextResponse.json({
      videoUrl,
      script: data.script,
      duration: data.duration,
      voice: data.voice,
      message: data.message || 'Video generated successfully',
    });
  } catch (error) {
    console.error('[Structured API Error]', error);
    const message = error instanceof Error ? error.message : 'Structured render failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
