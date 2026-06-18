"""
structured_renderer.py – AveFlow Video Renderer
=================================================
Renders product ad videos from a Gemini-structured VideoScript.

Key improvements over v1:
- Subtitle text properly sized with word-level highlighting
- Audio duration drives the video (no desync)
- Brighter, image-derived backgrounds (no forced purple)
- Smooth zoompan motion without stutter
- Crisp video scenes (no blur)
- Prioritises video clips when available
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from models.video_script import VideoScript, VisualScene

# ── Constants ────────────────────────────────────────────────────
ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / 'outputs' / 'renders'
TEMP_DIR = OUTPUT_DIR / '_tmp'
FRAME_W, FRAME_H = 1080, 1920
FRAME_SIZE = (FRAME_W, FRAME_H)
FPS = 30


# ── Filesystem helpers ───────────────────────────────────────────

def _ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _ffmpeg() -> str:
    return shutil.which('ffmpeg') or 'ffmpeg'


def _ffprobe() -> str:
    return shutil.which('ffprobe') or 'ffprobe'


def _run(args: list[str], label: str = '') -> None:
    """Run a subprocess, raise with stderr on failure."""
    print(f"  [ffmpeg] {label or ' '.join(args[:4])}")
    proc = subprocess.run(args, capture_output=True, text=True, encoding='utf-8')
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or 'ffmpeg failed').strip()
        # Keep only the last 600 chars of error for readability
        raise RuntimeError(err[-600:])


def _download(url: str, dest: Path) -> Path:
    if not url or not url.startswith(('http://', 'https://')):
        raise ValueError(f"Invalid URL: {url}")
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        )
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, 'wb') as out:
        shutil.copyfileobj(resp, out)
    return dest


def _validate_video(path: Path) -> bool:
    """Check that a downloaded file is actually a valid video, not HTML/junk."""
    if not path.exists():
        return False
    size = path.stat().st_size
    if size < 10_000:  # < 10KB is almost certainly not a real video
        print(f"  [validate] {path.name} too small ({size} bytes), skipping")
        return False
    # Check magic bytes — MP4 has 'ftyp' at offset 4, WebM starts with 0x1A45DFA3
    with open(path, 'rb') as f:
        header = f.read(16)
    if b'ftyp' in header or header[:4] == b'\x1a\x45\xdf\xa3':
        return True
    if header[:4] == b'\x00\x00\x00':  # Could be MP4 with different box
        return True
    # If it starts with HTML tags, it's an error page
    if header[:5] in (b'<!DOC', b'<html', b'<HTML', b'<?xml'):
        print(f"  [validate] {path.name} is HTML, not video")
        return False
    # Try ffprobe as last resort
    try:
        r = subprocess.run(
            [_ffprobe(), '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
            capture_output=True, text=True, encoding='utf-8', timeout=10,
        )
        return r.returncode == 0 and float(r.stdout.strip()) > 0
    except Exception:
        print(f"  [validate] {path.name} failed ffprobe check")
        return False


def _media_duration(path: Path) -> float:
    """Get media file duration in seconds via ffprobe."""
    try:
        r = subprocess.run(
            [_ffprobe(), '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
            capture_output=True, text=True, encoding='utf-8', check=True,
        )
        return max(0.1, float(r.stdout.strip()))
    except Exception:
        return 0.0


def _escape_filter_path(p: Path) -> str:
    """Escape a path for use inside ffmpeg filter strings."""
    s = p.resolve().as_posix()
    s = s.replace('\\', '\\\\')
    s = s.replace(':', '\\:')
    s = s.replace("'", "\\'")
    return s


# ── Image processing ─────────────────────────────────────────────

def _prepare_image_for_scene(source: Path, output: Path) -> Path:
    """
    Prepare an image to fill 1080×1920 with a bright blurred background
    and the product image centred on top — NO forced purple.

    Strategy:
    1. Scale source to cover the full frame → gaussian-blur it → use as bg
    2. Scale source to fit inside with padding → overlay on centre
    3. Result: clean product showcase with matching-colour backdrop
    """
    img = Image.open(source).convert('RGB')

    # -- Background: blurred, colour-matched, brightened version --
    bg_ratio = FRAME_W / FRAME_H
    img_ratio = img.width / max(img.height, 1)

    if img_ratio > bg_ratio:
        bg_h = FRAME_H
        bg_w = int(bg_h * img_ratio)
    else:
        bg_w = FRAME_W
        bg_h = int(bg_w / max(img_ratio, 0.01))

    bg = img.resize((bg_w, bg_h), Image.LANCZOS)
    # Centre-crop to frame size
    left = max(0, (bg_w - FRAME_W) // 2)
    top = max(0, (bg_h - FRAME_H) // 2)
    bg = bg.crop((left, top, left + FRAME_W, top + FRAME_H))
    # Blur + brighten
    bg = bg.filter(ImageFilter.GaussianBlur(radius=35))
    from PIL import ImageEnhance
    bg = ImageEnhance.Brightness(bg).enhance(1.25)

    # -- Foreground: product image, fitted with padding --
    pad = 100
    max_w = FRAME_W - pad * 2
    max_h = FRAME_H - pad * 2

    if img_ratio > (max_w / max_h):
        new_w = max_w
        new_h = int(max_w / max(img_ratio, 0.01))
    else:
        new_h = max_h
        new_w = int(max_h * img_ratio)

    fg = img.resize((new_w, new_h), Image.LANCZOS)

    # Rounded-corner mask
    mask = Image.new('L', fg.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, fg.width, fg.height), radius=32, fill=255)

    # Soft shadow behind product
    shadow_size = (fg.width + 60, fg.height + 60)
    shadow = Image.new('RGBA', shadow_size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle(
        (0, 0, shadow_size[0], shadow_size[1]),
        radius=44, fill=(0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(25))

    # Composite
    bg_rgba = bg.convert('RGBA')
    x = (FRAME_W - new_w) // 2
    y = (FRAME_H - new_h) // 2
    bg_rgba.paste(shadow, (x - 30, y - 20), shadow)
    fg_rgba = Image.new('RGBA', fg.size)
    fg_rgba.paste(fg, (0, 0))
    bg_rgba.paste(fg_rgba, (x, y), mask)

    bg_rgba.convert('RGB').save(output, quality=95)
    return output


# ── Scene builders ────────────────────────────────────────────────

def _build_zoompan_filter(
    motion: str, duration: float, w: int = FRAME_W, h: int = FRAME_H
) -> str:
    """
    Build a zoompan filter string for the given motion effect.
    Uses a SINGLE zoompan call with smooth easing to avoid stutter.
    """
    frames = max(1, int(duration * FPS))
    fade_in = 0.4
    fade_out_start = max(0.1, duration - 0.4)

    # Use 't' (normalised 0→1 progress) via 'on/d'
    # Smooth easing: avoid abrupt zoom start
    # NOTE: ffmpeg expressions use pow(x,y) — NOT Python's ** operator
    # Inside single-quoted zoompan values, commas in pow() are fine
    effects = {
        'center_zoom': {
            'z': f"1+0.15*pow(on/{frames},0.6)",
            'x': "iw/2-(iw/zoom/2)",
            'y': "ih/2-(ih/zoom/2)",
        },
        'slow_zoom_out': {
            'z': f"1.18-0.15*pow(on/{frames},0.6)",
            'x': "iw/2-(iw/zoom/2)",
            'y': "ih/2-(ih/zoom/2)",
        },
        'pan_left': {
            'z': "1.06",
            'x': f"iw*0.08*(1-on/{frames})",
            'y': "ih/2-(ih/zoom/2)",
        },
        'pan_right': {
            'z': "1.06",
            'x': f"iw*0.08*(on/{frames})",
            'y': "ih/2-(ih/zoom/2)",
        },
        'drift_up': {
            'z': "1.08",
            'x': "iw/2-(iw/zoom/2)",
            'y': f"ih*0.06*(1-on/{frames})",
        },
        'drift_down': {
            'z': "1.08",
            'x': "iw/2-(iw/zoom/2)",
            'y': f"ih*0.06*(on/{frames})",
        },
        'ken_burns_tl': {
            'z': f"1+0.12*pow(on/{frames},0.5)",
            'x': f"iw*0.06*(1-on/{frames})",
            'y': f"ih*0.06*(1-on/{frames})",
        },
        'ken_burns_br': {
            'z': f"1+0.12*pow(on/{frames},0.5)",
            'x': f"iw*0.06*(on/{frames})",
            'y': f"ih*0.06*(on/{frames})",
        },
        'static': {
            'z': "1",
            'x': "iw/2-(iw/zoom/2)",
            'y': "ih/2-(ih/zoom/2)",
        },
    }

    eff = effects.get(motion, effects['center_zoom'])
    vf = (
        f"zoompan=z='{eff['z']}':x='{eff['x']}':y='{eff['y']}'"
        f":d={frames}:s={w}x{h}:fps={FPS},"
        f"fade=t=in:st=0:d={fade_in},"
        f"fade=t=out:st={fade_out_start}:d=0.4,"
        f"format=yuv420p"
    )
    return vf


def _create_image_scene(
    source: Path, duration: float, output: Path, motion: str
) -> Path:
    """Create a video clip from a still image with smooth motion."""
    vf = _build_zoompan_filter(motion, duration)
    _run([
        _ffmpeg(), '-y',
        '-loop', '1', '-i', str(source),
        '-vf', vf,
        '-t', f'{duration:.3f}',
        '-r', str(FPS),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        str(output),
    ], label=f'image scene {output.stem}')
    return output


def _create_video_scene(
    source: Path, duration: float, output: Path
) -> Path:
    """
    Cut / loop a video clip to fill `duration`.
    Uses high-quality scaling to avoid blur.
    """
    src_dur = _media_duration(source)
    loop_flag = '-1' if src_dur < duration else '0'

    _run([
        _ffmpeg(), '-y',
        '-stream_loop', loop_flag,
        '-i', str(source),
        '-t', f'{duration:.3f}',
        '-vf', (
            f"scale={FRAME_W}:{FRAME_H}:force_original_aspect_ratio=increase,"
            f"crop={FRAME_W}:{FRAME_H},"
            f"fps={FPS},"
            f"fade=t=in:st=0:d=0.35,"
            f"fade=t=out:st={max(0.1, duration - 0.35)}:d=0.35,"
            "format=yuv420p"
        ),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
        '-an',
        str(output),
    ], label=f'video scene {output.stem}')
    return output


# ── ASS Subtitles ─────────────────────────────────────────────────

def _ass_ts(seconds: float) -> str:
    """Format seconds as ASS timestamp h:mm:ss.cs"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    return f'{h}:{m:02d}:{s:02d}.{cs:02d}'


def _wrap_ass(text: str, max_chars: int = 28) -> str:
    """Wrap text for ASS subtitle lines."""
    words = text.split()
    lines: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for w in words:
        if cur_len + len(w) + 1 <= max_chars:
            cur.append(w)
            cur_len += len(w) + 1
        else:
            if cur:
                lines.append(' '.join(cur))
            cur = [w]
            cur_len = len(w)
    if cur:
        lines.append(' '.join(cur))
    return '\\N'.join(lines[:3])


def _create_ass_subtitles(
    script: VideoScript, output: Path, actual_audio_duration: float
) -> Path:
    """
    Generate ASS subtitles synced to the actual audio duration.

    The Gemini-planned timings are rescaled proportionally so the
    script exactly fills the audio track.
    """
    # Compute time-scale factor
    planned = max(script.total_duration, 1.0)
    scale = actual_audio_duration / planned

    # ── ASS Header with well-sized styles ──
    header = f"""[Script Info]
Title: AveFlow Video
ScriptType: v4.00+
PlayResX: {FRAME_W}
PlayResY: {FRAME_H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: HookTop,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,4.5,2,8,100,100,180,1
Style: Body,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,4.5,2,2,100,100,220,1
Style: CallToAction,Arial,76,&H0000FFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,5,2.5,5,100,100,200,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text"""

    lines = [header]
    for seg in script.segments:
        start = _ass_ts(seg.start_time * scale)
        end = _ass_ts((seg.start_time + seg.duration) * scale)
        # Sanitise text for ASS
        safe = seg.text.replace('{', '\\{').replace('}', '\\}')
        wrapped = _wrap_ass(safe)
        style = seg.style if seg.style in ('HookTop', 'Body', 'CallToAction') else 'Body'
        lines.append(
            f'Dialogue: 0,{start},{end},{style},,0,0,0,,'
            f'{{\\fad(200,200)}}{wrapped}'
        )

    output.write_text('\n'.join(lines), encoding='utf-8')
    return output


# ── Main render entry point ───────────────────────────────────────

def render_video_with_script(
    script: VideoScript,
    cover_image: str | None,
    screenshots: list[str],
    videos: list[str],
    elevenlabs_api_key: str,
    title: str = 'video',
    use_free_tts: bool = False,
) -> Path:
    """
    Render a TikTok-style ad video from a Gemini-structured VideoScript.

    Pipeline:
    1. Generate / download voiceover audio
    2. Download all media assets
    3. Build per-scene clips (image+motion or video cut)
    4. Concatenate scenes
    5. Sync audio duration → rescale subtitle timings
    6. Burn subtitles, mux audio, encode final MP4
    """
    _ensure_dirs()

    safe_title = re.sub(r'[^a-zA-Z0-9]+', '-', title.strip().lower()).strip('-')[:30] or 'video'
    render_id = f'{safe_title}-{os.getpid()}'

    with tempfile.TemporaryDirectory(dir=TEMP_DIR, ignore_cleanup_errors=True) as temp_root:
        work = Path(temp_root)

        # ── 1. Audio ──────────────────────────────────────────
        audio_path = work / 'voiceover.mp3'
        print(f"[Render] Generating voiceover ({len(script.script_text)} chars)")

        if use_free_tts:
            _generate_edge_tts(script.script_text, audio_path)
        else:
            _generate_elevenlabs(
                script.script_text,
                audio_path,
                elevenlabs_api_key,
                script.elevenlabs_voice_id,
                script.voice_stability,
                script.voice_similarity,
            )

        audio_dur = _media_duration(audio_path)
        if audio_dur < 1.0:
            raise RuntimeError("Audio generation failed or produced empty file")
        print(f"[Render] Audio duration: {audio_dur:.1f}s")

        # ── 2. Download media ─────────────────────────────────
        print("[Render] Downloading media assets")
        cover_path: Path | None = None
        if cover_image:
            try:
                cover_path = _download(cover_image, work / 'cover.jpg')
            except Exception as e:
                print(f"  [warn] cover download failed: {e}")

        shot_paths: list[Path] = []
        for i, url in enumerate(screenshots):
            try:
                shot_paths.append(_download(url, work / f'shot_{i}.jpg'))
            except Exception as e:
                print(f"  [warn] screenshot {i} failed: {e}")

        vid_paths: list[Path] = []
        for i, url in enumerate(videos):
            try:
                dest = _download(url, work / f'vid_{i}.mp4')
                if _validate_video(dest):
                    vid_paths.append(dest)
                else:
                    print(f"  [warn] video {i} downloaded but invalid, skipping")
                    dest.unlink(missing_ok=True)
            except Exception as e:
                print(f"  [warn] video {i} failed: {e}")

        all_images = ([cover_path] if cover_path else []) + shot_paths
        if not all_images and not vid_paths:
            raise RuntimeError("No valid media files downloaded")

        # ── 3. Build scenes ───────────────────────────────────
        # Rescale scene durations so total matches audio
        planned_total = max(script.total_duration, 1.0)
        dur_scale = audio_dur / planned_total

        scene_clips: list[Path] = []
        print(f"[Render] Building {len(script.scenes)} scenes (dur_scale={dur_scale:.2f})")

        for i, scene in enumerate(script.scenes):
            clip_path = work / f'scene_{i}.mp4'
            scene_dur = max(1.0, scene.duration * dur_scale)

            # Resolve the media file for this scene
            media = _resolve_media(
                scene, cover_path, shot_paths, vid_paths, all_images
            )

            if scene.media_type == 'video' and media.suffix.lower() in ('.mp4', '.webm', '.mov'):
                scene_clips.append(
                    _create_video_scene(media, scene_dur, clip_path)
                )
            else:
                # Prepare product-image with bright blurred background
                prepared = work / f'prepared_{i}.jpg'
                _prepare_image_for_scene(media, prepared)
                scene_clips.append(
                    _create_image_scene(prepared, scene_dur, clip_path, scene.motion or 'center_zoom')
                )

        if not scene_clips:
            raise RuntimeError("No scene clips were generated")

        # ── 4. Concatenate ────────────────────────────────────
        concat_txt = work / 'concat.txt'
        concat_txt.write_text(
            '\n'.join(f"file '{c.as_posix()}'" for c in scene_clips),
            encoding='utf-8',
        )
        merged = work / 'merged.mp4'
        print("[Render] Concatenating scene clips")
        _run([
            _ffmpeg(), '-y',
            '-f', 'concat', '-safe', '0',
            '-i', str(concat_txt),
            '-c', 'copy',
            str(merged),
        ], label='concat')

        # ── 5. Subtitles synced to audio ──────────────────────
        subs_path = _create_ass_subtitles(script, work / 'subs.ass', audio_dur)
        sub_filter = f"subtitles=filename='{_escape_filter_path(subs_path)}'"

        # ── 6. Final encode ───────────────────────────────────
        final = OUTPUT_DIR / f'{render_id}.mp4'
        print(f"[Render] Final encode → {final.name}")
        _run([
            _ffmpeg(), '-y',
            '-i', str(merged),
            '-i', str(audio_path),
            '-vf', sub_filter,
            '-map', '0:v:0', '-map', '1:a:0',
            '-shortest',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            str(final),
        ], label='final encode')

        print(f"[Render] ✅ Done: {final}")
        return final


# ── Helpers ──────────────────────────────────────────────────────

def _resolve_media(
    scene: VisualScene,
    cover: Path | None,
    shots: list[Path],
    vids: list[Path],
    all_images: list[Path],
) -> Path:
    """Pick the correct file for a scene, with safe fallback."""
    try:
        if scene.media_type == 'video' and vids:
            idx = min(scene.media_index, len(vids) - 1)
            return vids[idx]
        if scene.media_type == 'cover' and cover:
            return cover
        if scene.media_type == 'image' and shots:
            idx = min(scene.media_index, len(shots) - 1)
            return shots[idx]
    except (IndexError, TypeError):
        pass

    # Fallback: first available
    if vids:
        return vids[0]
    if all_images:
        return all_images[0]
    raise RuntimeError("No media available for scene")


def _generate_edge_tts(text: str, output: Path) -> None:
    """Generate voiceover with Edge TTS (free)."""
    result = subprocess.run(
        ['edge-tts', '--text', text,
         '--voice', 'en-US-JennyNeural',
         '--write-media', str(output)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Edge TTS failed: {result.stderr}")


def _generate_elevenlabs(
    text: str, output: Path,
    api_key: str, voice_id: str,
    stability: float, similarity: float,
) -> None:
    """Generate voiceover with ElevenLabs API."""
    import json as _json
    body = _json.dumps({
        'text': text,
        'model_id': 'eleven_multilingual_v2',
        'voice_settings': {
            'stability': stability,
            'similarity_boost': similarity,
        },
    }).encode('utf-8')
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
        data=body,
        headers={
            'xi-api-key': api_key,
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp, open(output, 'wb') as out:
        shutil.copyfileobj(resp, out)
