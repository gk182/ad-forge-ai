from __future__ import annotations

import base64
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

from services.alignment_service import align_audio_with_gentle

TtsEngine = Literal["kokoro", "edge", "elevenlabs"]

DEFAULT_TTS_ENGINE: TtsEngine = "kokoro"
DEFAULT_KOKORO_LANG_CODE = "a"
DEFAULT_KOKORO_VOICE = "af_heart"
DEFAULT_EDGE_VOICE = "en-US-JennyNeural"
DEFAULT_ELEVENLABS_VOICE = "JBFqnCBsd6RMkjVDRZzb"
DEFAULT_AUDIO_MIME = "audio/mpeg"
DEFAULT_SAMPLE_RATE = 24_000
SUPPORTED_KOKORO_VOICES = {
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_sarah",
    "am_adam",
    "am_michael",
}

_KOKORO_PIPELINES: dict[str, object] = {}


class TtsError(RuntimeError):
    """Raised when the requested TTS engine cannot produce audio."""


@dataclass(slots=True)
class TtsSynthesisRequest:
    text: str
    engine: str = DEFAULT_TTS_ENGINE
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str = DEFAULT_ELEVENLABS_VOICE
    kokoro_voice_id: str = DEFAULT_KOKORO_VOICE
    edge_voice_id: str = DEFAULT_EDGE_VOICE
    scene_subtitles: list[str] | None = None
    stability: float = 0.5
    similarity: float = 0.75


def normalize_engine_name(
    voice_engine: str | None = None,
    tts_engine: str | None = None,
    use_free_tts: bool | None = None,
) -> TtsEngine:
    requested = (voice_engine or tts_engine or "").strip().lower()
    if requested:
        aliases: dict[str, TtsEngine] = {
            "kokoro": "kokoro",
            "free": "kokoro",
            "local": "kokoro",
            "edge": "edge",
            "microsoft": "edge",
            "elevenlabs": "elevenlabs",
        }
        return aliases.get(requested, DEFAULT_TTS_ENGINE)
    if use_free_tts is False:
        return "elevenlabs"
    return DEFAULT_TTS_ENGINE


def synthesize_speech_to_base64(request: TtsSynthesisRequest) -> dict[str, str]:
    with tempfile.TemporaryDirectory(prefix="aveflow-tts-") as temp_dir:
        output_path = Path(temp_dir) / "voiceover.mp3"
        synthesis_result = synthesize_speech_to_file(request, output_path)
        audio_duration = get_audio_duration(output_path)
        alignment_result = align_audio_with_gentle(
            audio_path=output_path,
            transcript=request.text,
            scene_subtitles=request.scene_subtitles,
            audio_duration=audio_duration,
        )
        audio_base64 = base64.b64encode(output_path.read_bytes()).decode("utf-8")
    response = {
        "audioBase64": f"data:{DEFAULT_AUDIO_MIME};base64,{audio_base64}",
        "audioDuration": audio_duration,
        "alignment": [],
        "sceneAlignments": [],
        "alignmentSource": "heuristic",
        "engine": synthesis_result["engine"],
    }
    if alignment_result is not None:
        response["alignment"] = [
            {
                "word": word.word,
                "start": word.start,
                "end": word.end,
                "matched": word.matched,
                "isEstimated": word.is_estimated,
                "confidence": word.confidence,
            }
            for word in alignment_result.words
        ]
        response["sceneAlignments"] = [
            {
                "sceneIndex": scene.scene_index,
                "subtitle": scene.subtitle,
                "start": scene.start,
                "end": scene.end,
                "duration": scene.duration,
                "wordTimings": [
                    {
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "matched": word.matched,
                        "isEstimated": word.is_estimated,
                        "confidence": word.confidence,
                    }
                    for word in scene.word_timings
                ],
            }
            for scene in alignment_result.scene_alignments
        ]
        response["alignmentSource"] = alignment_result.source
    return response


def synthesize_speech_to_file(request: TtsSynthesisRequest, output_path: Path) -> dict[str, str]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    candidates = _build_engine_candidates(request)
    last_error: Exception | None = None

    for engine in candidates:
        started_at = time.perf_counter()
        try:
            print(f"[TTS] Engine selected: {engine}")
            if engine == "kokoro":
                _generate_kokoro_audio(request.text, output_path, request.kokoro_voice_id)
            elif engine == "edge":
                _generate_edge_audio(request.text, output_path, request.edge_voice_id)
            elif engine == "elevenlabs":
                _generate_elevenlabs_audio(
                    text=request.text,
                    output_path=output_path,
                    api_key=request.elevenlabs_api_key,
                    voice_id=request.elevenlabs_voice_id,
                    stability=request.stability,
                    similarity=request.similarity,
                )
            else:
                raise TtsError(f"Unsupported TTS engine: {engine}")

            elapsed = time.perf_counter() - started_at
            print(f"[TTS] Engine {engine} completed in {elapsed:.2f}s")
            return {"engine": engine, "output_path": str(output_path)}
        except Exception as exc:
            elapsed = time.perf_counter() - started_at
            last_error = exc
            print(f"[TTS] Engine {engine} failed after {elapsed:.2f}s: {exc}")

    raise TtsError(str(last_error) if last_error else "No TTS engine was able to generate audio")


def _build_engine_candidates(request: TtsSynthesisRequest) -> list[TtsEngine]:
    primary = normalize_engine_name(request.engine)
    if primary == "kokoro":
        fallbacks: list[TtsEngine] = ["edge"]
        if request.elevenlabs_api_key:
            fallbacks.append("elevenlabs")
        return [primary, *fallbacks]

    if primary == "edge":
        return ["edge"]

    if not request.elevenlabs_api_key:
        raise TtsError("ElevenLabs API key is required when voice_engine=elevenlabs.")
    return ["elevenlabs"]


def _generate_kokoro_audio(text: str, output_path: Path, voice_id: str) -> None:
    try:
        import soundfile as sf
        from kokoro import KPipeline
    except Exception as exc:
        raise TtsError(
            "Kokoro runtime is unavailable. Install `kokoro>=0.9.4`, `soundfile`, and system package `espeak-ng`."
        ) from exc

    selected_voice = voice_id if voice_id in SUPPORTED_KOKORO_VOICES else DEFAULT_KOKORO_VOICE
    pipeline = _KOKORO_PIPELINES.get(DEFAULT_KOKORO_LANG_CODE)
    if pipeline is None:
        pipeline = KPipeline(lang_code=DEFAULT_KOKORO_LANG_CODE)
        _KOKORO_PIPELINES[DEFAULT_KOKORO_LANG_CODE] = pipeline

    chunks: list[np.ndarray] = []
    generator = pipeline(text, voice=selected_voice, speed=1, split_pattern=r"\n+")
    for _, _, audio in generator:
        audio_np = np.asarray(audio, dtype=np.float32).flatten()
        if audio_np.size:
            chunks.append(audio_np)

    if not chunks:
        raise TtsError("Kokoro returned no audio chunks.")

    merged_audio = np.concatenate(chunks)
    merged_audio = np.clip(merged_audio, -1.0, 1.0)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
        wav_path = Path(temp_wav.name)

    try:
        sf.write(wav_path, merged_audio, DEFAULT_SAMPLE_RATE)
        _convert_wav_to_mp3(wav_path, output_path)
    finally:
        wav_path.unlink(missing_ok=True)


def _generate_edge_audio(text: str, output_path: Path, voice_id: str) -> None:
    result = subprocess.run(
        [
            "edge-tts",
            "--text",
            text,
            "--voice",
            voice_id or DEFAULT_EDGE_VOICE,
            "--write-media",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise TtsError((result.stderr or result.stdout or "edge-tts failed").strip())


def _generate_elevenlabs_audio(
    text: str,
    output_path: Path,
    api_key: str | None,
    voice_id: str,
    stability: float,
    similarity: float,
) -> None:
    if not api_key:
        raise TtsError("ElevenLabs API key is required.")

    body = json.dumps(
        {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity,
                "style": 0.35,
                "use_speaker_boost": True,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id or DEFAULT_ELEVENLABS_VOICE}",
        data=body,
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": DEFAULT_AUDIO_MIME,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response, open(output_path, "wb") as output_file:
        shutil.copyfileobj(response, output_file)


def _convert_wav_to_mp3(wav_path: Path, output_path: Path) -> None:
    ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
    result = subprocess.run(
        [
            ffmpeg_bin,
            "-y",
            "-i",
            str(wav_path),
            "-vn",
            "-ar",
            str(DEFAULT_SAMPLE_RATE),
            "-ac",
            "1",
            "-b:a",
            "192k",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise TtsError((result.stderr or result.stdout or "ffmpeg conversion failed").strip())


def get_audio_duration(audio_path: Path) -> float:
    ffprobe_bin = shutil.which("ffprobe") or "ffprobe"
    result = subprocess.run(
        [
            ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise TtsError((result.stderr or result.stdout or "ffprobe duration probe failed").strip())
    try:
        return max(0.0, float(result.stdout.strip()))
    except ValueError as exc:
        raise TtsError("Unable to parse generated audio duration.") from exc
