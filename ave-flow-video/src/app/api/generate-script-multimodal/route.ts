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

type GeneratedScene = {
  media_type: 'image' | 'video';
  media_url: string;
  duration: number;
  subtitle: string;
  motion: string;
  transition_type?: 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'zoom_in' | 'none';
  video_start_offset?: number;
};

type GeneratedVariant = {
  variant_id: string;
  creative_angle: string;
  script_text: string;
  elevenlabs_voice_id: string;
  scenes: GeneratedScene[];
  rationale: string;
  score: number;
  coverageNotes: string[];
  on_video_script?: string;
};

const DEFAULT_VARIANT_ANGLES = [
  {
    id: 'hook_benefit',
    label: 'Hook-first benefit demo',
    instruction:
      'Open with a curiosity hook, immediately show the strongest benefit, and keep the pacing sharp and direct.',
  },
  {
    id: 'social_proof',
    label: 'Social proof / credibility',
    instruction:
      'Lead with trust, proof, comparison, or "people like you" language. Make it feel like a real recommendation, not an ad.',
  },
  {
    id: 'urgent_fomo',
    label: 'Urgency / FOMO',
    instruction:
      'Create urgency and a strong close. Make the product feel timely, limited, or too useful to skip.',
  },
];

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toPositiveNumber(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function isLikelyVideoUrl(url: string) {
  if (!url) return false;
  if (/^data:video\//i.test(url)) return true;
  return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
}

function extractJsonPayload(text: string) {
  let cleanJson = text.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
  }
  return JSON.parse(cleanJson);
}

async function repairJsonPayloadWithModel(model: any, rawText: string) {
  const repairPrompt = `You are a strict JSON repair tool.
Fix the malformed Gemini output below and return valid JSON only.
Preserve all meaningful data, including variant ids, scene media URLs, subtitles, rationales, scores, and coverage notes.
If there are fewer than 3 variants, keep the best ones and duplicate the best available variant to reach 3.
Do not add commentary, markdown, or explanation.

Malformed output:
${rawText}`;

  const response = await model.generateContent([repairPrompt]);
  const repairedText = response.response.text();
  return extractJsonPayload(repairedText);
}

function countWords(text: string) {
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean);
  return tokens.length;
}

function hasCTA(text: string) {
  return /\b(download|tap|shop|buy|order|claim|get it|link in bio|install|try)\b/i.test(text);
}

function hasHookSignal(text: string) {
  return /[?!]/.test(text) || /\b(you need this|stop scrolling|wait|watch this|here's|imagine|ever)\b/i.test(text);
}

function normalizeScene(
  raw: any,
  index: number,
  imagePool: string[],
  videoPool: string[]
): GeneratedScene {
  const fallbackImage =
    imagePool[index % Math.max(1, imagePool.length)] ||
    imagePool[0] ||
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
  const fallbackVideo = videoPool[index % Math.max(1, videoPool.length)] || videoPool[0] || '';
  const requestedMediaType = raw?.media_type === 'video' ? 'video' : 'image';
  const rawMediaUrl = normalizeText(raw?.media_url);
  const rawLooksVideo = isLikelyVideoUrl(rawMediaUrl) || videoPool.includes(rawMediaUrl);
  const resolvedVideoUrl = rawLooksVideo ? rawMediaUrl : fallbackVideo;
  const mediaType: 'image' | 'video' = requestedMediaType === 'video' && isLikelyVideoUrl(resolvedVideoUrl)
    ? 'video'
    : 'image';
  const transitionType = raw?.transition_type;
  const validTransition =
    transitionType === 'fade' ||
    transitionType === 'slide_left' ||
    transitionType === 'slide_right' ||
    transitionType === 'slide_up' ||
    transitionType === 'slide_down' ||
    transitionType === 'zoom_in' ||
    transitionType === 'none'
      ? transitionType
      : undefined;

  return {
    media_type: mediaType,
    media_url:
      mediaType === 'video'
        ? resolvedVideoUrl
        : requestedMediaType === 'video'
          ? fallbackImage || rawMediaUrl
          : rawMediaUrl || fallbackImage,
    duration: toPositiveNumber(raw?.duration, 3.5),
    subtitle: normalizeText(raw?.subtitle) || 'Check this out.',
    motion: normalizeText(raw?.motion) || (mediaType === 'video' ? 'static' : 'center_zoom'),
    transition_type: validTransition,
    video_start_offset: raw?.video_start_offset !== undefined ? Number(raw.video_start_offset) || 0 : undefined,
  };
}

function normalizeVariant(raw: any, index: number, mediaPool: string[]): GeneratedVariant {
  const imagePool = mediaPool.filter((url) => !isLikelyVideoUrl(url));
  const videoPool = mediaPool.filter((url) => isLikelyVideoUrl(url));
  const scenes = Array.isArray(raw?.scenes)
    ? raw.scenes.map((scene: unknown, sceneIndex: number) => normalizeScene(scene, sceneIndex, imagePool, videoPool))
    : [];
  const scriptText = normalizeText(raw?.script_text) || scenes.map((scene: GeneratedScene) => scene.subtitle).join(' ').trim();
  const voiceId = normalizeText(raw?.elevenlabs_voice_id) || 'JBFqnCBsd6RMkjVDRZzb';
  const coverageNotes = uniqueStrings(
    Array.isArray(raw?.coverageNotes)
      ? raw.coverageNotes.map((note: unknown) => normalizeText(note))
      : []
  );
  const onVideoScript = scenes.map((scene: GeneratedScene) => scene.subtitle).join(' ').trim();

  return {
    variant_id: normalizeText(raw?.variant_id) || `variant_${index + 1}`,
    creative_angle: normalizeText(raw?.creative_angle) || `Variant ${index + 1}`,
    script_text: scriptText,
    elevenlabs_voice_id: voiceId,
    scenes,
    rationale: normalizeText(raw?.rationale) || 'Model-generated creative variation.',
    score: toPositiveNumber(raw?.score, 70),
    coverageNotes,
    on_video_script: onVideoScript,
  };
}

function scoreVariant(
  variant: GeneratedVariant,
  targetDuration: number,
  mediaPool: string[],
  videos: string[]
) {
  const totalDuration = variant.scenes.reduce((sum, scene) => sum + toPositiveNumber(scene.duration, 0), 0);
  const wordCount = countWords(variant.script_text);
  const targetWords = Math.round(targetDuration * 2.45);
  const uniqueMedia = uniqueStrings(variant.scenes.map((scene: GeneratedScene) => scene.media_url));
  const allowedMedia = new Set(mediaPool.filter(Boolean));
  const videoSet = new Set(videos.filter(Boolean));
  const usesVideo = variant.scenes.some((scene) => scene.media_type === 'video' || videoSet.has(scene.media_url));
  const invalidMediaCount = variant.scenes.filter((scene) => scene.media_url && !allowedMedia.has(scene.media_url)).length;
  const repeatedMediaPenalty = Math.max(0, variant.scenes.length - uniqueMedia.length) * 2;
  const firstSubtitle = variant.scenes[0]?.subtitle || '';
  const lastSubtitle = variant.scenes[variant.scenes.length - 1]?.subtitle || '';

  let score = Number.isFinite(variant.score) ? variant.score : 70;
  score += Math.max(0, 18 - Math.abs(totalDuration - targetDuration) * 2.5);
  score += Math.max(0, 12 - Math.abs(wordCount - targetWords) * 0.8);
  score += Math.min(12, uniqueMedia.length * 2.5);
  if (usesVideo && videos.length > 0) score += 8;
  if (hasHookSignal(firstSubtitle)) score += 8;
  if (firstSubtitle.split(/\s+/).filter(Boolean).length <= 12) score += 4;
  if (hasCTA(variant.script_text) || hasCTA(lastSubtitle)) score += 8;
  if (invalidMediaCount > 0) score -= invalidMediaCount * 4;
  if (repeatedMediaPenalty > 0) score -= repeatedMediaPenalty;
  if (variant.scenes.length < 3) score -= 4;
  if (variant.scenes.length > 8) score -= 4;

  return Math.max(0, Math.round(score));
}

function buildSelectionReason(variant: GeneratedVariant, targetDuration: number) {
  const totalDuration = variant.scenes.reduce((sum, scene) => sum + toPositiveNumber(scene.duration, 0), 0);
  const mediaCount = uniqueStrings(variant.scenes.map((scene: GeneratedScene) => scene.media_url)).length;
  const hook = variant.scenes[0]?.subtitle || '';
  const cta = variant.scenes[variant.scenes.length - 1]?.subtitle || '';

  const reasons = [
    `${variant.creative_angle} scored highest at ${variant.score}/100.`,
    `Total duration ${totalDuration.toFixed(1)}s is close to the ${targetDuration.toFixed(1)}s target.`,
    `${mediaCount} unique assets are covered across the selected scenes.`,
  ];

  if (hasHookSignal(hook)) {
    reasons.push('The opening hook is strong and attention-grabbing.');
  }
  if (hasCTA(cta) || hasCTA(variant.script_text)) {
    reasons.push('The CTA is clear and action-oriented.');
  }

  return reasons.join(' ');
}

function buildOnVideoScript(variant: GeneratedVariant) {
  return variant.scenes.map((scene) => scene.subtitle).filter(Boolean).join(' ').trim();
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
        maxOutputTokens: 8192,
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
Analyze the provided product info, markdown description, and the visual assets (images of the product, and keyframes extracted from the video clips) to create multiple highly viral 15-30s ad script variants.

You must return a JSON object with a top-level "variants" array of exactly 3 items.
Each variant must include:
- "variant_id": a stable short id
- "creative_angle": a short label for the approach
- "script_text": the complete marketing text to be read by the narrator
- "elevenlabs_voice_id": a suggested voice ID from ElevenLabs
- "scenes": an array of scene items
- "rationale": why this variant works
- "score": a 0-100 self-score
- "coverageNotes": an array of short notes about media or message coverage

Suggested voice IDs:
- Friendly male: "JBFqnCBsd6RMkjVDRZzb" (George)
- Professional male: "pNInz6obpgDQGcFmaJgB" (Adam)
- Playful female: "EXAVITQu4vr4xnSDxMaL" (Bella)
- Professional female: "21m00Tcm4TlvDq8ikWAM" (Rachel)

Each scene represents a video slice and must include:
- "media_type": "image" or "video"
- "media_url": the URL of the image or video from the selected assets
- "duration": planned scene duration in seconds
- "subtitle": the spoken text overlay for this scene
- "motion": for images, one of "center_zoom", "slow_zoom_out", "pan_left", "pan_right", "drift_up", "drift_down", "ken_burns_tl", "ken_burns_br"; for videos, always "static"

Keep the variants meaningfully different in hook, pacing, or closing angle. Return JSON only.`;

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

    const mediaPool = uniqueStrings([...displayImages, ...(productVideos || [])]);
    const variantDescriptions = DEFAULT_VARIANT_ANGLES.map(
      (variant, idx) =>
        `${idx + 1}. ${variant.label}: ${variant.instruction}`
    ).join('\n');

    const userPrompt = `Create exactly 3 distinct video script variants for:
Title: ${title}
Description: ${description}
Product Details: ${markdown}

Tone: ${tone}
Target Duration: ${targetDuration} seconds
Custom Instructions: ${customNotes || 'None'}

Variant directions:
${variantDescriptions}

Please map the "media_url" fields in "scenes" only to the available image and video URLs below.
Images: ${JSON.stringify(displayImages)}
Videos: ${JSON.stringify(productVideos || [])}
Rules:
- Return JSON only.
- Return a top-level object with a "variants" array of length 3.
- Each variant must have: variant_id, creative_angle, script_text, elevenlabs_voice_id, scenes, rationale, score, coverageNotes.
- Each variant must be meaningfully different in hook, pacing, or closing angle.
- Each scene must have short subtitle text, a realistic duration, and a media_url from the provided assets.
- For video scenes, use motion "static".
- Keep the total scene duration close to the target duration.
- Keep the script natural, TikTok-friendly, and product-specific.`;

    // Execute multimodal request
    const response = await model.generateContent([
      systemPrompt,
      ...mediaParts,
      userPrompt,
    ]);

    const text = response.response.text();
    console.log('[Gemini Multimodal] Raw output:', text);

    let parsed: any;
    try {
      parsed = extractJsonPayload(text);
    } catch (parseError) {
      console.warn('[Gemini Multimodal] Initial JSON parse failed, retrying with repair pass.');
      try {
        parsed = await repairJsonPayloadWithModel(model, text);
      } catch (repairError) {
        console.error('[Gemini Multimodal] Repair pass failed:', repairError);
        throw parseError;
      }
    }
    const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : [parsed];
    const normalizedVariants = rawVariants
      .filter(Boolean)
      .slice(0, 3)
      .map((variant: unknown, index: number) => {
        const normalized = normalizeVariant(variant, index, mediaPool);
        normalized.scenes = normalized.scenes.map((scene: GeneratedScene, sceneIndex: number) => {
          const restoredUrl = base64Map[scene.media_url];
          return {
            ...scene,
            media_url: restoredUrl || scene.media_url,
            motion: scene.media_type === 'video' ? 'static' : scene.motion,
            video_start_offset: scene.media_type === 'video' ? scene.video_start_offset || 0 : scene.video_start_offset,
          };
        });
        normalized.score = scoreVariant(normalized, toPositiveNumber(targetDuration, 30), mediaPool, productVideos || []);
        return normalized;
      });

    if (normalizedVariants.length === 0) {
      throw new Error('Gemini returned no usable variants.');
    }

    while (normalizedVariants.length < 3) {
      const clone = { ...normalizedVariants[0], variant_id: `fallback_${normalizedVariants.length + 1}` };
      clone.score = Math.max(0, clone.score - normalizedVariants.length * 2);
      clone.rationale = `${clone.rationale} Fallback copy used because the model returned fewer than 3 variants.`;
      clone.coverageNotes = uniqueStrings([...clone.coverageNotes, 'Fallback variant generated from the selected script.']);
      normalizedVariants.push(clone);
    }

    normalizedVariants.sort((a: GeneratedVariant, b: GeneratedVariant) => b.score - a.score);
    const selectedVariant = normalizedVariants[0];
    const selectedVariantIndex = 0;
    const selectionReason = buildSelectionReason(selectedVariant, toPositiveNumber(targetDuration, 30));
    const onVideoScript = buildOnVideoScript(selectedVariant);

    console.log('[Gemini Multimodal] Selected variant:', {
      variant_id: selectedVariant.variant_id,
      creative_angle: selectedVariant.creative_angle,
      score: selectedVariant.score,
      selectionReason,
    });
    console.log('[Gemini Multimodal] Selected on-video script:', onVideoScript);

    const responsePayload = {
      variants: normalizedVariants,
      selectedVariantIndex,
      selectedVariant,
      selectionReason,
      on_video_script: onVideoScript,
      script_text: selectedVariant.script_text,
      elevenlabs_voice_id: selectedVariant.elevenlabs_voice_id,
      scenes: selectedVariant.scenes,
    };

    // Restore base64 strings if they were selected
    responsePayload.variants = responsePayload.variants.map((variant: GeneratedVariant) => ({
      ...variant,
      scenes: variant.scenes.map((scene: GeneratedScene) => ({
        ...scene,
        media_url: base64Map[scene.media_url] || scene.media_url,
      })),
    }));
    responsePayload.selectedVariant = {
      ...responsePayload.selectedVariant,
      on_video_script: onVideoScript,
      scenes: responsePayload.selectedVariant.scenes.map((scene: GeneratedScene) => ({
        ...scene,
        media_url: base64Map[scene.media_url] || scene.media_url,
      })),
    };
    responsePayload.script_text = responsePayload.selectedVariant.script_text;
    responsePayload.elevenlabs_voice_id = responsePayload.selectedVariant.elevenlabs_voice_id;
    responsePayload.scenes = responsePayload.selectedVariant.scenes;
    responsePayload.on_video_script = onVideoScript;

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('[Gemini Multimodal API Error]', error);
    const message = error instanceof Error ? error.message : 'Multimodal script generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
