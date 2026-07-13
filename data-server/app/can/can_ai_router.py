# data-server/app/can/can_ai_router.py

from __future__ import annotations

import asyncio
import json
import math
import os
import re
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
from app.can.can_ml_service import (
    ML_BLEND_WEIGHT,
    apply_supervised_model,
    load_active_ml_model,
    ml_configuration,
    ml_router,
)


def env_float(name: str, default: float, minimum: float = 0.0) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else float(default)
    except (TypeError, ValueError):
        value = float(default)
    return max(value, minimum)


def env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else int(default)
    except (TypeError, ValueError):
        value = int(default)
    return max(value, minimum)


router = APIRouter(prefix="/data/can", tags=["can-ai"])
router.include_router(ml_router)

OLLAMA_URL = os.getenv(
    "OLLAMA_URL",
    "http://127.0.0.1:11434",
).rstrip("/")

DEFAULT_LLM_MODEL = os.getenv("DEFAULT_LLM_MODEL", "qwen2.5:3b")
DEFAULT_EMBED_MODEL = os.getenv("DEFAULT_EMBED_MODEL", "nomic-embed-text")

MAX_ANALYSIS_FRAMES = 75_000
MAX_DELTAS_TO_STORE = 50_000
MAX_DELTAS_TO_PERSIST = 10_000
MAX_DELTA_CANDIDATES_TO_PERSIST = 20

# Three-hour ceiling for a deliberately slow Raspberry Pi inference run.
LLM_DEADLINE_SECONDS = env_float(
    "LLM_DEADLINE_SECONDS",
    10_800.0,
    minimum=60.0,
)
LLM_HTTP_READ_TIMEOUT_SECONDS = max(
    env_float(
        "LLM_HTTP_READ_TIMEOUT_SECONDS",
        10_920.0,
        minimum=61.0,
    ),
    LLM_DEADLINE_SECONDS + 30.0,
)
LLM_NUM_CTX = env_int("LLM_NUM_CTX", 4096, minimum=1024)
LLM_NUM_PREDICT = env_int("LLM_NUM_PREDICT", 700, minimum=128)
LLM_CANDIDATE_LIMIT = env_int("LLM_CANDIDATE_LIMIT", 5, minimum=1)
LLM_BYTE_EVIDENCE_LIMIT = env_int(
    "LLM_BYTE_EVIDENCE_LIMIT",
    2,
    minimum=1,
)
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "3h")
EMBED_TIMEOUT_SECONDS = env_float(
    "EMBED_TIMEOUT_SECONDS",
    300.0,
    minimum=10.0,
)

# Vector memory is retrieved only as historical context. It never directly
# changes candidate confidence; supervised ML remains the learned reranker.
VECTOR_MEMORY_SCHEMA_VERSION = 1
VECTOR_MEMORY_LIMIT = min(
    10,
    env_int("VECTOR_MEMORY_LIMIT", 5, minimum=1),
)
VECTOR_MEMORY_MIN_SIMILARITY = min(
    1.0,
    env_float("VECTOR_MEMORY_MIN_SIMILARITY", 0.60, minimum=0.0),
)
DEFAULT_MARKER_WINDOW_MS = env_int(
    "CAN_MARKER_WINDOW_MS",
    300,
    minimum=100,
)

# Keep production responses small enough for the Pi, browser, and React renderer.
MAX_RESPONSE_CANDIDATES = 15
MAX_RESPONSE_EVIDENCE_CANDIDATES = 5
MAX_RESPONSE_BYTE_EVIDENCE = 3
MAX_PERSISTED_REPORT_CANDIDATES = 10

# Baseline subtraction compares normalized per-byte transition rates.
BASELINE_PENALTY_WEIGHT = min(
    1.0,
    env_float("BASELINE_PENALTY_WEIGHT", 0.65, minimum=0.0),
)

VECTOR_DIMENSION = 768
EMBED_ONLY_MODEL_HINTS = ("embed", "embedding", "nomic-embed-text", "all-minilm")

ANALYSIS_MODE_BASELINE = "baseline_profile"
ANALYSIS_MODE_TARGET = "target_correlation"
BASELINE_CODE_PREFIXES = ("BASE", "NOISE", "SNIFF", "PROFILE")

# Only explicit action markers contribute to target correlation. Structural
# markers remain useful as controls/audit context but must not create evidence.
ACTION_MARKER_TYPES = {
    "action_start",
    "action",
    "target_action",
    "target_event",
}
CONTROL_MARKER_TYPES = {
    "step_start",
    "baseline_start",
    "countdown_start",
    "capture_start",
    "step_complete",
}
IGNORED_MARKER_TYPES = {
    "run_cancelled",
    "session_start",
    "session_stop",
}
CONFIDENCE_SEMANTICS = (
    "bounded research evidence score in [0,1]; not a calibrated probability"
)


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
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.frequency_hz is not None
        and candidate.frequency_hz >= 20
    ][:15]
    noisy_ids = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.change_count > 0
    ][:15]
    stable_ids = [
        compact_candidate_payload(
            candidate,
            include_byte_evidence=False,
        )
        for candidate in candidates
        if candidate.change_count == 0
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
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
    vector_context: Optional[dict[str, Any]] = None,
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

    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    vector_context = vector_context or {}
    vector_match_count = int(vector_context.get("match_count") or 0)
    ml_model_text = (
        str(ml_context.get("model_id"))
        if ml_context.get("applied")
        else "none"
    )
    baseline_session_text = (
        str(baseline_context.get("session_id"))
        if baseline_context.get("applied")
        else "none"
    )

    candidate_lines = [
        (
            f"- {candidate.can_id_hex}: confidence={candidate.confidence}, "
            f"pre_baseline_confidence={candidate.confidence_before_baseline}, "
            f"baseline_overlap={candidate.baseline_overlap_score}, "
            f"baseline_penalty={candidate.baseline_penalty}, "
            f"baseline_adjusted_change_ratio={candidate.baseline_adjusted_change_ratio}, "
            f"ml_probability={candidate.ml_probability}, "
            f"pre_ml_confidence={candidate.confidence_before_ml}, "
            f"adjusted_correlation={candidate.correlation_score}, "
            f"raw_marker_fraction={candidate.raw_marker_fraction}, "
            f"window_coverage={candidate.marker_window_coverage}, "
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
                "The following results are hypotheses, not confirmed decodes. "
                f"Matched baseline session: {baseline_session_text}. "
                f"Supervised model: {ml_model_text}."
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
            "- Correlation is adjusted for the percentage of the timeline covered by marker windows.",
            "- Even adjusted marker correlation does not prove that an ID owns the intended signal.",
            (
                f"- Matched baseline session {baseline_session_text} was used with normalized per-byte subtraction."
                if baseline_context.get("applied")
                else "- No compatible analyzed baseline was available."
            ),
            "- Baseline subtraction reduces false positives but does not prove signal ownership.",
            (
                f"- Scoped vector memory retrieved {vector_match_count} similar prior sessions; "
                "those matches did not alter numerical confidence."
                if vector_context.get("requested")
                else "- Vector memory was not requested for this analysis."
            ),
            (
                f"- Supervised model {ml_model_text} was applied using explicit human labels."
                if ml_context.get("applied")
                else "- No supervised model was applied; ranking remains statistical and rule-based."
            ),
            "",
            "# 5. Recommendations and Next Mission",
            "1. Repeat the target action at least four times and verify the same byte transition each time.",
            "2. Record an equal-duration no-action control and reject candidates that behave similarly there.",
            "3. Verify that the candidate returns to its pre-action value after deactivation.",
            "Recommended next mission: 2-second baseline, four action repetitions, 1.8-second action windows, 1.5-second capture windows, and 2-second idle recovery between repetitions.",
        ]
    )


class AnalyzeSessionRequest(BaseModel):
    marker_window_ms: int = Field(default=DEFAULT_MARKER_WINDOW_MS, ge=100, le=10_000)
    max_frames: int = Field(default=MAX_ANALYSIS_FRAMES, ge=100, le=250_000)
    use_llm: bool = True
    use_embeddings: bool = True
    use_baseline: bool = True
    baseline_session_id: Optional[UUID] = None
    use_ml_model: bool = True
    ml_model_id: Optional[UUID] = None
    llm_model: str = DEFAULT_LLM_MODEL
    embed_model: str = DEFAULT_EMBED_MODEL
    persist: bool = True


class MarkerObservation(BaseModel):
    marker_type: str
    step_code: Optional[str]
    label: Optional[str]
    action_key: str
    timestamp_ms: int
    pre_mode: Optional[int]
    action_mode: Optional[int]
    post_mode: Optional[int]
    change_count: int
    latency_ms: Optional[float]


class ByteEvidence(BaseModel):
    byte_index: int
    change_count: int
    unique_values: list[int]
    most_common_values: list[tuple[int, int]]

    # These three compatibility fields are populated only when all explicit
    # action groups agree. ON and OFF groups are never pooled into one mode.
    pre_marker_mode: Optional[int]
    action_window_mode: Optional[int]
    post_marker_mode: Optional[int]

    bit_flip_counts: dict[str, int]
    median_marker_latency_ms: Optional[float]
    in_window_changes: int
    out_of_window_changes: int
    marker_observations: list[MarkerObservation] = Field(default_factory=list)
    action_group_modes: dict[str, Any] = Field(default_factory=dict)


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
    raw_marker_fraction: float
    marker_window_coverage: float
    correlation_lift: float
    correlation_score: float
    confidence: float
    likely_marker_types: list[str]
    notes: str
    analysis_mode: str = ANALYSIS_MODE_TARGET
    candidate_role: str = "target_candidate"
    baseline_score: float = 0.0

    baseline_applied: bool = False
    baseline_session_id: Optional[str] = None
    baseline_id_present: bool = False
    baseline_overlap_score: float = 0.0
    baseline_penalty: float = 0.0
    baseline_adjusted_change_ratio: float = 0.0
    confidence_before_baseline: float = 0.0
    baseline_evidence: dict[str, Any] = Field(default_factory=dict)

    ml_applied: bool = False
    ml_model_id: Optional[str] = None
    ml_probability: Optional[float] = None
    ml_blend_weight: float = 0.0
    confidence_before_ml: float = 0.0
    ml_feature_vector: dict[str, float] = Field(default_factory=dict)

    # Read-only cross-session evidence from scoped vector retrieval. This is
    # deliberately excluded from the numerical confidence calculation.
    historical_support: dict[str, Any] = Field(default_factory=dict)


@dataclass
class FrameRow:
    id: int
    timestamp_ms: int
    can_id: int
    dlc: int
    data: list[int]
    # Truncated sessions are loaded as multiple contiguous time segments.
    # Transitions are never calculated across segment boundaries.
    segment_id: int = 0


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


def interval_coverage_fraction(
    intervals: list[tuple[int, int]],
    session_start_ms: int,
    session_end_ms: int,
) -> float:
    """Return the fraction of the recorded timeline covered by marker windows."""
    if session_end_ms <= session_start_ms:
        return 0.0

    covered_ms = 0
    for start, end in intervals:
        clipped_start = max(start, session_start_ms)
        clipped_end = min(end, session_end_ms)
        if clipped_end >= clipped_start:
            covered_ms += clipped_end - clipped_start + 1

    duration_ms = session_end_ms - session_start_ms + 1
    return min(1.0, covered_ms / max(duration_ms, 1))


REPORT_SECTION_PATTERN = re.compile(
    r"(?im)^\s*#{0,6}\s*([1-5])\s*[.)\-:]\s*[^\n]*$"
)


def split_numbered_report_sections(report: str) -> dict[int, str]:
    """Split a Markdown report into numbered sections 1 through 5."""
    matches = list(REPORT_SECTION_PATTERN.finditer(report or ""))
    sections: dict[int, str] = {}

    for index, match in enumerate(matches):
        section_number = int(match.group(1))
        section_end = (
            matches[index + 1].start()
            if index + 1 < len(matches)
            else len(report)
        )
        sections.setdefault(
            section_number,
            report[match.start():section_end].strip(),
        )

    return sections


def ensure_complete_five_section_report(
    report: str,
    fallback_report: str,
) -> tuple[str, list[int]]:
    """Append deterministic fallback sections when a model omits or truncates them."""
    model_sections = split_numbered_report_sections(report)
    fallback_sections = split_numbered_report_sections(fallback_report)

    missing_sections = [
        section_number
        for section_number in range(1, 6)
        if section_number not in model_sections
    ]

    if not missing_sections:
        return report.strip(), []

    repaired = report.rstrip()
    for section_number in missing_sections:
        fallback_section = fallback_sections.get(section_number)
        if fallback_section:
            repaired += "\n\n" + fallback_section

    return repaired.strip(), missing_sections


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



def normalized_marker_type(marker: dict[str, Any]) -> str:
    return str(marker.get("marker_type") or "").strip().lower().replace("-", "_")


def marker_action_key(marker: dict[str, Any]) -> str:
    return str(
        marker.get("step_code")
        or marker.get("label")
        or normalized_marker_type(marker)
        or "unknown_action"
    )


def classify_marker_role(marker: dict[str, Any]) -> str:
    marker_type = normalized_marker_type(marker)
    metadata = metadata_dict(marker.get("metadata"))
    phase = str(metadata.get("phase") or "").strip().lower().replace("-", "_")

    if marker_type in ACTION_MARKER_TYPES or phase == "action":
        return "action"
    if marker_type in CONTROL_MARKER_TYPES or phase in {
        "baseline",
        "countdown",
        "capture",
    }:
        return "control"
    if marker_type in IGNORED_MARKER_TYPES:
        return "ignored"
    if marker_type.startswith("action_"):
        return "action"
    return "unknown"


def select_analysis_markers(
    markers: list[dict[str, Any]],
    *,
    baseline_mode: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Select explicit action markers and retain structural markers as controls."""
    roles = {
        "action": [],
        "control": [],
        "ignored": [],
        "unknown": [],
    }
    for marker in markers:
        roles[classify_marker_role(marker)].append(marker)

    selected = [] if baseline_mode else list(roles["action"])
    fallback_used = False

    # Legacy captures may predate action_start. Only use unknown markers when
    # there are no explicit action markers at all; structural controls remain
    # excluded.
    if not baseline_mode and not selected and roles["unknown"]:
        selected = list(roles["unknown"])
        fallback_used = True

    context = {
        "strategy": (
            "baseline_profile_no_target_windows"
            if baseline_mode
            else (
                "legacy_unknown_marker_fallback"
                if fallback_used
                else "explicit_action_markers_only"
            )
        ),
        "action_markers": len(selected),
        "explicit_action_markers": len(roles["action"]),
        "control_markers": len(roles["control"]),
        "ignored_markers": len(roles["ignored"]),
        "unknown_markers": len(roles["unknown"]),
        "fallback_used": fallback_used,
        "action_keys": sorted({
            marker_action_key(marker)
            for marker in selected
        }),
        "confidence_influence": (
            "selected action markers define correlation windows; controls do not"
        ),
    }
    return selected, context


def strict_consensus(values: list[Optional[int]]) -> Optional[int]:
    """Return a mode only when every group supplied and agreed on one value."""
    if not values or any(value is None for value in values):
        return None
    unique = {int(value) for value in values if value is not None}
    return next(iter(unique)) if len(unique) == 1 else None


def build_byte_evidence(
    rows: list[FrameRow],
    marker_windows: list[tuple[int, int, dict[str, Any]]],
    marker_window_ms: int,
) -> tuple[list[ByteEvidence], dict[str, float]]:
    """Build per-action evidence without pooling ON and OFF marker states."""
    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )

    evidence_rows: list[ByteEvidence] = []
    byte_entropy: dict[str, float] = {}
    row_timestamps = [row.timestamp_ms for row in rows]

    for byte_index in range(8):
        values = [frame_byte(row, byte_index) for row in rows]
        byte_entropy[str(byte_index)] = round(
            max(0.0, entropy(values)),
            4,
        )

        change_timestamps: list[int] = []
        bit_flip_counts = [0] * 8

        for previous, current in zip(rows, rows[1:]):
            if previous.segment_id != current.segment_id:
                continue

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

        observations: list[MarkerObservation] = []
        grouped: dict[str, list[MarkerObservation]] = defaultdict(list)

        for _, _, marker in marker_windows:
            marker_time = int(marker.get("timestamp_ms") or 0)
            pre_start = marker_time - marker_window_ms
            pre_end = marker_time - 1
            action_start = marker_time
            action_end = marker_time + marker_window_ms
            post_start = action_end + 1
            post_end = marker_time + (2 * marker_window_ms)

            def values_between(start_ms: int, end_ms: int) -> list[int]:
                left = bisect_left(row_timestamps, start_ms)
                right = bisect_right(row_timestamps, end_ms)
                return values[left:right]

            pre_values = values_between(pre_start, pre_end)
            action_values = values_between(action_start, action_end)
            post_values = values_between(post_start, post_end)

            left_change = bisect_left(change_timestamps, action_start)
            right_change = bisect_right(change_timestamps, action_end)
            marker_change_count = right_change - left_change

            latency: Optional[float] = None
            if left_change < len(change_timestamps):
                first_change = change_timestamps[left_change]
                if first_change <= action_end:
                    latency = float(first_change - marker_time)

            action_key = marker_action_key(marker)
            observation = MarkerObservation(
                marker_type=normalized_marker_type(marker),
                step_code=(
                    str(marker.get("step_code"))
                    if marker.get("step_code") is not None
                    else None
                ),
                label=(
                    str(marker.get("label"))
                    if marker.get("label") is not None
                    else None
                ),
                action_key=action_key,
                timestamp_ms=marker_time,
                pre_mode=mode_value(pre_values),
                action_mode=mode_value(action_values),
                post_mode=mode_value(post_values),
                change_count=marker_change_count,
                latency_ms=(
                    round(latency, 2)
                    if latency is not None
                    else None
                ),
            )
            observations.append(observation)
            grouped[action_key].append(observation)

        action_group_modes: dict[str, Any] = {}
        group_pre_modes: list[Optional[int]] = []
        group_action_modes: list[Optional[int]] = []
        group_post_modes: list[Optional[int]] = []
        all_latencies: list[float] = []

        for action_key, group_observations in grouped.items():
            pre_modes = [item.pre_mode for item in group_observations]
            action_modes = [item.action_mode for item in group_observations]
            post_modes = [item.post_mode for item in group_observations]
            latencies = [
                float(item.latency_ms)
                for item in group_observations
                if item.latency_ms is not None
            ]

            group_pre = strict_consensus(pre_modes)
            group_action = strict_consensus(action_modes)
            group_post = strict_consensus(post_modes)
            group_pre_modes.append(group_pre)
            group_action_modes.append(group_action)
            group_post_modes.append(group_post)
            all_latencies.extend(latencies)

            action_group_modes[action_key] = {
                "repetitions": len(group_observations),
                "pre_modes": pre_modes,
                "action_modes": action_modes,
                "post_modes": post_modes,
                "consensus_pre_mode": group_pre,
                "consensus_action_mode": group_action,
                "consensus_post_mode": group_post,
                "total_action_window_changes": sum(
                    item.change_count
                    for item in group_observations
                ),
                "median_latency_ms": (
                    round(float(statistics.median(latencies)), 2)
                    if latencies
                    else None
                ),
            }

        evidence_rows.append(
            ByteEvidence(
                byte_index=byte_index,
                change_count=len(change_timestamps),
                unique_values=sorted(set(values))[:32],
                most_common_values=[
                    (int(value), int(count))
                    for value, count in Counter(values).most_common(5)
                ],
                # Do not collapse opposing action groups. These remain None
                # whenever ON/OFF or press/release groups disagree.
                pre_marker_mode=strict_consensus(group_pre_modes),
                action_window_mode=strict_consensus(group_action_modes),
                post_marker_mode=strict_consensus(group_post_modes),
                bit_flip_counts={
                    str(bit_index): int(count)
                    for bit_index, count in enumerate(bit_flip_counts)
                },
                median_marker_latency_ms=(
                    round(float(statistics.median(all_latencies)), 2)
                    if all_latencies
                    else None
                ),
                in_window_changes=in_window_changes,
                out_of_window_changes=out_of_window_changes,
                marker_observations=observations,
                action_group_modes=action_group_modes,
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
                "keep_alive": OLLAMA_KEEP_ALIVE,
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
        async with httpx.AsyncClient(timeout=EMBED_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{OLLAMA_URL}/api/embed",
                json={
                    "model": model,
                    "input": text,
                    "keep_alive": OLLAMA_KEEP_ALIVE,
                },
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
            f"consensus_pre={item.pre_marker_mode}, "
            f"consensus_action={item.action_window_mode}, "
            f"consensus_post={item.post_marker_mode}, "
            f"action_groups={item.action_group_modes}, "
            f"latency_ms={item.median_marker_latency_ms}, "
            f"common={item.most_common_values[:4]}, "
            f"bit_flips={nonzero_bit_flips}"
        )

    return "; ".join(summaries)



def embedding_candidate_metadata(candidate: Candidate) -> dict[str, Any]:
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

    return {
        "can_id": candidate.can_id,
        "can_id_hex": candidate.can_id_hex,
        "confidence": candidate.confidence,
        "candidate_role": candidate.candidate_role,
        "correlation_score": candidate.correlation_score,
        "baseline_overlap_score": candidate.baseline_overlap_score,
        "baseline_adjusted_change_ratio": (
            candidate.baseline_adjusted_change_ratio
        ),
        "ml_probability": candidate.ml_probability,
        "byte_change_counts": candidate.byte_change_counts,
        "byte_evidence": [
            item.model_dump()
            for item in active_evidence[:2]
        ],
    }


def build_embedding_document(
    session: dict[str, Any],
    candidates: list[Candidate],
    analysis_mode: str,
    marker_window_ms: int,
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
) -> str:
    """Create evidence-rich text for both storage and similarity search."""
    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    capture_kind = capture_kind_for(
        session.get("bus_interface"),
        session.get("bus_mode"),
    )

    lines = [
        f"Vehicle: {session.get('vehicle_slug')}",
        f"Mission: {session.get('mission_code')}",
        f"Target: {session.get('mission_target')}",
        f"Analysis mode: {analysis_mode}",
        f"Capture kind: {capture_kind}",
        (
            "CAN source: "
            f"{session.get('bus_interface')}/{session.get('bus_mode')}"
        ),
        f"Post-marker action window: {marker_window_ms} ms",
        (
            "Matched baseline: "
            f"{baseline_context.get('session_id') or 'none'}"
        ),
        (
            "Supervised model: "
            f"{ml_context.get('model_id') or 'none'}"
        ),
        "Ranked candidate evidence:",
    ]

    for candidate in candidates[:10]:
        lines.append(
            " | ".join(
                [
                    candidate.can_id_hex,
                    f"confidence={candidate.confidence}",
                    f"role={candidate.candidate_role}",
                    f"correlation={candidate.correlation_score}",
                    f"baseline_overlap={candidate.baseline_overlap_score}",
                    (
                        "baseline_excess="
                        f"{candidate.baseline_adjusted_change_ratio}"
                    ),
                    f"ml_probability={candidate.ml_probability}",
                    f"changes={candidate.change_count}",
                    f"bytes={candidate.byte_change_counts}",
                    (
                        "evidence="
                        f"{compact_byte_evidence(candidate, limit=2)}"
                    ),
                ]
            )
        )

    return "\n".join(lines)


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


async def retrieve_vector_memory(
    conn: Any,
    *,
    query_embedding: list[float],
    session: dict[str, Any],
    analysis_mode: str,
    embed_model: str,
) -> dict[str, Any]:
    """Retrieve latest exact-scope memories, deduplicated by session."""
    mission_code = session.get("mission_code")
    capture_kind = capture_kind_for(
        session.get("bus_interface"),
        session.get("bus_mode"),
    )

    context: dict[str, Any] = {
        "requested": True,
        "query_embedded": True,
        "retrieved": False,
        "scope": {
            "vehicle_slug": session.get("vehicle_slug"),
            "mission_code": mission_code,
            "capture_kind": capture_kind,
            "analysis_mode": analysis_mode,
            "embed_model": embed_model,
        },
        "limit": VECTOR_MEMORY_LIMIT,
        "minimum_similarity": VECTOR_MEMORY_MIN_SIMILARITY,
        "confidence_influence": False,
        "matches": [],
        "match_count": 0,
    }

    if not mission_code:
        context["reason"] = "Session has no mission code for scoped retrieval."
        return context

    query_vector = vector_literal(query_embedding)

    try:
        rows = await conn.fetch(
            """
            WITH latest_embeddings AS (
                SELECT DISTINCT ON (se.session_id)
                    se.id AS embedding_id,
                    se.session_id,
                    se.text,
                    se.embedding,
                    se.metadata,
                    se.created_at,
                    cs.bus_interface,
                    cs.bus_mode,
                    rm.mission_code
                FROM signal_embeddings se
                JOIN can_sessions cs ON cs.id = se.session_id
                LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
                WHERE se.vehicle_id = $2
                  AND se.session_id <> $3
                  AND rm.mission_code = $4
                  AND COALESCE(se.metadata->>'model', '') = $5
                  AND COALESCE(se.metadata->>'analysis_mode', '') = $6
                  AND se.embedding IS NOT NULL
                  AND (
                        (
                            $7 = 'simulation'
                            AND (
                                LOWER(COALESCE(cs.bus_mode, '')) IN (
                                    'simulation', 'replay', 'offline'
                                )
                                OR LOWER(COALESCE(cs.bus_interface, '')) = 'vcan0'
                            )
                        )
                        OR
                        (
                            $7 = 'live'
                            AND LOWER(COALESCE(cs.bus_mode, '')) NOT IN (
                                'simulation', 'replay', 'offline'
                            )
                            AND LOWER(COALESCE(cs.bus_interface, '')) <> 'vcan0'
                        )
                  )
                ORDER BY se.session_id, se.created_at DESC
            ),
            scored AS (
                SELECT
                    latest_embeddings.*,
                    1.0 - (embedding <=> $1::vector) AS similarity
                FROM latest_embeddings
            )
            SELECT *
            FROM scored
            WHERE similarity >= $8
            ORDER BY
                CASE WHEN bus_interface IS NOT DISTINCT FROM $9 THEN 0 ELSE 1 END,
                CASE WHEN bus_mode IS NOT DISTINCT FROM $10 THEN 0 ELSE 1 END,
                similarity DESC,
                created_at DESC
            LIMIT $11
            """,
            query_vector,
            session.get("vehicle_id"),
            session.get("id"),
            mission_code,
            embed_model,
            analysis_mode,
            capture_kind,
            VECTOR_MEMORY_MIN_SIMILARITY,
            session.get("bus_interface"),
            session.get("bus_mode"),
            VECTOR_MEMORY_LIMIT,
        )
    except Exception as exc:
        context["error"] = f"{type(exc).__name__}: {exc}"
        context["reason"] = "Vector-memory query failed."
        return context

    matches: list[dict[str, Any]] = []
    for raw_row in rows:
        row = dict(raw_row)
        metadata = metadata_dict(row.get("metadata"))
        matches.append({
            "embedding_id": str(row["embedding_id"]),
            "session_id": str(row["session_id"]),
            "similarity": round(float(row.get("similarity") or 0.0), 6),
            "mission_code": row.get("mission_code"),
            "bus_interface": row.get("bus_interface"),
            "bus_mode": row.get("bus_mode"),
            "capture_kind": capture_kind_for(
                row.get("bus_interface"),
                row.get("bus_mode"),
            ),
            "analysis_mode": metadata.get("analysis_mode"),
            "created_at": row.get("created_at"),
            "text": str(row.get("text") or "")[:2_000],
            "metadata": metadata,
            "labels": {},
        })

    if matches:
        session_ids = [UUID(match["session_id"]) for match in matches]
        try:
            label_rows = await conn.fetch(
                """
                SELECT
                    session_id,
                    can_id,
                    label,
                    signal_name,
                    notes,
                    metadata
                FROM can_ml_labels
                WHERE session_id = ANY($1::uuid[])
                """,
                session_ids,
            )
            labels_by_session: dict[str, dict[str, Any]] = defaultdict(dict)
            for raw_label in label_rows:
                label = dict(raw_label)
                labels_by_session[str(label["session_id"])][
                    str(label["can_id"])
                ] = {
                    "label": label.get("label"),
                    "signal_name": label.get("signal_name"),
                    "notes": label.get("notes"),
                    "metadata": metadata_dict(label.get("metadata")),
                }
            for match in matches:
                match["labels"] = labels_by_session.get(
                    match["session_id"],
                    {},
                )
        except Exception as exc:
            context["label_lookup_error"] = f"{type(exc).__name__}: {exc}"

    context["matches"] = matches
    context["match_count"] = len(matches)
    context["retrieved"] = bool(matches)
    if not matches:
        context["reason"] = "No compatible historical embeddings met the similarity threshold."
    return context


def apply_vector_historical_support(
    candidates: list[Candidate],
    vector_context: dict[str, Any],
) -> None:
    """Attach transparent support counts without changing confidence."""
    matches = vector_context.get("matches")
    if not isinstance(matches, list):
        return

    for candidate in candidates:
        seen_sessions = 0
        top_five_sessions = 0
        same_active_bytes_sessions = 0
        similarities: list[float] = []
        label_counts = {
            "positive": 0,
            "negative": 0,
            "uncertain": 0,
        }
        current_active_bytes = {
            str(byte_index)
            for byte_index in range(8)
            if int(candidate.byte_change_counts.get(str(byte_index), 0) or 0) > 0
        }

        for match in matches:
            metadata = metadata_dict(match.get("metadata"))
            historical_candidates = metadata.get("top_candidates")
            if not isinstance(historical_candidates, list):
                historical_candidates = []

            historical_candidate: Optional[dict[str, Any]] = None
            historical_index: Optional[int] = None
            for index, item in enumerate(historical_candidates):
                if not isinstance(item, dict):
                    continue
                if int(item.get("can_id") or -1) == candidate.can_id:
                    historical_candidate = item
                    historical_index = index
                    break

            if historical_candidate is not None:
                seen_sessions += 1
                if historical_index is not None and historical_index < 5:
                    top_five_sessions += 1
                similarities.append(float(match.get("similarity") or 0.0))

                historical_counts = metadata_dict(
                    historical_candidate.get("byte_change_counts")
                )
                historical_active_bytes = {
                    str(byte_index)
                    for byte_index in range(8)
                    if int(historical_counts.get(str(byte_index), 0) or 0) > 0
                }
                if current_active_bytes and (
                    current_active_bytes == historical_active_bytes
                ):
                    same_active_bytes_sessions += 1

            labels = metadata_dict(match.get("labels"))
            label = metadata_dict(labels.get(str(candidate.can_id)))
            label_value = label.get("label")
            if label_value in label_counts:
                label_counts[label_value] += 1

        candidate.historical_support = {
            "retrieved_sessions": len(matches),
            "seen_sessions": seen_sessions,
            "top_five_sessions": top_five_sessions,
            "same_active_bytes_sessions": same_active_bytes_sessions,
            "mean_similarity": (
                round(float(statistics.mean(similarities)), 6)
                if similarities
                else None
            ),
            "label_counts": label_counts,
            "confidence_influence": False,
        }


def vector_memory_prompt_text(vector_context: dict[str, Any]) -> str:
    matches = vector_context.get("matches")
    if not isinstance(matches, list) or not matches:
        return (
            "No compatible historical vector memories were retrieved. "
            f"Reason: {vector_context.get('reason') or 'none available'}."
        )

    lines = [
        (
            f"Retrieved {len(matches)} scoped historical sessions. "
            "Similarity is contextual evidence only and must not override "
            "the current raw CAN observations."
        )
    ]
    for index, match in enumerate(matches, 1):
        metadata = metadata_dict(match.get("metadata"))
        historical_candidates = metadata.get("top_candidates")
        summaries: list[str] = []
        if isinstance(historical_candidates, list):
            for candidate in historical_candidates[:3]:
                if not isinstance(candidate, dict):
                    continue
                summaries.append(
                    f"{candidate.get('can_id_hex')} "
                    f"confidence={candidate.get('confidence')} "
                    f"bytes={candidate.get('byte_change_counts')}"
                )
        labels = metadata_dict(match.get("labels"))
        label_summary = ", ".join(
            f"{can_hex(int(can_id))}:{metadata_dict(value).get('label')}"
            for can_id, value in list(labels.items())[:5]
            if str(can_id).isdigit()
        ) or "none"
        memory_excerpt = " ".join(
            str(match.get("text") or "").split()
        )[:400]
        lines.append(
            f"{index}. session={match.get('session_id')} "
            f"similarity={match.get('similarity')} "
            f"source={match.get('bus_interface')}/{match.get('bus_mode')} "
            f"top=[{'; '.join(summaries) or 'not stored'}] "
            f"human_labels=[{label_summary}] "
            f"memory_excerpt={memory_excerpt or 'none'}"
        )
    return "\n".join(lines)


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


def score_candidate_confidence(
    correlation_score: float,
    activity_ratio: float,
    frame_count: int,
) -> float:
    """Score evidence without allowing frame volume to create evidence.

    Frame count is sample support only. A high-volume CAN ID with no marker
    correlation and no changing bytes must receive zero confidence.
    """
    correlation = min(1.0, max(0.0, float(correlation_score)))
    activity = min(1.0, max(0.0, float(activity_ratio)))
    sample_support = min(max(int(frame_count), 0) / 200.0, 1.0)

    evidence_score = (
        (correlation * 0.80)
        + (activity * 0.20)
    )
    support_multiplier = 0.50 + (sample_support * 0.50)

    return min(
        1.0,
        max(0.0, evidence_score * support_multiplier),
    )


def normalized_byte_change_rates(
    frame_count: int,
    byte_change_counts: dict[str, int],
) -> dict[str, float]:
    transitions = max(int(frame_count) - 1, 1)
    return {
        str(byte_index): round(
            float(byte_change_counts.get(str(byte_index), 0) or 0)
            / transitions,
            8,
        )
        for byte_index in range(8)
    }


def baseline_feature_map(
    rows: list[Any],
) -> dict[int, dict[str, Any]]:
    features: dict[int, dict[str, Any]] = {}

    for raw_row in rows:
        row = dict(raw_row)
        metadata = metadata_dict(row.get("metadata"))
        counts_raw = metadata_dict(row.get("byte_change_counts"))
        counts = {
            str(byte_index): int(
                counts_raw.get(str(byte_index), 0) or 0
            )
            for byte_index in range(8)
        }
        frame_count = int(row.get("frame_count") or 0)
        change_count = int(row.get("change_count") or 0)

        stored_ratio = float(metadata.get("change_ratio") or 0.0)
        try:
            change_ratio = float(stored_ratio)
        except (TypeError, ValueError):
            change_ratio = (
                change_count / max((frame_count - 1) * 8, 1)
            )

        features[int(row["can_id"])] = {
            "can_id": int(row["can_id"]),
            "frame_count": frame_count,
            "change_count": change_count,
            "change_ratio": max(0.0, change_ratio),
            "byte_change_rates": normalized_byte_change_rates(
                frame_count,
                counts,
            ),
            "frequency_hz": (
                float(row["frequency_hz"])
                if row.get("frequency_hz") is not None
                else None
            ),
            "entropy": float(row.get("entropy") or 0.0),
            "baseline_score": float(
                metadata.get("baseline_score") or 0.0
            ),
        }

    return features


def baseline_row_is_valid(row: dict[str, Any]) -> bool:
    for metadata_key in (
        "report_metadata",
        "session_metadata",
        "mission_metadata",
    ):
        metadata = metadata_dict(row.get(metadata_key))
        if (
            normalize_analysis_mode(metadata.get("analysis_mode"))
            == ANALYSIS_MODE_BASELINE
        ):
            return True

    mission_code = str(row.get("mission_code") or "").upper()
    mission_title = str(row.get("mission_title") or "").upper()
    label = str(row.get("label") or "").upper()
    searchable_text = f"{mission_title} {label}"

    return (
        mission_code.startswith(BASELINE_CODE_PREFIXES)
        or "BASELINE" in searchable_text
        or "NOISE" in searchable_text
        or "SNIFF" in searchable_text
        or "PROFILE" in searchable_text
    )


async def load_baseline_reference(
    conn: Any,
    target_session: dict[str, Any],
    requested_baseline_session_id: Optional[UUID],
) -> tuple[dict[str, Any], dict[int, dict[str, Any]]]:
    """Load the newest compatible analyzed baseline for a target session."""
    vehicle_id = target_session.get("vehicle_id")
    target_id = target_session.get("id")
    bus_interface = target_session.get("bus_interface")
    bus_mode = target_session.get("bus_mode")
    target_started_at = target_session.get("started_at")

    common_select = """
        SELECT
            bs.id AS session_id,
            bs.vehicle_id,
            bs.label,
            bs.bus_interface,
            bs.bus_mode,
            bs.started_at,
            bs.ended_at,
            bs.metadata AS session_metadata,
            rm.mission_code,
            rm.title AS mission_title,
            rm.target AS mission_target,
            rm.metadata AS mission_metadata,
            sr.metadata AS report_metadata
        FROM can_sessions bs
        LEFT JOIN recon_missions rm ON rm.id = bs.mission_id
        LEFT JOIN LATERAL (
            SELECT metadata
            FROM session_reports
            WHERE session_id = bs.id
              AND report_type = 'ai_analysis'
            ORDER BY created_at DESC
            LIMIT 1
        ) sr ON true
    """

    if requested_baseline_session_id is not None:
        baseline_row = await conn.fetchrow(
            common_select
            + """
            WHERE bs.id = $1
              AND bs.vehicle_id = $2
              AND bs.id <> $3
            """,
            requested_baseline_session_id,
            vehicle_id,
            target_id,
        )
        selection = "explicit"
    else:
        baseline_row = await conn.fetchrow(
            common_select
            + """
            WHERE bs.vehicle_id = $1
              AND bs.id <> $2
              AND bs.bus_interface IS NOT DISTINCT FROM $3
              AND bs.bus_mode IS NOT DISTINCT FROM $4
              AND bs.ended_at IS NOT NULL
              AND (
                    $5::timestamptz IS NULL
                    OR bs.started_at <= $5::timestamptz
              )
              AND EXISTS (
                  SELECT 1
                  FROM can_id_features cif
                  WHERE cif.session_id = bs.id
              )
              AND (
                    COALESCE(bs.metadata->>'analysis_mode', '') = $6
                    OR COALESCE(sr.metadata->>'analysis_mode', '') = $6
                    OR UPPER(COALESCE(rm.mission_code, ''))
                       ~ '^(BASE|NOISE|SNIFF|PROFILE)'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%BASELINE%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%NOISE%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%SNIFF%'
                    OR UPPER(COALESCE(rm.title, '')) LIKE '%PROFILE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%BASELINE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%NOISE%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%SNIFF%'
                    OR UPPER(COALESCE(bs.label, '')) LIKE '%PROFILE%'
              )
            ORDER BY bs.started_at DESC
            LIMIT 1
            """,
            vehicle_id,
            target_id,
            bus_interface,
            bus_mode,
            target_started_at,
            ANALYSIS_MODE_BASELINE,
        )
        selection = "automatic"

    if baseline_row is None:
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "reason": (
                    "No compatible analyzed baseline was found for the same "
                    "vehicle, CAN interface, and bus mode."
                ),
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    baseline = dict(baseline_row)
    if not baseline_row_is_valid(baseline):
        if requested_baseline_session_id is not None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Requested baseline is not labeled or analyzed as a "
                    "baseline/noise profile."
                ),
            )
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "reason": "Selected session was not recognized as a baseline.",
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    if requested_baseline_session_id is not None and (
        baseline.get("bus_interface") != bus_interface
        or baseline.get("bus_mode") != bus_mode
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Requested baseline must use the same CAN interface and "
                "bus mode as the target session."
            ),
        )

    feature_rows = await conn.fetch(
        """
        SELECT
            can_id,
            frame_count,
            change_count,
            byte_change_counts,
            entropy,
            frequency_hz,
            metadata
        FROM can_id_features
        WHERE session_id = $1
        ORDER BY can_id ASC
        """,
        baseline["session_id"],
    )
    features = baseline_feature_map(list(feature_rows))

    if not features:
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "session_id": str(baseline["session_id"]),
                "reason": "Selected baseline has no persisted CAN-ID features.",
                "penalty_weight": BASELINE_PENALTY_WEIGHT,
            },
            {},
        )

    return (
        {
            "applied": True,
            "found": True,
            "selection": selection,
            "session_id": str(baseline["session_id"]),
            "mission_code": baseline.get("mission_code"),
            "mission_title": baseline.get("mission_title"),
            "label": baseline.get("label"),
            "bus_interface": baseline.get("bus_interface"),
            "bus_mode": baseline.get("bus_mode"),
            "started_at": baseline.get("started_at"),
            "ended_at": baseline.get("ended_at"),
            "feature_count": len(features),
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
            "method": (
                "Normalized per-byte transition rates are subtracted. "
                "Activity already present in the matched baseline applies a "
                "bounded confidence penalty; raw counts are never subtracted."
            ),
        },
        features,
    )


def apply_baseline_subtraction(
    candidates: list[Candidate],
    baseline_features: dict[int, dict[str, Any]],
    baseline_context: dict[str, Any],
) -> None:
    """Adjust candidate confidence using matched baseline activity."""
    applied = bool(
        baseline_context.get("applied")
        and baseline_features
    )
    baseline_session_id = (
        str(baseline_context.get("session_id"))
        if applied
        else None
    )

    for candidate in candidates:
        candidate.confidence_before_baseline = candidate.confidence
        candidate.baseline_adjusted_change_ratio = candidate.change_ratio

        if not applied:
            continue

        candidate.baseline_applied = True
        candidate.baseline_session_id = baseline_session_id

        target_rates = normalized_byte_change_rates(
            candidate.frame_count,
            candidate.byte_change_counts,
        )
        baseline = baseline_features.get(candidate.can_id)

        if baseline is None:
            candidate.baseline_id_present = False
            candidate.baseline_evidence = {
                "target_byte_change_rates": target_rates,
                "baseline_byte_change_rates": {
                    str(byte_index): 0.0
                    for byte_index in range(8)
                },
                "excess_byte_change_rates": target_rates,
                "baseline_change_ratio": 0.0,
            }
            if candidate.correlation_score >= 0.05:
                candidate.notes = (
                    f"{candidate.notes}; CAN ID absent from matched baseline"
                )
            continue

        candidate.baseline_id_present = True
        baseline_rates = {
            str(byte_index): float(
                baseline.get("byte_change_rates", {}).get(
                    str(byte_index),
                    0.0,
                )
            )
            for byte_index in range(8)
        }
        excess_rates = {
            str(byte_index): max(
                0.0,
                target_rates[str(byte_index)]
                - baseline_rates[str(byte_index)],
            )
            for byte_index in range(8)
        }

        target_activity = sum(target_rates.values())
        overlap_activity = sum(
            min(
                target_rates[str(byte_index)],
                baseline_rates[str(byte_index)],
            )
            for byte_index in range(8)
        )
        overlap_score = (
            min(1.0, overlap_activity / target_activity)
            if target_activity > 0
            else 0.0
        )
        adjusted_change_ratio = sum(excess_rates.values()) / 8.0
        penalty = min(
            BASELINE_PENALTY_WEIGHT,
            overlap_score * BASELINE_PENALTY_WEIGHT,
        )

        adjusted_confidence = (
            score_candidate_confidence(
                candidate.correlation_score,
                adjusted_change_ratio,
                candidate.frame_count,
            )
            * (1.0 - penalty)
        )

        candidate.baseline_overlap_score = round(overlap_score, 8)
        candidate.baseline_penalty = round(penalty, 8)
        candidate.baseline_adjusted_change_ratio = round(
            adjusted_change_ratio,
            8,
        )
        candidate.confidence = round(adjusted_confidence, 5)
        candidate.baseline_evidence = {
            "target_byte_change_rates": target_rates,
            "baseline_byte_change_rates": baseline_rates,
            "excess_byte_change_rates": {
                key: round(value, 8)
                for key, value in excess_rates.items()
            },
            "baseline_change_ratio": round(
                float(baseline.get("change_ratio") or 0.0),
                8,
            ),
            "baseline_frequency_hz": baseline.get("frequency_hz"),
            "baseline_entropy": baseline.get("entropy"),
        }

        if (
            overlap_score >= 0.80
            and adjusted_change_ratio
                <= max(candidate.change_ratio * 0.20, 0.001)
        ):
            candidate.candidate_role = "baseline_like_candidate"
            candidate.notes = (
                "candidate activity substantially overlaps matched baseline"
            )
        elif candidate.correlation_score >= 0.05:
            candidate.notes = (
                "correlated changes remain after matched-baseline subtraction"
            )

    candidates.sort(
        key=lambda candidate: (
            candidate.confidence,
            candidate.correlation_score,
            candidate.baseline_adjusted_change_ratio,
            candidate.change_count,
        ),
        reverse=True,
    )


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
            "raw_marker_fraction": candidate.raw_marker_fraction,
            "marker_window_coverage": candidate.marker_window_coverage,
            "correlation_lift": candidate.correlation_lift,
            "correlation_score": candidate.correlation_score,
            "confidence": candidate.confidence,
            "baseline_applied": candidate.baseline_applied,
            "baseline_session_id": candidate.baseline_session_id,
            "baseline_id_present": candidate.baseline_id_present,
            "baseline_overlap_score": candidate.baseline_overlap_score,
            "baseline_penalty": candidate.baseline_penalty,
            "baseline_adjusted_change_ratio": (
                candidate.baseline_adjusted_change_ratio
            ),
            "confidence_before_baseline": (
                candidate.confidence_before_baseline
            ),
            "ml_applied": candidate.ml_applied,
            "ml_model_id": candidate.ml_model_id,
            "ml_probability": candidate.ml_probability,
            "ml_blend_weight": candidate.ml_blend_weight,
            "confidence_before_ml": candidate.confidence_before_ml,
        }
        for candidate in candidates
    }


def build_llm_prompt(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    candidates: list[Candidate],
    analysis_mode: str,
    baseline_profile: Optional[dict[str, Any]] = None,
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
    vector_context: Optional[dict[str, Any]] = None,
) -> str:
    selected_action_markers, prompt_marker_context = select_analysis_markers(
        markers,
        baseline_mode=is_baseline_mode(analysis_mode),
    )
    selected_ids = {
        str(marker.get("id"))
        for marker in selected_action_markers
        if marker.get("id") is not None
    }
    control_markers = [
        marker
        for marker in markers
        if str(marker.get("id")) not in selected_ids
    ]

    action_marker_lines = "\n".join(
        (
            f"- {marker.get('timestamp_ms')}ms "
            f"{marker.get('marker_type')} "
            f"{marker.get('step_code') or ''}: "
            f"{marker.get('label') or ''}"
        )
        for marker in selected_action_markers[:40]
    ) or "- no explicit action markers"

    control_marker_lines = "\n".join(
        (
            f"- {marker.get('timestamp_ms')}ms "
            f"{marker.get('marker_type')} "
            f"{marker.get('step_code') or ''}: "
            f"{marker.get('label') or ''}"
        )
        for marker in control_markers[:40]
    ) or "- no structural/control markers"

    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    vector_context = vector_context or {
        "requested": False,
        "retrieved": False,
        "reason": "Vector memory was not requested.",
        "matches": [],
    }
    historical_memory = vector_memory_prompt_text(vector_context)

    if ml_context.get("applied"):
        ml_summary = (
            f"model={ml_context.get('model_id')}, "
            f"scope={ml_context.get('mission_code') or 'vehicle-wide'}, "
            f"labels={ml_context.get('label_count')}, "
            f"blend_weight={ml_context.get('blend_weight')}"
        )
    else:
        ml_summary = (
            "not applied; "
            f"reason={ml_context.get('reason') or 'not requested'}"
        )

    if baseline_context.get("applied"):
        baseline_summary = (
            f"session={baseline_context.get('session_id')}, "
            f"mission={baseline_context.get('mission_code') or baseline_context.get('label')}, "
            f"features={baseline_context.get('feature_count')}, "
            f"penalty_weight={baseline_context.get('penalty_weight')}"
        )
    else:
        baseline_summary = (
            "not applied; "
            f"reason={baseline_context.get('reason') or 'not requested'}"
        )

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
                f"raw_marker_fraction={c.raw_marker_fraction:.3f}, "
                f"marker_window_coverage={c.marker_window_coverage:.3f}, "
                f"correlation_lift={c.correlation_lift:.3f}, "
                f"change_ratio={c.change_ratio:.5f}, changed_frames={c.changed_frame_count}, "
                f"byte_changes={c.byte_change_counts}, byte_entropy={c.byte_entropy}, "
                f"markers={c.likely_marker_types}, "
                f"baseline_present={c.baseline_id_present}, "
                f"baseline_overlap={c.baseline_overlap_score:.3f}, "
                f"baseline_penalty={c.baseline_penalty:.3f}, "
                f"baseline_adjusted_change_ratio={c.baseline_adjusted_change_ratio:.5f}, "
                f"confidence_before_baseline={c.confidence_before_baseline:.3f}, "
                f"ml_probability={c.ml_probability}, "
                f"confidence_before_ml={c.confidence_before_ml:.3f}, "
                f"historical_support={c.historical_support}, "
                f"byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no candidates"

        mode_instructions = """
        This is a TARGET CORRELATION mission.
        Rank candidate CAN IDs by evidence near action/capture markers.
        Confidence is a research score, not proof.
        Prefer IDs that changed near the intended action and are not merely noisy baseline traffic.
        When a matched baseline is available, interpret baseline_overlap as the
        fraction of target byte activity already present in the control session.
        Interpret baseline_adjusted_change_ratio as activity remaining after
        normalized per-byte subtraction.
        When ml_probability is present, treat it as a classifier estimate
        learned only from explicit human labels. It is supporting evidence,
        not proof.
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

    Matched baseline:
    - {baseline_summary}

    Supervised model:
    - {ml_summary}

    Retrieved vector memory:
    {historical_memory}

    Vector-memory rule:
    - Historical similarity is supporting context only.
    - Do not change or overrule current-session evidence solely because a prior
      report is semantically similar.
    - Prefer repeated agreement in CAN ID, active byte, bit transitions,
      latency, return state, baseline behavior, and human labels.

    Marker selection:
    - strategy: {prompt_marker_context.get('strategy')}
    - action markers used for correlation: {prompt_marker_context.get('action_markers')}
    - structural/control markers excluded from correlation: {prompt_marker_context.get('control_markers')}

    Explicit action markers used for correlation:
    {action_marker_lines}

    Structural/control markers retained only as context:
    {control_marker_lines}

    {candidate_heading}:
    {candidate_lines}

    Detailed reporting requirements:
    - Write a full technical report, not a short list.
    - For each top CAN ID, explain why it ranked high and why it might be a false positive.
    - Discuss only the active byte evidence explicitly supplied in the prompt.
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
) -> tuple[
    list[Candidate],
    list[dict[str, Any]],
    dict[str, Any],
    dict[str, Any],
]:
    baseline_mode = is_baseline_mode(analysis_mode)
    selected_markers, marker_context = select_analysis_markers(
        markers,
        baseline_mode=baseline_mode,
    )

    by_id: dict[int, list[FrameRow]] = defaultdict(list)
    for frame in frames:
        by_id[frame.can_id].append(frame)

    all_deltas: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    heatmap: dict[str, Any] = {}

    marker_windows: list[tuple[int, int, dict[str, Any]]] = []
    for marker in selected_markers:
        timestamp_ms = int(marker.get("timestamp_ms") or 0)
        marker_windows.append(
            (
                timestamp_ms,
                timestamp_ms + marker_window_ms,
                marker,
            )
        )

    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )

    session_start_ms = min(
        (frame.timestamp_ms for frame in frames),
        default=0,
    )
    session_end_ms = max(
        (frame.timestamp_ms for frame in frames),
        default=session_start_ms,
    )
    marker_window_coverage = interval_coverage_fraction(
        correlation_intervals,
        session_start_ms,
        session_end_ms,
    )

    for can_id, rows in sorted(by_id.items()):
        rows.sort(key=lambda row: (row.timestamp_ms, row.id))

        byte_change_counts = [0] * 8
        changed_frame_timestamps: set[tuple[int, int]] = set()
        byte_change_events: list[tuple[int, int]] = []

        previous: Optional[FrameRow] = None
        for row in rows:
            if (
                previous is not None
                and previous.segment_id == row.segment_id
            ):
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
                    changed_frame_timestamps.add((row.segment_id, row.timestamp_ms))

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

        rows_by_segment: dict[int, list[FrameRow]] = defaultdict(list)
        for row in rows:
            rows_by_segment[row.segment_id].append(row)

        observed_duration_seconds = 0.0
        observed_frame_count = 0
        for segment_rows in rows_by_segment.values():
            if len(segment_rows) < 2:
                continue
            segment_rows.sort(key=lambda item: (item.timestamp_ms, item.id))
            observed_duration_seconds += max(
                (
                    segment_rows[-1].timestamp_ms
                    - segment_rows[0].timestamp_ms
                )
                / 1000.0,
                0.001,
            )
            observed_frame_count += len(segment_rows)

        frequency_hz = (
            observed_frame_count / observed_duration_seconds
            if observed_duration_seconds > 0.0
            else None
        )

        change_count = sum(byte_change_counts)
        valid_frame_transitions = sum(
            max(len(segment_rows) - 1, 0)
            for segment_rows in rows_by_segment.values()
        )

        # Byte changes are measured only across adjacent frames from the same
        # selected time segment. Truncation gaps never become synthetic changes.
        possible_byte_transitions = max(valid_frame_transitions * 8, 1)
        change_ratio = change_count / possible_byte_transitions

        changed_frame_count = len(changed_frame_timestamps)
        changed_frame_ratio = (
            changed_frame_count / max(valid_frame_transitions, 1)
        )

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
            raw_marker_fraction = 0.0
            correlation_lift = 0.0
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
            raw_marker_fraction = (
                min(1.0, window_delta_count / max(change_count, 1))
                if change_count > 0
                else 0.0
            )

            # A raw marker fraction is misleading when marker windows cover a
            # large share of the recording. Score only the lift above the
            # fraction expected from timeline coverage.
            if (
                raw_marker_fraction > marker_window_coverage
                and marker_window_coverage < 1.0
            ):
                correlation_lift = (
                    raw_marker_fraction - marker_window_coverage
                ) / max(1.0 - marker_window_coverage, 1e-9)
            else:
                correlation_lift = 0.0

            correlation_score = min(1.0, max(0.0, correlation_lift))

            confidence = score_candidate_confidence(
                correlation_score,
                change_ratio,
                len(rows),
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
            raw_marker_fraction=round(raw_marker_fraction, 5),
            marker_window_coverage=round(marker_window_coverage, 5),
            correlation_lift=round(correlation_lift, 5),
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
            "raw_marker_fraction": round(raw_marker_fraction, 5),
            "marker_window_coverage": round(marker_window_coverage, 5),
            "correlation_lift": round(correlation_lift, 5),
            "correlation_score": round(correlation_score, 5),
            "confidence": round(confidence, 5),
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

    marker_context["window_coverage"] = round(marker_window_coverage, 5)
    marker_context["selected_marker_timestamps"] = [
        int(marker.get("timestamp_ms") or 0)
        for marker in selected_markers
    ]
    return candidates, all_deltas, heatmap, marker_context


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
        "llm_deadline_seconds": LLM_DEADLINE_SECONDS,
        "llm_http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
        "llm_num_ctx": LLM_NUM_CTX,
        "llm_num_predict": LLM_NUM_PREDICT,
        "llm_candidate_limit": LLM_CANDIDATE_LIMIT,
        "llm_byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
        "ollama_keep_alive": OLLAMA_KEEP_ALIVE,
        "baseline_penalty_weight": BASELINE_PENALTY_WEIGHT,
        "baseline_matching": (
            "same vehicle + interface + bus mode; newest completed "
            "analyzed baseline recorded before target"
        ),
        "baseline_subtraction_method": (
            "normalized per-byte transition-rate subtraction with bounded "
            "activity-overlap penalty"
        ),
        "candidate_confidence_method": (
            "marker correlation and activity evidence, with frame count used "
            "only as a support multiplier; zero evidence yields zero confidence"
        ),
        "confidence_semantics": CONFIDENCE_SEMANTICS,
        "marker_selection": {
            "target_windows": "post-marker windows from explicit action_start/action markers only",
            "control_markers": (
                "baseline/countdown/capture/step markers are retained as "
                "controls but excluded from correlation"
            ),
            "legacy_fallback": (
                "unknown marker types are used only when no explicit action "
                "markers exist"
            ),
        },
        "frame_limit_strategy": (
            "all frames when within limit; otherwise contiguous action-marker "
            "strata plus an initial control stratum, with no cross-segment "
            "transitions"
        ),
        "report_storage": "replace latest ai_analysis report per session",
        "default_marker_window_ms": DEFAULT_MARKER_WINDOW_MS,
        "vector_memory": {
            "storage": True,
            "retrieval": True,
            "schema_version": VECTOR_MEMORY_SCHEMA_VERSION,
            "limit": VECTOR_MEMORY_LIMIT,
            "minimum_similarity": VECTOR_MEMORY_MIN_SIMILARITY,
            "scope": (
                "same vehicle + mission + capture kind + analysis mode + "
                "embedding model; exact interface/mode preferred"
            ),
            "confidence_influence": False,
            "usage": "LLM context and transparent historical support only",
        },
        "supervised_ml": ml_configuration(),
    }



async def load_analysis_frame_rows(
    conn: Any,
    *,
    session_id: UUID,
    max_frames: int,
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load a bounded but temporally representative frame set.

    Full sessions are unchanged. Truncated target sessions prioritize contiguous
    pre/action/post slices around every explicit action marker plus an initial
    control slice. Baseline/no-marker sessions use four contiguous time strata.
    """
    total_frames = int(
        await conn.fetchval(
            """
            SELECT COUNT(*)::bigint
            FROM can_frames_raw
            WHERE session_id = $1
            """,
            session_id,
        )
        or 0
    )

    context: dict[str, Any] = {
        "total_frames": total_frames,
        "max_frames": max_frames,
        "truncated": total_frames > max_frames,
        "selected_frames": 0,
        "strategy": "all_frames",
        "segment_count": 1,
        "transition_rule": "adjacent frames within the same selected segment",
    }

    if total_frames <= max_frames:
        rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, id ASC
            """,
            session_id,
        )
        items = [dict(row) for row in rows]
        for item in items:
            item["_segment_id"] = 0
        context["selected_frames"] = len(items)
        return items, context

    baseline_mode = is_baseline_mode(analysis_mode)
    action_markers, marker_context = select_analysis_markers(
        markers,
        baseline_mode=baseline_mode,
    )

    async def fetch_phase(
        *,
        start_ms: int,
        end_ms: int,
        limit: int,
        segment_id: int,
        descending: bool = False,
    ) -> list[dict[str, Any]]:
        if limit <= 0 or end_ms < start_ms:
            return []
        direction = "DESC" if descending else "ASC"
        rows = await conn.fetch(
            f"""
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
              AND timestamp_ms BETWEEN $2 AND $3
            ORDER BY timestamp_ms {direction}, id {direction}
            LIMIT $4
            """,
            session_id,
            int(start_ms),
            int(end_ms),
            int(limit),
        )
        items = [dict(row) for row in rows]
        if descending:
            items.reverse()
        for item in items:
            item["_segment_id"] = segment_id
        return items

    selected_action: dict[int, dict[str, Any]] = {}
    selected_control: dict[int, dict[str, Any]] = {}

    if action_markers:
        target_budget = max(1, int(max_frames * 0.85))
        control_budget = max_frames - target_budget
        per_marker_budget = max(
            3,
            target_budget // max(len(action_markers), 1),
        )

        for marker_index, marker in enumerate(action_markers, start=1):
            marker_time = int(marker.get("timestamp_ms") or 0)
            pre_budget = max(1, per_marker_budget // 4)
            action_budget = max(1, (per_marker_budget * 3) // 8)
            post_budget = max(
                1,
                per_marker_budget - pre_budget - action_budget,
            )

            phase_rows = []
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time - marker_window_ms,
                    end_ms=marker_time - 1,
                    limit=pre_budget,
                    segment_id=marker_index,
                    descending=True,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time,
                    end_ms=marker_time + marker_window_ms,
                    limit=action_budget,
                    segment_id=marker_index,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time + marker_window_ms + 1,
                    end_ms=marker_time + (2 * marker_window_ms),
                    limit=post_budget,
                    segment_id=marker_index,
                )
            )

            for item in phase_rows:
                selected_action.setdefault(int(item["id"]), item)

        first_action_time = min(
            int(marker.get("timestamp_ms") or 0)
            for marker in action_markers
        )
        control_rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
              AND timestamp_ms < $2
            ORDER BY timestamp_ms DESC, id DESC
            LIMIT $3
            """,
            session_id,
            first_action_time,
            control_budget,
        )
        control_items = [dict(row) for row in control_rows]
        control_items.reverse()
        for item in control_items:
            item["_segment_id"] = 0
            selected_control.setdefault(int(item["id"]), item)

        ordered_action = sorted(
            selected_action.values(),
            key=lambda item: (item["timestamp_ms"], item["id"]),
        )
        ordered_control = sorted(
            (
                item
                for frame_id, item in selected_control.items()
                if frame_id not in selected_action
            ),
            key=lambda item: (item["timestamp_ms"], item["id"]),
        )

        selected = ordered_action[:target_budget]
        remaining = max_frames - len(selected)
        selected.extend(ordered_control[-remaining:] if remaining > 0 else [])
        selected.sort(key=lambda item: (item["timestamp_ms"], item["id"]))

        context.update({
            "strategy": "action_marker_stratified",
            "selected_frames": len(selected),
            "segment_count": len(action_markers) + (1 if ordered_control else 0),
            "action_marker_count": len(action_markers),
            "control_frame_budget": control_budget,
            "action_frame_budget": target_budget,
            "marker_selection": marker_context,
            "warning": (
                "Session exceeded the frame limit. Candidate activity and "
                "frequency are calculated only from selected contiguous "
                "segments; no transitions cross segment boundaries."
            ),
        })
        return selected, context

    bounds = await conn.fetchrow(
        """
        SELECT
            MIN(timestamp_ms)::bigint AS min_timestamp_ms,
            MAX(timestamp_ms)::bigint AS max_timestamp_ms
        FROM can_frames_raw
        WHERE session_id = $1
        """,
        session_id,
    )
    min_timestamp = int(bounds["min_timestamp_ms"] or 0)
    max_timestamp = int(bounds["max_timestamp_ms"] or min_timestamp)
    stratum_count = 4
    per_stratum = max(1, max_frames // stratum_count)
    duration = max(max_timestamp - min_timestamp + 1, 1)

    selected: list[dict[str, Any]] = []
    for stratum_index in range(stratum_count):
        start_ms = min_timestamp + (duration * stratum_index) // stratum_count
        end_ms = (
            max_timestamp
            if stratum_index == stratum_count - 1
            else min_timestamp
            + (duration * (stratum_index + 1)) // stratum_count
            - 1
        )
        selected.extend(
            await fetch_phase(
                start_ms=start_ms,
                end_ms=end_ms,
                limit=per_stratum,
                segment_id=stratum_index,
            )
        )

    selected = selected[:max_frames]
    selected.sort(key=lambda item: (item["timestamp_ms"], item["id"]))
    context.update({
        "strategy": "time_stratified_contiguous",
        "selected_frames": len(selected),
        "segment_count": stratum_count,
        "action_marker_count": 0,
        "marker_selection": marker_context,
        "warning": (
            "Session exceeded the frame limit and had no explicit action "
            "markers. Four contiguous time strata were analyzed."
        ),
    })
    return selected, context


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
        use_baseline=payload.use_baseline,
        requested_baseline_session=payload.baseline_session_id,
        use_ml_model=payload.use_ml_model,
        requested_ml_model=payload.ml_model_id,
        persist=payload.persist,
        llm_deadline_seconds=(
            LLM_DEADLINE_SECONDS
            if payload.use_llm
            else None
        ),
        llm_num_ctx=LLM_NUM_CTX if payload.use_llm else None,
        llm_num_predict=LLM_NUM_PREDICT if payload.use_llm else None,
    )

    pool = await connect_db()
    async with pool.acquire() as conn:
        session = await conn.fetchrow(
            """
            SELECT
                cs.id, cs.vehicle_id, cs.mission_id, cs.label, cs.bus_interface, cs.bus_mode,
                cs.started_at, cs.ended_at,
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

        marker_dicts = [dict(row) for row in markers]
        for marker in marker_dicts:
            marker["metadata"] = metadata_dict(marker.get("metadata"))

        session_dict = dict(session)
        session_dict["session_metadata"] = metadata_dict(
            session_dict.get("session_metadata")
        )
        session_dict["mission_metadata"] = metadata_dict(
            session_dict.get("mission_metadata")
        )

        analysis_mode = infer_analysis_mode(session_dict, marker_dicts)
        baseline_mode = is_baseline_mode(analysis_mode)

        raw_rows, frame_selection = await load_analysis_frame_rows(
            conn,
            session_id=session_id,
            max_frames=payload.max_frames,
            markers=marker_dicts,
            marker_window_ms=payload.marker_window_ms,
            analysis_mode=analysis_mode,
        )

    can_ai_log(
        "database_input_loaded",
        session=session_id,
        raw_frames=len(raw_rows),
        total_raw_frames=frame_selection.get("total_frames"),
        frame_selection=frame_selection.get("strategy"),
        truncated=frame_selection.get("truncated"),
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
            segment_id=int(row.get("_segment_id", 0)),
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

    if baseline_mode:
        baseline_context = {
            "applied": False,
            "found": False,
            "selection": "not_applicable",
            "reason": "Baseline profiles are not subtracted from themselves.",
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
        }
        baseline_features: dict[int, dict[str, Any]] = {}
    elif not payload.use_baseline:
        baseline_context = {
            "applied": False,
            "found": False,
            "selection": "disabled",
            "reason": "Baseline subtraction was disabled for this request.",
            "penalty_weight": BASELINE_PENALTY_WEIGHT,
        }
        baseline_features = {}
    else:
        async with pool.acquire() as conn:
            baseline_context, baseline_features = (
                await load_baseline_reference(
                    conn,
                    session_dict,
                    payload.baseline_session_id,
                )
            )

    can_ai_log(
        "baseline_selected",
        session=session_id,
        applied=baseline_context.get("applied"),
        selection=baseline_context.get("selection"),
        baseline_session=baseline_context.get("session_id"),
        feature_count=len(baseline_features),
        reason=baseline_context.get("reason"),
    )

    _, marker_selection_preview = select_analysis_markers(
        marker_dicts,
        baseline_mode=baseline_mode,
    )

    can_ai_log(
        "statistics_started",
        session=session_id,
        analysis_mode=analysis_mode,
        frames=len(frames),
        markers=len(marker_dicts),
        selected_action_markers=marker_selection_preview.get("action_markers"),
        marker_strategy=marker_selection_preview.get("strategy"),
    )

    try:
        candidates, deltas, heatmap, marker_selection = analyze_frames(
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

    if not baseline_mode:
        apply_baseline_subtraction(
            candidates,
            baseline_features,
            baseline_context,
        )

    # Preserve the statistical/baseline-adjusted score even when no model exists.
    for candidate in candidates:
        candidate.confidence_before_ml = candidate.confidence

    ml_context: dict[str, Any]
    ml_model: dict[str, Any]

    if baseline_mode:
        ml_context = {
            "applied": False,
            "found": False,
            "selection": "not_applicable",
            "reason": (
                "Baseline profiles are not candidate-classification targets."
            ),
        }
        ml_model = {}
    elif not payload.use_ml_model:
        ml_context = {
            "applied": False,
            "found": False,
            "selection": "disabled",
            "reason": "Supervised model use was disabled for this request.",
        }
        ml_model = {}
    else:
        try:
            async with pool.acquire() as conn:
                ml_context, ml_model = await load_active_ml_model(
                    conn,
                    vehicle_id=session["vehicle_id"],
                    mission_code=session_dict.get("mission_code"),
                    bus_interface=session_dict.get("bus_interface"),
                    bus_mode=session_dict.get("bus_mode"),
                    capture_kind=capture_kind_for(
                        session_dict.get("bus_interface"),
                        session_dict.get("bus_mode"),
                    ),
                    requested_model_id=payload.ml_model_id,
                )
        except HTTPException as exc:
            if exc.status_code == 503:
                ml_context = {
                    "applied": False,
                    "found": False,
                    "selection": "unavailable",
                    "reason": exc.detail,
                }
                ml_model = {}
            else:
                raise

    if ml_context.get("applied"):
        apply_supervised_model(
            candidates,
            ml_model,
            ml_context,
        )

    can_ai_log(
        "ml_model_selected",
        session=session_id,
        applied=ml_context.get("applied"),
        selection=ml_context.get("selection"),
        model_id=ml_context.get("model_id"),
        label_count=ml_context.get("label_count"),
        reason=ml_context.get("reason"),
    )

    baseline_profile = build_baseline_profile(frames, candidates) if baseline_mode else None

    embedding_text: Optional[str] = None
    query_embedding: Optional[list[float]] = None
    vector_context: dict[str, Any] = {
        "requested": payload.use_embeddings,
        "query_embedded": False,
        "retrieved": False,
        "match_count": 0,
        "matches": [],
        "stored": False,
        "confidence_influence": False,
    }

    if payload.use_embeddings and candidates:
        embedding_text = build_embedding_document(
            session_dict,
            candidates,
            analysis_mode,
            payload.marker_window_ms,
            baseline_context,
            ml_context,
        )
        can_ai_log(
            "vector_memory_embedding_started",
            session=session_id,
            model=payload.embed_model,
            document_chars=len(embedding_text),
        )
        vector_phase_started = time.perf_counter()
        query_embedding = await call_ollama_embed(
            payload.embed_model,
            embedding_text,
        )
        if query_embedding and len(query_embedding) == VECTOR_DIMENSION:
            async with pool.acquire() as conn:
                vector_context = await retrieve_vector_memory(
                    conn,
                    query_embedding=query_embedding,
                    session=session_dict,
                    analysis_mode=analysis_mode,
                    embed_model=payload.embed_model,
                )
            apply_vector_historical_support(candidates, vector_context)
        elif query_embedding:
            vector_context.update({
                "query_embedded": False,
                "error": (
                    f"Embedding dimension {len(query_embedding)} does not "
                    f"match schema vector({VECTOR_DIMENSION})."
                ),
                "reason": "Embedding dimension mismatch.",
            })
            query_embedding = None
        else:
            vector_context.update({
                "query_embedded": False,
                "error": "Embedding request failed or returned no embedding.",
                "reason": "Query embedding was unavailable.",
            })

        can_ai_log(
            "vector_memory_retrieval_completed",
            session=session_id,
            query_embedded=vector_context.get("query_embedded"),
            retrieved=vector_context.get("retrieved"),
            match_count=vector_context.get("match_count"),
            error=vector_context.get("error"),
            elapsed_ms=round(
                (time.perf_counter() - vector_phase_started) * 1000,
                2,
            ),
        )
    elif payload.use_embeddings:
        vector_context["reason"] = "No candidates were available to embed."
    else:
        vector_context["reason"] = "Vector memory was disabled for this request."

    can_ai_log(
        "statistics_completed",
        session=session_id,
        candidates=len(candidates),
        deltas=len(deltas),
        heatmap_ids=len(heatmap),
        baseline_applied=baseline_context.get("applied"),
        baseline_session=baseline_context.get("session_id"),
        ml_applied=ml_context.get("applied"),
        ml_model_id=ml_context.get("model_id"),
        vector_matches=vector_context.get("match_count"),
        top_candidate=(
            candidates[0].can_id_hex
            if candidates
            else None
        ),
        top_confidence=(
            candidates[0].confidence
            if candidates
            else None
        ),
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
                baseline_context,
                ml_context,
                vector_context,
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

    fallback_report = build_fallback_report(
        session_id=session_id,
        analysis_mode=analysis_mode,
        frames_count=len(frames),
        markers_count=len(marker_dicts),
        candidates=candidates,
        baseline_profile=baseline_profile,
        baseline_context=baseline_context,
        ml_context=ml_context,
        vector_context=vector_context,
    )

    repaired_report_sections: list[int] = []
    if llm_response:
        report_content, repaired_report_sections = (
            ensure_complete_five_section_report(
                llm_response,
                fallback_report,
            )
        )
    else:
        report_content = fallback_report

    report_sections_present = sorted(
        split_numbered_report_sections(report_content).keys()
    )

    can_ai_log(
        "report_selected",
        session=session_id,
        source="llm" if llm_response else "fallback",
        report_chars=len(report_content),
        report_sections=report_sections_present,
        repaired_sections=repaired_report_sections,
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
                                "baseline_applied": c.baseline_applied,
                                "baseline_session_id": c.baseline_session_id,
                                "baseline_id_present": c.baseline_id_present,
                                "baseline_overlap_score": c.baseline_overlap_score,
                                "baseline_penalty": c.baseline_penalty,
                                "baseline_adjusted_change_ratio": (
                                    c.baseline_adjusted_change_ratio
                                ),
                                "confidence_before_baseline": (
                                    c.confidence_before_baseline
                                ),
                                "baseline_evidence": c.baseline_evidence,
                                "ml_applied": c.ml_applied,
                                "ml_model_id": c.ml_model_id,
                                "ml_probability": c.ml_probability,
                                "ml_blend_weight": c.ml_blend_weight,
                                "confidence_before_ml": c.confidence_before_ml,
                                "ml_feature_vector": c.ml_feature_vector,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
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
                                "baseline_applied": c.baseline_applied,
                                "baseline_session_id": c.baseline_session_id,
                                "baseline_id_present": c.baseline_id_present,
                                "baseline_overlap_score": c.baseline_overlap_score,
                                "baseline_penalty": c.baseline_penalty,
                                "baseline_adjusted_change_ratio": (
                                    c.baseline_adjusted_change_ratio
                                ),
                                "confidence_before_baseline": (
                                    c.confidence_before_baseline
                                ),
                                "baseline_evidence": c.baseline_evidence,
                                "ml_applied": c.ml_applied,
                                "ml_model_id": c.ml_model_id,
                                "ml_probability": c.ml_probability,
                                "ml_blend_weight": c.ml_blend_weight,
                                "confidence_before_ml": c.confidence_before_ml,
                                "ml_feature_vector": c.ml_feature_vector,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
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

                existing_report = await conn.fetchrow(
                    """
                    SELECT id, metadata
                    FROM session_reports
                    WHERE session_id = $1
                      AND report_type = 'ai_analysis'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    session_id,
                )
                previous_report_metadata = metadata_dict(
                    existing_report.get("metadata")
                    if existing_report
                    else None
                )
                analysis_revision = int(
                    previous_report_metadata.get("analysis_revision", 0) or 0
                ) + 1

                report_title = (
                    f"CAN baseline profile for {session_dict.get('vehicle_slug')} session {session_id}"
                    if baseline_mode
                    else f"AI CAN analysis for {session_dict.get('vehicle_slug')} session {session_id}"
                )
                report_metadata = {
                    "vehicle_slug": session_dict.get("vehicle_slug"),
                    "analysis_mode": analysis_mode,
                    "analysis_revision": analysis_revision,
                    "report_storage": "replace_latest_per_session",
                    "baseline_profile": baseline_profile,
                    "target_expected": not baseline_mode,
                    "baseline_subtraction": baseline_context,
                    "supervised_ml": ml_context,
                    "vector_memory": vector_context,
                    "marker_window_ms": payload.marker_window_ms,
                    "marker_selection": marker_selection,
                    "frame_selection": frame_selection,
                    "confidence_semantics": CONFIDENCE_SEMANTICS,
                    "frames_analyzed": len(frames),
                    "frames_available": frame_selection.get("total_frames"),
                    "markers": len(marker_dicts),
                    "model": resolved_llm_model,
                    "ollama_url": OLLAMA_URL,
                    "llm_deadline_seconds": LLM_DEADLINE_SECONDS,
                    "llm_http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
                    "llm_num_ctx": LLM_NUM_CTX,
                    "llm_num_predict": LLM_NUM_PREDICT,
                    "llm_candidate_limit": LLM_CANDIDATE_LIMIT,
                    "llm_byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
                    "ollama_keep_alive": OLLAMA_KEEP_ALIVE,
                    "llm_requested": payload.use_llm,
                    "llm_succeeded": llm_response is not None,
                    "analysis_source": "llm" if llm_response else "fallback",
                    "llm_error": llm_error,
                    "llm_timed_out": llm_timed_out,
                    "report_sections_present": report_sections_present,
                    "report_repaired_sections": repaired_report_sections,
                    "marker_window_coverage": (
                        candidates[0].marker_window_coverage
                        if candidates
                        else 0.0
                    ),
                    "generation": generation_metadata,
                    "deltas_computed": len(deltas),
                    "deltas_persisted": len(deltas_to_persist),
                    "top_candidates": persisted_top_candidates,
                    "heatmap": persisted_heatmap,
                }

                if existing_report:
                    report_row = await conn.fetchrow(
                        """
                        UPDATE session_reports
                        SET
                            title = $2,
                            content = $3,
                            metadata = $4::jsonb,
                            created_at = NOW()
                        WHERE id = $1
                        RETURNING id
                        """,
                        existing_report["id"],
                        report_title,
                        report_content,
                        json_dumps(report_metadata),
                    )
                    await conn.execute(
                        """
                        DELETE FROM session_reports
                        WHERE session_id = $1
                          AND report_type = 'ai_analysis'
                          AND id <> $2
                        """,
                        session_id,
                        report_row["id"],
                    )
                else:
                    report_row = await conn.fetchrow(
                        """
                        INSERT INTO session_reports (
                            session_id,
                            report_type,
                            title,
                            content,
                            metadata
                        )
                        VALUES ($1, 'ai_analysis', $2, $3, $4::jsonb)
                        RETURNING id
                        """,
                        session_id,
                        report_title,
                        report_content,
                        json_dumps(report_metadata),
                    )


                if payload.use_llm and llm_response:
                    prompt = build_llm_prompt(
                        session_dict,
                        marker_dicts,
                        candidates,
                        analysis_mode,
                        baseline_profile,
                        baseline_context,
                        ml_context,
                        vector_context,
                    )
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
                            "baseline_subtraction": baseline_context,
                            "supervised_ml": ml_context,
                            "vector_memory": vector_context,
                            "marker_window_ms": payload.marker_window_ms,
                        }),
                    )

                embedding_inserted = False
                embedding_error = vector_context.get("error")
                if query_embedding is not None and embedding_text is not None:
                    try:
                        await conn.execute(
                            """
                            DELETE FROM signal_embeddings
                            WHERE session_id = $1
                              AND COALESCE(metadata->>'model', '') = $2
                              AND COALESCE(metadata->>'analysis_mode', '') = $3
                            """,
                            session_id,
                            payload.embed_model,
                            analysis_mode,
                        )
                        await conn.execute(
                            """
                            INSERT INTO signal_embeddings (
                                vehicle_id,
                                session_id,
                                text,
                                embedding,
                                metadata
                            )
                            VALUES ($1, $2, $3, $4::vector, $5::jsonb)
                            """,
                            session["vehicle_id"],
                            session_id,
                            embedding_text,
                            vector_literal(query_embedding),
                            json_dumps({
                                "schema_version": VECTOR_MEMORY_SCHEMA_VERSION,
                                "model": payload.embed_model,
                                "dimension": len(query_embedding),
                                "vehicle_slug": session_dict.get("vehicle_slug"),
                                "mission_code": session_dict.get("mission_code"),
                                "bus_interface": session_dict.get("bus_interface"),
                                "bus_mode": session_dict.get("bus_mode"),
                                "capture_kind": capture_kind_for(
                                    session_dict.get("bus_interface"),
                                    session_dict.get("bus_mode"),
                                ),
                                "analysis_mode": analysis_mode,
                                "marker_window_ms": payload.marker_window_ms,
                                "baseline_subtraction": baseline_context,
                                "supervised_ml": ml_context,
                                "retrieved_session_ids": [
                                    match.get("session_id")
                                    for match in vector_context.get("matches", [])
                                    if isinstance(match, dict)
                                ],
                                "top_candidates": [
                                    embedding_candidate_metadata(candidate)
                                    for candidate in candidates[:10]
                                ],
                            }),
                        )
                        embedding_inserted = True
                    except Exception as exc:
                        embedding_error = f"{type(exc).__name__}: {exc}"

                vector_context["stored"] = embedding_inserted
                vector_context["storage_error"] = embedding_error
                await conn.execute(
                    """
                    UPDATE session_reports
                    SET metadata = metadata || jsonb_build_object(
                        'vector_memory', $2::jsonb
                    )
                    WHERE id = $1
                    """,
                    report_row["id"],
                    json_dumps(vector_context),
                )

                can_ai_log(
                    "vector_memory_storage_completed",
                    session=session_id,
                    model=payload.embed_model,
                    inserted=embedding_inserted,
                    error=embedding_error,
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
        "baseline_subtraction": baseline_context,
        "supervised_ml": ml_context,
        "target_expected": not baseline_mode,
        "frames_analyzed": len(frames),
        "short_dlc_frames": short_dlc_frames,
        "invalid_width_frames": invalid_width_frames,
        "markers": len(marker_dicts),
        "selected_action_markers": marker_selection.get("action_markers"),
        "marker_selection": marker_selection,
        "marker_window_ms": payload.marker_window_ms,
        "marker_window_coverage": (
            candidates[0].marker_window_coverage
            if candidates
            else 0.0
        ),
        "vector_memory": vector_context,
        "frame_selection": frame_selection,
        "frames_available": frame_selection.get("total_frames"),
        "confidence_semantics": CONFIDENCE_SEMANTICS,
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
        "llm_runtime": {
            "ollama_url": OLLAMA_URL,
            "deadline_seconds": LLM_DEADLINE_SECONDS,
            "http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
            "num_ctx": LLM_NUM_CTX,
            "num_predict": LLM_NUM_PREDICT,
            "candidate_limit": LLM_CANDIDATE_LIMIT,
            "byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            "baseline_penalty_weight": BASELINE_PENALTY_WEIGHT,
            "ml_blend_weight": ML_BLEND_WEIGHT,
        },
        "llm_error": llm_error,
        "llm_timed_out": llm_timed_out,
        "report_sections_present": report_sections_present,
        "report_repaired_sections": repaired_report_sections,
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
        "baseline_subtraction": latest_report_metadata.get("baseline_subtraction"),
        "supervised_ml": latest_report_metadata.get("supervised_ml"),
        "vector_memory": latest_report_metadata.get("vector_memory"),
        "marker_selection": latest_report_metadata.get("marker_selection"),
        "frame_selection": latest_report_metadata.get("frame_selection"),
        "frames_available": latest_report_metadata.get("frames_available"),
        "confidence_semantics": latest_report_metadata.get(
            "confidence_semantics",
            CONFIDENCE_SEMANTICS,
        ),
        "marker_window_ms": latest_report_metadata.get("marker_window_ms"),
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