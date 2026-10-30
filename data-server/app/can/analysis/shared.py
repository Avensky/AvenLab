"""Single owner of configuration, request schemas, router and process/session state.
Edit feature modules for behavior; never create a second router or capture registry.
"""
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
from app.can.learning import (
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

MAX_RESPONSE_CANDIDATES = 15

MAX_RESPONSE_EVIDENCE_CANDIDATES = 5

MAX_RESPONSE_BYTE_EVIDENCE = 3

MAX_PERSISTED_REPORT_CANDIDATES = 10

BASELINE_PENALTY_WEIGHT = min(
    1.0,
    env_float("BASELINE_PENALTY_WEIGHT", 0.65, minimum=0.0),
)

VECTOR_DIMENSION = 768

EMBED_ONLY_MODEL_HINTS = ("embed", "embedding", "nomic-embed-text", "all-minilm")

ANALYSIS_MODE_BASELINE = "baseline_profile"

ANALYSIS_MODE_TARGET = "target_correlation"

BASELINE_CODE_PREFIXES = ("BASE", "NOISE", "SNIFF", "PROFILE")

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

BACKGROUND_BYTE_ROLE_KINDS = {
    "constant",
    "rolling_counter",
    "checksum_candidate",
    "payload_or_noise",
}

REPORT_SECTION_PATTERN = re.compile(
    r"(?im)^\s*#{0,6}\s*([1-5])\s*[.)\-:]\s*[^\n]*$"
)
