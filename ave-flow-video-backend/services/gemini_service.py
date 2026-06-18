"""
gemini_service.py – Generate structured VideoScript via Gemini
"""

import json
import google.generativeai as genai
from models.video_script import VideoScript, MOTION_EFFECTS


SYSTEM_PROMPT = """You are an expert TikTok/Reels video ad creator.  
Given product data you MUST produce a JSON video script.

═══════════════════════════════════════════════════
 MEDIA SELECTION RULES  (most important)
═══════════════════════════════════════════════════
• **VIDEOS FIRST** – if the product has video clips, use them for ≥80 % of scenes.
  – Loop the same video clip multiple times at different start offsets if needed.
  – Only use a static image for the opening hook (1-2 s) or the final CTA.
• If ZERO videos are available → use images with VARIED motion effects.
  – Never repeat the same motion effect on consecutive scenes.
• `media_index` is 0-based into the screenshots or videos array.
  – It MUST be < the count of that media type.
• `media_type` must be one of: `image`, `video`, `cover`.

═══════════════════════════════════════════════════
 MOTION EFFECTS  (for images only – videos use "static")
═══════════════════════════════════════════════════
Available effects:
  center_zoom, slow_zoom_out, pan_left, pan_right,
  drift_up, drift_down, ken_burns_tl, ken_burns_br, static

Choose motion that matches the scene mood:
  - Hook / dramatic reveal → center_zoom or slow_zoom_out
  - Showing features → pan_left / pan_right
  - Elegant / luxury → drift_up / drift_down
  - Dynamic showcase → ken_burns_tl / ken_burns_br
  - Video clips → always "static"

═══════════════════════════════════════════════════
 SCRIPT & SUBTITLE GUIDELINES
═══════════════════════════════════════════════════
• 3 sections: Hook (3-5 s), Body (60-70 % of time), CTA (3-5 s)
• Segments → `style` must be one of: HookTop, Body, CallToAction
• Keep each segment's text SHORT (≤ 15 words) for readability on mobile
• Include real user reviews/testimonials from the markdown if available

═══════════════════════════════════════════════════
 TIMING RULES
═══════════════════════════════════════════════════
• `total_duration` = target_duration from the request.
• Scene durations: 3-6 s each.  Sum of all scene durations ≈ total_duration.
• Segment timings must be continuous (no gaps, no overlaps).
• More scenes = more dynamic video.  Minimum 4 scenes.

═══════════════════════════════════════════════════
 VOICE SELECTION (ElevenLabs)
═══════════════════════════════════════════════════
• Professional / Luxury → "pNInz6obpgDQGcFmaJgB" (Adam)
• Fun / Playful → "EXAVITQu4vr4xnSDxMaL" (Bella)
• Friendly → "JBFqnCBsd6RMkjVDRZzb" (George)
• Female Professional → "21m00Tcm4TlvDq8ikWAM" (Rachel)
• Female Elegant → "ThT5KcBeYPX3keUQqHPh" (Dorothy)

═══════════════════════════════════════════════════
 OUTPUT JSON SCHEMA
═══════════════════════════════════════════════════
{
  "script_text": "<full voiceover script>",
  "total_duration": <number>,
  "segments": [
    {"text": "...", "start_time": 0.0, "duration": 4.0, "style": "HookTop"},
    ...
  ],
  "scenes": [
    {"media_type": "image", "media_index": 0, "start_time": 0.0, "duration": 4.0, "motion": "center_zoom", "transition": "fade"},
    ...
  ],
  "elevenlabs_voice_id": "...",
  "voice_stability": 0.5,
  "voice_similarity": 0.75
}
"""


def generate_video_script(
    title: str,
    description: str,
    markdown: str,
    screenshots: list[str],
    videos: list[str],
    tone: str,
    target_duration: float,
    gemini_api_key: str,
    gemini_model: str = "gemini-2.5-flash",
    custom_notes: str = "",
) -> VideoScript:
    """Call Gemini to produce a structured VideoScript."""

    genai.configure(api_key=gemini_api_key)

    model = genai.GenerativeModel(
        model_name=gemini_model,
        generation_config={
            "temperature": 0.85,
            "top_p": 0.95,
            "response_mime_type": "application/json",
        },
    )

    user_prompt = f"""
Create a TikTok video ad script for this product:

**Product Info:**
- Title: {title}
- Description: {description[:500]}

**Product Details (markdown):**
{markdown[:3000]}

**Available Media:**
- Screenshots: {len(screenshots)} images  (indices 0..{max(0, len(screenshots)-1)})
- Videos: {len(videos)} video clips  (indices 0..{max(0, len(videos)-1)})
- Cover image: {"yes" if screenshots or videos else "no"}

**Requirements:**
- Tone: {tone}
- Target Duration: {target_duration}s
- Custom Notes: {custom_notes or "None"}
- Number of scenes: {max(4, min(8, int(target_duration / 4)))}
- Number of segments: 3-6

IMPORTANT CONSTRAINTS:
1. If videos > 0, use media_type="video" for ≥80% of scenes
2. media_index for "image" must be < {len(screenshots)}
3. media_index for "video" must be < {len(videos)}
4. media_index for "cover" is always 0
5. Sum of scene durations ≈ {target_duration}
6. Each segment text ≤ 15 words
7. motion for video scenes MUST be "static"

Return valid JSON matching the schema from the system prompt.
"""

    response = model.generate_content([SYSTEM_PROMPT, user_prompt])

    # Parse JSON
    raw = response.text.strip()
    if raw.startswith("```json"):
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif raw.startswith("```"):
        raw = raw.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned invalid JSON: {e}\nRaw: {raw[:500]}")

    # Basic validation
    for field in ("script_text", "segments", "scenes"):
        if not data.get(field):
            raise ValueError(f"Gemini response missing '{field}'")

    # Clamp media indices to safe bounds
    for scene in data.get("scenes", []):
        mt = scene.get("media_type", "image")
        idx = scene.get("media_index", 0)
        if mt == "video":
            scene["media_index"] = min(idx, max(0, len(videos) - 1))
        elif mt == "image":
            scene["media_index"] = min(idx, max(0, len(screenshots) - 1))
        else:
            scene["media_index"] = 0

    return VideoScript(**data)
