import { NextRequest, NextResponse } from 'next/server';

type SafetyRating = {
  blocked?: boolean;
  category?: string;
};

const TONE_GUIDES: Record<string, string> = {
  professional:
    'Use a polished, confident, expert tone. Emphasize credibility, practical value, and clear benefits. Keep the language concise, structured, and persuasive like a seasoned creator who deeply understands the product.',
  fun:
    'Use a youthful, upbeat, high-energy tone that feels natural and conversational. Keep the pacing fast, playful, and highly engaging. Favor short sentences, emotional punch, and viral-friendly phrasing.',
  humorous:
    'Use witty, playful humor with a smart punchline. Start from a relatable pain point and turn it into a clever joke. Keep it charming, not forced, and make it feel easy to share.',
  romantic:
    'Use a warm, soft, emotionally appealing tone. Create a sense of desire, comfort, and aspiration. Prefer elegant phrasing and emotional imagery over blunt feature-listing.',
  urgent:
    'Use a direct, fast-moving tone that creates urgency and FOMO. Focus on limited availability, missed opportunity, and immediate action. Keep the wording decisive and compact.',
  luxury:
    'Use a refined, premium, exclusive tone. Avoid hype and loud sales language. Make the product feel high-value, tasteful, and distinct with minimalist but sharp wording.',
  friendly:
    'Use a warm, trustworthy, approachable tone, like a friend recommending something genuinely great. Keep it sincere, relatable, and easy to understand.',
  asmr:
    'Use a soft, calm, soothing tone. Slow the rhythm down, keep the sentences minimal, and create a relaxing sensory feel. Make it gentle and satisfying to hear.',
};

function buildBasePrompt({
  title,
  description,
  context,
  toneGuide,
  userNotes,
  targetDurationSeconds,
}: {
  title: string;
  description: string;
  context: string;
  toneGuide: string;
  userNotes?: string;
  targetDurationSeconds: number;
}) {
  const wordTarget = Math.round(targetDurationSeconds * 2.5);
  const wordRangeMin = Math.round(wordTarget * 0.9);
  const wordRangeMax = Math.round(wordTarget * 1.05);

  return `Below is detailed information about a product, formatted as Markdown, that I collected from a website. You are a professional TikTok creator capable of producing viral-style product review videos.

Required instructions:
1. Read and understand the Markdown file, then automatically identify what type of product it is (mobile app, electronic device, home appliance, beauty product, fashion item, course, service, etc.) so you can choose the most suitable tone of voice.
2. Extract the top 2-3 strongest unique selling points (USPs) and use them in the script.
3. CRITICAL: Write a TikTok video script that is EXACTLY ${targetDurationSeconds} seconds when spoken at natural pace (~150 words per minute).
4. STRICT WORD COUNT: You MUST write EXACTLY ${wordTarget} words (between ${wordRangeMin}-${wordRangeMax} words). This is critical for video synchronization.
5. Return only the spoken script as plain text.
5. Do not include timestamps, section labels, scene directions, shot descriptions, tables, bullet lists, or markdown formatting.
6. The script should still be structured internally as Hook, Body, and CTA, but those labels must not appear in the final output.
7. The Hook must be a curiosity-driven opener or a line that directly hits the target audience's pain point.
8. The Body must feel like a real review and should naturally weave in features extracted from the Markdown.
9. The Body must include at least one small drawback or caution to increase credibility.
10. The CTA must be short, natural, and action-oriented, such as download the app, click the bio link, or add to cart.
11. Do not explain your process. Return only the final script.

Creator style:
${toneGuide}

User style notes:
${userNotes?.trim() || 'No extra notes provided. Stick to the selected style and optimize for the product.'}

Product information:
Title: ${title}
Description: ${description || 'No description available'}
Markdown content:
${context || 'No Markdown content available'}

Return only plain script text. No headings, no table, no timestamps, no markdown.`;
}

function stripMarkdown(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/^#+\s*/gm, '')
    .trim();
}

function extractPlainScript(raw: string) {
  const cleaned = stripMarkdown(raw);
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const tableLines = lines.filter((line) => line.includes('|'));
  if (tableLines.length >= 2) {
    const voiceLines = tableLines
      .filter((line) => !/^(\|?\s*[-:]+\s*)+$/.test(line))
      .map((line) => line.replace(/^\|+|\|+$/g, ''))
      .map((line) => line.split('|').map((cell) => cell.trim()).filter(Boolean))
      .filter((cells) => cells.length >= 2)
      .map((cells) => cells[cells.length - 1])
      .map((cell) => cell.replace(/^(Hook|Body|CTA)\s*\(?[^:)]*\)?\s*:?\s*/i, '').trim())
      .filter(Boolean);

    if (voiceLines.length > 0) {
      return voiceLines.join(' ');
    }
  }

  const plainLines = lines
    .filter((line) => !/^(\|?\s*[-:]+\s*)+$/.test(line))
    .filter((line) => !/^(hook|body|cta)\b/i.test(line))
    .filter((line) => !/^\d+(\.\d+)?\s*-\s*\d+(\.\d+)?s\b/i.test(line))
    .map((line) => line.replace(/^(hook|body|cta)\s*\(?[^:)]*\)?\s*:?\s*/i, ''))
    .map((line) => line.replace(/^[-•]\s*/, ''))
    .filter(Boolean);

  return plainLines.join(' ').replace(/\s+/g, ' ').trim();
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const {
      title,
      description,
      markdown,
      geminiApiKey,
      geminiModel,
      tone,
      promptTemplate,
      targetDurationSeconds: rawTargetDurationSeconds,
    } = payload;
    const targetDurationSeconds = Number(rawTargetDurationSeconds || 30);

    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API key is required.' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Product title is required.' }, { status: 400 });
    }

    const toneGuide = TONE_GUIDES[tone || 'fun'] || TONE_GUIDES.fun;
    const contextBlock = markdown ? markdown.substring(0, 15000) : '';

    const prompt = buildBasePrompt({
      title: title || 'Unknown product',
      description: description || '',
      context: contextBlock,
      toneGuide,
      userNotes: promptTemplate,
      targetDurationSeconds,
    });

    console.log('Gemini prompt:', prompt);

    const modelName = geminiModel || 'gemini-2.5-flash';
    const isThinkingModel = modelName.includes('2.5');
    console.log(`Using Gemini model: ${modelName} (thinking: ${isThinkingModel})`);

    const generationConfig: Record<string, unknown> = {
      temperature: 0.7,
      maxOutputTokens: isThinkingModel ? 8192 : 1024,
    };
    if (isThinkingModel) {
      generationConfig.thinkingConfig = { thinkingBudget: 1024 };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig,
        }),
      }
    );

    console.log('Gemini API response status:', response.status);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData?.error?.message || `Gemini API returned HTTP ${response.status}`;
      console.error('Gemini API error payload:', errData);
      return NextResponse.json({ error: errMessage }, { status: response.status });
    }

    const data = await response.json();
    console.log('Gemini API response data:', JSON.stringify(data, null, 2));

    const parts = data?.candidates?.[0]?.content?.parts || [];
    let script = '';

    for (const part of parts) {
      if (part.text && !part.thought) {
        script = part.text.trim();
        break;
      }
    }

    if (!script && parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      script = lastPart?.text?.trim() || '';
    }

    if (!script) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      const safetyRatings = data?.candidates?.[0]?.safetyRatings;
      const promptFeedback = data?.promptFeedback;

      let debugMessage = 'Gemini returned an empty response.';
      if (finishReason) {
        debugMessage += ` Finish reason: ${finishReason}.`;
      }
      if (safetyRatings) {
        const blocked = safetyRatings.filter((rating: SafetyRating) => rating.blocked);
        if (blocked.length > 0) {
          debugMessage += ` Blocked safety categories: ${blocked
            .map((rating: SafetyRating) => rating.category)
            .join(', ')}.`;
        }
      }
      if (promptFeedback?.blockReason) {
        debugMessage += ` Prompt block reason: ${promptFeedback.blockReason}.`;
      }

      return NextResponse.json(
        { error: `${debugMessage} Please try again or check the product URL content.` },
        { status: 500 }
      );
    }

    const cleanScript = extractPlainScript(script)
      .replace(/^["']+|["']+$/g, '')
      .trim();

    return NextResponse.json({ script: cleanScript });
  } catch (error) {
    console.error('Script generation error:', error);
    const message = error instanceof Error ? error.message : 'Script generation failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
