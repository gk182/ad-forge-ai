import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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

type AssetCatalogEntry = {
  id: string;
  kind: 'image' | 'video';
  sourceUrl: string;
};

const DEFAULT_VARIANT_ANGLES = [
  {
    id: 'intro',
    label: 'App/Product Intro',
    instruction:
      'High-energy product introduction showcasing key features, benefits, and call to action. Similar to a standard promotional video.',
  },
  {
    id: 'user_review',
    label: 'User Review Roleplay',
    instruction:
      'Role-play as an authentic user reviewing the product/app. Speak naturally, recount the experience of using it, and mention specific features loved by users.',
  },
  {
    id: 'review_verification',
    label: 'Review Verification (Fact Check)',
    instruction:
      'Verifying customer reviews. Start by raising a common review comment (e.g., "People say this app is...") and verify if it is true, checking it against product facts.',
  },
  {
    id: 'user_feelings',
    label: 'User Feelings / Feedback',
    instruction:
      'A personal, emotional sharing of feelings, experiences, and feedback after using the product/app. Focus on the transformation/result.',
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

const GEMINI_VARIANTS_RESPONSE_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    variants: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          variant_id: { type: SchemaType.STRING },
          creative_angle: { type: SchemaType.STRING },
          script_text: { type: SchemaType.STRING },
          elevenlabs_voice_id: { type: SchemaType.STRING },
          rationale: { type: SchemaType.STRING },
          score: { type: SchemaType.NUMBER },
          coverageNotes: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          scenes: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                media_type: { type: SchemaType.STRING },
                media_url: { type: SchemaType.STRING },
                duration: { type: SchemaType.NUMBER },
                subtitle: { type: SchemaType.STRING },
                motion: { type: SchemaType.STRING },
                transition_type: { type: SchemaType.STRING },
                video_start_offset: { type: SchemaType.NUMBER },
              },
              required: ['media_type', 'media_url', 'duration', 'subtitle', 'motion'],
            },
          },
        },
        required: [
          'variant_id',
          'creative_angle',
          'script_text',
          'elevenlabs_voice_id',
          'rationale',
          'score',
          'coverageNotes',
          'scenes',
        ],
      },
    },
  },
  required: ['variants'],
};

function stripCodeFence(text: string) {
  let cleanJson = text.trim();
  if (cleanJson.startsWith('```json')) {
    cleanJson = cleanJson.split('```json')[1]?.split('```')[0]?.trim() || cleanJson;
  } else if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.split('```')[1]?.split('```')[0]?.trim() || cleanJson;
  }
  return cleanJson;
}

function extractBalancedJsonCandidate(text: string) {
  const start = text.search(/[\[{]/);
  if (start === -1) return '';

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack.at(-1);
      const matches =
        (char === '}' && last === '{') ||
        (char === ']' && last === '[');
      if (!matches) continue;
      stack.pop();
      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text.slice(start).trim();
}

function extractJsonPayload(text: string) {
  const cleanJson = stripCodeFence(text);
  const candidates = uniqueStrings([
    cleanJson,
    extractBalancedJsonCandidate(cleanJson),
    extractBalancedJsonCandidate(text),
  ]);

  let lastError: unknown;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to parse JSON payload.');
}

async function repairJsonPayloadWithModel(model: any, rawText: string) {
  const repairPrompt = `You are a strict JSON repair tool.
Fix the malformed Gemini output below and return valid JSON only.
Preserve all meaningful data, including variant ids, scene media URLs, subtitles, rationales, scores, and coverage notes.
If there are fewer than 4 variants, keep the best ones and duplicate the best available variant to reach 4.
Do not add commentary, markdown, or explanation.
Do not wrap the JSON in code fences.
Close every open string, array, and object.

Malformed output:
${rawText}`;

  const response = await model.generateContent([repairPrompt]);
  const repairedText = response.response.text();
  return extractJsonPayload(repairedText);
}

async function regenerateJsonPayloadWithModel(
  model: any,
  prompt: string,
  mediaParts: any[]
) {
  const regenerationPrompt = `${prompt}

Return valid JSON only.
Do not use markdown fences.
Keep each rationale under 160 characters.
Keep coverageNotes to at most 3 short strings per variant.
Ensure every string is properly closed.`;

  const response = await model.generateContent([
    ...mediaParts,
    regenerationPrompt,
  ]);
  return extractJsonPayload(response.response.text());
}

async function generateVariantFallback(
  model: any,
  basePrompt: string,
  mediaParts: any[],
  angle: { id: string; label: string; instruction: string },
  index: number
) {
  const prompt = `${basePrompt}

Return a top-level JSON object with a single "variants" array containing exactly 1 item.
Use variant_id "${angle.id}".
Creative angle: ${angle.label}
Direction: ${angle.instruction}
Return JSON only.`;

  const response = await model.generateContent([
    ...mediaParts,
    prompt,
  ]);

  const parsed = extractJsonPayload(response.response.text());
  const variants = Array.isArray(parsed?.variants) ? parsed.variants : [parsed];
  return variants[0] || {
    variant_id: angle.id || `variant_${index + 1}`,
    creative_angle: angle.label,
    script_text: '',
    elevenlabs_voice_id: 'JBFqnCBsd6RMkjVDRZzb',
    rationale: '',
    score: 70,
    coverageNotes: [],
    scenes: [],
  };
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
  videoPool: string[],
  assetIdToUrl: Record<string, string>,
  assetIdToKind: Record<string, 'image' | 'video'>
): GeneratedScene {
  const fallbackImage =
    imagePool[index % Math.max(1, imagePool.length)] ||
    imagePool[0] ||
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80';
  const fallbackVideo = videoPool[index % Math.max(1, videoPool.length)] || videoPool[0] || '';
  const requestedMediaType = raw?.media_type === 'video' ? 'video' : 'image';
  const rawMediaRef = normalizeText(raw?.media_url);
  const resolvedAssetUrl = assetIdToUrl[rawMediaRef] || rawMediaRef;
  const assetKind = assetIdToKind[rawMediaRef];
  const rawLooksVideo =
    assetKind === 'video' ||
    isLikelyVideoUrl(resolvedAssetUrl) ||
    videoPool.includes(resolvedAssetUrl);
  const resolvedVideoUrl = rawLooksVideo ? resolvedAssetUrl : fallbackVideo;
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
          ? fallbackImage || resolvedAssetUrl
          : resolvedAssetUrl || fallbackImage,
    duration: toPositiveNumber(raw?.duration, 3.5),
    subtitle: normalizeText(raw?.subtitle) || 'Check this out.',
    motion: normalizeText(raw?.motion) || (mediaType === 'video' ? 'static' : 'center_zoom'),
    transition_type: validTransition,
    video_start_offset: raw?.video_start_offset !== undefined ? Number(raw.video_start_offset) || 0 : undefined,
  };
}

function normalizeVariant(
  raw: any,
  index: number,
  mediaPool: string[],
  assetIdToUrl: Record<string, string>,
  assetIdToKind: Record<string, 'image' | 'video'>
): GeneratedVariant {
  const imagePool = mediaPool.filter((url) => !isLikelyVideoUrl(url));
  const videoPool = mediaPool.filter((url) => isLikelyVideoUrl(url));
  const scenes = Array.isArray(raw?.scenes)
    ? raw.scenes.map((scene: unknown, sceneIndex: number) =>
        normalizeScene(scene, sceneIndex, imagePool, videoPool, assetIdToUrl, assetIdToKind)
      )
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
      orderedAssets = [], // ordered assets with type, url, keyframes
      scriptMode = 'standard', // 'standard' | 'customer_review' | 'problem_solution' | 'asmr_unboxing'
      reviews = [], // array of customer reviews
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
        responseSchema: GEMINI_VARIANTS_RESPONSE_SCHEMA,
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
- "subtitle": the spoken text overlay for this scene. IMPORTANT: Write detailed and descriptive sentences for the subtitle that will take the same amount of time to read aloud as the scene's duration (about 2.5 to 3.5 words per second). For example, if a scene's duration is 4 seconds, the subtitle should be around 10-14 words long so that the voiceover fills the scene without leaving silent gaps.
- "motion": for images, one of "center_zoom", "slow_zoom_out", "pan_left", "pan_right", "drift_up", "drift_down", "ken_burns_tl", "ken_burns_br"; for videos, always "static"

Keep the variants meaningfully different in hook, pacing, or closing angle. Return JSON only.`;

    const assetCatalog: AssetCatalogEntry[] = [];
    const assetIdToUrl: Record<string, string> = {};
    const assetIdToKind: Record<string, 'image' | 'video'> = {};
    const imageAssetRefs: string[] = [];
    const videoAssetRefs: string[] = [];

    uniqueStrings(selectedImages || []).forEach((url, index) => {
      const id = `image_asset_${index + 1}`;
      assetCatalog.push({ id, kind: 'image', sourceUrl: url });
      assetIdToUrl[id] = url;
      assetIdToKind[id] = 'image';
      imageAssetRefs.push(id);
    });

    uniqueStrings(productVideos || []).forEach((url, index) => {
      const id = `video_asset_${index + 1}`;
      assetCatalog.push({ id, kind: 'video', sourceUrl: url });
      assetIdToUrl[id] = url;
      assetIdToKind[id] = 'video';
      videoAssetRefs.push(id);
    });

    const mediaPool = assetCatalog.map((asset) => asset.sourceUrl);
    const variantDescriptions = DEFAULT_VARIANT_ANGLES.map(
      (variant, idx) =>
        `${idx + 1}. ${variant.label}: ${variant.instruction}`
    ).join('\n');
    const assetListForPrompt = assetCatalog
      .map((asset) => `${asset.id} (${asset.kind})`)
      .join(', ');

    // Build script mode-specific instructions
    let scriptModeInstruction = '';
    switch (scriptMode) {
      case 'customer_review':
        scriptModeInstruction = `\n\nSCRIPT MODE: CUSTOMER REVIEW\nWrite the script as a first-person testimonial from a real customer.\nUse conversational, authentic language as if recording a genuine product review.\nReference specific product features the customer loves.\n${reviews && reviews.length > 0 ? `Real customer reviews to incorporate:\n${reviews.slice(0, 5).map((r: any, i: number) => `${i + 1}. "${r.body}" — ${r.author} (${r.rating}★)`).join('\n')}` : ''}`;
        break;
      case 'problem_solution':
        scriptModeInstruction = '\n\nSCRIPT MODE: PROBLEM → SOLUTION\nStart by presenting a relatable pain point or frustration.\nBuild tension for the first 30-40% of the script.\nThen reveal the product as the perfect solution.\nEnd with proof of results and a strong CTA.';
        break;
      case 'asmr_unboxing':
        scriptModeInstruction = '\n\nSCRIPT MODE: ASMR / UNBOXING\nUse calm, sensory-focused language.\nDescribe textures, sounds, and the unboxing experience.\nPace should be slower and more deliberate.\nFocus on visual details and tactile sensations.\nUse ellipses and soft transitions.';
        break;
      default:
        scriptModeInstruction = '\n\nSCRIPT MODE: STANDARD PROMO\nHigh-energy ad with attention-grabbing hook, clear benefits, and strong CTA.';
    }

    // Build ordered assets instruction if available
    const hasOrderedAssets = Array.isArray(orderedAssets) && orderedAssets.length > 0;
    let orderedAssetsInstruction = '';
    if (hasOrderedAssets) {
      const assetList = orderedAssets.map((a: any, i: number) => 
        `Scene ${i + 1}: ${a.type === 'video' ? 'VIDEO' : 'IMAGE'} → ${a.type === 'video' ? a.url : (a.url.startsWith('data:') ? `uploaded_image_${i}` : a.url)}`
      ).join('\n');
      orderedAssetsInstruction = `\n\nIMPORTANT — SCENE ORDER (MANDATORY):\nThe user has selected assets in a specific order. You MUST generate exactly ${orderedAssets.length} scenes, one per selected asset, in this exact order:\n${assetList}\nEach scene\'s media_url and media_type MUST match the corresponding asset above. Do NOT reorder, skip, or add extra scenes.`;
    }

    const userPrompt = `Create exactly 4 distinct video script variants for:
Title: ${title}
Description: ${description}
Product Details: ${markdown}

Tone: ${tone}
Target Duration: ${targetDuration} seconds
Custom Instructions: ${customNotes || 'None'}
${scriptModeInstruction}
${orderedAssetsInstruction}

Variant directions:
${variantDescriptions}

Please map the "media_url" fields in "scenes" only to the available asset IDs below.
Do not output raw URLs in "media_url". Output only an asset id like "image_asset_1" or "video_asset_1".
Available assets: ${assetListForPrompt}
Images: ${JSON.stringify(imageAssetRefs)}
Videos: ${JSON.stringify(videoAssetRefs)}
Rules:
- Return JSON only.
- Return a top-level object with a "variants" array of length 4.
- Each variant must have: variant_id, creative_angle, script_text, elevenlabs_voice_id, scenes, rationale, score, coverageNotes.
- Each variant must be meaningfully different in hook, pacing, or closing angle.
- Each scene must have detailed and descriptive subtitle text that matches its duration (approx. 2.5 to 3.5 words per second of duration to prevent silent gaps when spoken), a realistic duration, and a media_url from the provided assets.
- For video scenes, use motion "static".
- Keep each rationale under 160 characters.
- Keep coverageNotes to at most 3 short bullet-style strings per variant.
- Keep the total scene duration close to the target duration.
- Never emit partial URLs or partial asset IDs.
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
        console.warn('[Gemini Multimodal] Regenerating structured payload with stricter constraints.');
        try {
          parsed = await regenerateJsonPayloadWithModel(model, userPrompt, mediaParts);
        } catch (regenerationError) {
          console.error('[Gemini Multimodal] Regeneration pass failed:', regenerationError);
          console.warn('[Gemini Multimodal] Falling back to per-variant generation.');
          const fallbackVariants = await Promise.all(
            DEFAULT_VARIANT_ANGLES.map((angle, index) =>
              generateVariantFallback(model, userPrompt, mediaParts, angle, index)
            )
          );
          parsed = { variants: fallbackVariants };
        }
      }
    }
    const rawVariants = Array.isArray(parsed?.variants) ? parsed.variants : [parsed];
    const normalizedVariants = rawVariants
      .filter(Boolean)
      .slice(0, 4)
      .map((variant: unknown, index: number) => {
        const normalized = normalizeVariant(variant, index, mediaPool, assetIdToUrl, assetIdToKind);
        normalized.scenes = normalized.scenes.map((scene: GeneratedScene, sceneIndex: number) => {
          const restoredUrl = assetIdToUrl[scene.media_url];
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

    while (normalizedVariants.length < 4) {
      const clone = { ...normalizedVariants[0], variant_id: `fallback_${normalizedVariants.length + 1}` };
      clone.score = Math.max(0, clone.score - normalizedVariants.length * 2);
      clone.rationale = `${clone.rationale} Fallback copy used because the model returned fewer than 4 variants.`;
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
        media_url: assetIdToUrl[scene.media_url] || scene.media_url,
      })),
    }));
    responsePayload.selectedVariant = {
      ...responsePayload.selectedVariant,
      on_video_script: onVideoScript,
      scenes: responsePayload.selectedVariant.scenes.map((scene: GeneratedScene) => ({
        ...scene,
        media_url: assetIdToUrl[scene.media_url] || scene.media_url,
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
