from __future__ import annotations

import hashlib
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

import requests

ROOT_DIR = Path(__file__).resolve().parents[1]
ALIGNMENT_CACHE_DIR = ROOT_DIR / "outputs" / "alignment_cache"
DEFAULT_GENTLE_URL = os.getenv("GENTLE_URL", "http://127.0.0.1:8765").rstrip("/")
DEFAULT_GENTLE_TIMEOUT_SECONDS = float(os.getenv("GENTLE_TIMEOUT_SECONDS", "60"))
MIN_ALIGNMENT_COVERAGE = 0.8


@dataclass(slots=True)
class AlignedWord:
    word: str
    start: float
    end: float


@dataclass(slots=True)
class SceneAlignment:
    scene_index: int
    subtitle: str
    start: float
    end: float
    duration: float
    word_timings: list[AlignedWord]


@dataclass(slots=True)
class AlignmentResult:
    source: str
    words: list[AlignedWord]
    scene_alignments: list[SceneAlignment]
    coverage: float
    cache_hit: bool


def align_audio_with_gentle(
    audio_path: Path,
    transcript: str,
    scene_subtitles: list[str] | None,
    audio_duration: float,
) -> AlignmentResult | None:
    transcript = transcript.strip()
    if not transcript:
        return None

    cache_key = _build_cache_key(audio_path, transcript, scene_subtitles or [])
    cache_path = ALIGNMENT_CACHE_DIR / f"{cache_key}.json"
    cached = _load_cached_alignment(cache_path)
    if cached is not None:
        print(f"[Alignment] Cache hit: {cache_path.name}")
        return cached

    try:
        response = _request_gentle_alignment(audio_path, transcript)
        words = _parse_gentle_words(response.get("words", []))
        transcript_word_count = len(_split_transcript_words(transcript))
        coverage = len(words) / max(1, transcript_word_count)
        if not words or coverage < MIN_ALIGNMENT_COVERAGE:
            print(
                f"[Alignment] Coverage too low for Gentle result: "
                f"{len(words)}/{transcript_word_count} ({coverage:.2%})"
            )
            return None

        scene_alignments = _build_scene_alignments(words, scene_subtitles or [], audio_duration)
        result = AlignmentResult(
            source="gentle",
            words=words,
            scene_alignments=scene_alignments,
            coverage=coverage,
            cache_hit=False,
        )
        _store_alignment(cache_path, result)
        return result
    except Exception as exc:
        print(f"[Alignment] Gentle alignment unavailable: {exc}")
        return None


def _request_gentle_alignment(audio_path: Path, transcript: str) -> dict:
    with open(audio_path, "rb") as audio_file:
        files = {
            "audio": (audio_path.name, audio_file, "audio/mpeg"),
            "transcript": ("transcript.txt", transcript.encode("utf-8"), "text/plain"),
        }
        response = requests.post(
            f"{DEFAULT_GENTLE_URL}/transcriptions",
            params={"async": "false"},
            files=files,
            timeout=DEFAULT_GENTLE_TIMEOUT_SECONDS,
        )
    response.raise_for_status()
    return response.json()


def _parse_gentle_words(raw_words: list[dict]) -> list[AlignedWord]:
    words: list[AlignedWord] = []
    for item in raw_words:
        start = item.get("start")
        end = item.get("end")
        if start is None or end is None:
            continue
        word = str(item.get("word") or item.get("alignedWord") or "").strip()
        if not word:
            continue
        words.append(
            AlignedWord(
                word=word,
                start=max(0.0, float(start)),
                end=max(float(start), float(end)),
            )
        )
    return words


def _build_scene_alignments(
    words: list[AlignedWord],
    scene_subtitles: list[str],
    audio_duration: float,
) -> list[SceneAlignment]:
    if not scene_subtitles:
        return []

    scene_word_lists = [_split_transcript_words(subtitle) for subtitle in scene_subtitles]
    expected_total_words = sum(len(word_list) for word_list in scene_word_lists)
    if expected_total_words == 0:
        return []

    if len(words) < expected_total_words:
        raise ValueError(
            f"Aligned word count {len(words)} is lower than scene word count {expected_total_words}"
        )

    if len(words) - expected_total_words > max(2, len(scene_subtitles)):
        raise ValueError(
            f"Aligned word count mismatch is too large: {len(words)} vs {expected_total_words}"
        )

    cursor = 0
    grouped_words: list[list[AlignedWord]] = []
    for word_list in scene_word_lists:
        if not word_list:
            grouped_words.append([])
            continue
        next_cursor = cursor + len(word_list)
        grouped_words.append(words[cursor:next_cursor])
        cursor = next_cursor

    starts = [group[0].start for group in grouped_words if group]
    ends = [group[-1].end for group in grouped_words if group]
    if not starts or not ends:
        return []

    scene_alignments: list[SceneAlignment] = []
    for index, (subtitle, display_words, aligned_group) in enumerate(
        zip(scene_subtitles, scene_word_lists, grouped_words)
    ):
        if not aligned_group:
            continue

        if index == 0:
            scene_start = 0.0
        else:
            previous_group = grouped_words[index - 1]
            scene_start = (
                (previous_group[-1].end + aligned_group[0].start) / 2
                if previous_group
                else aligned_group[0].start
            )

        if index == len(grouped_words) - 1:
            scene_end = audio_duration
        else:
            next_group = grouped_words[index + 1]
            scene_end = (
                (aligned_group[-1].end + next_group[0].start) / 2
                if next_group
                else aligned_group[-1].end
            )

        if scene_end < scene_start:
            scene_end = aligned_group[-1].end

        word_timings = [
            AlignedWord(
                word=display_word,
                start=max(0.0, aligned_word.start - scene_start),
                end=max(0.0, aligned_word.end - scene_start),
            )
            for display_word, aligned_word in zip(display_words, aligned_group)
        ]
        scene_alignments.append(
            SceneAlignment(
                scene_index=index,
                subtitle=subtitle,
                start=scene_start,
                end=scene_end,
                duration=max(0.1, scene_end - scene_start),
                word_timings=word_timings,
            )
        )

    return scene_alignments


def _split_transcript_words(text: str) -> list[str]:
    return [word for word in text.split() if word]


def _build_cache_key(audio_path: Path, transcript: str, scene_subtitles: list[str]) -> str:
    digest = hashlib.sha256()
    with open(audio_path, "rb") as audio_file:
        for chunk in iter(lambda: audio_file.read(1024 * 1024), b""):
            digest.update(chunk)
    digest.update(transcript.encode("utf-8"))
    digest.update("\n".join(scene_subtitles).encode("utf-8"))
    return digest.hexdigest()


def _load_cached_alignment(cache_path: Path) -> AlignmentResult | None:
    if not cache_path.exists():
        return None
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        return AlignmentResult(
            source=payload.get("source", "gentle"),
            words=[AlignedWord(**word) for word in payload.get("words", [])],
            scene_alignments=[
                SceneAlignment(
                    scene_index=scene["scene_index"],
                    subtitle=scene["subtitle"],
                    start=scene["start"],
                    end=scene["end"],
                    duration=scene["duration"],
                    word_timings=[AlignedWord(**word) for word in scene.get("word_timings", [])],
                )
                for scene in payload.get("scene_alignments", [])
            ],
            coverage=float(payload.get("coverage", 0)),
            cache_hit=True,
        )
    except Exception as exc:
        print(f"[Alignment] Failed to load cache {cache_path.name}: {exc}")
        return None


def _store_alignment(cache_path: Path, result: AlignmentResult) -> None:
    ALIGNMENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": result.source,
        "coverage": result.coverage,
        "words": [asdict(word) for word in result.words],
        "scene_alignments": [
            {
                "scene_index": scene.scene_index,
                "subtitle": scene.subtitle,
                "start": scene.start,
                "end": scene.end,
                "duration": scene.duration,
                "word_timings": [asdict(word) for word in scene.word_timings],
            }
            for scene in result.scene_alignments
        ],
    }
    cache_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
