import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, serverConfig } from '@/config/env';

const BACKEND_BASE_URL = BACKEND_URL;
const DID_API_URL = 'https://api.d-id.com';
const DEFAULT_SOURCE_URL =
  'https://d-id-public-bucket.s3.us-west-2.amazonaws.com/alice.jpg';

async function pollForResult(
  talkId: string,
  apiKey: string,
  maxAttempts = 80
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetch(`${DID_API_URL}/talks/${talkId}`, {
      headers: {
        Authorization: `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`D-ID polling failed (HTTP ${res.status})`);
    }

    const data = await res.json();
    console.log(`D-ID poll attempt ${i + 1}: status=${data.status}`);

    if (data.status === 'done' && data.result_url) {
      return data.result_url;
    }

    if (data.status === 'error' || data.status === 'rejected') {
      throw new Error(
        data.error?.description || data.description || 'D-ID video generation failed.'
      );
    }
  }

  throw new Error('D-ID video generation timed out after 4 minutes.');
}

export async function POST(req: NextRequest) {
  try {
    const {
      script,
      didApiKey: reqDidApiKey,
      avatarImageUrl,
      voiceId = 'en-US-JennyNeural',
      voiceProvider = 'microsoft',
      productData,
      elevenLabsApiKey: reqElevenLabsApiKey,
      targetDuration,
    } = await req.json();

    const elevenLabsApiKey = reqElevenLabsApiKey || serverConfig.elevenLabsApiKey;
    const didApiKey = reqDidApiKey || serverConfig.didApiKey;

    if (!script || typeof script !== 'string') {
      return NextResponse.json({ error: 'Script text is required.' }, { status: 400 });
    }

    const renderPayload = {
      title: productData?.title || 'Generated Video',
      script,
      description: productData?.description || '',
      image: productData?.image || avatarImageUrl?.trim() || '',
      screenshots: Array.isArray(productData?.screenshots) ? productData.screenshots : [],
      videos: Array.isArray(productData?.videos) ? productData.videos : [],
      elevenlabs_api_key: elevenLabsApiKey || null,
      target_duration: typeof targetDuration === 'number' ? targetDuration : null,
      cta_text: 'Tap the link in bio',
    };

    try {
      const renderResponse = await fetch(`${BACKEND_BASE_URL}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload),
      });

      if (renderResponse.ok) {
        const data = await renderResponse.json();
        let videoUrl = data.videoUrl;
        if (videoUrl && videoUrl.includes('/outputs/renders/')) {
          const filename = videoUrl.split('/').pop();
          videoUrl = `/api/renders/${filename}`;
        }
        return NextResponse.json({
          videoUrl,
          isMock: false,
          message: data.message || 'Rendered with ffmpeg storyboard pipeline.',
        });
      }

      const renderError = await renderResponse.text().catch(() => 'Unknown render error');
      console.warn('Backend render failed, falling back to D-ID if available:', renderError);
    } catch (renderError) {
      console.warn('Backend render request failed, falling back to D-ID if available:', renderError);
    }

    if (didApiKey) {
      const sourceUrl = avatarImageUrl?.trim() || DEFAULT_SOURCE_URL;
      console.log('D-ID source image:', sourceUrl);
      console.log(`D-ID voice: provider=${voiceProvider}, id=${voiceId}`);

      try {
        const createRes = await fetch(`${DID_API_URL}/talks`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${didApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source_url: sourceUrl,
            script: {
              type: 'text',
              input: script,
              subtitles: false,
              provider: {
                type: voiceProvider,
                voice_id: voiceId,
              },
            },
            config: {
              fluent: true,
              pad_audio: 0.0,
            },
          }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(
            errData?.description ||
              errData?.message ||
              errData?.kind ||
              `D-ID returned HTTP ${createRes.status}`
          );
        }

        const createData = await createRes.json();
        const talkId = createData.id;
        if (!talkId) {
          throw new Error('D-ID did not return a talk ID.');
        }

        const videoUrl = await pollForResult(talkId, didApiKey);
        return NextResponse.json({ videoUrl, isMock: false });
      } catch (didError) {
        console.error('D-ID Talks API error, falling back to mock:', didError);
      }
    }

    return NextResponse.json(
      {
        videoUrl: '',
        isMock: true,
        message: 'Rendered with ffmpeg storyboard pipeline.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Avatar route error:', error);
    const message = error instanceof Error ? error.message : 'Avatar generation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
