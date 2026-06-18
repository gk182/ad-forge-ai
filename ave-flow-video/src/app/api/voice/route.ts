import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    const { script, elevenLabsApiKey, elevenLabsVoiceId } = await req.json();

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API Key is required.' }, { status: 400 });
    }

    if (!script || typeof script !== 'string') {
      return NextResponse.json({ error: 'Script text is required.' }, { status: 400 });
    }

    const response = await fetch(`${BACKEND_URL}/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        elevenlabs_api_key: elevenLabsApiKey,
        elevenlabs_voice_id: elevenLabsVoiceId || 'JBFqnCBsd6RMkjVDRZzb',
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData?.detail || `Backend returned HTTP ${response.status}`;
      return NextResponse.json({ error: errMessage }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({ audioBase64: data.audioBase64 });
  } catch (error) {
    console.error('Voice generation error:', error);
    const message = error instanceof Error ? error.message : 'Voiceover generation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
