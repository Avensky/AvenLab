# data-server/app/can/can_ai_router.py

from __future__ import annotations

import asyncio
import json
import math
import statistics
import time
from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.db import connect_db

import os

LLM_DEADLINE_SECONDS = float(
    os.getenv("LLM_DEADLINE_SECONDS", "1800")
)

LLM_HTTP_READ_TIMEOUT_SECONDS = float(
    os.getenv("LLM_HTTP_READ_TIMEOUT_SECONDS", "1810")
)

router = APIRouter(prefix="/data/can", tags=["can-ai"])

OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_LLM_MODEL = "qwen2.5:3b"
DEFAULT_EMBED_MODEL = "nomic-embed-text"
MAX_ANALYSIS_FRAMES = 75_000
MAX_DELTAS_TO_STORE = 50_000
MAX_DELTAS_TO_PERSIST = 10_000
MAX_DELTA_CANDIDATES_TO_PERSIST = 20

LLM_DEADLINE_SECONDS = 105.0
LLM_HTTP_READ_TIMEOUT_SECONDS = 110.0
LLM_NUM_CTX = 3072
LLM_NUM_PREDICT = 420
LLM_CANDIDATE_LIMIT = 5
LLM_BYTE_EVIDENCE_LIMIT = 2

# Keep production responses small enough for the Pi, browser, and React renderer.
MAX_RESPONSE_CANDIDATES = 15
MAX_RESPONSE_EVIDENCE_CANDIDATES = 5
MAX_RESPONSE_BYTE_EVIDENCE = 3
MAX_PERSISTED_REPORT_CANDIDATES = 10

VECTOR_DIMENSION = 768
EMBED_ONLY_MODEL_HINTS = ("embed", "embedding", "nomic-embed-text", "all-minilm")

ANALYSIS_MODE_BASELINE = "baseline_profile"
ANALYSIS_MODE_TARGET = "target_correlation"
BASELINE_CODE_PREFIXES = ("BASE", "NOISE", "SNIFF", "PROFILE")


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


def can_hex(can_id: int) -> str:
    return f"0x{can_id:03X}"


def entropy(values: list[int]) -> float:
    if not values:
        return 0.0
    total = len(values)
    counts = Counter(values)
    return float(-sum((n / total) * math.log2(n / total) for n in counts.values()))


def normalize_data(data: Any, dlc: int = 8) -> list[int]:
    """Return an eight-byte analysis buffer while preserving the original DLC separately.

    Classical CAN frames may legitimately have DLC values below eight. The statistical
    analyzer still iterates over byte positions 0 through 7, so absent positions are
    represented as zero instead of producing IndexError.
    """
    frame_width = 8

    if data is None:
        return [0] * frame_width

    if isinstance(data, memoryview):
        raw = data.tobytes()
    elif isinstance(data, bytes):
        raw = data
    elif isinstance(data, bytearray):
        raw = bytes(data)
    else:
        raw = bytes(data)

    try:
        reported_dlc = max(0, min(int(dlc), frame_width))
    except (TypeError, ValueError):
        reported_dlc = min(len(raw), frame_width)

    usable_length = reported_dlc if reported_dlc > 0 else min(len(raw), frame_width)
    padded = list(raw[:usable_length])

    while len(padded) < frame_width:
        padded.append(0)

    return padded[:frame_width]


def can_ai_log(event: str, **fields: Any) -> None:
    """Emit one-line structured diagnostics to journald/stdout."""
    details = " ".join(
        f"{key}={value}"
        for key, value in fields.items()
        if value is not None
    )
    message = f"[can-ai] {event}"
    if details:
        message = f"{message} {details}"
    print(message, flush=True)


def frame_byte(row: FrameRow, byte_index: int) -> int:
    """Read one byte defensively from legacy or short-DLC frame rows."""
    if 0 <= byte_index < len(row.data):
        return int(row.data[byte_index])
    return 0


def metadata_dict(value: Any) -> dict[str, Any]:
    """Return a safe dict from asyncpg json/jsonb, JSON text, or None."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def normalize_analysis_mode(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None

    mode = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "baseline": ANALYSIS_MODE_BASELINE,
        "baseline_noise": ANALYSIS_MODE_BASELINE,
        "noise": ANALYSIS_MODE_BASELINE,
        "noise_profile": ANALYSIS_MODE_BASELINE,
        "noise_sniffing": ANALYSIS_MODE_BASELINE,
        "sniff": ANALYSIS_MODE_BASELINE,
        "sniffing": ANALYSIS_MODE_BASELINE,
        "passive": ANALYSIS_MODE_BASELINE,
        "passive_sniff": ANALYSIS_MODE_BASELINE,
        "target": ANALYSIS_MODE_TARGET,
        "action": ANALYSIS_MODE_TARGET,
        "decode": ANALYSIS_MODE_TARGET,
        "correlation": ANALYSIS_MODE_TARGET,
        "target_correlation": ANALYSIS_MODE_TARGET,
    }
    if mode in aliases:
        return aliases[mode]
    if mode in {ANALYSIS_MODE_BASELINE, ANALYSIS_MODE_TARGET, "state_compare", "playback_validation"}:
        return mode
    return None


def infer_analysis_mode(session: dict[str, Any], markers: list[dict[str, Any]]) -> str:
    """Decide whether this session is baseline profiling or target correlation.

    Priority:
    1. Explicit analysis_mode in session / mission metadata.
    2. Baseline-looking mission code or label.
    3. Explicit marker metadata.
    4. Default to target correlation.
    """
    session_metadata = metadata_dict(session.get("session_metadata"))
    mission_metadata = metadata_dict(session.get("mission_metadata"))

    for metadata in (session_metadata, mission_metadata):
        mode = normalize_analysis_mode(metadata.get("analysis_mode"))
        if mode:
            return mode

    mission_code = str(session.get("mission_code") or "").upper()
    label = str(session.get("label") or "").upper()
    if mission_code.startswith(BASELINE_CODE_PREFIXES) or "BASELINE" in label or "NOISE" in label:
        return ANALYSIS_MODE_BASELINE

    for marker in markers:
        marker_metadata = metadata_dict(marker.get("metadata"))
        mode = normalize_analysis_mode(marker_metadata.get("analysis_mode"))
        if mode:
            return mode

    return ANALYSIS_MODE_TARGET


def is_baseline_mode(analysis_mode: str) -> bool:
    return normalize_analysis_mode(analysis_mode) == ANALYSIS_MODE_BASELINE


def build_baseline_profile(frames: list[FrameRow], candidates: list[Candidate]) -> dict[str, Any]:
    observed_ids = len({frame.can_id for frame in frames})
    total_frames = len(frames)
    high_rate_ids = [
        c.model_dump()
        for c in candidates
        if c.frequency_hz is not None and c.frequency_hz >= 20
    ][:15]
    noisy_ids = [
        c.model_dump()
        for c in candidates
        if c.change_count > 0
    ][:15]
    stable_ids = [
        c.model_dump()
        for c in candidates
        if c.change_count == 0
    ][:15]

    return {
        "kind": ANALYSIS_MODE_BASELINE,
        "target_expected": False,
        "total_frames": total_frames,
        "observed_ids": observed_ids,
        "high_rate_ids": high_rate_ids,
        "noisy_ids": noisy_ids,
        "stable_ids": stable_ids,
        "guidance": (
            "This is a passive/noise profile. Use these IDs as background traffic "
            "when scoring later action missions. Do not treat the highest-ranked ID "
            "as a decoded target signal."
        ),
    }


def build_fallback_report(
    session_id: UUID,
    analysis_mode: str,
    frames_count: int,
    markers_count: int,
    candidates: list[Candidate],
    baseline_profile: Optional[dict[str, Any]],
) -> str:
    if is_baseline_mode(analysis_mode):
        profile = baseline_profile or {}
        background_lines = [
            (
                f"- {candidate.can_id_hex}: role={candidate.candidate_role}, "
                f"frames={candidate.frame_count}, hz={candidate.frequency_hz}, "
                f"changes={candidate.change_count}, "
                f"change_ratio={candidate.change_ratio}, "
                f"bytes={candidate.byte_change_counts}"
            )
            for candidate in candidates[:5]
        ] or ["- No CAN IDs were available for baseline analysis."]

        byte_lines = [
            f"- {candidate.can_id_hex}: {compact_byte_evidence(candidate)}"
            for candidate in candidates[:3]
        ] or ["- No changing-byte evidence was available."]

        return "\n".join(
            [
                "# 1. Executive Summary",
                "",
                (
                    f"Statistical baseline analysis completed for session {session_id}. "
                    f"It analyzed {frames_count} frames, {markers_count} markers, and "
                    f"observed {profile.get('observed_ids', 0)} CAN IDs. This is a "
                    "noise profile, not a decoded target signal."
                ),
                "",
                "# 2. Baseline Traffic Profile",
                *background_lines,
                "",
                "# 3. Byte-Level Baseline Evidence",
                *byte_lines,
                "",
                "# 4. Warnings and Uncertainty",
                "- No LLM interpretation was available; this is a deterministic fallback report.",
                "- High-rate or high-change IDs may be normal background traffic.",
                "- Baseline observations should be matched to the same vehicle and operating state.",
                "",
                "# 5. Recommendations and Next Mission",
                "1. Preserve this baseline as a negative-control profile.",
                "2. Repeat the same baseline state to measure natural variability.",
                "3. Compare the next action mission against these naturally active IDs and bytes.",
                "Recommended next mission: record one repeated target action with at least four repetitions and idle recovery between actions.",
            ]
        )

    candidate_lines = [
        (
            f"- {candidate.can_id_hex}: confidence={candidate.confidence}, "
            f"correlation={candidate.correlation_score}, "
            f"changes={candidate.change_count}, "
            f"change_ratio={candidate.change_ratio}, "
            f"markers={candidate.likely_marker_types}"
        )
        for candidate in candidates[:5]
    ] or ["- No candidate CAN IDs were found."]

    byte_lines = [
        f"- {candidate.can_id_hex}: {compact_byte_evidence(candidate)}"
        for candidate in candidates[:3]
    ] or ["- No changing-byte evidence was available."]

    return "\n".join(
        [
            "# 1. Executive Summary",
            "",
            (
                f"Statistical target-correlation analysis completed for session {session_id}. "
                f"It analyzed {frames_count} frames and {markers_count} markers. "
                "The following results are hypotheses, not confirmed decodes."
            ),
            "",
            "# 2. Top CAN ID Hypotheses",
            *candidate_lines,
            "",
            "# 3. Byte-Level Evidence",
            *byte_lines,
            "",
            "# 4. Warnings and Uncertainty",
            "- No LLM interpretation was available; this is a deterministic fallback report.",
            "- Marker correlation does not prove that an ID owns the intended signal.",
            "- Naturally noisy background traffic may still rank highly without a matched baseline.",
            "",
            "# 5. Recommendations and Next Mission",
            "1. Repeat the target action at least four times and verify the same byte transition each time.",
            "2. Record an equal-duration no-action control and reject candidates that behave similarly there.",
            "3. Verify that the candidate returns to its pre-action value after deactivation.",
            "Recommended next mission: 2-second baseline, four action repetitions, 1.8-second action windows, 1.5-second capture windows, and 2-second idle recovery between repetitions.",
        ]
    )


class AnalyzeSessionRequest(BaseModel):
    marker_window_ms: int = Field(default=900, ge=100, le=10_000)
    max_frames: int = Field(default=MAX_ANALYSIS_FRAMES, ge=100, le=250_000)
    use_llm: bool = True
    use_embeddings: bool = True
    llm_model: str = DEFAULT_LLM_MODEL
    embed_model: str = DEFAULT_EMBED_MODEL
    persist: bool = True


class ByteEvidence(BaseModel):
    byte_index: int
    change_count: int
    unique_values: list[int]
    most_common_values: list[tuple[int, int]]
    pre_marker_mode: Optional[int]
    action_window_mode: Optional[int]
    post_marker_mode: Optional[int]
    bit_flip_counts: dict[str, int]
    median_marker_latency_ms: Optional[float]
    in_window_changes: int
    out_of_window_changes: int


class Candidate(BaseModel):
    can_id: int
    can_id_hex: str
    frame_count: int
    frequency_hz: Optional[float]
    change_count: int
    change_ratio: float
    changed_frame_count: int
    changed_frame_ratio: float
    byte_change_counts: dict[str, int]
    byte_entropy: dict[str, float]
    byte_evidence: list[ByteEvidence]
    entropy: float
    correlation_score: float
    confidence: float
    likely_marker_types: list[str]
    notes: str
    analysis_mode: str = ANALYSIS_MODE_TARGET
    candidate_role: str = "target_candidate"
    baseline_score: float = 0.0


@dataclass
class FrameRow:
    id: int
    timestamp_ms: int
    can_id: int
    dlc: int
    data: list[int]


def mode_value(values: list[int]) -> Optional[int]:
    if not values:
        return None
    return int(Counter(values).most_common(1)[0][0])


def merge_intervals(
    intervals: list[tuple[int, int]],
) -> list[tuple[int, int]]:
    """Merge overlapping inclusive timestamp intervals."""
    if not intervals:
        return []

    ordered = sorted(
        (min(start, end), max(start, end))
        for start, end in intervals
    )
    merged: list[tuple[int, int]] = [ordered[0]]

    for start, end in ordered[1:]:
        previous_start, previous_end = merged[-1]
        if start <= previous_end + 1:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))

    return merged


def build_interval_index(
    intervals: list[tuple[int, int]],
) -> tuple[list[tuple[int, int]], list[int]]:
    merged = merge_intervals(intervals)
    return merged, [start for start, _ in merged]


def timestamp_in_intervals(
    timestamp_ms: int,
    intervals: list[tuple[int, int]],
    starts: list[int],
) -> bool:
    if not intervals:
        return False

    index = bisect_right(starts, timestamp_ms) - 1
    if index < 0:
        return False

    start, end = intervals[index]
    return start <= timestamp_ms <= end


def timestamp_in_any_window(
    timestamp_ms: int,
    windows: list[tuple[int, int, dict[str, Any]]],
) -> bool:
    # Compatibility helper for callers that do not already have an interval index.
    intervals, starts = build_interval_index(
        [(start, end) for start, end, _ in windows]
    )
    return timestamp_in_intervals(timestamp_ms, intervals, starts)


def build_byte_evidence(
    rows: list[FrameRow],
    marker_windows: list[tuple[int, int, dict[str, Any]]],
    marker_window_ms: int,
) -> tuple[list[ByteEvidence], dict[str, float]]:
    """Build byte evidence without repeatedly rescanning frames for every marker.

    The previous implementation performed three full row scans for every marker
    and every byte. On a 75,000-frame Pi session that can create tens of millions
    of Python-level comparisons. This version builds merged phase intervals once,
    scans each byte's rows once, and uses binary search for marker latency.
    """
    marker_times = sorted(
        int(marker.get("timestamp_ms") or 0)
        for _, _, marker in marker_windows
    )

    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )
    pre_intervals, pre_starts = build_interval_index(
        [
            (marker_time - marker_window_ms, marker_time - 1)
            for marker_time in marker_times
        ]
    )
    action_intervals, action_starts = build_interval_index(
        [
            (marker_time, marker_time + marker_window_ms)
            for marker_time in marker_times
        ]
    )
    post_intervals, post_starts = build_interval_index(
        [
            (
                marker_time + marker_window_ms + 1,
                marker_time + (2 * marker_window_ms),
            )
            for marker_time in marker_times
        ]
    )

    evidence_rows: list[ByteEvidence] = []
    byte_entropy: dict[str, float] = {}

    for byte_index in range(8):
        values = [frame_byte(row, byte_index) for row in rows]
        byte_entropy[str(byte_index)] = round(
            max(0.0, entropy(values)),
            4,
        )

        change_timestamps: list[int] = []
        bit_flip_counts = [0] * 8

        for previous, current in zip(rows, rows[1:]):
            previous_value = frame_byte(previous, byte_index)
            current_value = frame_byte(current, byte_index)
            if previous_value == current_value:
                continue

            change_timestamps.append(current.timestamp_ms)
            changed_bits = previous_value ^ current_value
            for bit_index in range(8):
                if changed_bits & (1 << bit_index):
                    bit_flip_counts[bit_index] += 1

        in_window_changes = sum(
            1
            for timestamp_ms in change_timestamps
            if timestamp_in_intervals(
                timestamp_ms,
                correlation_intervals,
                correlation_starts,
            )
        )
        out_of_window_changes = len(change_timestamps) - in_window_changes

        pre_marker_values: list[int] = []
        action_window_values: list[int] = []
        post_marker_values: list[int] = []

        for row, value in zip(rows, values):
            timestamp_ms = row.timestamp_ms

            if timestamp_in_intervals(
                timestamp_ms,
                pre_intervals,
                pre_starts,
            ):
                pre_marker_values.append(value)

            if timestamp_in_intervals(
                timestamp_ms,
                action_intervals,
                action_starts,
            ):
                action_window_values.append(value)

            if timestamp_in_intervals(
                timestamp_ms,
                post_intervals,
                post_starts,
            ):
                post_marker_values.append(value)

        marker_latencies: list[int] = []
        for marker_time in marker_times:
            change_index = bisect_left(change_timestamps, marker_time)
            if change_index >= len(change_timestamps):
                continue

            first_change = change_timestamps[change_index]
            if first_change <= marker_time + marker_window_ms:
                marker_latencies.append(first_change - marker_time)

        median_latency = (
            float(statistics.median(marker_latencies))
            if marker_latencies
            else None
        )

        evidence_rows.append(
            ByteEvidence(
                byte_index=byte_index,
                change_count=len(change_timestamps),
                unique_values=sorted(set(values))[:32],
                most_common_values=[
                    (int(value), int(count))
                    for value, count in Counter(values).most_common(5)
                ],
                pre_marker_mode=mode_value(pre_marker_values),
                action_window_mode=mode_value(action_window_values),
                post_marker_mode=mode_value(post_marker_values),
                bit_flip_counts={
                    str(bit_index): int(count)
                    for bit_index, count in enumerate(bit_flip_counts)
                },
                median_marker_latency_ms=(
                    round(median_latency, 2)
                    if median_latency is not None
                    else None
                ),
                in_window_changes=in_window_changes,
                out_of_window_changes=out_of_window_changes,
            )
        )

    return evidence_rows, byte_entropy


def is_embedding_only_model(model_name: str) -> bool:
    lowered = model_name.lower()
    return any(hint in lowered for hint in EMBED_ONLY_MODEL_HINTS)


async def list_ollama_models() -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{OLLAMA_URL}/api/tags")
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []

    names: list[str] = []
    for model in payload.get("models", []):
        name = model.get("name")
        if isinstance(name, str) and name:
            names.append(name)
    return names


async def resolve_llm_model(requested_model: str) -> tuple[str, list[str]]:
    installed = await list_ollama_models()
    generate_capable = [name for name in installed if not is_embedding_only_model(name)]

    if requested_model in generate_capable:
        return requested_model, installed

    if generate_capable:
        return generate_capable[0], installed

    if installed and requested_model in installed and is_embedding_only_model(requested_model):
        raise RuntimeError(
            f"Ollama model '{requested_model}' is installed, but it appears to be embedding-only. "
            "Pull a generate-capable model, for example: ollama pull qwen2.5:3b"
        )

    raise RuntimeError(
        f"No generate-capable Ollama model is installed. Installed models: {installed or 'none'}. "
        f"Requested model: {requested_model}. Run: ollama pull {requested_model}"
    )


async def call_ollama_generate(model: str, prompt: str) -> dict[str, Any]:
    timeout = httpx.Timeout(
        connect=10.0,
        read=LLM_HTTP_READ_TIMEOUT_SECONDS,
        write=30.0,
        pool=30.0,
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "keep_alive": "30m",
                "options": {
                    "temperature": 0.2,
                    "top_p": 0.9,
                    "num_ctx": LLM_NUM_CTX,
                    "num_predict": LLM_NUM_PREDICT,
                },
            },
        )
        if response.status_code >= 400:
            detail = response.text.strip()
            raise RuntimeError(
                f"Ollama generate failed for model '{model}' "
                f"with HTTP {response.status_code}: {detail}"
            )
        return response.json()


async def call_ollama_embed(model: str, text: str) -> Optional[list[float]]:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/embed",
                json={"model": model, "input": text},
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None

    embeddings = payload.get("embeddings")
    if isinstance(embeddings, list) and embeddings:
        first = embeddings[0]
        if isinstance(first, list):
            return [float(x) for x in first]

    embedding = payload.get("embedding")
    if isinstance(embedding, list):
        return [float(x) for x in embedding]

    return None


def compact_byte_evidence(candidate: Candidate, limit: int = 3) -> str:
    active = [
        item
        for item in candidate.byte_evidence
        if item.change_count > 0
    ]
    active.sort(
        key=lambda item: (
            item.in_window_changes,
            item.change_count,
        ),
        reverse=True,
    )

    if not active:
        return "no changing bytes"

    summaries: list[str] = []
    for item in active[:limit]:
        nonzero_bit_flips = {
            bit: count
            for bit, count in item.bit_flip_counts.items()
            if count > 0
        }
        summaries.append(
            f"B{item.byte_index}: changes={item.change_count}, "
            f"in_window={item.in_window_changes}, "
            f"out_window={item.out_of_window_changes}, "
            f"pre={item.pre_marker_mode}, "
            f"action={item.action_window_mode}, "
            f"post={item.post_marker_mode}, "
            f"latency_ms={item.median_marker_latency_ms}, "
            f"common={item.most_common_values[:4]}, "
            f"bit_flips={nonzero_bit_flips}"
        )

    return "; ".join(summaries)


def compact_candidate_payload(
    candidate: Candidate,
    *,
    include_byte_evidence: bool,
    byte_evidence_limit: int = MAX_RESPONSE_BYTE_EVIDENCE,
) -> dict[str, Any]:
    """Serialize a candidate without returning all eight evidence objects by default."""
    payload = candidate.model_dump(exclude={"byte_evidence"})

    if include_byte_evidence:
        active_evidence = [
            item
            for item in candidate.byte_evidence
            if item.change_count > 0
        ]
        active_evidence.sort(
            key=lambda item: (
                item.in_window_changes,
                item.change_count,
            ),
            reverse=True,
        )
        payload["byte_evidence"] = [
            item.model_dump()
            for item in active_evidence[:byte_evidence_limit]
        ]
    else:
        payload["byte_evidence"] = []

    return payload


def compact_heatmap_payload(
    candidates: list[Candidate],
) -> dict[str, dict[str, Any]]:
    """Return visualization data without duplicating full byte evidence."""
    return {
        candidate.can_id_hex: {
            "can_id": candidate.can_id,
            "analysis_mode": candidate.analysis_mode,
            "candidate_role": candidate.candidate_role,
            "byte_change_counts": candidate.byte_change_counts,
            "byte_entropy": candidate.byte_entropy,
            "change_count": candidate.change_count,
            "change_ratio": candidate.change_ratio,
            "changed_frame_count": candidate.changed_frame_count,
            "changed_frame_ratio": candidate.changed_frame_ratio,
            "frame_count": candidate.frame_count,
            "frequency_hz": candidate.frequency_hz,
            "baseline_score": candidate.baseline_score,
            "correlation_score": candidate.correlation_score,
            "confidence": candidate.confidence,
        }
        for candidate in candidates
    }


def build_llm_prompt(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    candidates: list[Candidate],
    analysis_mode: str,
    baseline_profile: Optional[dict[str, Any]] = None,
) -> str:
    marker_lines = "\n".join(
        f"- {m.get('timestamp_ms')}ms {m.get('marker_type')} {m.get('step_code') or ''}: {m.get('label') or ''}"
        for m in markers[:40]
    ) or "- no markers"

    if is_baseline_mode(analysis_mode):
        candidate_heading = "Background / noise-profile CAN IDs"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: role={c.candidate_role}, frames={c.frame_count}, "
                f"hz={c.frequency_hz}, changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"baseline_score={c.baseline_score:.3f}, change_ratio={c.change_ratio:.5f}, "
                f"byte_changes={c.byte_change_counts}, byte_entropy={c.byte_entropy}, "
                f"byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no background IDs"

        profile = baseline_profile or {}

        mode_instructions = f"""
        This is a PASSIVE BASELINE / NOISE-SNIFFING mission.
        There is no intended target action and no expected CAN ID to decode.
        Do not say any ID is "the right ID" for a command.
        Do not present confidence as a probability of a target signal.
        Instead, summarize background traffic for this vehicle state:
        - observed_ids: {profile.get('observed_ids')}
        - total_frames: {profile.get('total_frames')}
        - high-rate periodic IDs
        - naturally noisy bytes
        - stable IDs
        - which IDs should be filtered or down-weighted during future action missions.
        """
                    
        response_structure = """
        Return exactly these five numbered sections.

        1. Executive Summary
        - Maximum 100 words.
        - State that this is a baseline/noise profile, not a decoded target.

        2. Baseline Traffic Profile
        - Include no more than five CAN IDs.
        - Use a compact table with:
          CAN ID | background role | frequency | strongest changing bytes | why it matters

        3. Byte-Level Baseline Evidence
        - Discuss only the top three background IDs.
        - Identify stable, periodic, and naturally noisy bytes from the supplied evidence.
        - Do not invent encodings.

        4. Warnings and Uncertainty
        - Maximum five bullets.
        - Explain that baseline activity can cause false positives in later target missions.

        5. Recommendations and Next Mission
        - This section is mandatory.
        - Include exactly three practical recommendations.
        - End with one target-action mission that should be recorded next.
        - If the output budget is low, shorten sections 2 and 3, but always produce section 5.
        """
    else:
        candidate_heading = "Ranked statistical CAN-ID candidates"
        candidate_lines = "\n".join(
            (
                f"- {c.can_id_hex}: frames={c.frame_count}, hz={c.frequency_hz}, "
                f"changes={c.change_count}, entropy={c.entropy:.3f}, "
                f"score={c.correlation_score:.3f}, confidence={c.confidence:.3f}, "
                f"change_ratio={c.change_ratio:.5f}, changed_frames={c.changed_frame_count}, "
                f"byte_changes={c.byte_change_counts}, byte_entropy={c.byte_entropy}, "
                f"markers={c.likely_marker_types}, byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no candidates"

        mode_instructions = """
        This is a TARGET CORRELATION mission.
        Rank candidate CAN IDs by evidence near action/capture markers.
        Confidence is a research score, not proof.
        Prefer IDs that changed near the intended action and are not merely noisy baseline traffic.
        """

        response_structure = """
        Return exactly these five numbered sections.

        1. Executive Summary
        - Maximum 120 words.
        - State whether evidence is strong, moderate, weak, or insufficient.
        - Name no more than three leading CAN IDs.

        2. Top CAN ID Hypotheses
        - Include no more than five candidates.
        - Use a compact table with:
          CAN ID | suspected role | strongest byte | observed evidence | confidence | false-positive risk

        3. Byte-Level Evidence
        - Discuss only the top three candidates.
        - Distinguish observed values and transitions from interpretation.
        - Do not invent byte values, bit positions, scale, offset, or endianness.

        4. Warnings and Uncertainty
        - Maximum five bullets.
        - Mention missing controls, baseline noise, marker ambiguity, and insufficient repetition when applicable.

        5. Recommendations and Next Mission
        - This section is mandatory.
        - Include exactly three validation experiments.
        - End with one recommended mission containing:
          action, repetitions, baseline duration, action duration, capture duration, and expected evidence.
        - If the output budget is low, shorten sections 2 and 3, but always produce section 5.
        """

    return f"""
    You are a CAN bus reverse-engineering assistant for AvenLab.

    You must be conservative. Do not claim a signal is decoded unless the evidence supports it.
    Treat the output as a research hypothesis for the selected vehicle dataset only.
    Do not assume every session belongs to a 2015 Scion FR-S. Practice vehicles such as AE86, vcan interface, and simulation mode must keep as separate hypotheses from live captures.

    The intended target describes the human action being tested. It does not prove
    that any candidate carries that signal. Use it only to evaluate temporal and
    behavioral consistency.

    You are given raw observed byte values, transition counts, bit-flip counts,
    and pre/action/post marker-window summaries. These observations do not have
    confirmed semantic meaning. Do not claim a decoded signal, scale, offset,
    signedness, endianness, or bit assignment unless repeated evidence supports it.

    Analysis mode:
    - analysis_mode: {analysis_mode}
    {mode_instructions}

    Session:
    - session_id: {session.get('id')}
    - vehicle_slug: {session.get('vehicle_slug')}
    - vehicle: {session.get('year')} {session.get('make')} {session.get('model')}
    - mission_code: {session.get('mission_code')}
    - mission_title: {session.get('mission_title')}
    - intended_target: {session.get('mission_target')}
    - bus_interface: {session.get('bus_interface')}
    - bus_mode: {session.get('bus_mode')}

    Human event markers:
    {marker_lines}

    {candidate_heading}:
    {candidate_lines}

    Detailed reporting requirements:
    - Write a full technical report, not a short list.
    - For each top CAN ID, explain why it ranked high and why it might be a false positive.
    - Discuss byte-level behavior for bytes 0 through 7 when available.
    - Compare marker timing against byte changes.
    - Separate evidence, hypothesis, and next validation steps.
    - Follow the exact recommendation count required by section 5.
    - Do not stop after listing IDs.
    {response_structure}
    """.strip()


def analyze_frames(
    frames: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str = ANALYSIS_MODE_TARGET,
) -> tuple[list[Candidate], list[dict[str, Any]], dict[str, Any]]:
    baseline_mode = is_baseline_mode(analysis_mode)

    by_id: dict[int, list[FrameRow]] = defaultdict(list)
    for frame in frames:
        by_id[frame.can_id].append(frame)

    all_deltas: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    heatmap: dict[str, Any] = {}

    marker_windows: list[tuple[int, int, dict[str, Any]]] = []
    for marker in markers:
        timestamp_ms = int(marker.get("timestamp_ms") or 0)
        marker_windows.append(
            (
                timestamp_ms - marker_window_ms,
                timestamp_ms + marker_window_ms,
                marker,
            )
        )

    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )

    for can_id, rows in sorted(by_id.items()):
        rows.sort(key=lambda row: (row.timestamp_ms, row.id))

        byte_change_counts = [0] * 8
        changed_frame_timestamps: set[int] = set()
        byte_change_events: list[tuple[int, int]] = []

        previous: Optional[FrameRow] = None
        for row in rows:
            if previous is not None:
                frame_changed = False
                for byte_index in range(8):
                    previous_byte = frame_byte(previous, byte_index)
                    current_byte = frame_byte(row, byte_index)

                    if previous_byte == current_byte:
                        continue

                    frame_changed = True
                    byte_change_counts[byte_index] += 1
                    byte_change_events.append((row.timestamp_ms, byte_index))

                    if len(all_deltas) < MAX_DELTAS_TO_STORE:
                        all_deltas.append(
                            {
                                "session_id": None,
                                "can_id": can_id,
                                "timestamp_ms": row.timestamp_ms,
                                "byte_index": byte_index,
                                "previous_value": previous_byte,
                                "current_value": current_byte,
                                "delta": int(current_byte) - int(previous_byte),
                                "metadata": {
                                    "can_id_hex": can_hex(can_id),
                                    "raw_frame_id": row.id,
                                    "analysis_mode": analysis_mode,
                                },
                            }
                        )

                if frame_changed:
                    changed_frame_timestamps.add(row.timestamp_ms)

            previous = row

        byte_evidence, byte_entropy = build_byte_evidence(
            rows,
            marker_windows,
            marker_window_ms,
        )

        active_entropy_values = [
            byte_entropy[str(byte_index)]
            for byte_index, count in enumerate(byte_change_counts)
            if count > 0
        ]
        entropy_score = (
            float(statistics.mean(active_entropy_values))
            if active_entropy_values
            else 0.0
        )

        first_timestamp = rows[0].timestamp_ms if rows else 0
        last_timestamp = rows[-1].timestamp_ms if rows else first_timestamp
        duration_seconds = max(
            (last_timestamp - first_timestamp) / 1000.0,
            0.001,
        )
        frequency_hz = len(rows) / duration_seconds if len(rows) > 1 else None

        change_count = sum(byte_change_counts)

        # Byte changes are measured against all possible byte transitions, not
        # against the number of frames. This prevents multi-byte frames from
        # immediately saturating the activity score.
        possible_byte_transitions = max((len(rows) - 1) * 8, 1)
        change_ratio = change_count / possible_byte_transitions

        changed_frame_count = len(changed_frame_timestamps)
        changed_frame_ratio = changed_frame_count / max(len(rows) - 1, 1)

        frame_volume_score = min(len(rows) / 200.0, 1.0)
        entropy_norm = min(entropy_score / 8.0, 1.0)
        baseline_score = min(
            1.0,
            (frame_volume_score * 0.35)
            + (change_ratio * 0.35)
            + (entropy_norm * 0.30),
        )

        marker_hits: Counter[str] = Counter()
        in_window_events = [
            event
            for event in byte_change_events
            if timestamp_in_intervals(
                event[0],
                correlation_intervals,
                correlation_starts,
            )
        ]
        window_delta_count = len(in_window_events)

        # Count each byte-change event once overall, while still recording which
        # marker labels had activity for analyst context.
        event_timestamps = [
            timestamp_ms
            for timestamp_ms, _ in byte_change_events
        ]

        for start, end, marker in marker_windows:
            left_index = bisect_left(event_timestamps, start)
            right_index = bisect_right(event_timestamps, end)
            hits = right_index - left_index
            if hits:
                marker_type = marker.get("marker_type") or "unknown_marker"
                step_code = (
                    marker.get("step_code")
                    or marker.get("label")
                    or marker_type
                )
                marker_hits[str(step_code)] += hits

        if baseline_mode:
            correlation_score = 0.0
            confidence = 0.0

            if change_count == 0 and frequency_hz is not None and frequency_hz >= 5:
                candidate_role = "periodic_stable_background"
                notes = (
                    "baseline periodic traffic; useful for down-weighting "
                    "future false positives"
                )
            elif change_count > 0:
                candidate_role = "baseline_noisy_background"
                notes = (
                    "naturally changing baseline traffic; filter before "
                    "target correlation"
                )
            else:
                candidate_role = "stable_background"
                notes = "stable/background traffic observed during passive profile"
        else:
            correlation_score = (
                min(1.0, window_delta_count / max(change_count, 1))
                if change_count > 0
                else 0.0
            )

            confidence = min(
                1.0,
                (correlation_score * 0.72)
                + (change_ratio * 0.18)
                + (frame_volume_score * 0.10),
            )

            candidate_role = (
                "target_candidate"
                if correlation_score >= 0.05
                else "weak_or_background_candidate"
            )
            if correlation_score >= 0.05:
                notes = "correlated changes near markers"
            elif change_count > 0:
                notes = "changed during session but weak marker correlation"
            else:
                notes = "stable/background traffic"

        byte_change_map = {
            str(byte_index): int(count)
            for byte_index, count in enumerate(byte_change_counts)
        }
        top_markers = (
            []
            if baseline_mode
            else [name for name, _ in marker_hits.most_common(5)]
        )

        candidate = Candidate(
            can_id=can_id,
            can_id_hex=can_hex(can_id),
            frame_count=len(rows),
            frequency_hz=(
                round(frequency_hz, 3)
                if frequency_hz is not None
                else None
            ),
            change_count=change_count,
            change_ratio=round(change_ratio, 6),
            changed_frame_count=changed_frame_count,
            changed_frame_ratio=round(changed_frame_ratio, 6),
            byte_change_counts=byte_change_map,
            byte_entropy=byte_entropy,
            byte_evidence=byte_evidence,
            entropy=round(entropy_score, 4),
            correlation_score=round(correlation_score, 5),
            confidence=round(confidence, 5),
            likely_marker_types=top_markers,
            notes=notes,
            analysis_mode=analysis_mode,
            candidate_role=candidate_role,
            baseline_score=round(baseline_score, 5),
        )
        candidates.append(candidate)

        heatmap[can_hex(can_id)] = {
            "can_id": can_id,
            "analysis_mode": analysis_mode,
            "candidate_role": candidate_role,
            "byte_change_counts": byte_change_map,
            "byte_entropy": byte_entropy,
            "byte_evidence": [
                item.model_dump()
                for item in byte_evidence
            ],
            "change_count": change_count,
            "change_ratio": round(change_ratio, 6),
            "changed_frame_count": changed_frame_count,
            "changed_frame_ratio": round(changed_frame_ratio, 6),
            "frame_count": len(rows),
            "frequency_hz": (
                round(frequency_hz, 3)
                if frequency_hz is not None
                else None
            ),
            "baseline_score": round(baseline_score, 5),
        }

    if baseline_mode:
        candidates.sort(
            key=lambda candidate: (
                candidate.baseline_score,
                candidate.change_count,
                candidate.frame_count,
            ),
            reverse=True,
        )
    else:
        candidates.sort(
            key=lambda candidate: (
                candidate.confidence,
                candidate.correlation_score,
                candidate.change_count,
                candidate.frame_count,
            ),
            reverse=True,
        )

    return candidates, all_deltas, heatmap


@router.get("/ai/status")
async def get_ai_status() -> dict[str, Any]:
    models = await list_ollama_models()
    generate_models = [name for name in models if not is_embedding_only_model(name)]
    embedding_models = [name for name in models if is_embedding_only_model(name)]
    return {
        "ok": True,
        "ollama_url": OLLAMA_URL,
        "models": models,
        "generate_models": generate_models,
        "embedding_models": embedding_models,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "default_embed_model": DEFAULT_EMBED_MODEL,
        "llm_ready": len(generate_models) > 0,
    }


@router.post("/session/{session_id}/analyze")
async def analyze_session(session_id: UUID, payload: AnalyzeSessionRequest) -> dict[str, Any]:
    analysis_started = time.perf_counter()
    phase_started = analysis_started

    can_ai_log(
        "analysis_started",
        session=session_id,
        marker_window_ms=payload.marker_window_ms,
        max_frames=payload.max_frames,
        use_llm=payload.use_llm,
        use_embeddings=payload.use_embeddings,
        persist=payload.persist,
    )

    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.vehicle_id, cs.mission_id, cs.label, cs.bus_interface, cs.bus_mode,
                cs.metadata AS session_metadata,
                rm.mission_code,
                rm.title AS mission_title,
                rm.target AS mission_target,
                rm.metadata AS mission_metadata,
                v.slug AS vehicle_slug, v.year, v.make, v.model
            FROM can_sessions cs
            JOIN vehicles v ON v.id = cs.vehicle_id
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if not session:
            raise HTTPException(status_code=404, detail="CAN session not found")

        markers = await conn.fetch(
            """
            SELECT csm.id, csm.marker_type, csm.label, csm.timestamp_ms, csm.metadata,
                   rs.step_code
            FROM can_session_markers csm
            LEFT JOIN recon_steps rs ON rs.id = csm.step_id
            WHERE csm.session_id = $1
            ORDER BY csm.timestamp_ms ASC, csm.created_at ASC
            """,
            session_id,
        )

        raw_rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, id ASC
            LIMIT $2
            """,
            session_id,
            payload.max_frames,
        )

    can_ai_log(
        "database_input_loaded",
        session=session_id,
        raw_frames=len(raw_rows),
        markers=len(markers),
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    frames = [
        FrameRow(
            id=int(row["id"]),
            timestamp_ms=int(row["timestamp_ms"]),
            can_id=int(row["can_id"]),
            dlc=int(row["dlc"] or 8),
            data=normalize_data(row["data"], int(row["dlc"] or 8)),
        )
        for row in raw_rows
    ]
    short_dlc_frames = sum(1 for row in raw_rows if int(row["dlc"] or 0) < 8)
    invalid_width_frames = sum(1 for frame in frames if len(frame.data) != 8)

    can_ai_log(
        "frames_normalized",
        session=session_id,
        frames=len(frames),
        short_dlc_frames=short_dlc_frames,
        invalid_width_frames=invalid_width_frames,
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    if not frames:
        can_ai_log("analysis_rejected_no_frames", session=session_id)
        raise HTTPException(
            status_code=400,
            detail="CAN session contains no frames to analyze",
        )

    marker_dicts = [dict(row) for row in markers]
    for marker in marker_dicts:
        marker["metadata"] = metadata_dict(marker.get("metadata"))

    session_dict = dict(session)
    session_dict["session_metadata"] = metadata_dict(session_dict.get("session_metadata"))
    session_dict["mission_metadata"] = metadata_dict(session_dict.get("mission_metadata"))

    analysis_mode = infer_analysis_mode(session_dict, marker_dicts)
    baseline_mode = is_baseline_mode(analysis_mode)

    can_ai_log(
        "statistics_started",
        session=session_id,
        analysis_mode=analysis_mode,
        frames=len(frames),
        markers=len(marker_dicts),
    )

    try:
        candidates, deltas, heatmap = analyze_frames(
            frames,
            marker_dicts,
            payload.marker_window_ms,
            analysis_mode,
        )
    except Exception as exc:
        can_ai_log(
            "statistics_failed",
            session=session_id,
            error_type=type(exc).__name__,
            error=repr(exc),
            elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
        )
        raise

    baseline_profile = build_baseline_profile(frames, candidates) if baseline_mode else None

    can_ai_log(
        "statistics_completed",
        session=session_id,
        candidates=len(candidates),
        deltas=len(deltas),
        heatmap_ids=len(heatmap),
        elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
    )
    phase_started = time.perf_counter()

    llm_response: Optional[str] = None
    llm_error: Optional[str] = None
    llm_timed_out = False
    resolved_llm_model: Optional[str] = payload.llm_model if payload.use_llm else None
    installed_ollama_models: list[str] = []
    generation_metadata: dict[str, Any] = {}
    if payload.use_llm:
        try:
            can_ai_log(
                "llm_resolution_started",
                session=session_id,
                requested_model=payload.llm_model,
            )
            resolved_llm_model, installed_ollama_models = await resolve_llm_model(payload.llm_model)
            prompt = build_llm_prompt(
                session_dict,
                marker_dicts,
                candidates,
                analysis_mode,
                baseline_profile,
            )
            can_ai_log(
                "llm_generation_started",
                session=session_id,
                resolved_model=resolved_llm_model,
                installed_models=len(installed_ollama_models),
                prompt_chars=len(prompt),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            phase_started = time.perf_counter()
            try:
                async with asyncio.timeout(LLM_DEADLINE_SECONDS):
                    result = await call_ollama_generate(
                        resolved_llm_model,
                        prompt,
                    )
            except TimeoutError as exc:
                llm_timed_out = True
                raise RuntimeError(
                    f"Ollama exceeded the {LLM_DEADLINE_SECONDS:.0f}s "
                    "production response budget"
                ) from exc
            if result.get("done_reason") != "stop":
                print(
                    "[can-ai] LLM generation ended unexpectedly "
                    f"session={session_id} "
                    f"reason={result.get('done_reason')} "
                    f"output_tokens={result.get('eval_count')}",
                    flush=True,
                )
            generation_metadata = {
                "done": result.get("done"),
                "done_reason": result.get("done_reason"),
                "total_duration": result.get("total_duration"),
                "load_duration": result.get("load_duration"),
                "prompt_eval_count": result.get("prompt_eval_count"),
                "prompt_eval_duration": result.get("prompt_eval_duration"),
                "eval_count": result.get("eval_count"),
                "eval_duration": result.get("eval_duration"),
            }

            can_ai_log(
                "llm_generation_completed",
                session=session_id,
                resolved_model=resolved_llm_model,
                done=result.get("done"),
                done_reason=result.get("done_reason"),
                prompt_tokens=result.get("prompt_eval_count"),
                output_tokens=result.get("eval_count"),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            phase_started = time.perf_counter()

            llm_response = result.get("response", "")

            text = result.get("response")
            if isinstance(text, str) and text.strip():
                llm_response = text.strip()
            else:
                raise RuntimeError(f"Ollama returned no usable response: {result}")
            
        except Exception as exc:
            llm_error = f"{type(exc).__name__}: {exc}"
            can_ai_log(
                "llm_generation_failed",
                session=session_id,
                requested_model=payload.llm_model,
                resolved_model=resolved_llm_model,
                error_type=type(exc).__name__,
                error=repr(exc),
                elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
            )
            llm_response = None

    report_content = llm_response or build_fallback_report(
        session_id=session_id,
        analysis_mode=analysis_mode,
        frames_count=len(frames),
        markers_count=len(marker_dicts),
        candidates=candidates,
        baseline_profile=baseline_profile,
    )

    can_ai_log(
        "report_selected",
        session=session_id,
        source="llm" if llm_response else "fallback",
        report_chars=len(report_content),
        llm_error=llm_error,
    )

    response_candidates = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=(
                index < MAX_RESPONSE_EVIDENCE_CANDIDATES
            ),
        )
        for index, candidate in enumerate(
            candidates[:MAX_RESPONSE_CANDIDATES]
        )
    ]
    response_heatmap = compact_heatmap_payload(candidates)

    persisted_top_candidates = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=True,
        )
        for candidate in candidates[:MAX_PERSISTED_REPORT_CANDIDATES]
    ]
    persisted_heatmap = response_heatmap

    can_ai_log(
        "response_compacted",
        session=session_id,
        candidates_total=len(candidates),
        candidates_returned=len(response_candidates),
        evidence_candidates=min(
            len(response_candidates),
            MAX_RESPONSE_EVIDENCE_CANDIDATES,
        ),
        heatmap_ids=len(response_heatmap),
    )

    persisted_candidate_ids = {
        candidate.can_id
        for candidate in candidates[:MAX_DELTA_CANDIDATES_TO_PERSIST]
    }
    deltas_to_persist = [
        delta
        for delta in deltas
        if delta["can_id"] in persisted_candidate_ids
    ][:MAX_DELTAS_TO_PERSIST]

    if payload.persist:
        can_ai_log(
            "persistence_started",
            session=session_id,
            candidates=len(candidates),
            deltas_computed=len(deltas),
            deltas_selected=len(deltas_to_persist),
        )
        phase_started = time.perf_counter()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("DELETE FROM can_frame_deltas WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_features WHERE session_id = $1", session_id)
                await conn.execute("DELETE FROM can_id_correlations WHERE session_id = $1", session_id)

                if deltas_to_persist:
                    await conn.executemany(
                        """
                        INSERT INTO can_frame_deltas (
                            session_id, can_id, timestamp_ms, byte_index,
                            previous_value, current_value, delta, metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                        """,
                        [
                            (
                                session_id,
                                d["can_id"],
                                d["timestamp_ms"],
                                d["byte_index"],
                                d["previous_value"],
                                d["current_value"],
                                d["delta"],
                                json_dumps(d["metadata"]),
                            )
                            for d in deltas_to_persist
                        ],
                    )

                await conn.executemany(
                    """
                    INSERT INTO can_id_features (
                        session_id, can_id, frame_count, change_count,
                        byte_change_counts, entropy, frequency_hz, metadata
                    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)
                    ON CONFLICT (session_id, can_id) DO UPDATE SET
                        frame_count = EXCLUDED.frame_count,
                        change_count = EXCLUDED.change_count,
                        byte_change_counts = EXCLUDED.byte_change_counts,
                        entropy = EXCLUDED.entropy,
                        frequency_hz = EXCLUDED.frequency_hz,
                        metadata = EXCLUDED.metadata
                    """,
                    [
                        (
                            session_id,
                            c.can_id,
                            c.frame_count,
                            c.change_count,
                            json_dumps(c.byte_change_counts),
                            c.entropy,
                            c.frequency_hz,
                            json_dumps({
                                "can_id_hex": c.can_id_hex,
                                "notes": c.notes,
                                "analysis_mode": analysis_mode,
                                "candidate_role": c.candidate_role,
                                "baseline_score": c.baseline_score,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                            }),
                        )
                        for c in candidates
                    ],
                )

                await conn.executemany(
                    """
                    INSERT INTO can_id_correlations (
                        session_id, can_id, marker_type, score, confidence, notes, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
                    """,
                    [
                        (
                            session_id,
                            c.can_id,
                            ",".join(c.likely_marker_types) if c.likely_marker_types else analysis_mode,
                            c.correlation_score,
                            c.confidence,
                            c.notes,
                            json_dumps({
                                "can_id_hex": c.can_id_hex,
                                "byte_change_counts": c.byte_change_counts,
                                "entropy": c.entropy,
                                "frequency_hz": c.frequency_hz,
                                "analysis_mode": analysis_mode,
                                "candidate_role": c.candidate_role,
                                "baseline_score": c.baseline_score,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                            }),
                        )
                        for c in candidates
                    ],
                )

                report_row = await conn.fetchrow(
                    """
                    INSERT INTO session_reports (
                        session_id, report_type, title, content, metadata
                    ) VALUES ($1, 'ai_analysis', $2, $3, $4::jsonb)
                    RETURNING id
                    """,
                    session_id,
                    (
                        f"CAN baseline profile for {session_dict.get('vehicle_slug')} session {session_id}"
                        if baseline_mode
                        else f"AI CAN analysis for {session_dict.get('vehicle_slug')} session {session_id}"
                    ),
                    report_content,
                    json_dumps({
                        "vehicle_slug": session_dict.get("vehicle_slug"),
                        "analysis_mode": analysis_mode,
                        "baseline_profile": baseline_profile,
                        "target_expected": not baseline_mode,
                        "frames_analyzed": len(frames),
                        "markers": len(marker_dicts),
                        "model": resolved_llm_model,
                        "llm_requested": payload.use_llm,
                        "llm_succeeded": llm_response is not None,
                        "analysis_source": "llm" if llm_response else "fallback",
                        "llm_error": llm_error,
                        "llm_timed_out": llm_timed_out,
                        "generation": generation_metadata,
                        "deltas_computed": len(deltas),
                        "deltas_persisted": len(deltas_to_persist),
                        "top_candidates": persisted_top_candidates,
                        "heatmap": persisted_heatmap,
                    }),
                )

                if payload.use_llm and llm_response:
                    prompt = build_llm_prompt(session_dict, marker_dicts, candidates, analysis_mode, baseline_profile)
                    await conn.execute(
                        """
                        INSERT INTO ai_insights (session_id, vehicle_id, prompt, response, model, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                        """,
                        session_id,
                        session["vehicle_id"],
                        prompt,
                        llm_response,
                        resolved_llm_model,
                        json_dumps({
                            "report_id": str(report_row["id"]),
                            "vehicle_slug": session_dict.get("vehicle_slug"),
                            "analysis_mode": analysis_mode,
                        }),
                    )

                embedding_inserted = False
                embedding_error = None
                if payload.use_embeddings and candidates:
                    can_ai_log(
                        "embedding_started",
                        session=session_id,
                        model=payload.embed_model,
                    )
                    embedding_phase_started = time.perf_counter()

                    if baseline_mode:
                        text = (
                            f"CAN baseline profile {session_dict.get('vehicle_slug')} session {session_id}. Background IDs: "
                            + "; ".join(
                                f"{c.can_id_hex} role {c.candidate_role} baseline_score {c.baseline_score} changes {c.change_count}"
                                for c in candidates[:10]
                            )
                        )
                    else:
                        text = (
                            f"CAN analysis {session_dict.get('vehicle_slug')} session {session_id}. Top candidates: "
                            + "; ".join(
                                f"{c.can_id_hex} confidence {c.confidence} changes {c.change_count} markers {c.likely_marker_types}"
                                for c in candidates[:10]
                            )
                        )
                    embedding = await call_ollama_embed(payload.embed_model, text)
                    if embedding and len(embedding) == VECTOR_DIMENSION:
                        vector_literal = "[" + ",".join(f"{x:.8f}" for x in embedding) + "]"
                        await conn.execute(
                            """
                            INSERT INTO signal_embeddings (vehicle_id, session_id, text, embedding, metadata)
                            VALUES ($1, $2, $3, $4::vector, $5::jsonb)
                            """,
                            session["vehicle_id"],
                            session_id,
                            text,
                            vector_literal,
                            json_dumps({
                                "model": payload.embed_model,
                                "dimension": len(embedding),
                                "analysis_mode": analysis_mode,
                            }),
                        )
                        embedding_inserted = True
                    elif embedding:
                        embedding_error = f"Embedding dimension {len(embedding)} does not match schema vector({VECTOR_DIMENSION})"
                    else:
                        embedding_error = "Embedding request failed or returned no embedding"

                    can_ai_log(
                        "embedding_completed",
                        session=session_id,
                        model=payload.embed_model,
                        inserted=embedding_inserted,
                        error=embedding_error,
                        elapsed_ms=round(
                            (time.perf_counter() - embedding_phase_started) * 1000,
                            2,
                        ),
                    )

        can_ai_log(
            "persistence_completed",
            session=session_id,
            elapsed_ms=round((time.perf_counter() - phase_started) * 1000, 2),
        )

    can_ai_log(
        "analysis_completed",
        session=session_id,
        source="llm" if llm_response else "fallback",
        candidates=len(candidates),
        persisted=payload.persist,
        total_elapsed_ms=round(
            (time.perf_counter() - analysis_started) * 1000,
            2,
        ),
    )

    return {
        "generation": generation_metadata,
        "ok": True,
        "session_id": str(session_id),
        "analysis_mode": analysis_mode,
        "baseline_profile": baseline_profile,
        "target_expected": not baseline_mode,
        "frames_analyzed": len(frames),
        "short_dlc_frames": short_dlc_frames,
        "invalid_width_frames": invalid_width_frames,
        "markers": len(marker_dicts),
        "candidate_count": len(candidates),
        "candidates": response_candidates,
        "heatmap": response_heatmap,
        "response_detail": {
            "candidate_limit": MAX_RESPONSE_CANDIDATES,
            "evidence_candidate_limit": MAX_RESPONSE_EVIDENCE_CANDIDATES,
            "byte_evidence_per_candidate": MAX_RESPONSE_BYTE_EVIDENCE,
            "heatmap_includes_byte_evidence": False,
        },

        # LLM status
        "llm_requested": payload.use_llm,
        "llm_succeeded": llm_response is not None,
        "llm_available": llm_response is not None,
        "llm_model": resolved_llm_model,
        "llm_error": llm_error,
        "llm_timed_out": llm_timed_out,
        "installed_ollama_models": installed_ollama_models,
        "deltas_computed": len(deltas),
        "deltas_persisted": (
            len(deltas_to_persist)
            if payload.persist
            else 0
        ),

        # Important: always return something the UI can render.
        "analysis": report_content,
        "analysis_source": "llm" if llm_response else "fallback",

        "persisted": payload.persist,
    }


@router.get("/session/{session_id}/analysis")
async def get_session_analysis(session_id: UUID) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        features = await conn.fetch(
            """
            SELECT can_id, frame_count, change_count, byte_change_counts,
                   entropy, frequency_hz, metadata, created_at
            FROM can_id_features
            WHERE session_id = $1
            ORDER BY change_count DESC, frame_count DESC
            """,
            session_id,
        )
        correlations = await conn.fetch(
            """
            SELECT can_id, marker_type, score, confidence, notes, metadata, created_at
            FROM can_id_correlations
            WHERE session_id = $1
            ORDER BY confidence DESC, score DESC
            """,
            session_id,
        )
        report = await conn.fetchrow(
            """
            SELECT id, title, content, metadata, created_at
            FROM session_reports
            WHERE session_id = $1 AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            session_id,
        )

    latest_report = dict(report) if report else None
    latest_report_metadata = metadata_dict(latest_report.get("metadata")) if latest_report else {}
    if latest_report:
        latest_report["metadata"] = latest_report_metadata

    return {
        "ok": True,
        "session_id": str(session_id),
        "analysis_mode": latest_report_metadata.get("analysis_mode"),
        "baseline_profile": latest_report_metadata.get("baseline_profile"),
        "target_expected": latest_report_metadata.get("analysis_mode") != ANALYSIS_MODE_BASELINE if latest_report_metadata else None,
        "features": [dict(row) for row in features],
        "correlations": [dict(row) for row in correlations],
        "latest_report": latest_report,
    }



def capture_kind_for(bus_interface: str | None, bus_mode: str | None) -> str:
    iface = (bus_interface or "").lower()
    mode = (bus_mode or "").lower()
    if mode in {"simulation", "replay", "offline"} or iface == "vcan0":
        return "simulation"
    return "live"


def source_label_for(bus_interface: str | None, bus_mode: str | None) -> str:
    mode = (bus_mode or "").lower()
    if mode == "listen-only":
        return "LIVE / LISTEN-ONLY"
    if mode == "live":
        return "LIVE / ACTIVE"
    if mode == "simulation":
        return "SIMULATION"
    return (bus_mode or "UNKNOWN").upper()


def safe_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return None


@router.get("/mission-progress")
async def get_mission_progress(
    vehicle_slug: Optional[str] = Query(default=None),
    bus_interface: Optional[str] = Query(default=None),
    bus_mode: Optional[str] = Query(default=None),
    capture_kind: Optional[str] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
) -> dict[str, Any]:
    """Return latest recorded/analyzed session status by mission.

    This endpoint is intentionally lightweight for the mobile mission queue:
    - It does not run analysis.
    - It reads saved sessions/reports/correlations from Postgres.
    - `listen-only` and `live` are both treated as live captures; the label still
      preserves whether the capture was listen-only or active/live.
    """

    pool = await connect_db()
    conditions: list[str] = []
    values: list[Any] = []

    if vehicle_slug:
        values.append(vehicle_slug)
        conditions.append(f"v.slug = ${len(values)}")

    if bus_interface:
        values.append(bus_interface)
        conditions.append(f"cs.bus_interface = ${len(values)}")

    if bus_mode:
        values.append(bus_mode)
        conditions.append(f"cs.bus_mode = ${len(values)}")

    if capture_kind == "live":
        conditions.append("cs.bus_mode IN ('listen-only', 'live') AND cs.bus_interface <> 'vcan0'")
    elif capture_kind == "simulation":
        conditions.append("(cs.bus_mode IN ('simulation', 'replay', 'offline') OR cs.bus_interface = 'vcan0')")

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
    values.append(limit)
    limit_arg = len(values)

    query = f"""
        SELECT
            cs.id AS session_id,
            cs.label,
            cs.bus_interface,
            cs.bus_mode,
            cs.started_at,
            cs.ended_at,
            cs.metadata AS session_metadata,
            v.slug AS vehicle_slug,
            v.year,
            v.make,
            v.model,
            rm.mission_code,
            rm.title AS mission_title,
            rm.target AS mission_target,
            rm.metadata AS mission_metadata,
            COALESCE(fr.frame_count, 0) AS frame_count,
            COALESCE(mk.marker_count, 0) AS marker_count,
            sr.id AS report_id,
            sr.created_at AS report_created_at,
            sr.metadata AS report_metadata,
            cc.can_id AS top_can_id,
            cc.confidence AS top_confidence,
            cc.score AS top_score,
            cc.notes AS top_notes,
            cc.metadata AS correlation_metadata
        FROM can_sessions cs
        JOIN vehicles v ON v.id = cs.vehicle_id
        LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS frame_count
            FROM can_frames_raw cfr
            WHERE cfr.session_id = cs.id
        ) fr ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS marker_count
            FROM can_session_markers csm
            WHERE csm.session_id = cs.id
        ) mk ON true
        LEFT JOIN LATERAL (
            SELECT id, metadata, created_at
            FROM session_reports
            WHERE session_id = cs.id AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
        ) sr ON true
        LEFT JOIN LATERAL (
            SELECT can_id, confidence, score, notes, metadata
            FROM can_id_correlations
            WHERE session_id = cs.id
            ORDER BY confidence DESC, score DESC, created_at DESC
            LIMIT 1
        ) cc ON true
        {where_clause}
        ORDER BY cs.started_at DESC
        LIMIT ${limit_arg}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *values)

    sessions: list[dict[str, Any]] = []
    missions: dict[str, dict[str, Any]] = {}

    for raw_row in rows:
        row = dict(raw_row)
        session_metadata = metadata_dict(row.get("session_metadata"))
        mission_metadata = metadata_dict(row.get("mission_metadata"))
        report_metadata = metadata_dict(row.get("report_metadata"))
        correlation_metadata = metadata_dict(row.get("correlation_metadata"))
        mission_code = row.get("mission_code") or session_metadata.get("mission_code") or "UNKNOWN"

        top_candidates = report_metadata.get("top_candidates")
        top_candidate = top_candidates[0] if isinstance(top_candidates, list) and top_candidates else {}
        if not isinstance(top_candidate, dict):
            top_candidate = {}

        top_can_id = row.get("top_can_id") or top_candidate.get("can_id")
        top_can_id_hex = None
        if isinstance(top_can_id, int):
            top_can_id_hex = can_hex(top_can_id)
        elif isinstance(top_candidate.get("can_id_hex"), str):
            top_can_id_hex = top_candidate["can_id_hex"]
        elif isinstance(correlation_metadata.get("can_id_hex"), str):
            top_can_id_hex = correlation_metadata["can_id_hex"]

        confidence = safe_float(row.get("top_confidence"))
        if confidence is None:
            confidence = safe_float(top_candidate.get("confidence"))

        analysis_mode = (
            report_metadata.get("analysis_mode")
            or session_metadata.get("analysis_mode")
            or mission_metadata.get("analysis_mode")
        )
        if not isinstance(analysis_mode, str):
            analysis_mode = infer_analysis_mode(
                {
                    "mission_code": mission_code,
                    "session_metadata": session_metadata,
                    "mission_metadata": mission_metadata,
                },
                [],
            )

        frame_count = int(row.get("frame_count") or 0)     
        
        # changed_frame_count = len(set(changed_frame_timestamps))

        # changed_frame_ratio = (
        #     changed_frame_count / max(len(rows) - 1, 1)
        # )
        # changed_frame_timestamps: set[int] = set()
        # byte_change_events: list[tuple[int, int]] = []
        # if prev_byte != cur_byte:
        #     changed_frame_timestamps.add(row.timestamp_ms)
        #     byte_change_events.append((row.timestamp_ms, idx))

        marker_count = int(row.get("marker_count") or 0)
        analyzed = bool(row.get("report_id")) or confidence is not None
        completed = row.get("ended_at") is not None or frame_count > 0 or marker_count > 0
        status = "open"
        if completed and analyzed:
            status = "analyzed"
        elif completed:
            status = "recorded"
        if frame_count == 0 and marker_count > 0:
            status = "markers_only"

        item = {
            "mission_code": mission_code,
            "mission_title": row.get("mission_title") or row.get("label"),
            "mission_target": row.get("mission_target"),
            "session_id": str(row["session_id"]),
            "vehicle_slug": row.get("vehicle_slug"),
            "vehicle": {
                "year": row.get("year"),
                "make": row.get("make"),
                "model": row.get("model"),
            },
            "bus_interface": row.get("bus_interface"),
            "bus_mode": row.get("bus_mode"),
            "capture_kind": capture_kind_for(row.get("bus_interface"), row.get("bus_mode")),
            "source_label": source_label_for(row.get("bus_interface"), row.get("bus_mode")),
            "completed": completed,
            "analyzed": analyzed,
            "status": status,
            "analysis_mode": analysis_mode,
            "confidence": confidence,
            "top_can_id": top_can_id,
            "top_can_id_hex": top_can_id_hex,
            "top_score": safe_float(row.get("top_score")) or safe_float(top_candidate.get("correlation_score")),
            "frame_count": frame_count,
            "marker_count": marker_count,
            "started_at": row.get("started_at"),
            "ended_at": row.get("ended_at"),
            "report_id": str(row["report_id"]) if row.get("report_id") else None,
            "report_created_at": row.get("report_created_at"),
        }
        sessions.append(item)

        # Rows are newest first, so first one per mission is the current queue status.
        if mission_code not in missions:
            missions[mission_code] = item

    return {
        "ok": True,
        "filters": {
            "vehicle_slug": vehicle_slug,
            "bus_interface": bus_interface,
            "bus_mode": bus_mode,
            "capture_kind": capture_kind,
        },
        "missions": missions,
        "sessions": sessions,
    }


@router.get("/session/latest")
async def get_latest_session_for_mission(
    vehicle_slug: Optional[str] = Query(default=None),
    mission_code: Optional[str] = Query(default=None),
    bus_interface: Optional[str] = Query(default=None),
    bus_mode: Optional[str] = Query(default=None),
    capture_kind: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    """Return the newest session for a vehicle/mission/filter without creating a new run."""
    pool = await connect_db()
    conditions: list[str] = []
    values: list[Any] = []

    if vehicle_slug:
        values.append(vehicle_slug)
        conditions.append(f"v.slug = ${len(values)}")
    if mission_code:
        values.append(mission_code)
        conditions.append(f"rm.mission_code = ${len(values)}")
    if bus_interface:
        values.append(bus_interface)
        conditions.append(f"cs.bus_interface = ${len(values)}")
    if bus_mode:
        values.append(bus_mode)
        conditions.append(f"cs.bus_mode = ${len(values)}")

    if capture_kind == "live":
        conditions.append("cs.bus_mode IN ('listen-only', 'live') AND cs.bus_interface <> 'vcan0'")
    elif capture_kind == "simulation":
        conditions.append("(cs.bus_mode IN ('simulation', 'replay', 'offline') OR cs.bus_interface = 'vcan0')")

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    query = f"""
        SELECT
            cs.id AS session_id,
            cs.label,
            cs.bus_interface,
            cs.bus_mode,
            cs.started_at,
            cs.ended_at,
            cs.metadata AS session_metadata,
            v.slug AS vehicle_slug,
            v.year,
            v.make,
            v.model,
            rm.mission_code,
            rm.title AS mission_title,
            rm.target AS mission_target,
            COALESCE(fr.frame_count, 0) AS frame_count,
            COALESCE(mk.marker_count, 0) AS marker_count,
            sr.id AS report_id,
            sr.created_at AS report_created_at,
            sr.metadata AS report_metadata,
            cc.can_id AS top_can_id,
            cc.confidence AS top_confidence,
            cc.score AS top_score,
            cc.notes AS top_notes,
            cc.metadata AS correlation_metadata
        FROM can_sessions cs
        JOIN vehicles v ON v.id = cs.vehicle_id
        LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS frame_count
            FROM can_frames_raw cfr
            WHERE cfr.session_id = cs.id
        ) fr ON true
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS marker_count
            FROM can_session_markers csm
            WHERE csm.session_id = cs.id
        ) mk ON true
        LEFT JOIN LATERAL (
            SELECT id, metadata, created_at
            FROM session_reports
            WHERE session_id = cs.id AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
        ) sr ON true
        LEFT JOIN LATERAL (
            SELECT can_id, confidence, score, notes, metadata
            FROM can_id_correlations
            WHERE session_id = cs.id
            ORDER BY confidence DESC, score DESC, created_at DESC
            LIMIT 1
        ) cc ON true
        {where_clause}
        ORDER BY cs.started_at DESC
        LIMIT 1
    """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *values)

    if not row:
        return {
            "ok": True,
            "found": False,
            "filters": {
                "vehicle_slug": vehicle_slug,
                "mission_code": mission_code,
                "bus_interface": bus_interface,
                "bus_mode": bus_mode,
                "capture_kind": capture_kind,
            },
            "session": None,
        }

    item = dict(row)
    session_metadata = metadata_dict(item.get("session_metadata"))
    report_metadata = metadata_dict(item.get("report_metadata"))
    correlation_metadata = metadata_dict(item.get("correlation_metadata"))
    top_candidates = report_metadata.get("top_candidates")
    top_candidate = top_candidates[0] if isinstance(top_candidates, list) and top_candidates else {}
    if not isinstance(top_candidate, dict):
        top_candidate = {}

    top_can_id = item.get("top_can_id") or top_candidate.get("can_id")
    top_can_id_hex = None
    if isinstance(top_can_id, int):
        top_can_id_hex = can_hex(top_can_id)
    elif isinstance(top_candidate.get("can_id_hex"), str):
        top_can_id_hex = top_candidate["can_id_hex"]
    elif isinstance(correlation_metadata.get("can_id_hex"), str):
        top_can_id_hex = correlation_metadata["can_id_hex"]

    confidence = safe_float(item.get("top_confidence"))
    if confidence is None:
        confidence = safe_float(top_candidate.get("confidence"))

    analysis_mode = report_metadata.get("analysis_mode") or session_metadata.get("analysis_mode")
    if not isinstance(analysis_mode, str):
        analysis_mode = infer_analysis_mode(
            {
                "mission_code": item.get("mission_code"),
                "label": item.get("label"),
                "session_metadata": session_metadata,
                "mission_metadata": {},
            },
            [],
        )

    session_item = {
        "session_id": str(item["session_id"]),
        "label": item.get("label"),
        "vehicle_slug": item.get("vehicle_slug"),
        "vehicle": {
            "year": item.get("year"),
            "make": item.get("make"),
            "model": item.get("model"),
        },
        "mission_code": item.get("mission_code"),
        "mission_title": item.get("mission_title"),
        "mission_target": item.get("mission_target"),
        "bus_interface": item.get("bus_interface"),
        "bus_mode": item.get("bus_mode"),
        "capture_kind": capture_kind_for(item.get("bus_interface"), item.get("bus_mode")),
        "source_label": source_label_for(item.get("bus_interface"), item.get("bus_mode")),
        "analysis_mode": analysis_mode,
        "confidence": confidence,
        "top_can_id": top_can_id,
        "top_can_id_hex": top_can_id_hex,
        "top_score": safe_float(item.get("top_score")) or safe_float(top_candidate.get("correlation_score")),
        "frame_count": int(item.get("frame_count") or 0),
        "marker_count": int(item.get("marker_count") or 0),
        "started_at": item.get("started_at"),
        "ended_at": item.get("ended_at"),
        "report_id": str(item["report_id"]) if item.get("report_id") else None,
        "report_created_at": item.get("report_created_at"),
    }

    return {"ok": True, "found": True, "session": session_item}


@router.delete("/session/{session_id}")
async def delete_can_session(session_id: UUID) -> dict[str, Any]:
    """Delete a bad/dead recording and all derived analysis rows for that session."""
    pool = await connect_db()
    deleted: dict[str, int] = {}

    async with pool.acquire() as conn:
        exists = await conn.fetchval("SELECT EXISTS (SELECT 1 FROM can_sessions WHERE id = $1)", session_id)
        if not exists:
            raise HTTPException(status_code=404, detail="CAN session not found")

        async with conn.transaction():
            table_order = [
                ("signal_embeddings", "session_id"),
                ("ai_insights", "session_id"),
                ("session_reports", "session_id"),
                ("can_id_correlations", "session_id"),
                ("can_id_features", "session_id"),
                ("can_frame_deltas", "session_id"),
                ("can_frames_decoded", "session_id"),
                ("can_frames_raw", "session_id"),
                ("can_session_markers", "session_id"),
                ("can_sessions", "id"),
            ]

            for table, column in table_order:
                table_exists = await conn.fetchval("SELECT to_regclass($1)", f"public.{table}")
                if not table_exists:
                    deleted[table] = 0
                    continue

                status = await conn.execute(f"DELETE FROM {table} WHERE {column} = $1", session_id)
                try:
                    deleted[table] = int(status.split()[-1])
                except (ValueError, IndexError):
                    deleted[table] = 0

    return {
        "ok": True,
        "session_id": str(session_id),
        "deleted": deleted,
    }


@router.get("/session/{session_id}/export", response_model=None)
async def export_session(
    session_id: UUID,
    format: str = Query(default="json", pattern="^(json|candump|csv)$"),
    limit: int = Query(default=250_000, ge=1, le=1_000_000),
) -> Response | dict[str, Any]:
    """Export a session for offline decoding by another person/tool."""
    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.label, cs.bus_interface, cs.bus_mode, cs.started_at, cs.ended_at,
                cs.metadata AS session_metadata,
                v.slug AS vehicle_slug, v.year, v.make, v.model, v.trim, v.alias,
                rm.mission_code, rm.title AS mission_title, rm.target AS mission_target
            FROM can_sessions cs
            JOIN vehicles v ON v.id = cs.vehicle_id
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if not session:
            raise HTTPException(status_code=404, detail="CAN session not found")

        markers = await conn.fetch(
            """
            SELECT marker_type, label, timestamp_ms, metadata, created_at
            FROM can_session_markers
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, created_at ASC
            """,
            session_id,
        )
        frames = await conn.fetch(
            """
            SELECT timestamp_ms, elapsed_ms, can_id, can_id_hex, dlc,
                   upper(encode(data, 'hex')) AS data_hex,
                   source, metadata
            FROM can_frames_raw
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, id ASC
            LIMIT $2
            """,
            session_id,
            limit,
        )
        report = await conn.fetchrow(
            """
            SELECT title, content, metadata, created_at
            FROM session_reports
            WHERE session_id = $1 AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            session_id,
        )

    session_dict = dict(session)
    session_dict["id"] = str(session_dict["id"])
    session_dict["session_metadata"] = metadata_dict(session_dict.get("session_metadata"))

    marker_items = []
    for row in markers:
        item = dict(row)
        item["metadata"] = metadata_dict(item.get("metadata"))
        marker_items.append(item)

    frame_items = []
    for row in frames:
        item = dict(row)
        item["metadata"] = metadata_dict(item.get("metadata"))
        frame_items.append(item)

    if format == "candump":
        lines = []
        for frame in frame_items:
            # candump -L compatible enough for most tools. Timestamp is relative seconds.
            elapsed = safe_float(frame.get("elapsed_ms"))
            if elapsed is None:
                elapsed = float(frame.get("timestamp_ms") or 0) / 1000.0
            data_hex = frame.get("data_hex") or ""
            can_id_hex = str(frame.get("can_id_hex") or can_hex(int(frame.get("can_id") or 0))).replace("0x", "")
            iface = frame.get("source") or session_dict.get("bus_interface") or "can0"
            lines.append(f"({elapsed:.6f}) {iface} {can_id_hex}#{data_hex}")
        return Response(
            "\n".join(lines) + ("\n" if lines else ""),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{session_id}.candump"'},
        )

    if format == "csv":
        header = "timestamp_ms,elapsed_ms,interface,can_id_hex,dlc,data_hex\n"
        rows = [
            f"{frame.get('timestamp_ms')},{frame.get('elapsed_ms')},{frame.get('source')},{frame.get('can_id_hex')},{frame.get('dlc')},{frame.get('data_hex')}"
            for frame in frame_items
        ]
        return Response(
            header + "\n".join(rows) + ("\n" if rows else ""),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{session_id}.csv"'},
        )

    payload = {
        "ok": True,
        "export_version": 1,
        "session": session_dict,
        "markers": marker_items,
        "frames": frame_items,
        "frame_count": len(frame_items),
        "latest_report": dict(report) if report else None,
    }

    return Response(
        json.dumps(payload, default=str, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.json"'},
    )