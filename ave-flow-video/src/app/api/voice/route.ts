import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, serverConfig } from '@/config/env';

export async function POST(req: NextRequest) {
  try {
    const { script, sceneSubtitles, kokoroVoiceId } = await req.json();

    if (!script || typeof script !== 'string') {
      return NextResponse.json({ error: 'Script text is required.' }, { status: 400 });
    }

    console.log('[Voice API] Forwarding to FastAPI backend for Kokoro TTS...', { kokoroVoiceId });
    const response = await fetch(`${BACKEND_URL}/voice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        script,
        voice_engine: 'kokoro',
        kokoro_voice_id: kokoroVoiceId || 'af_heart',
        scene_subtitles: Array.isArray(sceneSubtitles) ? sceneSubtitles : [],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData?.detail || `Backend returned HTTP ${response.status}`;
      return NextResponse.json({ error: errMessage }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({
      audioBase64: data.audioBase64,
      audioDuration: data.audioDuration,
      alignment: data.alignment,
      sceneAlignments: data.sceneAlignments,
      alignmentSource: data.alignmentSource,
    });
  } catch (error) {
    console.error('Voice generation error:', error);
    const message = error instanceof Error ? error.message : 'Voiceover generation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
