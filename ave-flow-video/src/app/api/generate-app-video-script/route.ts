import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { serverConfig } from '@/config/env';
import { z } from 'zod';

// Zod schemas for robust validation
const SceneValidationSchema = z.object({
  imageUrl: z.string(),
  duration: z.number().positive(),
  subtitle: z.string(),
  featureLabel: z.string(),
  featureDescription: z.string(),
  animation: z.enum(['highlight_pulse', 'stagger_in', 'spring_scale', 'fade_in', 'slide_up', 'none']),
  transition: z.enum(['fade', 'slide_left', 'slide_right', 'slide_up', 'zoom_in', 'none']),
  ctaText: z.string().optional(),
});

const ScriptResponseValidationSchema = z.object({
  appName: z.string(),
  tagline: z.string(),
  preset: z.enum([
    'hero_floating',
    'orbit_reveal',
    'screenshot_cascade',
    'tiktok_hook',
    'phone_wall',
    'phone_explosion',
    'blueprint_style',
    'ai_assistant',
    'feature_spotlight',
    'premium_luxury',
    'floating_cards',
    'cinematic_reveal',
    'front_flat'
  ]),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  scenes: z.array(SceneValidationSchema).min(1).max(5),
  scriptText: z.string(),
  rationale: z.string(),
});

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
    console.error(`[Gemini App vision] Failed to fetch image: ${url}`, error);
    return null;
  }
}

const GEMINI_MOBILE_RESPONSE_SCHEMA: any = {
  type: SchemaType.OBJECT,
  properties: {
    appName: { type: SchemaType.STRING },
    tagline: { type: SchemaType.STRING },
    preset: {
      type: SchemaType.STRING,
      description: "Must be one of: 'hero_floating', 'orbit_reveal', 'screenshot_cascade', 'tiktok_hook', 'phone_wall', 'phone_explosion', 'blueprint_style', 'ai_assistant', 'feature_spotlight', 'premium_luxury', 'floating_cards', 'cinematic_reveal', 'front_flat'"
    },
    primaryColor: {
      type: SchemaType.STRING,
      description: "Hex color representing the dominant brand/theme color of the app analyzed from the screenshots (e.g. '#2563eb')"
    },
    secondaryColor: {
      type: SchemaType.STRING,
      description: "Hex color representing the accent or contrasting brand color of the app analyzed from the screenshots (e.g. '#10b981')"
    },
    scenes: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          imageUrl: {
            type: SchemaType.STRING,
            description: "Must match one of the available image asset IDs exactly (e.g. 'image_asset_1')"
          },
          duration: { type: SchemaType.NUMBER },
          subtitle: { type: SchemaType.STRING },
          featureLabel: { type: SchemaType.STRING },
          featureDescription: { type: SchemaType.STRING },
          animation: {
            type: SchemaType.STRING,
            description: "Must be one of: 'highlight_pulse', 'stagger_in', 'spring_scale', 'fade_in', 'slide_up', 'none'"
          },
          transition: {
            type: SchemaType.STRING,
            description: "Must be one of: 'fade', 'slide_left', 'slide_right', 'slide_up', 'zoom_in', 'none'"
          },
          ctaText: { type: SchemaType.STRING }
        },
        required: ['imageUrl', 'duration', 'subtitle', 'featureLabel', 'featureDescription', 'animation', 'transition']
      }
    },
    scriptText: { type: SchemaType.STRING },
    rationale: { type: SchemaType.STRING }
  },
  required: ['appName', 'tagline', 'preset', 'primaryColor', 'secondaryColor', 'scenes', 'scriptText', 'rationale']
};

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  try {
    const {
      appName: clientAppName,
      url,
      crawlData,
      selectedImages = [],
      tone = 'friendly',
      targetDuration = 15,
      customNotes = '',
      geminiApiKey: reqGeminiApiKey,
      geminiModel = 'gemini-2.5-flash',
    } = await req.json();

    const geminiApiKey = reqGeminiApiKey || serverConfig.geminiApiKey;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key is required. Please set it in Settings.' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModel,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_MOBILE_RESPONSE_SCHEMA,
        temperature: 0.8,
        maxOutputTokens: 8192,
      },
    });

    console.log('[Gemini App vision] Preparing screenshots...');
    const mediaParts: any[] = [];
    const assetIdToUrl: Record<string, string> = {};
    const imageAssetRefs: string[] = [];

    // Process up to 5 screenshots
    const screenshotsToProcess = selectedImages.slice(0, 5);
    for (let i = 0; i < screenshotsToProcess.length; i++) {
      const imgUrl = screenshotsToProcess[i];
      const assetId = `image_asset_${i + 1}`;
      assetIdToUrl[assetId] = imgUrl;
      imageAssetRefs.push(assetId);

      if (imgUrl.startsWith('data:image/')) {
        try {
          mediaParts.push(base64ToGenerativePart(imgUrl));
        } catch (e) {
          console.warn('[Gemini App vision] Skip invalid base64 screenshot:', e);
        }
      } else {
        const part = await urlToGenerativePart(imgUrl);
        if (part) mediaParts.push(part);
      }
    }

    console.log(`[Gemini App vision] Bundled ${mediaParts.length} media items. Preparing single AI pass...`);

    const systemPrompt = `You are an elite mobile app video advertising script writer and UI designer.
Your task is to analyze the provided mobile app description/crawl data and the uploaded screenshots, and produce a high-impact, highly engaging video ad script (approx. 15-30s).

You will output a JSON object containing:
- appName: The name of the mobile app (infer from screenshots/crawl data if not explicitly given).
- tagline: A brief, punchy slogan or description of the app.
- primaryColor: Look at the screenshots, identify the dominant brand/theme color of the app (e.g. green for agriculture apps, blue for banking apps), and return it as a Hex string (e.g. '#2563eb').
- secondaryColor: Identify a matching accent or secondary theme color from the screenshots and return it as a Hex string (e.g. '#10b981').
- preset: Select the overall video visual & animation style preset that best fits the app category:
  - 'hero_floating': Clean, premium, floating perspective. Best for standard productivity, finance, or general utility apps.
  - 'orbit_reveal': 3D orbit rotations with star particles. Best for cinematic reveals, innovative tech, or hardware-adjacent apps.
  - 'screenshot_cascade': Multiple screens sliding down in cascade sequence. Best for photo galleries, social feeds, messaging apps, and portfolios.
  - 'tiktok_hook': Energetic neon glows, snappy text hook overlays. Best for entertainment, social, or consumer/viral apps.
  - 'phone_wall': Multi-mockup wallpaper background. Best for rich utility suites or dashboards with many views.
  - 'phone_explosion': Bezel splits and screen layers separating/reassembling in space. Best for high-impact action features or gaming.
  - 'blueprint_style': Technical grid lines, crosshairs, and blueprint HUD. Best for developer tools, engineering, data-heavy, or highly technical apps.
  - 'ai_assistant': Connected nodes and pulsing neural web lines. Best for AI chats, virtual agents, voice assistants, and futuristic tools.
  - 'feature_spotlight': Centered focus auto-zooming onto specific UI buttons/features. Best for analytical dashboards or detail walkthroughs.
  - 'premium_luxury': Sophisticated dark styling with gold light sweeps. Best for high-end fashion, luxury, premium design, or boutique lifestyle apps.
  - 'floating_cards': UI components detaching and floating in front of the mockup. Best for task trackers, checklists, profile pages, and charts.
  - 'cinematic_reveal': Cinematic smoke, backlighting, and lens sweeps. Best for dramatic, narrative, or creative brand intros.
  - 'front_flat': Flat, front-facing phone mockup showing directly forward. Best for flat-lay designs, direct product mockups, and minimal modern styling.
- scriptText: The complete marketing monologue to be read by a narrator.
- rationale: A short explanation of the narrative hook and why it fits this app.
- scenes: An array of 1 to 5 scenes representing the video sequence.

For each scene in "scenes":
- imageUrl: The ID of the image asset to display (e.g. 'image_asset_1', 'image_asset_2'). You MUST use only the available asset IDs.
- duration: The time (in seconds) the scene will be shown. Keep total duration close to ${targetDuration}s.
- subtitle: The voiceover / karaoke subtitle spoken during this scene. Write descriptive, engaging sentences (approx 3 words per second).
- featureLabel: A short uppercase badge or title identifying the featured component (e.g. "DASHBOARD", "INSTANT CHECKOUT").
- featureDescription: A brief text overlay explanation of what is happening in the UI or what feature is highlighted.
- animation: The phone entrance/emphasis animation. Choose from: 'highlight_pulse', 'stagger_in', 'spring_scale', 'fade_in', 'slide_up', 'none'.
- transition: The transition into this scene. Choose from: 'fade', 'slide_left', 'slide_right', 'slide_up', 'zoom_in', 'none'.
- ctaText: Optional CTA text overlay.

Please be careful to map each scene to the correct screenshot asset ID based on your analysis of the UI content in each screenshot.
Available asset IDs to use: ${JSON.stringify(imageAssetRefs)}`;

    const userPrompt = `Create a viral, high-conversion mobile app video script.
App Store/Website Crawl Info:
${crawlData || 'No crawl data provided.'}

URL: ${url || 'No URL provided.'}
Suggested App Name: ${clientAppName || 'Infer from screenshots'}
Tone of the ad: ${tone}
Target Duration: ${targetDuration} seconds
Custom Instructions: ${customNotes || 'None'}

Please construct the sequence of scenes mapping directly to the screenshots. Use only these asset IDs: ${JSON.stringify(imageAssetRefs)}.
Ensure the flow is natural:
1. Scene 1: Hook the user, showcase the brand name and the primary value proposition.
2. Middle Scenes: Focus on core features shown in the screenshots, using 'highlight_pulse' or 'spring_scale' for important CTA buttons or cards.
3. Final Scene: Call to action, invite them to install or visit the app.`;

    const response = await model.generateContent([
      systemPrompt,
      ...mediaParts,
      userPrompt,
    ]);

    const rawText = response.response.text();
    console.log('[Gemini App vision] Raw response:', rawText);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(rawText.trim());
    } catch (err) {
      // Fallback if there's any formatting glitch (e.g. markdown code fence wrap)
      let clean = rawText.trim();
      if (clean.startsWith('```json')) {
        clean = clean.split('```json')[1]?.split('```')[0]?.trim() || clean;
      } else if (clean.startsWith('```')) {
        clean = clean.split('```')[1]?.split('```')[0]?.trim() || clean;
      }
      parsedPayload = JSON.parse(clean);
    }

    // Map asset IDs back to original screenshot URLs/base64 strings and normalize animations/transitions/presets
    const allowedAnimations = ['highlight_pulse', 'stagger_in', 'spring_scale', 'fade_in', 'slide_up', 'none'];
    const allowedTransitions = ['fade', 'slide_left', 'slide_right', 'slide_up', 'zoom_in', 'none'];
    const allowedPresets = [
      'hero_floating',
      'orbit_reveal',
      'screenshot_cascade',
      'tiktok_hook',
      'phone_wall',
      'phone_explosion',
      'blueprint_style',
      'ai_assistant',
      'feature_spotlight',
      'premium_luxury',
      'floating_cards',
      'cinematic_reveal',
      'front_flat'
    ];

    if (!parsedPayload.preset || !allowedPresets.includes(parsedPayload.preset)) {
      console.warn(`[Gemini App vision] Mapping invalid or missing preset "${parsedPayload.preset}" to "hero_floating"`);
      parsedPayload.preset = 'hero_floating';
    }

    // Default primary and secondary brand colors if missing or invalid hex format
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    if (!parsedPayload.primaryColor || !hexRegex.test(parsedPayload.primaryColor)) {
      parsedPayload.primaryColor = '#6366f1'; // default indigo
    }
    if (!parsedPayload.secondaryColor || !hexRegex.test(parsedPayload.secondaryColor)) {
      parsedPayload.secondaryColor = '#ec4899'; // default pink
    }

    if (parsedPayload.scenes && Array.isArray(parsedPayload.scenes)) {
      parsedPayload.scenes = parsedPayload.scenes.map((scene: any) => {
        const resolvedUrl = assetIdToUrl[scene.imageUrl] || scene.imageUrl;
        
        let resolvedAnim = scene.animation;
        if (!allowedAnimations.includes(resolvedAnim)) {
          console.warn(`[Gemini App vision] Mapping invalid animation "${resolvedAnim}" to "spring_scale"`);
          resolvedAnim = 'spring_scale';
        }
        
        let resolvedTransition = scene.transition;
        if (!allowedTransitions.includes(resolvedTransition)) {
          console.warn(`[Gemini App vision] Mapping invalid transition "${resolvedTransition}" to "fade"`);
          resolvedTransition = 'fade';
        }

        return {
          ...scene,
          imageUrl: resolvedUrl,
          animation: resolvedAnim,
          transition: resolvedTransition,
        };
      });
    }

    // Zod validation check
    const validationResult = ScriptResponseValidationSchema.safeParse(parsedPayload);
    if (!validationResult.success) {
      console.error('[Gemini App vision] Zod validation failed:', validationResult.error);
      return NextResponse.json(
        {
          error: 'AI generated output failed validation constraints.',
          details: validationResult.error.issues,
          rawOutput: parsedPayload,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(validationResult.data);
  } catch (error) {
    console.error('[Gemini App vision API Error]', error);
    const msg = error instanceof Error ? error.message : 'Mobile app script generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
