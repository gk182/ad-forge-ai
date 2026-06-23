import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, serverConfig } from '@/config/env';

// Helper to chunk text and fetch Google Translate TTS
async function generateFreeTTS(text: string): Promise<Buffer> {
  const chunks: string[] = [];
  let current = '';
  // Split text by punctuation or spaces to respect 200-char Google Translate limit
  const sentences = text.match(/[^.!?]+[.!?]*|.+/g) || [text];

  for (const sentence of sentences) {
    if ((current + sentence).length > 200) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += ' ' + sentence;
    }
  }
  if (current) chunks.push(current.trim());

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        buffers.push(Buffer.from(ab));
      } else {
        console.error(`Free TTS chunk fetch failed: ${res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to fetch TTS chunk:', e);
    }
  }

  if (buffers.length === 0) {
    throw new Error('Failed to generate any audio chunks');
  }

  return Buffer.concat(buffers);
}

export async function POST(req: NextRequest) {
  try {
    const { script, elevenLabsApiKey: reqElevenLabsApiKey, elevenLabsVoiceId, useFreeTTS } = await req.json();

    const elevenLabsApiKey = reqElevenLabsApiKey || serverConfig.elevenLabsApiKey;

    if (!script || typeof script !== 'string') {
      return NextResponse.json({ error: 'Script text is required.' }, { status: 400 });
    }

    if (useFreeTTS) {
      console.log('[Voice API] Generating Free TTS audio...');
      const audioBuffer = await generateFreeTTS(script);
      const audioBase64 = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      return NextResponse.json({ audioBase64 });
    }

    // ElevenLabs flow (via FastAPI backend proxy)
    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API Key is required. Please set it in Settings or system .env.' }, { status: 400 });
    }

    console.log('[Voice API] Forwarding to FastAPI backend for ElevenLabs TTS...');
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
