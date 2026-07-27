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
    apply_candidate_label_priors,
    apply_supervised_model,
    load_candidate_label_priors,
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
QUICK_ID_BIT_FIRST_METHOD = "bit_first_opposing_actions"
QUICK_ID_ORDINAL_FIELD_METHOD = "field_first_ordinal_levels"
QUICK_ID_CONTINUOUS_FIELD_METHOD = "field_first_continuous_trace"
QUICK_ID_ENUM_FIELD_METHOD = "field_first_enum_state"
QUICK_ID_PULSE_METHOD = "pulse_event"
QUICK_ID_FALLBACK_METHOD = "aggregate_id_fallback"

ANALYZER_PROFILE_BASELINE = "baseline_profile"
ANALYZER_PROFILE_BOOLEAN = "boolean_transition"
ANALYZER_PROFILE_ORDINAL = "ordinal_level"
ANALYZER_PROFILE_CONTINUOUS = "continuous_trace"
ANALYZER_PROFILE_ENUM = "enum_state"
ANALYZER_PROFILE_PULSE = "pulse_event"
FIELD_ANALYZER_PROFILES = {
    ANALYZER_PROFILE_ORDINAL,
    ANALYZER_PROFILE_CONTINUOUS,
    ANALYZER_PROFILE_ENUM,
}



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

    role_counts = Counter(
        hypothesis.hypothesis_kind
        for candidate in candidates
        for hypothesis in candidate.byte_role_hypotheses
    )

    return {
        "kind": ANALYSIS_MODE_BASELINE,
        "target_expected": False,
        "total_frames": total_frames,
        "observed_ids": observed_ids,
        "byte_role_counts": dict(role_counts),
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
                f"bytes={candidate.byte_change_counts}, roles={compact_byte_roles(candidate)}"
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
    allow_low_quality: bool = False


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
    byte_delta_counts: dict[str, int] = Field(default_factory=dict)
    byte_modulo_delta_counts: dict[str, int] = Field(default_factory=dict)
    low_nibble_delta_counts: dict[str, int] = Field(default_factory=dict)
    high_nibble_delta_counts: dict[str, int] = Field(default_factory=dict)
    hamming_distance_counts: dict[str, int] = Field(default_factory=dict)
    transition_step_counts: dict[str, int] = Field(default_factory=dict)
    inverse_transition_pairs: list[dict[str, Any]] = Field(default_factory=list)
    transition_symmetry_score: float = 0.0

    # These three compatibility fields are populated only when all explicit
    # action groups agree. ON and OFF groups are never pooled into one mode.
    pre_marker_mode: Optional[int]
    action_window_mode: Optional[int]
    post_marker_mode: Optional[int]

    bit_flip_counts: dict[str, int]
    median_marker_latency_ms: Optional[float]
    in_window_changes: int
    out_of_window_changes: int
    marker_transition_coverage: float = 0.0
    transition_score: float = 0.0
    encoding_hint: str = "unknown"
    marker_observations: list[MarkerObservation] = Field(default_factory=list)
    action_group_modes: dict[str, Any] = Field(default_factory=dict)


class ByteRoleHypothesis(BaseModel):
    byte_index: int
    hypothesis_kind: str
    confidence: float
    bit_mask: Optional[int] = None
    auto_detected: bool = True
    source: str = "auto_analysis"
    validation_status: str = "unreviewed"
    reason: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class FieldMarkerObservation(BaseModel):
    marker_type: str
    step_code: Optional[str]
    label: Optional[str]
    action_key: str
    timestamp_ms: int
    expected_value: float
    expected_unit: Optional[str] = None
    expected_direction: Optional[str] = None
    pre_value: Optional[float]
    action_value: Optional[float]
    post_value: Optional[float]
    plateau_mad: Optional[float]
    response_latency_ms: Optional[float]
    hold_ms: int


class FieldSignalHypothesis(BaseModel):
    start_byte: int
    width_bits: int
    endianness: str
    signed: bool
    score: float
    monotonicity: float
    observed_direction: str
    level_separation: float
    repeatability: float
    plateau_stability: float
    return_consistency: float
    outside_action_drift: float
    response_latency_score: float
    marker_coverage: float
    location_dominance: float = 0.0
    baseline_penalty: float = 0.0
    baseline_adjusted_score: Optional[float] = None
    expected_levels: list[float] = Field(default_factory=list)
    observed_level_medians: dict[str, float] = Field(default_factory=dict)
    observations: list[FieldMarkerObservation] = Field(default_factory=list)
    reason: str


class BitSignalHypothesis(BaseModel):
    byte_index: int
    bit_index: int
    bit_mask: int
    score: float
    marker_lift: float
    window_purity: float
    outside_action_fraction: float
    repetition_score: float
    single_flip_score: float
    location_dominance: float
    total_flips: int
    in_window_flips: int
    out_of_window_flips: int
    matched_repetitions: int
    total_repetitions: int
    inverse_pair_verified: bool
    median_latency_ms: Optional[float] = None
    baseline_penalty: float = 0.0
    baseline_adjusted_score: Optional[float] = None
    action_groups: dict[str, Any] = Field(default_factory=dict)
    reason: str


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
    byte_role_hypotheses: list[ByteRoleHypothesis] = Field(default_factory=list)
    signal_hypotheses: list[BitSignalHypothesis] = Field(default_factory=list)
    field_hypotheses: list[FieldSignalHypothesis] = Field(default_factory=list)
    analyzer_profile: str = ANALYZER_PROFILE_BOOLEAN
    quick_id_method: str = QUICK_ID_FALLBACK_METHOD
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
    byte_transition_score: float = 0.0
    byte_transition_evidence: dict[str, Any] = Field(default_factory=dict)

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
    confidence_before_label_prior: float = 0.0
    label_prior_applied: bool = False
    label_prior: dict[str, Any] = Field(default_factory=dict)

    # Read-only cross-session evidence from scoped vector retrieval. This is
    # deliberately excluded from the numerical confidence calculation.
    historical_support: dict[str, Any] = Field(default_factory=dict)

    confidence_before_human_byte_roles: float = 0.0
    human_byte_role_applied: bool = False
    human_byte_role_penalty: float = 0.0
    human_byte_role_evidence: dict[str, Any] = Field(default_factory=dict)


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


def top_count_map(counter: Counter[Any], limit: int = 8) -> dict[str, int]:
    return {
        str(value): int(count)
        for value, count in counter.most_common(limit)
        if count > 0
    }


def dominant_count_fraction(counter: Counter[Any], keys: set[Any]) -> float:
    total = sum(counter.values())
    if total <= 0:
        return 0.0
    return sum(count for value, count in counter.items() if value in keys) / total


def byte_encoding_hint(
    *,
    unique_values: int,
    hamming_distance_counts: Counter[int],
    byte_modulo_delta_counts: Counter[int],
    low_nibble_delta_counts: Counter[int],
    high_nibble_delta_counts: Counter[int],
) -> str:
    full_counter_fraction = dominant_count_fraction(
        byte_modulo_delta_counts,
        {1, 255},
    )
    low_counter_fraction = dominant_count_fraction(
        low_nibble_delta_counts,
        {1, 15},
    )
    high_counter_fraction = dominant_count_fraction(
        high_nibble_delta_counts,
        {1, 15},
    )
    bit_flip_fraction = dominant_count_fraction(
        hamming_distance_counts,
        {1},
    )

    if unique_values <= 1:
        return "constant"
    if unique_values >= 4 and full_counter_fraction >= 0.70:
        return "full_byte_modulo_counter"
    if unique_values >= 4 and low_counter_fraction >= 0.70:
        return "low_nibble_modulo_counter"
    if unique_values >= 4 and high_counter_fraction >= 0.70:
        return "high_nibble_modulo_counter"
    if unique_values <= 4 and bit_flip_fraction >= 0.65:
        return "sparse_bitfield_or_enum"
    if unique_values <= 16:
        return "enum_or_small_encoded_field"
    return "encoded_byte_or_noise"


BACKGROUND_BYTE_ROLE_KINDS = {
    "constant",
    "rolling_counter",
    "checksum_candidate",
    "payload_or_noise",
}


def byte_role_map(
    roles: list[ByteRoleHypothesis],
) -> dict[int, ByteRoleHypothesis]:
    """Select the effective structural role for each byte.

    A human rejection vetoes the matching auto suggestion. Confirmed human
    classifications outrank uncertain and auto suggestions. This lets Playback
    and Top IDs share one saved decision without allowing an old auto role to
    silently override it during the next analysis.
    """
    by_byte: dict[int, list[ByteRoleHypothesis]] = defaultdict(list)
    for role in roles:
        by_byte[role.byte_index].append(role)

    selected: dict[int, ByteRoleHypothesis] = {}
    for byte_index, items in by_byte.items():
        rejected_kinds = {
            item.hypothesis_kind
            for item in items
            if item.source == "human"
            and item.validation_status == "negative"
        }
        eligible = [
            item
            for item in items
            if item.validation_status != "negative"
            and not (
                item.source != "human"
                and item.hypothesis_kind in rejected_kinds
            )
        ]
        if not eligible:
            continue

        def priority(item: ByteRoleHypothesis) -> tuple[int, float]:
            if item.source == "human" and item.validation_status == "positive":
                rank = 4
            elif item.source == "human" and item.validation_status == "uncertain":
                rank = 3
            elif item.source == "human":
                rank = 2
            else:
                rank = 1
            return rank, float(item.confidence)

        selected[byte_index] = max(eligible, key=priority)
    return selected


def byte_role_score_factor(role: Optional[ByteRoleHypothesis]) -> float:
    if role is None or role.validation_status == "negative":
        return 1.0

    kind = role.hypothesis_kind
    human = role.source == "human"
    status = role.validation_status

    if kind == "constant":
        if human and status == "positive":
            return 0.0
        if human and status == "uncertain":
            return 0.45
        return 0.20
    if kind == "rolling_counter":
        if human and status == "positive":
            return 0.20
        if human and status == "uncertain":
            return 0.55
        return 0.35
    if kind == "checksum_candidate":
        if human and status == "positive":
            return 0.15
        if human and status == "uncertain":
            return 0.45
        return 0.25
    if kind == "payload_or_noise":
        if human and status == "positive":
            return 0.50
        if human and status == "uncertain":
            return 0.75
    return 1.0


def byte_inverse_transition_evidence(
    observations: list[MarkerObservation],
) -> tuple[dict[str, int], list[dict[str, Any]], float]:
    transition_step_counts: Counter[int] = Counter()
    transition_groups: dict[tuple[int, int], list[int]] = defaultdict(list)

    for observation in observations:
        if observation.change_count > 0:
            transition_step_counts[int(observation.change_count)] += 1

        source = observation.pre_mode
        target = (
            observation.action_mode
            if observation.action_mode is not None
            else observation.post_mode
        )
        if source is None or target is None or source == target:
            continue
        transition_groups[(int(source), int(target))].append(
            max(0, int(observation.change_count)),
        )

    pairs: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    weighted_score = 0.0
    weight_total = 0

    for transition, forward_counts in transition_groups.items():
        if transition in seen:
            continue
        inverse = (transition[1], transition[0])
        inverse_counts = transition_groups.get(inverse)
        if not inverse_counts:
            continue
        seen.add(transition)
        seen.add(inverse)

        forward_median = float(statistics.median(forward_counts))
        inverse_median = float(statistics.median(inverse_counts))
        denominator = max(forward_median, inverse_median, 1.0)
        symmetry = 1.0 - min(
            1.0,
            abs(forward_median - inverse_median) / denominator,
        )
        support = len(forward_counts) + len(inverse_counts)
        weighted_score += symmetry * support
        weight_total += support
        pairs.append(
            {
                "from": transition[0],
                "to": transition[1],
                "from_hex": f"0x{transition[0]:02X}",
                "to_hex": f"0x{transition[1]:02X}",
                "forward_samples": len(forward_counts),
                "inverse_samples": len(inverse_counts),
                "forward_median_steps": round(forward_median, 3),
                "inverse_median_steps": round(inverse_median, 3),
                "symmetry_score": round(symmetry, 6),
            }
        )

    pairs.sort(
        key=lambda item: (
            item.get("symmetry_score", 0),
            item.get("forward_samples", 0) + item.get("inverse_samples", 0),
        ),
        reverse=True,
    )
    symmetry_score = (
        weighted_score / weight_total
        if weight_total > 0
        else 0.0
    )
    return top_count_map(transition_step_counts), pairs[:8], round(symmetry_score, 6)


def strongest_byte_transition(
    evidence: list[ByteEvidence],
    roles: list[ByteRoleHypothesis],
) -> tuple[Optional[ByteEvidence], float, dict[str, Any]]:
    roles_by_byte = byte_role_map(roles)
    best_item: Optional[ByteEvidence] = None
    best_score = 0.0
    best_payload: dict[str, Any] = {}

    for item in evidence:
        if item.change_count <= 0:
            continue
        role = roles_by_byte.get(item.byte_index)
        raw_score = float(item.transition_score)
        factor = byte_role_score_factor(role)
        score = raw_score * factor
        role_kind = role.hypothesis_kind if role else "unknown"
        if role_kind == "rolling_counter" and factor < 1.0:
            score = min(score, 0.15 if role and role.source == "human" else 0.25)
        elif role_kind == "checksum_candidate" and factor < 1.0:
            score = min(score, 0.12 if role and role.source == "human" else 0.20)
        elif role_kind == "constant" and factor < 1.0:
            score = min(score, 0.10)

        if score <= best_score:
            continue

        best_item = item
        best_score = score
        best_payload = {
            "byte_index": item.byte_index,
            "score": round(score, 6),
            "raw_transition_score": item.transition_score,
            "marker_transition_coverage": item.marker_transition_coverage,
            "in_window_changes": item.in_window_changes,
            "out_of_window_changes": item.out_of_window_changes,
            "change_count": item.change_count,
            "encoding_hint": item.encoding_hint,
            "transition_step_counts": item.transition_step_counts,
            "transition_symmetry_score": item.transition_symmetry_score,
            "inverse_transition_pairs": item.inverse_transition_pairs,
            "byte_role": role_kind,
            "byte_role_source": role.source if role else None,
            "byte_role_validation_status": role.validation_status if role else None,
            "byte_role_score_factor": round(factor, 6),
            "byte_modulo_delta_counts": item.byte_modulo_delta_counts,
            "low_nibble_delta_counts": item.low_nibble_delta_counts,
            "high_nibble_delta_counts": item.high_nibble_delta_counts,
            "hamming_distance_counts": item.hamming_distance_counts,
        }

    return best_item, round(best_score, 6), best_payload


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


def marker_action_duration_ms(
    marker: dict[str, Any],
    default_window_ms: int,
) -> int:
    """Return the expected action hold plus a bounded recovery tolerance.

    Mission markers are posted at action onset, while many vehicle ECUs update
    later in the hold or again when the control returns to rest. Restricting the
    evidence window to the first 300 ms discards both legitimate delayed updates
    and the return transition.
    """
    metadata = metadata_dict(marker.get("metadata"))
    step_metadata = metadata_dict(metadata.get("step_metadata"))
    combined = {**step_metadata, **metadata}

    raw_duration = combined.get(
        "hold_ms",
        combined.get("planned_duration_ms", default_window_ms),
    )
    try:
        duration_ms = int(float(raw_duration))
    except (TypeError, ValueError):
        duration_ms = int(default_window_ms)

    duration_ms = max(int(default_window_ms), min(duration_ms, 10_000))
    recovery_ms = max(100, min(int(default_window_ms), 1_000))
    return duration_ms + recovery_ms


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
        byte_delta_counts: Counter[int] = Counter()
        byte_modulo_delta_counts: Counter[int] = Counter()
        low_nibble_delta_counts: Counter[int] = Counter()
        high_nibble_delta_counts: Counter[int] = Counter()
        hamming_distance_counts: Counter[int] = Counter()

        for previous, current in zip(rows, rows[1:]):
            if previous.segment_id != current.segment_id:
                continue

            previous_value = frame_byte(previous, byte_index)
            current_value = frame_byte(current, byte_index)
            if previous_value == current_value:
                continue

            change_timestamps.append(current.timestamp_ms)
            changed_bits = previous_value ^ current_value
            byte_delta_counts[int(current_value) - int(previous_value)] += 1
            byte_modulo_delta_counts[
                (int(current_value) - int(previous_value)) % 256
            ] += 1
            previous_low = previous_value & 0x0F
            current_low = current_value & 0x0F
            if previous_low != current_low:
                low_nibble_delta_counts[(current_low - previous_low) % 16] += 1
            previous_high = (previous_value >> 4) & 0x0F
            current_high = (current_value >> 4) & 0x0F
            if previous_high != current_high:
                high_nibble_delta_counts[(current_high - previous_high) % 16] += 1
            hamming_distance_counts[int(changed_bits).bit_count()] += 1
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

        for action_start, action_end, marker in marker_windows:
            marker_time = int(marker.get("timestamp_ms") or action_start)
            pre_start = marker_time - marker_window_ms
            pre_end = marker_time - 1
            post_start = action_end + 1
            post_end = action_end + marker_window_ms

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

        (
            transition_step_counts,
            inverse_transition_pairs,
            transition_symmetry_score,
        ) = byte_inverse_transition_evidence(observations)
        marker_transition_coverage = (
            sum(1 for observation in observations if observation.change_count > 0)
            / max(len(observations), 1)
            if marker_windows
            else 0.0
        )
        window_purity = (
            in_window_changes / max(len(change_timestamps), 1)
            if change_timestamps
            else 0.0
        )
        latency_score = 0.0
        if all_latencies:
            median_latency = float(statistics.median(all_latencies))
            latency_score = 1.0 / (
                1.0 + (median_latency / max(marker_window_ms, 1))
            )
        transition_score = (
            (marker_transition_coverage * 0.55)
            + (window_purity * 0.30)
            + (latency_score * 0.15)
        )
        if inverse_transition_pairs:
            transition_score = min(
                1.0,
                transition_score + (transition_symmetry_score * 0.10),
            )
        unique_value_count = len(set(values))

        evidence_rows.append(
            ByteEvidence(
                byte_index=byte_index,
                change_count=len(change_timestamps),
                unique_values=sorted(set(values))[:32],
                most_common_values=[
                    (int(value), int(count))
                    for value, count in Counter(values).most_common(5)
                ],
                byte_delta_counts=top_count_map(byte_delta_counts),
                byte_modulo_delta_counts=top_count_map(
                    byte_modulo_delta_counts,
                ),
                low_nibble_delta_counts=top_count_map(
                    low_nibble_delta_counts,
                ),
                high_nibble_delta_counts=top_count_map(
                    high_nibble_delta_counts,
                ),
                hamming_distance_counts=top_count_map(
                    hamming_distance_counts,
                ),
                transition_step_counts=transition_step_counts,
                inverse_transition_pairs=inverse_transition_pairs,
                transition_symmetry_score=transition_symmetry_score,
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
                marker_transition_coverage=round(
                    marker_transition_coverage,
                    6,
                ),
                transition_score=round(
                    min(1.0, max(0.0, transition_score)),
                    6,
                ),
                encoding_hint=byte_encoding_hint(
                    unique_values=unique_value_count,
                    hamming_distance_counts=hamming_distance_counts,
                    byte_modulo_delta_counts=byte_modulo_delta_counts,
                    low_nibble_delta_counts=low_nibble_delta_counts,
                    high_nibble_delta_counts=high_nibble_delta_counts,
                ),
                marker_observations=observations,
                action_group_modes=action_group_modes,
            )
        )

    return evidence_rows, byte_entropy


def marker_polarity(marker: dict[str, Any]) -> Optional[str]:
    """Classify explicit opposing actions without substring false positives."""
    text = " ".join(
        str(value or "")
        for value in (
            marker.get("step_code"),
            marker.get("label"),
            marker_action_key(marker),
        )
    ).lower().replace("-", "_")
    tokens = set(re.findall(r"[a-z0-9]+", text))

    negative_tokens = {
        "off", "release", "released", "close", "closed", "disable",
        "disabled", "deactivate", "deactivated", "inactive", "down",
    }
    positive_tokens = {
        "on", "press", "pressed", "open", "opened", "enable", "enabled",
        "activate", "activated", "active", "up",
    }
    if tokens & negative_tokens:
        return "off"
    if tokens & positive_tokens:
        return "on"
    return None


def has_opposing_action_markers(markers: list[dict[str, Any]]) -> bool:
    polarities = {
        polarity
        for marker in markers
        if (polarity := marker_polarity(marker)) is not None
    }
    return {"on", "off"}.issubset(polarities)



def combined_marker_metadata(marker: dict[str, Any]) -> dict[str, Any]:
    metadata = metadata_dict(marker.get("metadata"))
    step_metadata = metadata_dict(metadata.get("step_metadata"))
    return {**step_metadata, **metadata}


def marker_expected_value(marker: dict[str, Any]) -> Optional[float]:
    metadata = combined_marker_metadata(marker)
    value = metadata.get("expected_value")
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
        except ValueError:
            return None
        return parsed if math.isfinite(parsed) else None
    return None


def normalize_analyzer_profile(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    profile = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "boolean": ANALYZER_PROFILE_BOOLEAN,
        "bit": ANALYZER_PROFILE_BOOLEAN,
        "digital": ANALYZER_PROFILE_BOOLEAN,
        "ordinal": ANALYZER_PROFILE_ORDINAL,
        "levels": ANALYZER_PROFILE_ORDINAL,
        "analog_levels": ANALYZER_PROFILE_ORDINAL,
        "continuous": ANALYZER_PROFILE_CONTINUOUS,
        "analog": ANALYZER_PROFILE_CONTINUOUS,
        "trace": ANALYZER_PROFILE_CONTINUOUS,
        "enum": ANALYZER_PROFILE_ENUM,
        "categorical": ANALYZER_PROFILE_ENUM,
        "pulse": ANALYZER_PROFILE_PULSE,
        "baseline": ANALYZER_PROFILE_BASELINE,
    }
    profile = aliases.get(profile, profile)
    valid = {
        ANALYZER_PROFILE_BASELINE,
        ANALYZER_PROFILE_BOOLEAN,
        ANALYZER_PROFILE_ORDINAL,
        ANALYZER_PROFILE_CONTINUOUS,
        ANALYZER_PROFILE_ENUM,
        ANALYZER_PROFILE_PULSE,
    }
    return profile if profile in valid else None


def resolve_analyzer_profile(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    analysis_mode: str,
) -> str:
    if is_baseline_mode(analysis_mode):
        return ANALYZER_PROFILE_BASELINE

    # Step/marker metadata is the most specific contract.
    marker_profiles = [
        normalize_analyzer_profile(
            combined_marker_metadata(marker).get("analyzer_profile")
        )
        for marker in markers
    ]
    explicit_marker_profiles = [profile for profile in marker_profiles if profile]
    if explicit_marker_profiles:
        counts = Counter(explicit_marker_profiles)
        return counts.most_common(1)[0][0]

    session_metadata = metadata_dict(session.get("session_metadata"))
    mission_metadata = metadata_dict(session.get("mission_metadata"))
    frontend_metadata = metadata_dict(mission_metadata.get("frontend_metadata"))
    for metadata in (session_metadata, mission_metadata, frontend_metadata):
        profile = normalize_analyzer_profile(metadata.get("analyzer_profile"))
        if profile:
            return profile

    selected, _ = select_analysis_markers(markers, baseline_mode=False)
    if has_opposing_action_markers(selected):
        return ANALYZER_PROFILE_BOOLEAN

    numeric_values = [
        value
        for marker in selected
        if (value := marker_expected_value(marker)) is not None
    ]
    unique_values = sorted(set(numeric_values))
    if len(unique_values) >= 3:
        if any(value < 0 for value in unique_values):
            return ANALYZER_PROFILE_CONTINUOUS
        return ANALYZER_PROFILE_ORDINAL
    if len(unique_values) >= 2:
        return ANALYZER_PROFILE_CONTINUOUS
    return ANALYZER_PROFILE_BOOLEAN


def quick_id_method_for_profile(profile: str, opposing_actions: bool) -> str:
    if profile == ANALYZER_PROFILE_ORDINAL:
        return QUICK_ID_ORDINAL_FIELD_METHOD
    if profile == ANALYZER_PROFILE_CONTINUOUS:
        return QUICK_ID_CONTINUOUS_FIELD_METHOD
    if profile == ANALYZER_PROFILE_ENUM:
        return QUICK_ID_ENUM_FIELD_METHOD
    if profile == ANALYZER_PROFILE_PULSE:
        return QUICK_ID_PULSE_METHOD
    if profile == ANALYZER_PROFILE_BOOLEAN:
        return QUICK_ID_BIT_FIRST_METHOD
    return QUICK_ID_FALLBACK_METHOD


def median_float(values: list[float]) -> Optional[float]:
    return float(statistics.median(values)) if values else None


def median_absolute_deviation(values: list[float]) -> Optional[float]:
    if not values:
        return None
    center = float(statistics.median(values))
    return float(statistics.median(abs(value - center) for value in values))


def field_value(
    row: FrameRow,
    start_byte: int,
    width_bits: int,
    endianness: str,
    signed: bool,
) -> int:
    width_bytes = width_bits // 8
    payload = bytes(frame_byte(row, start_byte + index) for index in range(width_bytes))
    byteorder = "little" if endianness == "little" else "big"
    return int.from_bytes(payload, byteorder=byteorder, signed=signed)


def field_specs(
    markers: list[dict[str, Any]],
    session: Optional[dict[str, Any]] = None,
) -> list[tuple[int, int, str, bool]]:
    widths: set[int] = {8, 16}
    allow_signed = False
    allow_little = True
    allow_big = True
    metadata_sources: list[dict[str, Any]] = [
        combined_marker_metadata(marker) for marker in markers
    ]
    if session:
        session_metadata = metadata_dict(session.get("session_metadata"))
        mission_metadata = metadata_dict(session.get("mission_metadata"))
        metadata_sources.extend([session_metadata, mission_metadata])

    for metadata in metadata_sources:
        raw_widths = metadata.get("field_widths")
        if isinstance(raw_widths, list):
            parsed = {
                int(value)
                for value in raw_widths
                if isinstance(value, (int, float)) and int(value) in {8, 16, 24, 32}
            }
            if parsed:
                widths = parsed
        allow_signed = allow_signed or bool(metadata.get("allow_signed"))
        if metadata.get("allow_little_endian") is False:
            allow_little = False
        if metadata.get("allow_big_endian") is False:
            allow_big = False

    expected_values = [
        value
        for marker in markers
        if (value := marker_expected_value(marker)) is not None
    ]
    if any(value < 0 for value in expected_values):
        allow_signed = True

    specs: list[tuple[int, int, str, bool]] = []
    for width_bits in sorted(widths):
        width_bytes = width_bits // 8
        for start_byte in range(0, 9 - width_bytes):
            if width_bits == 8:
                specs.append((start_byte, width_bits, "big", False))
                if allow_signed:
                    specs.append((start_byte, width_bits, "big", True))
                continue
            for endianness, allowed in (("little", allow_little), ("big", allow_big)):
                if not allowed:
                    continue
                specs.append((start_byte, width_bits, endianness, False))
                if allow_signed:
                    specs.append((start_byte, width_bits, endianness, True))
    return specs


def pairwise_monotonicity(
    expected: list[float],
    observed: list[float],
) -> tuple[float, str]:
    concordant = 0
    discordant = 0
    for left in range(len(expected)):
        for right in range(left + 1, len(expected)):
            expected_delta = expected[right] - expected[left]
            observed_delta = observed[right] - observed[left]
            if expected_delta == 0 or observed_delta == 0:
                continue
            if expected_delta * observed_delta > 0:
                concordant += 1
            else:
                discordant += 1
    total = concordant + discordant
    if total == 0:
        return 0.0, "unknown"
    if concordant >= discordant:
        return concordant / total, "increasing"
    return discordant / total, "decreasing"


def build_field_signal_hypotheses(
    rows: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analyzer_profile: str,
    session: Optional[dict[str, Any]] = None,
) -> list[FieldSignalHypothesis]:
    """Rank exact numeric fields against marker-declared expected levels.

    Aggregate CAN-ID activity never increases this score. A field wins by
    matching expected marker levels, remaining stable during holds, returning
    consistently, and avoiding significant unexplained movement outside action
    intervals.
    """
    numeric_markers = [
        marker for marker in markers if marker_expected_value(marker) is not None
    ]
    if not rows or len(numeric_markers) < 2:
        return []

    rows = sorted(rows, key=lambda row: (row.timestamp_ms, row.id))
    timestamps = [row.timestamp_ms for row in rows]
    provisional: list[FieldSignalHypothesis] = []

    for start_byte, width_bits, endianness, signed in field_specs(numeric_markers, session):
        values = [
            float(field_value(row, start_byte, width_bits, endianness, signed))
            for row in rows
        ]
        if len(set(values)) < 2:
            continue

        observations: list[FieldMarkerObservation] = []
        action_intervals: list[tuple[int, int]] = []
        expected_values: list[float] = []
        observed_values: list[float] = []
        plateau_mads: list[float] = []
        latencies: list[float] = []

        for marker in numeric_markers:
            expected = marker_expected_value(marker)
            if expected is None:
                continue
            metadata = combined_marker_metadata(marker)
            marker_time = int(marker.get("timestamp_ms") or 0)
            planned_duration: object = metadata.get(
                "hold_ms",
                metadata.get("planned_duration_ms"),
            )
            hold_ms = marker_window_ms
            if (
                not isinstance(planned_duration, bool)
                and isinstance(planned_duration, (int, float, str))
            ):
                try:
                    hold_ms = int(planned_duration)
                except ValueError:
                    hold_ms = marker_window_ms
            hold_ms = max(marker_window_ms, min(hold_ms, 60_000))
            settle_ms = min(marker_window_ms, max(0, hold_ms // 3))
            action_start = marker_time + settle_ms
            action_end = marker_time + hold_ms
            action_intervals.append((marker_time, action_end))

            def values_between(start_ms: int, end_ms: int) -> list[float]:
                left = bisect_left(timestamps, start_ms)
                right = bisect_right(timestamps, end_ms)
                return values[left:right]

            pre_values = values_between(marker_time - marker_window_ms, marker_time - 1)
            action_values = values_between(action_start, action_end)
            post_values = values_between(
                action_end + 1,
                action_end + marker_window_ms,
            )
            pre_value = median_float(pre_values)
            action_value = median_float(action_values)
            post_value = median_float(post_values)
            plateau_mad = median_absolute_deviation(action_values)
            if action_value is None:
                continue

            response_latency: Optional[float] = None
            if pre_value is not None:
                raw_span = max(values) - min(values)
                threshold = max(1.0, raw_span * 0.02)
                left = bisect_left(timestamps, marker_time)
                right = bisect_right(timestamps, min(action_end, marker_time + (2 * marker_window_ms)))
                for index in range(left, right):
                    if abs(values[index] - pre_value) >= threshold:
                        response_latency = float(timestamps[index] - marker_time)
                        break

            observation = FieldMarkerObservation(
                marker_type=normalized_marker_type(marker),
                step_code=(str(marker.get("step_code")) if marker.get("step_code") is not None else None),
                label=(str(marker.get("label")) if marker.get("label") is not None else None),
                action_key=marker_action_key(marker),
                timestamp_ms=marker_time,
                expected_value=expected,
                expected_unit=(str(metadata.get("expected_unit")) if metadata.get("expected_unit") is not None else None),
                expected_direction=(str(metadata.get("expected_direction")) if metadata.get("expected_direction") is not None else None),
                pre_value=pre_value,
                action_value=action_value,
                post_value=post_value,
                plateau_mad=plateau_mad,
                response_latency_ms=response_latency,
                hold_ms=hold_ms,
            )
            observations.append(observation)
            expected_values.append(expected)
            observed_values.append(action_value)
            if plateau_mad is not None:
                plateau_mads.append(plateau_mad)
            if response_latency is not None:
                latencies.append(response_latency)

        if len(observations) < 2 or len(set(expected_values)) < 2:
            continue

        observed_span = max(observed_values) - min(observed_values)
        if observed_span <= 0:
            continue

        monotonicity, observed_direction = pairwise_monotonicity(
            expected_values,
            observed_values,
        )

        by_level: dict[float, list[float]] = defaultdict(list)
        for expected, observed in zip(expected_values, observed_values):
            by_level[expected].append(observed)
        level_medians = {
            level: float(statistics.median(level_values))
            for level, level_values in by_level.items()
        }
        ordered_levels = sorted(level_medians)
        adjacent_gaps = [
            abs(level_medians[right] - level_medians[left])
            for left, right in zip(ordered_levels, ordered_levels[1:])
        ]
        level_separation = (
            min(1.0, (min(adjacent_gaps) * max(len(adjacent_gaps), 1)) / observed_span)
            if adjacent_gaps
            else 0.0
        )

        repeated_deviations: list[float] = []
        for level, level_values in by_level.items():
            if len(level_values) < 2:
                continue
            center = float(statistics.median(level_values))
            repeated_deviations.extend(abs(value - center) for value in level_values)
        repeatability = 1.0 - min(
            1.0,
            (float(statistics.median(repeated_deviations)) / observed_span)
            if repeated_deviations else 0.0,
        )
        plateau_stability = 1.0 - min(
            1.0,
            (float(statistics.median(plateau_mads)) / observed_span)
            if plateau_mads else 1.0,
        )

        return_values = [
            combined_marker_metadata(marker).get("return_value")
            for marker in numeric_markers
        ]
        numeric_returns = [
            float(value)
            for value in return_values
            if isinstance(value, (int, float)) and math.isfinite(float(value))
        ]
        return_level = (
            float(statistics.median(numeric_returns))
            if numeric_returns
            else min(expected_values)
        )
        return_observed = [
            observed
            for expected, observed in zip(expected_values, observed_values)
            if abs(expected - return_level) < 1e-9
        ]
        if return_observed:
            return_center = float(statistics.median(return_observed))
            return_consistency = 1.0 - min(
                1.0,
                float(statistics.median(abs(value - return_center) for value in return_observed))
                / observed_span,
            )
        else:
            return_consistency = 0.5

        significant_threshold = max(1.0, observed_span * 0.02)
        merged_actions = merge_intervals(action_intervals)
        action_starts = [start for start, _ in merged_actions]
        significant_total = 0
        significant_outside = 0
        for previous, current in zip(rows, rows[1:]):
            if previous.segment_id != current.segment_id:
                continue
            previous_value = float(field_value(previous, start_byte, width_bits, endianness, signed))
            current_value = float(field_value(current, start_byte, width_bits, endianness, signed))
            if abs(current_value - previous_value) < significant_threshold:
                continue
            significant_total += 1
            if not timestamp_in_intervals(current.timestamp_ms, merged_actions, action_starts):
                significant_outside += 1
        outside_action_drift = (
            significant_outside / significant_total if significant_total else 0.0
        )

        response_latency_score = 0.5
        if latencies:
            median_latency = float(statistics.median(latencies))
            response_latency_score = 1.0 / (1.0 + median_latency / max(marker_window_ms, 1))
        marker_coverage = len(observations) / max(len(numeric_markers), 1)

        score = (
            (monotonicity * 0.30)
            + (level_separation * 0.20)
            + (repeatability * 0.15)
            + (return_consistency * 0.15)
            + (plateau_stability * 0.10)
            + (response_latency_score * 0.10)
        )
        score *= marker_coverage
        score *= (1.0 - outside_action_drift) ** 2

        if analyzer_profile == ANALYZER_PROFILE_ENUM:
            # Enum states need repeatable, well-separated levels but do not
            # require numeric order to carry meaning.
            score = (
                (level_separation * 0.35)
                + (repeatability * 0.25)
                + (plateau_stability * 0.15)
                + (return_consistency * 0.10)
                + (marker_coverage * 0.15)
            ) * ((1.0 - outside_action_drift) ** 2)

        provisional.append(FieldSignalHypothesis(
            start_byte=start_byte,
            width_bits=width_bits,
            endianness=endianness,
            signed=signed,
            score=round(min(1.0, max(0.0, score)), 6),
            monotonicity=round(monotonicity, 6),
            observed_direction=observed_direction,
            level_separation=round(level_separation, 6),
            repeatability=round(repeatability, 6),
            plateau_stability=round(plateau_stability, 6),
            return_consistency=round(return_consistency, 6),
            outside_action_drift=round(outside_action_drift, 6),
            response_latency_score=round(response_latency_score, 6),
            marker_coverage=round(marker_coverage, 6),
            expected_levels=ordered_levels,
            observed_level_medians={
                str(level): round(level_medians[level], 6)
                for level in ordered_levels
            },
            observations=observations,
            reason=(
                f"{width_bits}-bit {endianness} field at B{start_byte}; "
                f"monotonicity={monotonicity:.3f}, separation={level_separation:.3f}, "
                f"repeatability={repeatability:.3f}, outside_drift={outside_action_drift:.3f}"
            ),
        ))

    provisional.sort(key=lambda item: item.score, reverse=True)
    total_score = sum(item.score for item in provisional[:8])
    for item in provisional:
        item.location_dominance = round(
            item.score / max(total_score, 1e-9),
            6,
        )
    return provisional[:20]


def build_bit_signal_hypotheses(
    rows: list[FrameRow],
    marker_windows: list[tuple[int, int, dict[str, Any]]],
    marker_window_ms: int,
    marker_window_coverage: float,
) -> list[BitSignalHypothesis]:
    """Rank exact byte/bit locations for discrete ON/OFF-style missions.

    The score rewards one repeatable state transition at the same location for
    each action and directly penalizes flips outside action windows. Aggregate
    CAN-ID activity cannot increase this score.
    """
    if not rows or not marker_windows:
        return []

    row_timestamps = [row.timestamp_ms for row in rows]
    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )
    opposing_actions_present = has_opposing_action_markers(
        [marker for _, _, marker in marker_windows]
    )

    provisional: list[dict[str, Any]] = []
    total_in_window_flips_all_bits = 0

    for byte_index in range(8):
        byte_values = [frame_byte(row, byte_index) for row in rows]
        for bit_index in range(8):
            bit_mask = 1 << bit_index
            transition_events: list[tuple[int, int, int]] = []

            for previous, current in zip(rows, rows[1:]):
                if previous.segment_id != current.segment_id:
                    continue
                previous_state = 1 if frame_byte(previous, byte_index) & bit_mask else 0
                current_state = 1 if frame_byte(current, byte_index) & bit_mask else 0
                if previous_state != current_state:
                    transition_events.append(
                        (current.timestamp_ms, previous_state, current_state)
                    )

            if not transition_events:
                continue

            event_timestamps = [event[0] for event in transition_events]
            in_window_flips = sum(
                1
                for timestamp_ms in event_timestamps
                if timestamp_in_intervals(
                    timestamp_ms,
                    correlation_intervals,
                    correlation_starts,
                )
            )
            if in_window_flips == 0:
                continue

            total_flips = len(transition_events)
            out_of_window_flips = total_flips - in_window_flips
            total_in_window_flips_all_bits += in_window_flips

            observations: list[dict[str, Any]] = []
            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            matched_repetitions = 0
            exact_single_flips = 0
            latencies: list[float] = []

            bit_values = [1 if value & bit_mask else 0 for value in byte_values]

            def states_between(start_ms: int, end_ms: int) -> list[int]:
                left = bisect_left(row_timestamps, start_ms)
                right = bisect_right(row_timestamps, end_ms)
                return bit_values[left:right]

            for action_start, action_end, marker in marker_windows:
                marker_time = int(marker.get("timestamp_ms") or action_start)
                pre_states = states_between(
                    marker_time - marker_window_ms,
                    marker_time - 1,
                )
                action_states = states_between(action_start, action_end)
                post_states = states_between(
                    action_end + 1,
                    action_end + marker_window_ms,
                )

                left_event = bisect_left(event_timestamps, action_start)
                right_event = bisect_right(event_timestamps, action_end)
                window_events = transition_events[left_event:right_event]
                flip_count = len(window_events)
                pre_state = mode_value(pre_states)
                action_state = mode_value(action_states)
                post_state = mode_value(post_states)
                transition_matched = (
                    pre_state is not None
                    and action_state is not None
                    and pre_state != action_state
                    and flip_count >= 1
                )
                if transition_matched:
                    matched_repetitions += 1
                if flip_count == 1:
                    exact_single_flips += 1

                latency_ms: Optional[float] = None
                if window_events:
                    latency_ms = float(window_events[0][0] - marker_time)
                    if latency_ms >= 0:
                        latencies.append(latency_ms)

                action_key = marker_action_key(marker)
                observation = {
                    "action_key": action_key,
                    "polarity": marker_polarity(marker),
                    "timestamp_ms": marker_time,
                    "pre_state": pre_state,
                    "action_state": action_state,
                    "post_state": post_state,
                    "flip_count": flip_count,
                    "transition_matched": transition_matched,
                    "latency_ms": (
                        round(latency_ms, 2)
                        if latency_ms is not None
                        else None
                    ),
                }
                observations.append(observation)
                grouped[action_key].append(observation)

            total_repetitions = len(marker_windows)
            repetition_score = (
                matched_repetitions / total_repetitions
                if total_repetitions
                else 0.0
            )
            single_flip_score = (
                exact_single_flips / total_repetitions
                if total_repetitions
                else 0.0
            )
            window_purity = in_window_flips / max(total_flips, 1)
            outside_action_fraction = out_of_window_flips / max(total_flips, 1)
            marker_lift = (
                (window_purity - marker_window_coverage)
                / max(1.0 - marker_window_coverage, 1e-9)
                if window_purity > marker_window_coverage
                and marker_window_coverage < 1.0
                else 0.0
            )
            latency_score = 0.0
            median_latency_ms: Optional[float] = None
            if latencies:
                median_latency_ms = float(statistics.median(latencies))
                latency_score = 1.0 / (
                    1.0 + (median_latency_ms / max(marker_window_ms, 1))
                )

            action_groups: dict[str, Any] = {}
            valid_on_groups: list[dict[str, Any]] = []
            valid_off_groups: list[dict[str, Any]] = []
            for action_key, group_observations in grouped.items():
                pre_consensus = strict_consensus(
                    [item.get("pre_state") for item in group_observations]
                )
                action_consensus = strict_consensus(
                    [item.get("action_state") for item in group_observations]
                )
                post_consensus = strict_consensus(
                    [item.get("post_state") for item in group_observations]
                )
                polarity_values = {
                    item.get("polarity")
                    for item in group_observations
                    if item.get("polarity") is not None
                }
                polarity = (
                    next(iter(polarity_values))
                    if len(polarity_values) == 1
                    else None
                )
                matched = sum(
                    1
                    for item in group_observations
                    if item.get("transition_matched")
                )
                group_payload = {
                    "polarity": polarity,
                    "repetitions": len(group_observations),
                    "matched_repetitions": matched,
                    "consensus_pre_state": pre_consensus,
                    "consensus_action_state": action_consensus,
                    "consensus_post_state": post_consensus,
                    "flip_counts": [
                        int(item.get("flip_count") or 0)
                        for item in group_observations
                    ],
                }
                action_groups[action_key] = group_payload
                if (
                    pre_consensus is not None
                    and action_consensus is not None
                    and pre_consensus != action_consensus
                ):
                    if polarity == "on":
                        valid_on_groups.append(group_payload)
                    elif polarity == "off":
                        valid_off_groups.append(group_payload)

            inverse_pair_verified = any(
                on_group["consensus_pre_state"]
                    == off_group["consensus_action_state"]
                and off_group["consensus_pre_state"]
                    == on_group["consensus_action_state"]
                and on_group["consensus_action_state"]
                    != off_group["consensus_action_state"]
                for on_group in valid_on_groups
                for off_group in valid_off_groups
            )

            provisional.append({
                "byte_index": byte_index,
                "bit_index": bit_index,
                "bit_mask": bit_mask,
                "marker_lift": min(1.0, max(0.0, marker_lift)),
                "window_purity": window_purity,
                "outside_action_fraction": outside_action_fraction,
                "repetition_score": repetition_score,
                "single_flip_score": single_flip_score,
                "total_flips": total_flips,
                "in_window_flips": in_window_flips,
                "out_of_window_flips": out_of_window_flips,
                "matched_repetitions": matched_repetitions,
                "total_repetitions": total_repetitions,
                "inverse_pair_verified": inverse_pair_verified,
                "median_latency_ms": median_latency_ms,
                "latency_score": latency_score,
                "action_groups": action_groups,
                "opposing_actions_present": opposing_actions_present,
            })

    hypotheses: list[BitSignalHypothesis] = []
    for item in provisional:
        location_dominance = (
            item["in_window_flips"] / max(total_in_window_flips_all_bits, 1)
        )
        if item["opposing_actions_present"]:
            score = (
                (item["repetition_score"] * 0.32)
                + (item["window_purity"] * 0.25)
                + ((1.0 if item["inverse_pair_verified"] else 0.0) * 0.20)
                + (item["single_flip_score"] * 0.10)
                + (item["latency_score"] * 0.08)
                + (location_dominance * 0.05)
            )
            if not item["inverse_pair_verified"]:
                score = min(score, 0.35)
        else:
            score = (
                (item["repetition_score"] * 0.40)
                + (item["window_purity"] * 0.30)
                + (item["single_flip_score"] * 0.12)
                + (item["latency_score"] * 0.10)
                + (location_dominance * 0.08)
            )

        # A clean command/state bit should not continue changing outside the
        # action. This multiplier makes one exact transition beat hundreds of
        # unrelated changes elsewhere in the CAN ID.
        score *= max(0.02, (1.0 - item["outside_action_fraction"]) ** 2)
        average_action_flips = (
            item["in_window_flips"] / max(item["total_repetitions"], 1)
        )
        if average_action_flips > 1.0:
            score /= average_action_flips
        if item["matched_repetitions"] == 0:
            score = 0.0

        score = min(1.0, max(0.0, score))
        reason = (
            f"B{item['byte_index']} bit {item['bit_index']} matched "
            f"{item['matched_repetitions']}/{item['total_repetitions']} "
            f"action markers; in-window flips={item['in_window_flips']}, "
            f"outside flips={item['out_of_window_flips']}, "
            f"inverse ON/OFF={item['inverse_pair_verified']}"
        )
        hypotheses.append(BitSignalHypothesis(
            byte_index=int(item["byte_index"]),
            bit_index=int(item["bit_index"]),
            bit_mask=int(item["bit_mask"]),
            score=round(score, 6),
            marker_lift=round(float(item["marker_lift"]), 6),
            window_purity=round(float(item["window_purity"]), 6),
            outside_action_fraction=round(
                float(item["outside_action_fraction"]),
                6,
            ),
            repetition_score=round(float(item["repetition_score"]), 6),
            single_flip_score=round(float(item["single_flip_score"]), 6),
            location_dominance=round(location_dominance, 6),
            total_flips=int(item["total_flips"]),
            in_window_flips=int(item["in_window_flips"]),
            out_of_window_flips=int(item["out_of_window_flips"]),
            matched_repetitions=int(item["matched_repetitions"]),
            total_repetitions=int(item["total_repetitions"]),
            inverse_pair_verified=bool(item["inverse_pair_verified"]),
            median_latency_ms=(
                round(float(item["median_latency_ms"]), 2)
                if item["median_latency_ms"] is not None
                else None
            ),
            action_groups=dict(item["action_groups"]),
            reason=reason,
        ))

    hypotheses.sort(
        key=lambda item: (
            item.score,
            item.inverse_pair_verified,
            item.repetition_score,
            item.window_purity,
            -item.out_of_window_flips,
        ),
        reverse=True,
    )
    return hypotheses[:24]


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
            f"marker_coverage={item.marker_transition_coverage}, "
            f"transition_score={item.transition_score}, "
            f"transition_symmetry={item.transition_symmetry_score}, "
            f"encoding_hint={item.encoding_hint}, "
            f"consensus_pre={item.pre_marker_mode}, "
            f"consensus_action={item.action_window_mode}, "
            f"consensus_post={item.post_marker_mode}, "
            f"action_groups={item.action_group_modes}, "
            f"inverse_pairs={item.inverse_transition_pairs[:3]}, "
            f"transition_steps={item.transition_step_counts}, "
            f"latency_ms={item.median_marker_latency_ms}, "
            f"common={item.most_common_values[:4]}, "
            f"byte_delta={item.byte_delta_counts}, "
            f"mod_delta={item.byte_modulo_delta_counts}, "
            f"low_nibble_delta={item.low_nibble_delta_counts}, "
            f"high_nibble_delta={item.high_nibble_delta_counts}, "
            f"hamming={item.hamming_distance_counts}, "
            f"bit_flips={nonzero_bit_flips}"
        )

    return "; ".join(summaries)



def compact_byte_roles(candidate: Candidate) -> str:
    if not candidate.byte_role_hypotheses:
        return "none"
    return "; ".join(
        f"B{item.byte_index}={item.hypothesis_kind}"
        + (f" mask=0x{item.bit_mask:02X}" if item.bit_mask is not None else "")
        + f" confidence={item.confidence:.3f}"
        for item in candidate.byte_role_hypotheses
    )


def compact_signal_hypothesis(candidate: Candidate) -> str:
    if candidate.field_hypotheses:
        field = candidate.field_hypotheses[0]
        return (
            f"B{field.start_byte} width={field.width_bits} "
            f"endianness={field.endianness} signed={field.signed} "
            f"score={field.score:.3f} monotonicity={field.monotonicity:.3f} "
            f"separation={field.level_separation:.3f} "
            f"repeatability={field.repeatability:.3f} "
            f"outside_drift={field.outside_action_drift:.3f} "
            f"levels={field.observed_level_medians}"
        )
    if not candidate.signal_hypotheses:
        return "none"
    top = candidate.signal_hypotheses[0]
    groups = ", ".join(
        f"{name}:{group.get('consensus_pre_state')}->{group.get('consensus_action_state')}"
        for name, group in top.action_groups.items()
    )
    return (
        f"B{top.byte_index} bit={top.bit_index} mask=0x{top.bit_mask:02X} "
        f"score={top.score:.3f} matched={top.matched_repetitions}/"
        f"{top.total_repetitions} outside={top.out_of_window_flips} "
        f"inverse={top.inverse_pair_verified} groups=[{groups}]"
    )


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
        "byte_transition_score": candidate.byte_transition_score,
        "byte_transition_evidence": candidate.byte_transition_evidence,
        "baseline_overlap_score": candidate.baseline_overlap_score,
        "baseline_adjusted_change_ratio": (
            candidate.baseline_adjusted_change_ratio
        ),
        "ml_probability": candidate.ml_probability,
        "byte_change_counts": candidate.byte_change_counts,
        "byte_role_hypotheses": [
            item.model_dump()
            for item in candidate.byte_role_hypotheses
        ],
        "signal_hypotheses": [
            item.model_dump()
            for item in candidate.signal_hypotheses[:8]
        ],
        "field_hypotheses": [
            item.model_dump()
            for item in candidate.field_hypotheses[:8]
        ],
        "analyzer_profile": candidate.analyzer_profile,
        "quick_id_method": candidate.quick_id_method,
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
                    f"byte_roles={compact_byte_roles(candidate)}",
                    f"top_signal={compact_signal_hypothesis(candidate)}",
                    f"quick_id_method={candidate.quick_id_method}",
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
            "byte_role_hypotheses": (
                metadata.get("byte_role_hypotheses")
                if isinstance(metadata.get("byte_role_hypotheses"), list)
                else []
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

        top_signal = (
            candidate.signal_hypotheses[0]
            if candidate.signal_hypotheses
            else None
        )
        top_field = (
            candidate.field_hypotheses[0]
            if candidate.field_hypotheses
            else None
        )
        if (
            candidate.quick_id_method == QUICK_ID_BIT_FIRST_METHOD
            and top_signal is not None
        ):
            baseline_role_penalty = 0.0
            for role in baseline.get("byte_role_hypotheses", []):
                if not isinstance(role, dict):
                    continue
                role_byte_index = role.get("byte_index")
                if (
                    role_byte_index is None
                    or int(role_byte_index) != top_signal.byte_index
                ):
                    continue
                kind = str(role.get("hypothesis_kind") or "")
                if kind in {"rolling_counter", "checksum_candidate"}:
                    baseline_role_penalty = max(baseline_role_penalty, 0.45)
                elif kind == "payload_or_noise":
                    baseline_role_penalty = max(baseline_role_penalty, 0.15)

            target_bit_rate = top_signal.total_flips / max(
                candidate.frame_count - 1,
                1,
            )
            baseline_byte_rate = baseline_rates.get(
                str(top_signal.byte_index),
                0.0,
            )
            bit_overlap = min(
                1.0,
                baseline_byte_rate / max(target_bit_rate, 1e-9),
            )
            bit_penalty = min(
                BASELINE_PENALTY_WEIGHT,
                (bit_overlap * 0.50) + baseline_role_penalty,
            )
            top_signal.baseline_penalty = round(bit_penalty, 6)
            top_signal.baseline_adjusted_score = round(
                top_signal.score * (1.0 - bit_penalty),
                6,
            )
            byte_adjusted_confidence = (
                score_candidate_confidence(
                    candidate.byte_transition_score,
                    adjusted_change_ratio,
                    candidate.frame_count,
                )
                * (1.0 - penalty)
                if candidate.byte_transition_score > 0.0
                else 0.0
            )
            adjusted_confidence = max(
                top_signal.baseline_adjusted_score,
                byte_adjusted_confidence,
            )
        elif top_field is not None and candidate.analyzer_profile in FIELD_ANALYZER_PROFILES:
            width_bytes = max(1, top_field.width_bits // 8)
            role_penalty = 0.0
            field_bytes = set(range(top_field.start_byte, top_field.start_byte + width_bytes))
            for role in baseline.get("byte_role_hypotheses", []):
                if not isinstance(role, dict):
                    continue
                role_byte_index = role.get("byte_index")
                if role_byte_index is None or int(role_byte_index) not in field_bytes:
                    continue
                kind = str(role.get("hypothesis_kind") or "")
                if kind in {"rolling_counter", "checksum_candidate"}:
                    role_penalty = max(role_penalty, 0.50)
                elif kind == "payload_or_noise":
                    role_penalty = max(role_penalty, 0.12)
            baseline_field_rate = sum(
                baseline_rates.get(str(byte_index), 0.0)
                for byte_index in field_bytes
            ) / max(len(field_bytes), 1)
            field_penalty = min(
                BASELINE_PENALTY_WEIGHT,
                role_penalty + min(0.35, baseline_field_rate * 2.0),
            )
            top_field.baseline_penalty = round(field_penalty, 6)
            top_field.baseline_adjusted_score = round(
                top_field.score * (1.0 - field_penalty),
                6,
            )
            adjusted_confidence = top_field.baseline_adjusted_score
        else:
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
            "baseline_byte_roles": baseline.get("byte_role_hypotheses", []),
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
            "byte_transition_score": candidate.byte_transition_score,
            "byte_transition_evidence": candidate.byte_transition_evidence,
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
                f"byte_roles=[{compact_byte_roles(c)}], "
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
        candidate_heading = "Ranked exact signal hypotheses grouped by CAN ID"
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
                f"byte_transition_score={c.byte_transition_score:.3f}, "
                f"byte_transition_evidence={c.byte_transition_evidence}, "
                f"label_prior={c.label_prior}, "
                f"ml_probability={c.ml_probability}, "
                f"confidence_before_ml={c.confidence_before_ml:.3f}, "
                f"historical_support={c.historical_support}, "
                f"quick_id_method={c.quick_id_method}, "
                f"top_signal=[{compact_signal_hypothesis(c)}], "
                f"byte_roles=[{compact_byte_roles(c)}], "
                f"byte_evidence=[{compact_byte_evidence(c, limit=LLM_BYTE_EVIDENCE_LIMIT)}]"
            )
            for c in candidates[:LLM_CANDIDATE_LIMIT]
        ) or "- no candidates"

        mode_instructions = """
        This is a TARGET CORRELATION mission.
        For opposing ON/OFF actions, rank the exact CAN ID + byte + bit location,
        not the total number of changes in the CAN ID. A clean hypothesis should
        transition at the same location for ON and OFF, show inverse states, and
        have few or no flips outside action windows. Aggregate ID changes are
        diagnostic only and must not outweigh exact-location evidence.
        If the best role is byte_transition_candidate, describe it as byte-level
        evidence only. Do not call it ON/OFF unless a bit_signal_hypothesis
        isolates the bit. Nibble sequences such as 0..F or F..0 are usually
        counters or encoded fields, not direct human action bits.
        Confidence is a research score, not proof.
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
    byte deltas, modulo byte/nibble deltas, Hamming distances, and pre/action/post
    marker-window summaries. These observations do not have confirmed semantic
    meaning. Do not claim a decoded signal, scale, offset, signedness, endianness,
    or bit assignment unless repeated evidence supports it.

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


def _modulo_counter_score(
    value_sequences: list[list[int]],
    modulus: int,
) -> tuple[float, Optional[int]]:
    deltas: list[int] = []
    for values in value_sequences:
        deltas.extend(
            (current - previous) % modulus
            for previous, current in zip(values, values[1:])
            if current != previous
        )
    if len(deltas) < 3:
        return 0.0, None
    counts = Counter(deltas)
    delta, count = counts.most_common(1)[0]
    score = count / len(deltas)
    if delta not in {1, modulus - 1}:
        score *= 0.5
    return score, int(delta)


def classify_byte_roles(
    rows: list[FrameRow],
    byte_entropy: dict[str, float],
) -> list[ByteRoleHypothesis]:
    """Conservatively identify normal baseline byte mechanics.

    `checksum_candidate` is intentionally a hypothesis, never a confirmed
    checksum. Rolling counters are detected across full bytes and nibbles.
    """
    roles: list[ByteRoleHypothesis] = []

    transition_pairs: list[tuple[FrameRow, FrameRow]] = []
    for previous, current in zip(rows, rows[1:]):
        if previous.segment_id == current.segment_id:
            transition_pairs.append((previous, current))

    for byte_index in range(8):
        values = [frame_byte(row, byte_index) for row in rows]
        unique_values = len(set(values))
        entropy_value = float(byte_entropy.get(str(byte_index), 0.0) or 0.0)

        changed = 0
        co_changed = 0
        for previous, current in transition_pairs:
            before = frame_byte(previous, byte_index)
            after = frame_byte(current, byte_index)
            if before == after:
                continue
            changed += 1
            if any(
                frame_byte(previous, other) != frame_byte(current, other)
                for other in range(8)
                if other != byte_index
            ):
                co_changed += 1

        transitions = max(len(transition_pairs), 1)
        change_rate = changed / transitions
        co_change_ratio = co_changed / max(changed, 1)

        rows_by_segment: dict[int, list[FrameRow]] = defaultdict(list)
        for row in rows:
            rows_by_segment[row.segment_id].append(row)
        full_sequences = [
            [frame_byte(row, byte_index) for row in segment_rows]
            for segment_rows in rows_by_segment.values()
        ]
        low_sequences = [
            [value & 0x0F for value in sequence]
            for sequence in full_sequences
        ]
        high_sequences = [
            [(value >> 4) & 0x0F for value in sequence]
            for sequence in full_sequences
        ]

        full_score, full_delta = _modulo_counter_score(full_sequences, 256)
        low_score, low_delta = _modulo_counter_score(low_sequences, 16)
        high_score, high_delta = _modulo_counter_score(high_sequences, 16)

        best_counter = max(
            (full_score, 0xFF, full_delta, "full byte"),
            (low_score, 0x0F, low_delta, "low nibble"),
            (high_score, 0xF0, high_delta, "high nibble"),
            key=lambda item: item[0],
        )

        metrics = {
            "unique_values": unique_values,
            "entropy": round(entropy_value, 4),
            "change_rate": round(change_rate, 6),
            "co_change_ratio": round(co_change_ratio, 6),
            "full_counter_score": round(full_score, 6),
            "low_nibble_counter_score": round(low_score, 6),
            "high_nibble_counter_score": round(high_score, 6),
        }

        if changed == 0:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="constant",
                confidence=1.0,
                reason="byte did not change in the analyzed recording",
                metrics=metrics,
            ))
            continue

        if best_counter[0] >= 0.72 and unique_values >= 4:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="rolling_counter",
                confidence=round(min(0.99, best_counter[0]), 5),
                bit_mask=best_counter[1],
                reason=(
                    f"{best_counter[3]} follows a dominant modulo "
                    f"delta of {best_counter[2]}"
                ),
                metrics=metrics,
            ))
            continue

        checksum_score = min(
            1.0,
            (min(entropy_value / 8.0, 1.0) * 0.45)
            + (min(change_rate, 1.0) * 0.30)
            + (co_change_ratio * 0.25),
        )
        if (
            entropy_value >= 4.0
            and change_rate >= 0.25
            and co_change_ratio >= 0.60
            and best_counter[0] < 0.55
            and unique_values >= 12
        ):
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="checksum_candidate",
                confidence=round(checksum_score, 5),
                bit_mask=0xFF,
                reason=(
                    "high-entropy byte changes with other payload bytes and "
                    "does not resemble a simple modulo counter"
                ),
                metrics=metrics,
            ))
            continue

        varying_mask = 0
        for previous, current in transition_pairs:
            varying_mask |= (
                frame_byte(previous, byte_index)
                ^ frame_byte(current, byte_index)
            )

        if unique_values <= 4 and varying_mask:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="periodic_or_state_bits",
                confidence=round(min(0.9, 0.45 + change_rate), 5),
                bit_mask=int(varying_mask),
                reason="few observed values with a repeatable changing bit mask",
                metrics=metrics,
            ))
        else:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="payload_or_noise",
                confidence=round(min(0.8, 0.25 + entropy_value / 16.0), 5),
                bit_mask=int(varying_mask) if varying_mask else None,
                reason="changing byte did not meet conservative counter/checksum heuristics",
                metrics=metrics,
            ))

    return roles


async def load_human_byte_hypotheses(
    conn: Any,
    session_id: UUID,
) -> list[dict[str, Any]]:
    """Load current reviews plus conservative compatible-session consensus.

    Current-session decisions always win. Rolling-counter and checksum roles
    may carry across matching vehicle/interface/mode sessions after two
    independent confirmations. Constant/noise roles require three confirmations
    from baseline-style missions because state-dependent bytes can otherwise be
    incorrectly suppressed.
    """
    target = await conn.fetchrow(
        """
        SELECT vehicle_id, bus_interface, bus_mode
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    if target is None:
        return []

    rows = await conn.fetch(
        """
        SELECT h.session_id, h.can_id, h.byte_index, h.bit_mask,
               h.hypothesis_kind, h.action_group, h.confidence,
               h.validation_status, h.notes, h.evidence, h.metadata,
               h.updated_at, rm.mission_code
        FROM can_signal_hypotheses h
        JOIN can_sessions cs ON cs.id = h.session_id
        LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
        WHERE h.source = 'human'
          AND cs.capture_status = 'finalized'
          AND cs.vehicle_id = $2
          AND cs.bus_interface IS NOT DISTINCT FROM $3
          AND cs.bus_mode IS NOT DISTINCT FROM $4
        ORDER BY h.updated_at DESC
        """,
        session_id,
        target["vehicle_id"],
        target["bus_interface"],
        target["bus_mode"],
    )

    # Keep one canonical/latest decision per session and structural role.
    per_session: dict[tuple[str, int, int, int, str], dict[str, Any]] = {}
    for raw in rows:
        row = dict(raw)
        key = (
            str(row.get("session_id")),
            int(row.get("can_id") or 0),
            int(row.get("byte_index") or 0),
            int(row.get("bit_mask") or 0),
            str(row.get("hypothesis_kind") or "unknown"),
        )
        current = per_session.get(key)
        if current is None:
            per_session[key] = row
            continue
        row_canonical = not bool(row.get("action_group"))
        current_canonical = not bool(current.get("action_group"))
        if row_canonical and not current_canonical:
            per_session[key] = row

    current_rows: dict[tuple[int, int, int, str], dict[str, Any]] = {}
    prior_groups: dict[
        tuple[int, int, int, str],
        list[dict[str, Any]],
    ] = defaultdict(list)

    for row in per_session.values():
        role_key = (
            int(row.get("can_id") or 0),
            int(row.get("byte_index") or 0),
            int(row.get("bit_mask") or 0),
            str(row.get("hypothesis_kind") or "unknown"),
        )
        if str(row.get("session_id")) == str(session_id):
            current_rows[role_key] = row
        else:
            prior_groups[role_key].append(row)

    inherited: list[dict[str, Any]] = []
    for role_key, group in prior_groups.items():
        if role_key in current_rows:
            continue

        kind = role_key[3]
        if kind not in BACKGROUND_BYTE_ROLE_KINDS:
            continue
        statuses = {
            str(row.get("validation_status") or "unreviewed")
            for row in group
            if str(row.get("validation_status") or "unreviewed")
            in {"positive", "negative"}
        }
        if len(statuses) != 1:
            continue
        status = next(iter(statuses))
        matching = [
            row
            for row in group
            if str(row.get("validation_status") or "") == status
        ]
        distinct_sessions = {str(row.get("session_id")) for row in matching}

        baseline_only = kind in {"constant", "payload_or_noise"}
        if baseline_only:
            matching = [
                row
                for row in matching
                if str(row.get("mission_code") or "").upper().startswith(
                    BASELINE_CODE_PREFIXES
                )
            ]
            distinct_sessions = {str(row.get("session_id")) for row in matching}

        minimum_sessions = 3 if baseline_only else 2
        if len(distinct_sessions) < minimum_sessions:
            continue

        template = dict(max(
            matching,
            key=lambda row: row.get("updated_at") or 0,
        ))
        confidences = [
            float(row.get("confidence") or 0.5)
            for row in matching
        ]
        template["confidence"] = min(
            0.95,
            float(statistics.mean(confidences)),
        )
        template["notes"] = (
            f"Inherited {status} consensus from "
            f"{len(distinct_sessions)} compatible finalized sessions"
        )
        template["evidence"] = {
            **metadata_dict(template.get("evidence")),
            "inherited_consensus": True,
            "independent_sessions": len(distinct_sessions),
            "source_session_ids": sorted(distinct_sessions),
        }
        template["metadata"] = {
            **metadata_dict(template.get("metadata")),
            "inherited_consensus": True,
            "scope": "same_vehicle_interface_mode",
        }
        inherited.append(template)

    return [*current_rows.values(), *inherited]


def apply_human_byte_hypotheses(
    candidates: list[Candidate],
    human_rows: list[dict[str, Any]],
) -> None:
    by_id = {candidate.can_id: candidate for candidate in candidates}
    for row in human_rows:
        candidate = by_id.get(int(row.get("can_id") or -1))
        if candidate is None:
            continue
        byte_index = int(row.get("byte_index") or 0)
        kind = str(row.get("hypothesis_kind") or "unknown")
        validation_status = str(row.get("validation_status") or "unreviewed")
        match = next(
            (
                item
                for item in candidate.byte_role_hypotheses
                if item.byte_index == byte_index
                and item.hypothesis_kind == kind
                and (item.bit_mask or 0) == int(row.get("bit_mask") or 0)
            ),
            None,
        )
        if match is None:
            candidate.byte_role_hypotheses.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind=kind,
                confidence=float(row.get("confidence") or 0.5),
                bit_mask=(
                    int(row["bit_mask"])
                    if row.get("bit_mask") is not None
                    else None
                ),
                auto_detected=False,
                source="human",
                validation_status=validation_status,
                reason=str(row.get("notes") or "human analyst hypothesis"),
                metrics=metadata_dict(row.get("evidence")),
            ))
        else:
            match.source = "human"
            match.validation_status = validation_status
            if row.get("notes"):
                match.reason = str(row["notes"])
            if row.get("confidence") is not None:
                match.confidence = float(row["confidence"])


def rescore_candidates_after_human_byte_roles(
    candidates: list[Candidate],
    heatmap: dict[str, Any],
    *,
    apply_confidence_penalty: bool = True,
) -> None:
    """Apply saved structural-byte reviews to the current session ranking.

    The review affects only the byte it classifies. A confirmed counter,
    checksum, or constant can suppress that byte as a target explanation while
    leaving other bytes on the same CAN ID available for consideration.
    """
    for candidate in candidates:
        roles_by_byte = byte_role_map(candidate.byte_role_hypotheses)
        best_item, best_score, best_payload = strongest_byte_transition(
            candidate.byte_evidence,
            candidate.byte_role_hypotheses,
        )
        candidate.byte_transition_score = best_score
        candidate.byte_transition_evidence = best_payload

        decisive_byte: Optional[int] = None
        decisive_source = "byte_transition"
        if candidate.field_hypotheses:
            decisive_byte = candidate.field_hypotheses[0].start_byte
            decisive_source = "field"
        elif candidate.signal_hypotheses:
            decisive_byte = candidate.signal_hypotheses[0].byte_index
            decisive_source = "bit"
        elif best_item is not None:
            decisive_byte = best_item.byte_index

        decisive_role = (
            roles_by_byte.get(decisive_byte)
            if decisive_byte is not None
            else None
        )
        factor = byte_role_score_factor(decisive_role)
        human_applied = bool(
            decisive_role is not None
            and decisive_role.source == "human"
            and decisive_role.validation_status in {"positive", "uncertain"}
            and decisive_role.hypothesis_kind in BACKGROUND_BYTE_ROLE_KINDS
            and factor < 1.0
        )

        candidate.confidence_before_human_byte_roles = candidate.confidence
        if (
            decisive_role is not None
            and human_applied
            and apply_confidence_penalty
        ):
            candidate.confidence = round(candidate.confidence * factor, 5)
            candidate.correlation_score = round(
                candidate.correlation_score * factor,
                5,
            )
            candidate.human_byte_role_applied = True
            candidate.human_byte_role_penalty = round(1.0 - factor, 6)
            candidate.human_byte_role_evidence = {
                "byte_index": decisive_byte,
                "decisive_source": decisive_source,
                "hypothesis_kind": decisive_role.hypothesis_kind,
                "validation_status": decisive_role.validation_status,
                "factor": round(factor, 6),
            }
            candidate.notes = (
                f"{candidate.notes}; human review marked decisive B{decisive_byte} "
                f"as {decisive_role.hypothesis_kind} "
                f"({decisive_role.validation_status})"
            )
        elif decisive_source == "byte_transition" and apply_confidence_penalty:
            # A rejected auto background suggestion restores the raw byte
            # transition as a valid lead for the next analysis.
            candidate.correlation_score = round(
                max(candidate.correlation_lift, best_score),
                5,
            )
            candidate.confidence = round(
                score_candidate_confidence(
                    candidate.correlation_score,
                    candidate.change_ratio,
                    candidate.frame_count,
                ),
                5,
            )

        row = heatmap.get(candidate.can_id_hex)
        if isinstance(row, dict):
            row["byte_role_hypotheses"] = [
                item.model_dump()
                for item in candidate.byte_role_hypotheses
            ]
            row["byte_transition_score"] = candidate.byte_transition_score
            row["byte_transition_evidence"] = candidate.byte_transition_evidence
            row["correlation_score"] = candidate.correlation_score
            row["confidence"] = candidate.confidence
            row["human_byte_role_applied"] = candidate.human_byte_role_applied
            row["human_byte_role_penalty"] = candidate.human_byte_role_penalty

    candidates.sort(
        key=lambda item: (
            item.confidence,
            item.correlation_score,
            item.byte_transition_score,
            item.change_count,
        ),
        reverse=True,
    )


def analyze_frames(
    frames: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str = ANALYSIS_MODE_TARGET,
    analyzer_profile: str = ANALYZER_PROFILE_BOOLEAN,
    session: Optional[dict[str, Any]] = None,
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
    opposing_actions = (
        not baseline_mode
        and has_opposing_action_markers(selected_markers)
    )
    bit_first_required = (
        analyzer_profile == ANALYZER_PROFILE_BOOLEAN
        and bool(selected_markers)
    )
    field_first_required = analyzer_profile in FIELD_ANALYZER_PROFILES
    numeric_expected_values = [
        value
        for marker in selected_markers
        if (value := marker_expected_value(marker)) is not None
    ]
    secondary_bit_scan = (
        field_first_required
        and numeric_expected_values
        and min(numeric_expected_values) <= 0
        and max(numeric_expected_values) > 0
    )
    quick_id_method = quick_id_method_for_profile(
        analyzer_profile,
        opposing_actions,
    )
    marker_context["analyzer_profile"] = analyzer_profile
    marker_context["quick_id_method"] = quick_id_method
    marker_context["numeric_expected_markers"] = len(numeric_expected_values)
    marker_context["secondary_bit_scan"] = bool(secondary_bit_scan)

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
                timestamp_ms + marker_action_duration_ms(
                    marker,
                    marker_window_ms,
                ),
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
        byte_role_hypotheses = classify_byte_roles(rows, byte_entropy)
        top_byte_transition, byte_transition_score, byte_transition_payload = (
            strongest_byte_transition(
                byte_evidence,
                byte_role_hypotheses,
            )
        )
        signal_hypotheses = (
            build_bit_signal_hypotheses(
                rows,
                marker_windows,
                marker_window_ms,
                marker_window_coverage,
            )
            if bit_first_required or secondary_bit_scan
            else []
        )
        top_signal_hypothesis = (
            signal_hypotheses[0]
            if signal_hypotheses
            else None
        )
        field_hypotheses = (
            build_field_signal_hypotheses(
                rows,
                selected_markers,
                marker_window_ms,
                analyzer_profile,
                session,
            )
            if field_first_required
            else []
        )
        top_field_hypothesis = (
            field_hypotheses[0]
            if field_hypotheses
            else None
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
            if field_first_required:
                if top_field_hypothesis is not None:
                    raw_marker_fraction = 1.0 - top_field_hypothesis.outside_action_drift
                    correlation_lift = top_field_hypothesis.monotonicity
                    correlation_score = top_field_hypothesis.score
                    confidence = top_field_hypothesis.score
                    candidate_role = (
                        "exact_field_signal_candidate"
                        if confidence >= 0.45
                        else "weak_field_signal_candidate"
                    )
                    notes = (
                        f"field-first Quick ID: B{top_field_hypothesis.start_byte} "
                        f"{top_field_hypothesis.width_bits}-bit "
                        f"{top_field_hypothesis.endianness}; "
                        f"levels={len(top_field_hypothesis.expected_levels)}; "
                        f"outside drift={top_field_hypothesis.outside_action_drift:.3f}"
                    )
                else:
                    raw_marker_fraction = (
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0
                    )
                    correlation_lift = 0.0
                    if byte_transition_score > 0.0:
                        correlation_score = byte_transition_score
                        confidence = score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        candidate_role = (
                            "byte_transition_candidate"
                            if byte_transition_score >= 0.20
                            else "weak_byte_transition_candidate"
                        )
                        notes = (
                            "field-first fallback: byte movement repeated near "
                            "action markers, but no exact numeric field was decoded"
                        )
                    else:
                        correlation_score = 0.0
                        confidence = 0.0
                        candidate_role = "no_exact_field_candidate"
                        notes = "no exact numeric field or marker-linked byte transition was found"
            elif bit_first_required:
                if (
                    top_signal_hypothesis is not None
                    and top_signal_hypothesis.score > 0.0
                ):
                    byte_fallback_confidence = (
                        score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        if byte_transition_score > 0.0
                        else 0.0
                    )
                    exact_bit_wins = (
                        top_signal_hypothesis.score >= byte_fallback_confidence
                    )
                    raw_marker_fraction = max(
                        top_signal_hypothesis.window_purity,
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0,
                    )
                    correlation_lift = top_signal_hypothesis.marker_lift
                    correlation_score = max(
                        top_signal_hypothesis.score,
                        byte_transition_score,
                    )
                    confidence = max(
                        top_signal_hypothesis.score,
                        byte_fallback_confidence,
                    )
                    candidate_role = (
                        "exact_bit_signal_candidate"
                        if exact_bit_wins and confidence >= 0.45
                        else "weak_bit_signal_candidate"
                        if exact_bit_wins
                        else "byte_transition_candidate"
                        if byte_transition_score >= 0.20
                        else "weak_byte_transition_candidate"
                    )
                    notes = (
                        f"boolean hybrid Quick ID: exact B{top_signal_hypothesis.byte_index} "
                        f"bit {top_signal_hypothesis.bit_index} matched "
                        f"{top_signal_hypothesis.matched_repetitions}/"
                        f"{top_signal_hypothesis.total_repetitions} markers; "
                        f"byte transition score={byte_transition_score:.3f}; "
                        f"outside flips={top_signal_hypothesis.out_of_window_flips}"
                    )
                else:
                    raw_marker_fraction = (
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0
                    )
                    correlation_lift = 0.0
                    if byte_transition_score > 0.0:
                        correlation_score = byte_transition_score
                        confidence = score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        candidate_role = (
                            "byte_transition_candidate"
                            if byte_transition_score >= 0.20
                            else "weak_byte_transition_candidate"
                        )
                        notes = (
                            "bit-first fallback: marker-linked byte movement was "
                            "found, but no exact bit transition was isolated"
                        )
                    else:
                        correlation_score = 0.0
                        confidence = 0.0
                        candidate_role = "no_exact_bit_candidate"
                        notes = "no exact bit or marker-linked byte transition was found"
            else:
                raw_marker_fraction = (
                    min(1.0, window_delta_count / max(change_count, 1))
                    if change_count > 0
                    else 0.0
                )
                if (
                    raw_marker_fraction > marker_window_coverage
                    and marker_window_coverage < 1.0
                ):
                    correlation_lift = (
                        raw_marker_fraction - marker_window_coverage
                    ) / max(1.0 - marker_window_coverage, 1e-9)
                else:
                    correlation_lift = 0.0
                correlation_score = min(
                    1.0,
                    max(0.0, correlation_lift, byte_transition_score),
                )
                confidence = score_candidate_confidence(
                    correlation_score,
                    change_ratio,
                    len(rows),
                )
                candidate_role = (
                    "byte_transition_candidate"
                    if byte_transition_score >= correlation_lift
                    and byte_transition_score >= 0.20
                    else "target_candidate"
                    if correlation_score >= 0.05
                    else "weak_or_background_candidate"
                )
                if candidate_role == "byte_transition_candidate":
                    notes = (
                        "byte-level fallback: action windows repeatedly "
                        "changed a byte, but bit/field encoding remains "
                        "unconfirmed"
                    )
                elif correlation_score >= 0.05:
                    notes = "aggregate fallback: correlated byte changes near markers"
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
            byte_role_hypotheses=byte_role_hypotheses,
            signal_hypotheses=signal_hypotheses,
            field_hypotheses=field_hypotheses,
            analyzer_profile=analyzer_profile,
            quick_id_method=quick_id_method,
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
            byte_transition_score=byte_transition_score,
            byte_transition_evidence=byte_transition_payload,
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
            "byte_role_hypotheses": [
                item.model_dump()
                for item in byte_role_hypotheses
            ],
            "signal_hypotheses": [
                item.model_dump()
                for item in signal_hypotheses[:8]
            ],
            "field_hypotheses": [
                item.model_dump()
                for item in field_hypotheses[:8]
            ],
            "analyzer_profile": analyzer_profile,
            "quick_id_method": quick_id_method,
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
            "byte_transition_score": byte_transition_score,
            "byte_transition_evidence": byte_transition_payload,
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
    marker_context["adaptive_action_windows"] = True
    marker_context["action_window_durations_ms"] = [
        max(0, end - start)
        for start, end, _ in marker_windows
    ]
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
            "mission-aware: discrete controls rank exact bits; numeric sensors "
            "rank exact byte fields against marker-declared levels"
        ),
        "quick_id": {
            "boolean_method": QUICK_ID_BIT_FIRST_METHOD,
            "ordinal_method": QUICK_ID_ORDINAL_FIELD_METHOD,
            "continuous_method": QUICK_ID_CONTINUOUS_FIELD_METHOD,
            "enum_method": QUICK_ID_ENUM_FIELD_METHOD,
            "digital_ranking_unit": "can_id + byte_index + bit_index",
            "field_ranking_unit": "can_id + start_byte + width + endianness + signedness",
            "outside_action_changes": "direct score penalty",
            "marker_contract": (
                "analyzer_profile + expected_value + expected_unit + "
                "expected_direction + return_value + hold_ms"
            ),
            "aggregate_fallback": QUICK_ID_FALLBACK_METHOD,
        },
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
        "session_integrity": {
            "analysis_requires": "capture_status=finalized",
            "timestamp_authority": "server only",
            "browser_timestamps": "ignored for persisted markers",
        },
        "byte_role_detection": {
            "automatic": True,
            "roles": [
                "constant", "rolling_counter", "checksum_candidate",
                "periodic_or_state_bits", "payload_or_noise"
            ],
            "checksum_semantics": "candidate only; requires validation",
        },
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
                    segment_id=(marker_index * 3) - 2,
                    descending=True,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time,
                    end_ms=marker_time + marker_window_ms,
                    limit=action_budget,
                    segment_id=(marker_index * 3) - 1,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time + marker_window_ms + 1,
                    end_ms=marker_time + (2 * marker_window_ms),
                    limit=post_budget,
                    segment_id=marker_index * 3,
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
            "segment_count": (len(action_markers) * 3) + (1 if ordered_control else 0),
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
                cs.started_at, cs.ended_at, cs.finalized_at,
                cs.capture_status, cs.final_frame_id, cs.final_frame_count,
                cs.final_marker_count, cs.capture_quality,
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

        if session["capture_status"] != "finalized":
            raise HTTPException(
                status_code=409,
                detail=(
                    "CAN session must be finalized before analysis. "
                    f"Current capture_status={session['capture_status']}."
                ),
            )
        if session["ended_at"] is None or session["finalized_at"] is None:
            raise HTTPException(
                status_code=409,
                detail="Finalized session is missing ended_at/finalized_at integrity fields.",
            )

        markers = await conn.fetch(
            """
            SELECT csm.id, csm.marker_type, csm.label, csm.timestamp_ms, csm.metadata,
                   COALESCE(rs.step_code, csm.metadata->>'step_code') AS step_code,
                   COALESCE(rm.mission_code, csm.metadata->>'mission_code') AS mission_code
            FROM can_session_markers csm
            LEFT JOIN recon_steps rs ON rs.id = csm.step_id
            LEFT JOIN recon_missions rm ON rm.id = csm.mission_id
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
        session_dict["capture_quality"] = metadata_dict(
            session_dict.get("capture_quality")
        )
        if (
            session_dict["capture_quality"].get("usable_for_analysis") is False
            and not payload.allow_low_quality
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Capture quality gate rejected this session. "
                    "Set allow_low_quality=true only for explicit forensic review."
                ),
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
        finalized_count = int(session["final_frame_count"] or 0)
        observed_count = int(frame_selection.get("total_frames") or 0)
        if finalized_count and observed_count != finalized_count:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Finalized frame-count integrity mismatch: "
                    f"expected {finalized_count}, observed {observed_count}."
                ),
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

    analyzer_profile = resolve_analyzer_profile(
        session_dict,
        marker_dicts,
        analysis_mode,
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
        analyzer_profile=analyzer_profile,
    )

    try:
        candidates, deltas, heatmap, marker_selection = analyze_frames(
            frames,
            marker_dicts,
            payload.marker_window_ms,
            analysis_mode,
            analyzer_profile,
            session_dict,
        )
        human_hypotheses: list[dict[str, Any]] = []
        try:
            async with pool.acquire() as conn:
                human_hypotheses = await load_human_byte_hypotheses(
                    conn,
                    session_id,
                )
            apply_human_byte_hypotheses(candidates, human_hypotheses)
            rescore_candidates_after_human_byte_roles(
                candidates,
                heatmap,
                apply_confidence_penalty=False,
            )
        except Exception as hypothesis_exc:
            can_ai_log(
                "human_hypothesis_load_failed",
                session=session_id,
                error_type=type(hypothesis_exc).__name__,
                error=repr(hypothesis_exc),
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

    # Baseline subtraction may replace exact-bit/field confidence. Apply the
    # saved human structural-byte decision once, after that statistical stage
    # and before supervised ML/ID-level priors.
    if human_hypotheses:
        rescore_candidates_after_human_byte_roles(
            candidates,
            heatmap,
            apply_confidence_penalty=True,
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

    label_prior_context: dict[str, Any] = {
        "applied": False,
        "compatible_id_priors": 0,
        "candidates_adjusted": 0,
        "reason": (
            "Baseline profiles are not candidate-classification targets."
            if baseline_mode
            else "No compatible labels loaded."
        ),
    }
    if not baseline_mode:
        try:
            async with pool.acquire() as conn:
                label_priors = await load_candidate_label_priors(
                    conn,
                    session_id=session_id,
                    vehicle_id=session["vehicle_id"],
                    mission_code=session_dict.get("mission_code"),
                    bus_interface=session_dict.get("bus_interface"),
                    bus_mode=session_dict.get("bus_mode"),
                    capture_kind=capture_kind_for(
                        session_dict.get("bus_interface"),
                        session_dict.get("bus_mode"),
                    ),
                )
            label_prior_context = apply_candidate_label_priors(
                candidates,
                label_priors,
                supervised_model_applied=bool(ml_context.get("applied")),
            )
            label_prior_context["applied"] = (
                int(label_prior_context.get("candidates_adjusted") or 0) > 0
            )
        except Exception as label_exc:
            label_prior_context = {
                "applied": False,
                "compatible_id_priors": 0,
                "candidates_adjusted": 0,
                "reason": "Could not load compatible human labels.",
                "error_type": type(label_exc).__name__,
            }
            can_ai_log(
                "label_prior_load_failed",
                session=session_id,
                error_type=type(label_exc).__name__,
                error=repr(label_exc),
            )

    can_ai_log(
        "ml_model_selected",
        session=session_id,
        applied=ml_context.get("applied"),
        selection=ml_context.get("selection"),
        model_id=ml_context.get("model_id"),
        label_count=ml_context.get("label_count"),
        label_priors=label_prior_context.get("compatible_id_priors"),
        label_prior_adjusted=label_prior_context.get("candidates_adjusted"),
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
                                "confidence_before_label_prior": (
                                    c.confidence_before_label_prior
                                ),
                                "label_prior_applied": c.label_prior_applied,
                                "label_prior": c.label_prior,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
                                "byte_transition_score": c.byte_transition_score,
                                "byte_transition_evidence": c.byte_transition_evidence,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                                "byte_role_hypotheses": [
                                    item.model_dump()
                                    for item in c.byte_role_hypotheses
                                ],
                                "signal_hypotheses": [
                                    item.model_dump()
                                    for item in c.signal_hypotheses[:12]
                                ],
                                "field_hypotheses": [
                                    item.model_dump()
                                    for item in c.field_hypotheses[:12]
                                ],
                                "analyzer_profile": c.analyzer_profile,
                                "quick_id_method": c.quick_id_method,
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
                                "confidence_before_label_prior": (
                                    c.confidence_before_label_prior
                                ),
                                "label_prior_applied": c.label_prior_applied,
                                "label_prior": c.label_prior,
                                "raw_marker_fraction": c.raw_marker_fraction,
                                "marker_window_coverage": c.marker_window_coverage,
                                "correlation_lift": c.correlation_lift,
                                "byte_transition_score": c.byte_transition_score,
                                "byte_transition_evidence": c.byte_transition_evidence,
                                "change_ratio": c.change_ratio,
                                "changed_frame_count": c.changed_frame_count,
                                "changed_frame_ratio": c.changed_frame_ratio,
                                "byte_entropy": c.byte_entropy,
                                "byte_evidence": [
                                    item.model_dump()
                                    for item in c.byte_evidence
                                ],
                                "byte_role_hypotheses": [
                                    item.model_dump()
                                    for item in c.byte_role_hypotheses
                                ],
                                "signal_hypotheses": [
                                    item.model_dump()
                                    for item in c.signal_hypotheses[:12]
                                ],
                                "field_hypotheses": [
                                    item.model_dump()
                                    for item in c.field_hypotheses[:12]
                                ],
                                "analyzer_profile": c.analyzer_profile,
                                "quick_id_method": c.quick_id_method,
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
                    "session_integrity": {
                        "capture_status": session_dict.get("capture_status"),
                        "finalized_at": session_dict.get("finalized_at"),
                        "final_frame_id": session_dict.get("final_frame_id"),
                        "final_frame_count": session_dict.get("final_frame_count"),
                        "final_marker_count": session_dict.get("final_marker_count"),
                        "capture_quality": session_dict.get("capture_quality"),
                        "timestamp_authority": "server",
                    },
                    "byte_hypothesis_count": sum(
                        len(candidate.byte_role_hypotheses)
                        + len(candidate.signal_hypotheses)
                        for candidate in candidates
                    ),
                    "field_hypothesis_count": sum(
                        len(candidate.field_hypotheses)
                        for candidate in candidates
                    ),
                    "analyzer_profile": analyzer_profile,
                    "quick_id_method": marker_selection.get("quick_id_method"),
                    "report_storage": "replace_latest_per_session",
                    "baseline_profile": baseline_profile,
                    "target_expected": not baseline_mode,
                    "baseline_subtraction": baseline_context,
                    "supervised_ml": ml_context,
                    "label_priors": label_prior_context,
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

                await conn.execute(
                    """
                    DELETE FROM can_signal_hypotheses auto_role
                    WHERE auto_role.session_id = $1
                      AND auto_role.source = 'auto_analysis'
                      AND NOT EXISTS (
                          SELECT 1
                          FROM can_signal_hypotheses human_role
                          WHERE human_role.session_id = auto_role.session_id
                            AND human_role.source = 'human'
                            AND human_role.can_id = auto_role.can_id
                            AND human_role.byte_index = auto_role.byte_index
                            AND COALESCE(human_role.bit_mask, 0) = COALESCE(auto_role.bit_mask, 0)
                            AND human_role.hypothesis_kind = auto_role.hypothesis_kind
                      )
                    """,
                    session_id,
                )
                hypothesis_rows = []
                for candidate in candidates:
                    for hypothesis in candidate.byte_role_hypotheses:
                        if hypothesis.source == "human":
                            # The canonical human row already exists. Preserve
                            # any previous auto suggestion for side-by-side
                            # review instead of duplicating the human decision
                            # as an auto_analysis record.
                            continue
                        bit_mask = hypothesis.bit_mask
                        hypothesis_key = (
                            f"{candidate.can_id}:{hypothesis.byte_index}:"
                            f"{bit_mask if bit_mask is not None else 0}:"
                            f"{hypothesis.hypothesis_kind}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            hypothesis_key,
                            candidate.can_id,
                            hypothesis.byte_index,
                            bit_mask,
                            hypothesis.hypothesis_kind,
                            None,
                            hypothesis.confidence,
                            hypothesis.reason,
                            json_dumps(hypothesis.metrics),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                            }),
                        ))
                    for field in candidate.field_hypotheses[:12]:
                        field_key = (
                            f"{candidate.can_id}:{field.start_byte}:0:"
                            f"numeric_field_candidate:{field.width_bits}:"
                            f"{field.endianness}:{int(field.signed)}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            field_key,
                            candidate.can_id,
                            field.start_byte,
                            None,
                            "numeric_field_candidate",
                            analyzer_profile,
                            field.score,
                            field.reason,
                            json_dumps(field.model_dump()),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "analyzer_profile": analyzer_profile,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                                "width_bits": field.width_bits,
                                "endianness": field.endianness,
                                "signed": field.signed,
                                "quick_id_method": candidate.quick_id_method,
                            }),
                        ))
                    for signal in candidate.signal_hypotheses[:12]:
                        signal_key = (
                            f"{candidate.can_id}:{signal.byte_index}:"
                            f"{signal.bit_mask}:boolean_signal_candidate:"
                            f"{','.join(sorted(signal.action_groups))}"
                        )
                        hypothesis_rows.append((
                            session_id,
                            session["vehicle_id"],
                            session["mission_id"],
                            session_dict.get("mission_code"),
                            signal_key,
                            candidate.can_id,
                            signal.byte_index,
                            signal.bit_mask,
                            "boolean_signal_candidate",
                            ",".join(sorted(signal.action_groups)),
                            signal.score,
                            signal.reason,
                            json_dumps(signal.model_dump()),
                            json_dumps({
                                "analysis_mode": analysis_mode,
                                "can_id_hex": candidate.can_id_hex,
                                "auto_detected": True,
                                "bit_index": signal.bit_index,
                                "quick_id_method": candidate.quick_id_method,
                                "action_groups": sorted(signal.action_groups),
                            }),
                        ))
                if hypothesis_rows:
                    await conn.executemany(
                        """
                        INSERT INTO can_signal_hypotheses (
                            session_id, vehicle_id, mission_id, mission_code,
                            hypothesis_key, can_id, byte_index, bit_mask,
                            hypothesis_kind, action_group, confidence, source, notes,
                            evidence, metadata
                        ) VALUES (
                            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                            'auto_analysis',$12,$13::jsonb,$14::jsonb
                        )
                        ON CONFLICT (session_id, hypothesis_key)
                        DO UPDATE SET
                            confidence = EXCLUDED.confidence,
                            notes = CASE
                                WHEN can_signal_hypotheses.source = 'human'
                                    THEN can_signal_hypotheses.notes
                                ELSE EXCLUDED.notes
                            END,
                            evidence = CASE
                                WHEN can_signal_hypotheses.source = 'human'
                                    THEN can_signal_hypotheses.evidence || EXCLUDED.evidence
                                ELSE EXCLUDED.evidence
                            END,
                            metadata = can_signal_hypotheses.metadata || EXCLUDED.metadata,
                            updated_at = now()
                        """,
                        hypothesis_rows,
                    )

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
                            "label_priors": label_prior_context,
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
                                "label_priors": label_prior_context,
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
        "analyzer_profile": analyzer_profile,
        "session_integrity": {
            "capture_status": session_dict.get("capture_status"),
            "finalized_at": session_dict.get("finalized_at"),
            "final_frame_id": session_dict.get("final_frame_id"),
            "final_frame_count": session_dict.get("final_frame_count"),
            "final_marker_count": session_dict.get("final_marker_count"),
            "capture_quality": session_dict.get("capture_quality"),
            "timestamp_authority": "server",
        },
        "byte_hypothesis_count": sum(
            len(candidate.byte_role_hypotheses)
            + len(candidate.signal_hypotheses)
            for candidate in candidates
        ),
        "field_hypothesis_count": sum(
            len(candidate.field_hypotheses)
            for candidate in candidates
        ),
        "baseline_profile": baseline_profile,
        "baseline_subtraction": baseline_context,
        "supervised_ml": ml_context,
        "label_priors": label_prior_context,
        "target_expected": not baseline_mode,
        "frames_analyzed": len(frames),
        "short_dlc_frames": short_dlc_frames,
        "invalid_width_frames": invalid_width_frames,
        "markers": len(marker_dicts),
        "selected_action_markers": marker_selection.get("action_markers"),
        "marker_selection": marker_selection,
        "quick_id_method": marker_selection.get("quick_id_method"),
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
        "analyzer_profile": latest_report_metadata.get("analyzer_profile"),
        "quick_id_method": latest_report_metadata.get("quick_id_method"),
        "session_integrity": latest_report_metadata.get("session_integrity"),
        "byte_hypothesis_count": latest_report_metadata.get("byte_hypothesis_count", 0),
        "field_hypothesis_count": latest_report_metadata.get("field_hypothesis_count", 0),
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
            cs.finalized_at,
            cs.capture_status,
            cs.final_frame_count,
            cs.final_marker_count,
            cs.capture_quality,
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
        capture_status = str(row.get("capture_status") or "open")
        completed = capture_status == "finalized"
        status = capture_status
        if capture_status == "finalized" and analyzed:
            status = "analyzed"
        elif capture_status == "finalized":
            status = "recorded"
        if capture_status == "finalized" and frame_count == 0 and marker_count > 0:
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
            "finalized_at": row.get("finalized_at"),
            "capture_status": row.get("capture_status"),
            "final_frame_count": row.get("final_frame_count"),
            "final_marker_count": row.get("final_marker_count"),
            "capture_quality": metadata_dict(row.get("capture_quality")),
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
            cs.finalized_at,
            cs.capture_status,
            cs.final_frame_count,
            cs.final_marker_count,
            cs.capture_quality,
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
        "finalized_at": item.get("finalized_at"),
        "capture_status": item.get("capture_status"),
        "final_frame_count": item.get("final_frame_count"),
        "final_marker_count": item.get("final_marker_count"),
        "capture_quality": metadata_dict(item.get("capture_quality")),
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
                ("can_signal_hypotheses", "session_id"),
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
                cs.finalized_at, cs.capture_status, cs.final_frame_id,
                cs.final_frame_count, cs.final_marker_count, cs.capture_quality,
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
        hypotheses = await conn.fetch(
            """
            SELECT id, can_id, byte_index, bit_mask, hypothesis_kind,
                   action_group, confidence, source, validation_status,
                   notes, evidence, metadata, created_at, updated_at
            FROM can_signal_hypotheses
            WHERE session_id = $1
            ORDER BY can_id, byte_index, confidence DESC
            """,
            session_id,
        )

    session_dict = dict(session)
    session_dict["id"] = str(session_dict["id"])
    session_dict["session_metadata"] = metadata_dict(session_dict.get("session_metadata"))
    session_dict["capture_quality"] = metadata_dict(session_dict.get("capture_quality"))

    hypothesis_items = []
    for row in hypotheses:
        item = dict(row)
        item["id"] = str(item["id"])
        item["can_id_hex"] = can_hex(int(item["can_id"]))
        item["evidence"] = metadata_dict(item.get("evidence"))
        item["metadata"] = metadata_dict(item.get("metadata"))
        hypothesis_items.append(item)

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
        "signal_hypotheses": hypothesis_items,
        "frames": frame_items,
        "frame_count": len(frame_items),
        "latest_report": dict(report) if report else None,
    }

    return Response(
        json.dumps(payload, default=str, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{session_id}.json"'},
    )