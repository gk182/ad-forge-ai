import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { serverConfig } from '@/config/env';

// Convert base64 string to Gemini part format
function base64ToGenerativePart(base64String: string) {
  const match = base64String.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image base64 format');
  }
  return {
    inlineData: {
      data: match[2],
      mimeType: match[1],
    },
  };
}

// Download remote image and convert to Gemini part format
async function urlToGenerativePart(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return {
      inlineData: {
        data: base64,
        mimeType: contentType,
      },
    };
  } catch (error) {
    console.error(`[Gemini Multimodal] Failed to prepare image URL: ${url}`, error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      title,
      description,
      markdown,
      selectedImages, // array of image URLs
      videoCaptures,  // array of base64 keyframe captures
      productVideos,  // array of crawled video URLs
      tone,
      targetDuration,
      geminiApiKey: reqGeminiApiKey,
      geminiModel = 'gemini-2.5-flash',
      customNotes = '',
    } = await req.json();

    const geminiApiKey = reqGeminiApiKey || serverConfig.geminiApiKey;

    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API Key is required. Please set it in Settings or system .env.' }, { status: 400 });
    }

    // Initialize Gemini API
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModel,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.85,
      },
    });

    console.log('[Gemini Multimodal] Preparing media assets...');
    const mediaParts: any[] = [];

    // 1. Process base64 captures from video
    if (Array.isArray(videoCaptures)) {
      for (const cap of videoCaptures) {
        if (cap && cap.startsWith('data:image/')) {
          try {
            mediaParts.push(base64ToGenerativePart(cap));
          } catch (e) {
            console.warn('[Gemini Multimodal] Skip invalid capture:', e);
          }
        }
      }
    }

    // 2. Fetch and process selected product images (limit to first 4 to avoid token size blow-up)
    if (Array.isArray(selectedImages)) {
      const imagesToFetch = selectedImages.slice(0, 4);
      const parts = await Promise.all(imagesToFetch.map(async (url) => {
        if (url.startsWith('data:image/')) {
          return base64ToGenerativePart(url);
        }
        return urlToGenerativePart(url);
      }));
      for (const p of parts) {
        if (p) mediaParts.push(p);
      }
    }

    console.log(`[Gemini Multimodal] Bundled ${mediaParts.length} media items. Generating script...`);

    const systemPrompt = `You are an expert TikTok/Reels video ad creator.
Analyze the provided product info, markdown description, and the visual assets (images of the product, and keyframes extracted from the video clips) to create a highly viral 15-30s ad script.

Your output must be a structured JSON with:
1. "script_text": The complete marketing text to be read by the narrator.
2. "elevenlabs_voice_id": A suggested voice ID from ElevenLabs. Suggested IDs:
   - Friendly male: "JBFqnCBsd6RMkjVDRZzb" (George)
   - Professional male: "pNInz6obpgDQGcFmaJgB" (Adam)
   - Playful female: "EXAVITQu4vr4xnSDxMaL" (Bella)
   - Professional female: "21m00Tcm4TlvDq8ikWAM" (Rachel)
3. "scenes": An array of scene items. Each scene represents a video slice:
   - "media_type": "image" or "video"
   - "media_url": The URL of the image or video from the selected assets.
   - "duration": Planned scene duration in seconds (usually 3 to 5s per scene, sum of durations must approximate targetDuration).
   - "subtitle": The spoken text overlay for this scene (should be short, under 12-15 words).
   - "motion": For images, specify one of: "center_zoom", "slow_zoom_out", "pan_left", "pan_right", "drift_up", "drift_down", "ken_burns_tl", "ken_burns_br". For videos, always use "static".

OUTPUT SCHEMA:
{
  "script_text": "...",
  "elevenlabs_voice_id": "...",
  "scenes": [
    {
      "media_type": "image" | "video",
      "media_url": "...",
      "duration": 4.0,
      "subtitle": "...",
      "motion": "..."
    }
  ]
}
`;

    // Map of IDs to base64 images to restore them later
    const base64Map: Record<string, string> = {};
    const displayImages = (selectedImages || []).map((url: string, index: number) => {
      if (typeof url === 'string' && url.startsWith('data:image/')) {
        const id = `uploaded_image_${index}`;
        base64Map[id] = url;
        return id;
      }
      return url;
    });

    const userPrompt = `Create a video script for:
Title: ${title}
Description: ${description}
Product Details: ${markdown}

Tone: ${tone}
Target Duration: ${targetDuration} seconds
Custom Instructions: ${customNotes || 'None'}

Please map the "media_url" fields in "scenes" to the available image and video URLs:
Images: ${JSON.stringify(displayImages)}
Videos: ${JSON.stringify(productVideos || [])}
*Note: Match image scenes with product images, and video scenes with the video sources.*`;

    // Execute multimodal request
    const response = await model.generateContent([
      systemPrompt,
      ...mediaParts,
      userPrompt,
    ]);

    const text = response.response.text();
    console.log('[Gemini Multimodal] Raw output:', text);

    // Extract JSON block if wrapped in markdown
    let cleanJson = text.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
    }

    const scriptData = JSON.parse(cleanJson);

    // Restore base64 strings if they were selected
    if (scriptData.scenes && Array.isArray(scriptData.scenes)) {
      scriptData.scenes.forEach((scene: any) => {
        if (scene.media_url && base64Map[scene.media_url]) {
          scene.media_url = base64Map[scene.media_url];
        }
      });
    }

    return NextResponse.json(scriptData);
  } catch (error) {
    console.error('[Gemini Multimodal API Error]', error);
    const message = error instanceof Error ? error.message : 'Multimodal script generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
