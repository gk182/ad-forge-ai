from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path

import requests

ROOT_DIR = Path(__file__).resolve().parents[1]
ALIGNMENT_CACHE_DIR = ROOT_DIR / "outputs" / "alignment_cache"
ALIGNMENT_CACHE_VERSION = "v2-gentle-progressive-highlight"
DEFAULT_GENTLE_URL = os.getenv("GENTLE_URL", "http://127.0.0.1:8765").rstrip("/")
DEFAULT_GENTLE_TIMEOUT_SECONDS = float(os.getenv("GENTLE_TIMEOUT_SECONDS", "60"))
MIN_ALIGNMENT_COVERAGE = 0.45
MIN_WORD_DURATION_SECONDS = 0.06
DEFAULT_ESTIMATED_WORD_DURATION_SECONDS = 0.24
MAX_SCENE_PADDING_SECONDS = 0.25
TOKEN_RE = re.compile(r"[a-z]+|\d+")


@dataclass(slots=True)
class AlignedWord:
    word: str
    start: float
    end: float
    matched: bool = True
    is_estimated: bool = False
    confidence: float | None = None


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


@dataclass(slots=True)
class DisplayWordPlan:
    scene_index: int
    subtitle: str
    word: str
    normalized_tokens: list[str]
    weight: int


@dataclass(slots=True)
class AlignmentPlan:
    scene_subtitles: list[str]
    display_words: list[DisplayWordPlan]
    scene_word_ranges: list[tuple[int, int]]
    alignment_tokens: list[str]
    token_to_word_index: list[int]
    alignment_transcript: str


@dataclass(slots=True)
class GentleWord:
    word: str
    normalized: str
    start: float
    end: float
    case: str
    confidence: float | None


def align_audio_with_gentle(
    audio_path: Path,
    transcript: str,
    scene_subtitles: list[str] | None,
    audio_duration: float,
) -> AlignmentResult | None:
    scene_texts = [subtitle.strip() for subtitle in (scene_subtitles or []) if subtitle.strip()]
    if not scene_texts:
        transcript = transcript.strip()
        if not transcript:
            return None
        scene_texts = [transcript]

    plan = _build_alignment_plan(scene_texts)
    if not plan.alignment_tokens:
        return None

    cache_key = _build_cache_key(audio_path, plan)
    cache_path = ALIGNMENT_CACHE_DIR / f"{cache_key}.json"
    cached = _load_cached_alignment(cache_path)
    if cached is not None:
        print(f"[Alignment] Cache hit: {cache_path.name}")
        return cached

    try:
        response = _request_gentle_alignment(audio_path, plan.alignment_transcript)
        gentle_words = _parse_gentle_words(response.get("words", []))
        actual_tokens = [word.normalized for word in gentle_words if word.normalized]
        coverage = len(actual_tokens) / max(1, len(plan.alignment_tokens))
        if not actual_tokens or coverage < MIN_ALIGNMENT_COVERAGE:
            print(
                f"[Alignment] Coverage too low for Gentle result: "
                f"{len(actual_tokens)}/{len(plan.alignment_tokens)} ({coverage:.2%})"
            )
            return None

        absolute_word_timings, matched_count, estimated_count = _build_display_word_timings(
            gentle_words=gentle_words,
            plan=plan,
            audio_duration=audio_duration,
        )
        scene_alignments = _build_scene_alignments(
            absolute_word_timings=absolute_word_timings,
            plan=plan,
            audio_duration=audio_duration,
        )

        mismatch_scenes = [
            str(scene.scene_index + 1)
            for scene in scene_alignments
            if scene.word_timings and sum(1 for word in scene.word_timings if word.is_estimated) / len(scene.word_timings) > 0.4
        ]
        print(
            f"[Alignment] Gentle coverage={coverage:.2%} "
            f"matched={matched_count} estimated={estimated_count} scenes={len(scene_alignments)}"
        )
        if mismatch_scenes:
            print(f"[Alignment] Scenes with heavy estimation: {', '.join(mismatch_scenes)}")

        result = AlignmentResult(
            source="gentle",
            words=absolute_word_timings,
            scene_alignments=scene_alignments,
            coverage=coverage,
            cache_hit=False,
        )
        _store_alignment(cache_path, result)
        return result
    except Exception as exc:
        print(f"[Alignment] Gentle alignment unavailable: {exc}")
        return None


def _build_alignment_plan(scene_subtitles: list[str]) -> AlignmentPlan:
    display_words: list[DisplayWordPlan] = []
    scene_word_ranges: list[tuple[int, int]] = []
    alignment_tokens: list[str] = []
    token_to_word_index: list[int] = []

    cursor = 0
    for scene_index, subtitle in enumerate(scene_subtitles):
        raw_words = [word for word in subtitle.split() if word]
        start_index = cursor
        for word in raw_words:
            normalized_tokens = _normalize_word_to_tokens(word)
            display_words.append(
                DisplayWordPlan(
                    scene_index=scene_index,
                    subtitle=subtitle,
                    word=word,
                    normalized_tokens=normalized_tokens,
                    weight=max(1, len("".join(normalized_tokens)) or len(word.strip())),
                )
            )
            word_index = len(display_words) - 1
            for token in normalized_tokens:
                alignment_tokens.append(token)
                token_to_word_index.append(word_index)
            cursor += 1
        scene_word_ranges.append((start_index, cursor))

    alignment_transcript = " ".join(alignment_tokens)
    return AlignmentPlan(
        scene_subtitles=scene_subtitles,
        display_words=display_words,
        scene_word_ranges=scene_word_ranges,
        alignment_tokens=alignment_tokens,
        token_to_word_index=token_to_word_index,
        alignment_transcript=alignment_transcript,
    )


def _normalize_word_to_tokens(word: str) -> list[str]:
    text = word.lower().strip()
    if not text:
        return []

    substitutions = {
        "&": " and ",
        "@": " at ",
        "%": " percent ",
        "+": " plus ",
    }
    for source, target in substitutions.items():
        text = text.replace(source, target)

    text = re.sub(r"(?<=\d),(?=\d)", "", text)
    text = re.sub(r"[-_/]+", " ", text)
    text = text.replace("'", "")

    number_expanded: list[str] = []
    for token in TOKEN_RE.findall(text):
        if token.isdigit():
            number_expanded.extend(_number_to_alignment_tokens(int(token)))
        else:
            number_expanded.append(token)
    return [token for token in number_expanded if token]


def _number_to_alignment_tokens(value: int) -> list[str]:
    if value == 0:
        return ["zero"]

    units = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ]
    tens = [
        "",
        "",
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
    ]

    def under_thousand(number: int) -> list[str]:
        words: list[str] = []
        if number >= 100:
            words.extend([units[number // 100], "hundred"])
            number %= 100
        if 0 < number < 20:
            words.append(units[number])
            return words
        if number >= 20:
            words.append(tens[number // 10])
            number %= 10
        if number > 0:
            words.append(units[number])
        return words

    groups = [
        (1_000_000_000, "billion"),
        (1_000_000, "million"),
        (1_000, "thousand"),
    ]
    words: list[str] = []
    remainder = value
    for divisor, label in groups:
        if remainder >= divisor:
            chunk = remainder // divisor
            words.extend(under_thousand(chunk))
            words.append(label)
            remainder %= divisor
    if remainder:
        words.extend(under_thousand(remainder))
    return words


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


def _parse_gentle_words(raw_words: list[dict]) -> list[GentleWord]:
    words: list[GentleWord] = []
    for item in raw_words:
        start = item.get("start")
        end = item.get("end")
        if start is None or end is None:
            continue
        raw_word = str(item.get("alignedWord") or item.get("word") or "").strip()
        normalized_tokens = _normalize_word_to_tokens(raw_word)
        if not normalized_tokens:
            continue
        case = str(item.get("case") or "success")
        confidence: float | None = None
        confidence_value = item.get("confidence")
        if confidence_value is not None:
            try:
                confidence = float(confidence_value)
            except (TypeError, ValueError):
                confidence = None
        words.append(
            GentleWord(
                word=raw_word,
                normalized=normalized_tokens[0],
                start=max(0.0, float(start)),
                end=max(float(start), float(end)),
                case=case,
                confidence=confidence,
            )
        )
    return words


def _build_display_word_timings(
    gentle_words: list[GentleWord],
    plan: AlignmentPlan,
    audio_duration: float,
) -> tuple[list[AlignedWord], int, int]:
    expected_tokens = plan.alignment_tokens
    actual_tokens = [word.normalized for word in gentle_words if word.normalized]
    matcher = SequenceMatcher(a=expected_tokens, b=actual_tokens, autojunk=False)

    matched_word_groups: list[list[GentleWord]] = [[] for _ in plan.display_words]
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "equal":
            continue
        for offset in range(min(i2 - i1, j2 - j1)):
            expected_index = i1 + offset
            actual_index = j1 + offset
            word_index = plan.token_to_word_index[expected_index]
            matched_word_groups[word_index].append(gentle_words[actual_index])

    absolute_word_timings: list[AlignedWord] = []
    matched_count = 0
    for plan_word, gentle_group in zip(plan.display_words, matched_word_groups):
        if gentle_group:
            matched_count += 1
            confidences = [word.confidence for word in gentle_group if word.confidence is not None]
            absolute_word_timings.append(
                AlignedWord(
                    word=plan_word.word,
                    start=min(word.start for word in gentle_group),
                    end=max(word.end for word in gentle_group),
                    matched=True,
                    is_estimated=False,
                    confidence=sum(confidences) / len(confidences) if confidences else None,
                )
            )
            continue

        absolute_word_timings.append(
            AlignedWord(
                word=plan_word.word,
                start=0.0,
                end=0.0,
                matched=False,
                is_estimated=True,
                confidence=0.0,
            )
        )

    estimated_count = _estimate_missing_word_timings(absolute_word_timings, plan.display_words, audio_duration)
    return absolute_word_timings, matched_count, estimated_count


def _estimate_missing_word_timings(
    absolute_word_timings: list[AlignedWord],
    display_words: list[DisplayWordPlan],
    audio_duration: float,
) -> int:
    matched_durations = [
        max(MIN_WORD_DURATION_SECONDS, word.end - word.start)
        for word in absolute_word_timings
        if word.matched and not word.is_estimated and word.end > word.start
    ]
    average_duration = (
        sum(matched_durations) / len(matched_durations)
        if matched_durations
        else DEFAULT_ESTIMATED_WORD_DURATION_SECONDS
    )

    estimated_count = 0
    index = 0
    while index < len(absolute_word_timings):
        if absolute_word_timings[index].matched and not absolute_word_timings[index].is_estimated:
            index += 1
            continue

        group_start = index
        while index < len(absolute_word_timings) and (
            not absolute_word_timings[index].matched or absolute_word_timings[index].is_estimated
        ):
            index += 1
        group_end = index

        prev_word = absolute_word_timings[group_start - 1] if group_start > 0 else None
        next_word = absolute_word_timings[group_end] if group_end < len(absolute_word_timings) else None
        weights = [display_words[position].weight for position in range(group_start, group_end)]
        total_weight = max(1, sum(weights))

        if prev_word and next_word:
            window_start = prev_word.end
            window_end = max(window_start, next_word.start)
        elif prev_word:
            window_start = prev_word.end
            window_end = min(audio_duration, window_start + average_duration * len(weights))
        elif next_word:
            window_end = next_word.start
            window_start = max(0.0, window_end - average_duration * len(weights))
        else:
            window_start = 0.0
            window_end = min(audio_duration, average_duration * len(weights))

        if window_end <= window_start:
            window_end = min(audio_duration, window_start + MIN_WORD_DURATION_SECONDS * len(weights))

        cursor = window_start
        span = max(window_end - window_start, MIN_WORD_DURATION_SECONDS * len(weights))
        for weight, position in zip(weights, range(group_start, group_end)):
            allocation = max(MIN_WORD_DURATION_SECONDS, span * (weight / total_weight))
            remaining_positions = group_end - position - 1
            max_end = window_end - MIN_WORD_DURATION_SECONDS * remaining_positions
            end = min(max_end, cursor + allocation)
            if end <= cursor:
                end = cursor + MIN_WORD_DURATION_SECONDS
            absolute_word_timings[position].start = max(0.0, cursor)
            absolute_word_timings[position].end = min(audio_duration, end)
            absolute_word_timings[position].matched = False
            absolute_word_timings[position].is_estimated = True
            absolute_word_timings[position].confidence = 0.0
            cursor = absolute_word_timings[position].end
            estimated_count += 1

    return estimated_count


def _build_scene_alignments(
    absolute_word_timings: list[AlignedWord],
    plan: AlignmentPlan,
    audio_duration: float,
) -> list[SceneAlignment]:
    scene_alignments: list[SceneAlignment] = []
    previous_scene_end = 0.0

    for scene_index, subtitle in enumerate(plan.scene_subtitles):
        start_index, end_index = plan.scene_word_ranges[scene_index]
        scene_words = absolute_word_timings[start_index:end_index]
        if not scene_words:
            continue

        first_word = scene_words[0]
        last_word = scene_words[-1]
        prev_last_word = absolute_word_timings[start_index - 1] if start_index > 0 else None
        next_first_word = absolute_word_timings[end_index] if end_index < len(absolute_word_timings) else None

        leading_gap = (
            first_word.start
            if prev_last_word is None
            else max(0.0, first_word.start - prev_last_word.end)
        )
        trailing_gap = (
            max(0.0, audio_duration - last_word.end)
            if next_first_word is None
            else max(0.0, next_first_word.start - last_word.end)
        )

        scene_start = max(
            previous_scene_end,
            first_word.start - min(MAX_SCENE_PADDING_SECONDS, leading_gap / 2),
        )
        scene_end = min(
            audio_duration,
            last_word.end + min(MAX_SCENE_PADDING_SECONDS, trailing_gap / 2),
        )
        if scene_end <= scene_start:
            scene_end = min(audio_duration, max(last_word.end, scene_start + MIN_WORD_DURATION_SECONDS))

        relative_word_timings = [
            AlignedWord(
                word=word.word,
                start=max(0.0, word.start - scene_start),
                end=max(0.0, word.end - scene_start),
                matched=word.matched,
                is_estimated=word.is_estimated,
                confidence=word.confidence,
            )
            for word in scene_words
        ]
        scene_alignments.append(
            SceneAlignment(
                scene_index=scene_index,
                subtitle=subtitle,
                start=scene_start,
                end=scene_end,
                duration=max(MIN_WORD_DURATION_SECONDS, scene_end - scene_start),
                word_timings=relative_word_timings,
            )
        )
        previous_scene_end = scene_end

    return scene_alignments


def _build_cache_key(audio_path: Path, plan: AlignmentPlan) -> str:
    digest = hashlib.sha256()
    digest.update(ALIGNMENT_CACHE_VERSION.encode("utf-8"))
    with open(audio_path, "rb") as audio_file:
        for chunk in iter(lambda: audio_file.read(1024 * 1024), b""):
            digest.update(chunk)
    digest.update(plan.alignment_transcript.encode("utf-8"))
    digest.update("\n".join(plan.scene_subtitles).encode("utf-8"))
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
