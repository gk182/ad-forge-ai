from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import textwrap
import urllib.request
from dataclasses import dataclass, field
from itertools import cycle
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT_DIR / 'outputs' / 'renders'
TEMP_DIR = OUTPUT_DIR / '_tmp'
FRAME_SIZE = (1080, 1920)
FPS = 30


def _ensure_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)


def _ffmpeg_executable() -> str:
    return shutil.which('ffmpeg') or 'ffmpeg'


def _ffprobe_executable() -> str:
    return shutil.which('ffprobe') or 'ffprobe'


def _run_command(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, encoding='utf-8')
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or 'ffmpeg failed').strip())


def _download_file(url: str, dest: Path) -> Path:
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        )
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response, open(dest, 'wb') as out:
        shutil.copyfileobj(response, out)
    return dest


def _is_remote_url(value: str) -> bool:
    return bool(re.match(r'^https?://', value or '', re.I))


def _duration_of_media(path: Path) -> float:
    try:
        result = subprocess.run(
            [
                _ffprobe_executable(),
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                str(path),
            ],
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=True,
        )
        return max(0.1, float(result.stdout.strip()))
    except Exception:
        return 0.0


def _slugify(value: str, fallback: str = 'video') -> str:
    slug = re.sub(r'[^a-zA-Z0-9]+', '-', value.strip().lower()).strip('-')
    return slug[:50] or fallback


def _font_candidates() -> list[str]:
    return [
        r'C:\Windows\Fonts\arialbd.ttf',
        r'C:\Windows\Fonts\arial.ttf',
        r'C:\Windows\Fonts\segoeuib.ttf',
        r'C:\Windows\Fonts\segoeui.ttf',
    ]


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for candidate in _font_candidates():
        if bold and 'bd' not in candidate.lower():
            continue
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def _create_gradient_background(size: tuple[int, int], colors: list[tuple[int, int, int]]) -> Image.Image:
    width, height = size
    base = Image.new('RGB', size, colors[0])
    top = colors[-1]
    overlay = Image.new('RGB', size, top)
    mask = Image.new('L', size)
    draw = ImageDraw.Draw(mask)
    for y in range(height):
        alpha = int(255 * (y / max(1, height - 1)))
        draw.line((0, y, width, y), fill=alpha)
    base.paste(overlay, (0, 0), mask)
    return base


def _wrap_text(text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    if not text:
        return []

    words = text.split()
    lines: list[str] = []
    current: list[str] = []

    def line_width(tokens: list[str]) -> int:
        return int(font.getbbox(' '.join(tokens))[2])

    for word in words:
        trial = current + [word]
        if current and line_width(trial) > max_width:
            lines.append(' '.join(current))
            current = [word]
        else:
            current = trial

    if current:
        lines.append(' '.join(current))

    return lines


def _draw_card(
    title: str,
    subtitle: str,
    cta: str,
    background_image: Path | None,
    output_path: Path,
    accent: tuple[int, int, int] = (139, 92, 246),
) -> Path:
    bg = _create_gradient_background(FRAME_SIZE, [(8, 8, 14), (9, 10, 20), accent])

    if background_image and background_image.exists():
        try:
            src = Image.open(background_image).convert('RGB')
            src_ratio = src.width / max(1, src.height)
            target_ratio = FRAME_SIZE[0] / FRAME_SIZE[1]
            if src_ratio > target_ratio:
                new_h = FRAME_SIZE[1]
                new_w = int(new_h * src_ratio)
            else:
                new_w = FRAME_SIZE[0]
                new_h = int(new_w / src_ratio)
            src = src.resize((new_w, new_h), Image.LANCZOS)
            left = max(0, (src.width - FRAME_SIZE[0]) // 2)
            top = max(0, (src.height - FRAME_SIZE[1]) // 2)
            bg = src.crop((left, top, left + FRAME_SIZE[0], top + FRAME_SIZE[1]))
            bg = bg.filter(ImageFilter.GaussianBlur(8))
        except Exception:
            pass

    overlay = Image.new('RGBA', FRAME_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((0, 0, FRAME_SIZE[0], FRAME_SIZE[1]), fill=(0, 0, 0, 100))

    panel_x = 90
    panel_y = 260
    panel_w = FRAME_SIZE[0] - 180
    panel_h = FRAME_SIZE[1] - 520
    draw.rounded_rectangle(
        (panel_x, panel_y, panel_x + panel_w, panel_y + panel_h),
        radius=54,
        fill=(10, 10, 18, 165),
        outline=(255, 255, 255, 25),
        width=2,
    )

    title_font = _load_font(68, bold=True)
    subtitle_font = _load_font(44)
    cta_font = _load_font(38, bold=True)

    title_lines = _wrap_text(title, title_font, panel_w - 100)
    y = panel_y + 90
    for line in title_lines[:4]:
        draw.text((panel_x + 50, y), line, font=title_font, fill=(255, 255, 255))
        y += title_font.size + 12

    if subtitle:
        y += 18
        for line in _wrap_text(subtitle, subtitle_font, panel_w - 100)[:4]:
            draw.text((panel_x + 50, y), line, font=subtitle_font, fill=(221, 221, 235))
            y += subtitle_font.size + 10

    if cta:
        cta_y = panel_y + panel_h - 150
        draw.rounded_rectangle(
            (panel_x + 50, cta_y - 12, panel_x + panel_w - 50, cta_y + 78),
            radius=28,
            fill=(*accent, 180),
        )
        draw.text((panel_x + 70, cta_y + 8), cta, font=cta_font, fill=(255, 255, 255))

    bg = bg.convert('RGBA')
    bg.alpha_composite(overlay)
    bg.convert('RGB').save(output_path, quality=95)
    return output_path


def _create_image_scene(
    source: Path,
    duration: float,
    output_path: Path,
    motion: str,
) -> Path:
    frames = max(1, int(duration * FPS))
    zoom_expr = {
        'pan_left': "min(zoom+0.0012,1.18)",
        'pan_right': "min(zoom+0.0012,1.18)",
        'drift_up': "min(zoom+0.0014,1.2)",
        'drift_down': "min(zoom+0.0014,1.2)",
        'center_zoom': "min(zoom+0.0015,1.22)",
    }.get(motion, "min(zoom+0.0014,1.2)")

    x_expr = {
        'pan_left': "iw/2-(iw/zoom/2)-32+20*sin(on/30)",
        'pan_right': "iw/2-(iw/zoom/2)+32+20*sin(on/30)",
        'drift_up': "iw/2-(iw/zoom/2)+12*sin(on/35)",
        'drift_down': "iw/2-(iw/zoom/2)+12*sin(on/35)",
        'center_zoom': "iw/2-(iw/zoom/2)+14*sin(on/25)",
    }.get(motion, "iw/2-(iw/zoom/2)+12*sin(on/35)")

    y_expr = {
        'drift_up': "ih/2-(ih/zoom/2)-28+12*cos(on/38)",
        'drift_down': "ih/2-(ih/zoom/2)+28+12*cos(on/38)",
        'pan_left': "ih/2-(ih/zoom/2)+8*cos(on/40)",
        'pan_right': "ih/2-(ih/zoom/2)+8*cos(on/40)",
        'center_zoom': "ih/2-(ih/zoom/2)+10*cos(on/28)",
    }.get(motion, "ih/2-(ih/zoom/2)+10*cos(on/35)")

    cmd = [
        _ffmpeg_executable(),
        '-y',
        '-loop',
        '1',
        '-i',
        str(source),
        '-vf',
        (
            f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':"
            f"d={frames}:s={FRAME_SIZE[0]}x{FRAME_SIZE[1]}:fps={FPS},"
            f"fade=t=in:st=0:d=0.5,fade=t=out:st={max(0.1, duration - 0.5)}:d=0.5,"
            "format=yuv420p"
        ),
        '-t',
        f'{duration:.3f}',
        '-r',
        str(FPS),
        str(output_path),
    ]
    _run_command(cmd)
    return output_path


def _create_video_scene(source: Path, duration: float, output_path: Path) -> Path:
    source_duration = _duration_of_media(source)
    
    cmd = [
        _ffmpeg_executable(),
        '-y',
        '-stream_loop',
        '-1' if source_duration < duration else '0',
        '-i',
        str(source),
        '-t',
        f'{duration:.3f}',
        '-vf',
        (
            f"scale={FRAME_SIZE[0]}:{FRAME_SIZE[1]}:force_original_aspect_ratio=increase,"
            f"crop={FRAME_SIZE[0]}:{FRAME_SIZE[1]},"
            "fps=30,format=yuv420p,"
            f"fade=t=in:st=0:d=0.5,fade=t=out:st={max(0.1, duration - 0.5)}:d=0.5"
        ),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-an',
        str(output_path),
    ]
    _run_command(cmd)
    return output_path


def _normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip())


def _truncate_words(text: str, max_words: int = 18) -> str:
    words = _normalize_text(text).split()
    if len(words) <= max_words:
        return ' '.join(words)
    return ' '.join(words[:max_words]).rstrip(' ,.;:') + '...'


def _split_script_chunks(script: str, total_duration: float) -> list[dict[str, object]]:
    script = _normalize_text(script)
    if not script:
        return []

    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', script) if s.strip()]
    if len(sentences) >= 3:
        chunks = sentences
    else:
        words = script.split()
        if len(words) <= 14:
            chunks = [script]
        else:
            size = max(5, min(10, len(words) // 5 or 5))
            chunks = [' '.join(words[i:i + size]) for i in range(0, len(words), size)]

    normalized_chunks: list[str] = []
    for chunk in chunks:
        chunk = _normalize_text(chunk)
        if not chunk:
            continue
        if len(chunk) > 80:
            normalized_chunks.extend(
                [' '.join(part.split()) for part in re.findall(r'.{1,80}(?:\s|$)', chunk)]
            )
        else:
            normalized_chunks.append(chunk)

    chunks = normalized_chunks or [script]

    total_words = max(1, sum(len(chunk.split()) for chunk in chunks))
    cursor = 0.0
    segments: list[dict[str, object]] = []
    for i, chunk in enumerate(chunks):
        chunk_words = max(1, len(chunk.split()))
        chunk_duration = max(1.5, total_duration * (chunk_words / total_words))
        start = cursor
        end = min(total_duration, cursor + chunk_duration)
        cursor = end
        frac = start / max(total_duration, 0.001)
        if frac < 0.18:
            style = 'HookTop'
        elif frac > 0.82:
            style = 'CTACenter'
        else:
            style = 'BodyBottom'
        segments.append({'start': start, 'end': end, 'text': chunk, 'style': style})

    if segments:
        segments[-1]['end'] = total_duration

    return segments


def _ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    return f'{h}:{m:02d}:{s:02d}.{cs:02d}'


def _format_ass_caption(text: str, max_width: int = 34) -> str:
    lines = textwrap.wrap(_normalize_text(text), width=max_width, break_long_words=False, break_on_hyphens=False)
    if not lines:
        return ''
    return r'\N'.join(lines[:3])


def _create_ass_subtitles(script: str, total_duration: float, output_path: Path) -> Path:
    segments = _split_script_chunks(script, total_duration)
    header = textwrap.dedent(
        f"""
        [Script Info]
        Title: AveFlow Video Captions
        ScriptType: v4.00+
        PlayResX: {FRAME_SIZE[0]}
        PlayResY: {FRAME_SIZE[1]}
        WrapStyle: 2
        ScaledBorderAndShadow: yes

        [V4+ Styles]
        Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
        Style: HookTop,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,4.5,2,8,100,100,180,1
        Style: BodyBottom,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,4.5,2,2,100,100,220,1
        Style: CTACenter,Arial,76,&H0000FFFF,&H000000FF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,5,2.5,5,100,100,200,1

        [Events]
        Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
        """
    ).strip()

    lines = [header]
    for segment in segments:
        start = _ass_time(float(segment['start']))
        end = _ass_time(float(segment['end']))
        style = segment['style']
        text = _format_ass_caption(str(segment['text']))
        text = text.replace('{', '\\{').replace('}', '\\}').replace('\n', ' ')
        lines.append(
            f'Dialogue: 0,{start},{end},{style},,0,0,0,,{{\\fad(180,180)}}{text}'
        )

    output_path.write_text('\n'.join(lines), encoding='utf-8')
    return output_path


def _download_asset(asset: str, work_dir: Path, prefix: str) -> Path | None:
    if not asset:
        return None

    if _is_remote_url(asset):
        suffix = Path(asset.split('?')[0]).suffix or '.bin'
        dest = work_dir / f'{prefix}{suffix}'
        return _download_file(asset, dest)

    path = Path(asset)
    if path.exists():
        return path

    return None


def _escape_ffmpeg_filter_path(path: Path) -> str:
    value = path.resolve().as_posix()
    value = value.replace('\\', '\\\\')
    value = value.replace(':', '\\:')
    value = value.replace("'", "\\'")
    return value


def _choose_motion(index: int) -> str:
    motions = ['center_zoom', 'pan_left', 'pan_right', 'drift_up', 'drift_down']
    return motions[index % len(motions)]


@dataclass
class RenderInput:
    title: str
    script: str
    description: str = ''
    image: str | None = None
    screenshots: list[str] = field(default_factory=list)
    videos: list[str] = field(default_factory=list)
    audio_base64: str | None = None
    audio_url: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    target_duration: float | None = None
    cta_text: str = 'Tap the link in bio'


def _select_visual_sources(payload: RenderInput, work_dir: Path) -> list[dict[str, object]]:
    sources: list[dict[str, object]] = []

    if payload.image:
        sources.append({
            'kind': 'image',
            'path': _download_asset(payload.image, work_dir, 'cover'),
            'label': 'Cover',
        })

    for i, video in enumerate(payload.videos[:3]):
        sources.append({
            'kind': 'video',
            'path': _download_asset(video, work_dir, f'video_{i}'),
            'label': f'Video {i + 1}',
        })

    for i, shot in enumerate(payload.screenshots[:8]):
        sources.append({
            'kind': 'image',
            'path': _download_asset(shot, work_dir, f'shot_{i}'),
            'label': f'Screenshot {i + 1}',
        })

    if not sources and payload.image:
        sources.append({
            'kind': 'image',
            'path': _download_asset(payload.image, work_dir, 'fallback'),
            'label': 'Fallback',
        })

    valid_sources = [source for source in sources if source.get('path')]
    return valid_sources


def _write_audio_file(payload: RenderInput, work_dir: Path) -> Path | None:
    if payload.audio_base64:
        raw = payload.audio_base64.strip()
        if ',' in raw and raw.startswith('data:'):
            raw = raw.split(',', 1)[1]
        audio_path = work_dir / 'voiceover.mp3'
        audio_path.write_bytes(base64.b64decode(raw))
        return audio_path

    if payload.audio_url:
        return _download_asset(payload.audio_url, work_dir, 'voiceover')

    # ElevenLabs removed - no longer auto-generate voice
    # Use structured pipeline (/render-structured) for AI voiceover
    return None


def render_video(payload: RenderInput) -> Path:
    """
    Render a short social video from screenshots/videos plus subtitles.
    Returns the final mp4 path.
    """
    _ensure_dirs()
    safe_title = _slugify(payload.title or 'video')
    render_id = f'{safe_title}-{os.getpid()}-{abs(hash(payload.script)) % 10_000_000}'

    print(f"[Render] Preparing temp workspace for {safe_title}")

    with tempfile.TemporaryDirectory(dir=TEMP_DIR, ignore_cleanup_errors=True) as temp_root:
        work_dir = Path(temp_root)

        print("[Render] Resolving audio and visual assets")
        audio_path = _write_audio_file(payload, work_dir)
        audio_duration = _duration_of_media(audio_path) if audio_path else 0.0
        estimated_duration = max(18.0, min(60.0, len((payload.script or '').split()) * 0.36 + 4.0))
        if payload.target_duration and payload.target_duration > 0:
            total_duration = payload.target_duration
        else:
            total_duration = audio_duration if audio_duration >= 8.0 else estimated_duration
        total_duration = max(12.0, min(60.0, total_duration))

        visuals = _select_visual_sources(payload, work_dir)
        if not visuals:
            print("[Render] No media found, using solid background")
            cover = _create_gradient_background(FRAME_SIZE, [(8, 8, 14), (9, 10, 20), (139, 92, 246)])
            cover_path = work_dir / 'cover.png'
            cover.save(cover_path)
            visuals = [{'kind': 'image', 'path': cover_path, 'label': 'Cover'}]

        # Determine if we have videos or only images
        has_videos = any(v['kind'] == 'video' for v in visuals)
        
        if has_videos:
            # Video mode: cut and splice videos together
            scene_count = max(3, min(6, len([v for v in visuals if v['kind'] == 'video'])))
        else:
            # Image mode: use all images with motion effects
            scene_count = max(3, min(8, len(visuals)))
        
        scene_duration = total_duration / scene_count
        scene_files: list[Path] = []
        visual_cycle = cycle(visuals)

        print(f"[Render] Building {scene_count} scenes ({'video splice' if has_videos else 'image motion'})")
        
        for index in range(scene_count):
            visual = next(visual_cycle)
            scene_path = work_dir / f'scene_{index}.mp4'
            if visual['kind'] == 'video':
                scene_files.append(_create_video_scene(Path(visual['path']), scene_duration, scene_path))
            else:
                scene_files.append(_create_image_scene(Path(visual['path']), scene_duration, scene_path, _choose_motion(index)))

        concat_list = work_dir / 'concat.txt'
        concat_list.write_text(
            '\n'.join(f"file '{scene.as_posix()}'" for scene in scene_files),
            encoding='utf-8',
        )

        merged_path = work_dir / 'merged.mp4'
        print("[Render] Concatenating scene clips")
        _run_command(
            [
                _ffmpeg_executable(),
                '-y',
                '-f',
                'concat',
                '-safe',
                '0',
                '-i',
                str(concat_list),
                '-c',
                'copy',
                str(merged_path),
            ]
        )

        subtitle_path = work_dir / 'captions.ass'
        _create_ass_subtitles(payload.script, total_duration, subtitle_path)
        subtitle_filter = f"subtitles=filename='{_escape_ffmpeg_filter_path(subtitle_path)}'"

        final_path = OUTPUT_DIR / f'{render_id}.mp4'
        print("[Render] Burning subtitles and encoding final video")

        if audio_path and audio_path.exists():
            _run_command(
                [
                    _ffmpeg_executable(),
                    '-y',
                    '-i',
                    str(merged_path),
                    '-i',
                    str(audio_path),
                    '-vf',
                    subtitle_filter,
                    '-map',
                    '0:v:0',
                    '-map',
                    '1:a:0',
                    '-shortest',
                    '-c:v',
                    'libx264',
                    '-preset',
                    'veryfast',
                    '-crf',
                    '18',
                    '-c:a',
                    'aac',
                    '-b:a',
                    '192k',
                    '-pix_fmt',
                    'yuv420p',
                    str(final_path),
                ]
            )
        else:
            _run_command(
                [
                    _ffmpeg_executable(),
                    '-y',
                    '-i',
                    str(merged_path),
                    '-vf',
                    subtitle_filter,
                    '-c:v',
                    'libx264',
                    '-preset',
                    'veryfast',
                    '-crf',
                    '18',
                    '-pix_fmt',
                    'yuv420p',
                    '-an',
                    str(final_path),
                ]
            )

        print(f"[Render] Completed: {final_path}")
        return final_path
