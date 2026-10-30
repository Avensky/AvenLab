"""Single owner of configuration, request schemas, router and process/session state.
Edit feature modules for behavior; never create a second router or capture registry.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import secrets
import statistics
from collections import Counter
from typing import Any, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field
from app.db import connect_db

def _env_float(name: str, default: float, minimum: float = 0.0) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else float(default)
    except (TypeError, ValueError):
        value = float(default)
    return max(value, minimum)

def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else int(default)
    except (TypeError, ValueError):
        value = int(default)
    return max(value, minimum)

ML_FEATURE_SCHEMA_VERSION = 5

ML_MIN_EXAMPLES = _env_int("ML_MIN_EXAMPLES", 8, minimum=4)

ML_MIN_DISTINCT_SESSIONS = _env_int(
    "ML_MIN_DISTINCT_SESSIONS",
    1,
    minimum=1,
)

ML_RECOMMENDED_DISTINCT_SESSIONS = _env_int(
    "ML_RECOMMENDED_DISTINCT_SESSIONS",
    5,
    minimum=2,
)

ML_ADMIN_TOKEN = os.getenv("ML_ADMIN_TOKEN", "").strip()

ML_TRAINING_EPOCHS = _env_int(
    "ML_TRAINING_EPOCHS",
    900,
    minimum=100,
)

ML_LEARNING_RATE = _env_float(
    "ML_LEARNING_RATE",
    0.08,
    minimum=0.0001,
)

ML_L2 = _env_float("ML_L2", 0.002, minimum=0.0)

ML_BLEND_WEIGHT = min(
    0.50,
    _env_float("ML_BLEND_WEIGHT", 0.25, minimum=0.0),
)

ML_FEATURE_NAMES = (
    "correlation_score",
    "raw_marker_fraction",
    "correlation_lift",
    "change_ratio",
    "changed_frame_ratio",
    "entropy_norm",
    "frequency_norm",
    "frame_volume_score",
    "active_byte_fraction",
    "max_byte_change_rate",
    "marker_latency_score",
    "action_shift_fraction",
    "baseline_overlap_score",
    "baseline_adjusted_change_ratio",
    "baseline_penalty",
    "rolling_counter_byte_fraction",
    "checksum_candidate_byte_fraction",
    "constant_byte_fraction",
    "top_bit_signal_score",
    "top_bit_window_purity",
    "top_bit_outside_action_fraction",
    "top_bit_repetition_score",
    "top_bit_inverse_pair_verified",
    "top_bit_location_dominance",
    "top_field_signal_score",
    "top_field_monotonicity",
    "top_field_level_separation",
    "top_field_repeatability",
    "top_field_plateau_stability",
    "top_field_return_consistency",
    "top_field_outside_action_drift",
    "top_field_response_latency_score",
    "top_field_marker_coverage",
    "top_field_location_dominance",
)

ml_router = APIRouter(tags=["can-ai"])

CANONICAL_BYTE_ROLE_KINDS = {
    "constant",
    "rolling_counter",
    "checksum_candidate",
    "periodic_or_state_bits",
    "payload_or_noise",
}

class CandidateLabelRequest(BaseModel):
    label: str = Field(pattern="^(positive|negative|uncertain)$")
    signal_name: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)

class SignalHypothesisRequest(BaseModel):
    can_id: int = Field(ge=0, le=0x1FFFFFFF)
    byte_index: int = Field(ge=0, le=7)
    bit_mask: Optional[int] = Field(default=None, ge=1, le=255)
    hypothesis_kind: str = Field(min_length=1, max_length=80)
    action_group: Optional[str] = Field(default=None, max_length=160)
    validation_status: str = Field(
        default="unreviewed",
        pattern="^(unreviewed|positive|negative|uncertain)$",
    )
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    notes: Optional[str] = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

class TrainCandidateModelRequest(BaseModel):
    vehicle_slug: str = Field(min_length=1, max_length=160)
    mission_code: Optional[str] = Field(default=None, max_length=160)
    bus_interface: Optional[str] = Field(default=None, max_length=80)
    bus_mode: Optional[str] = Field(default=None, max_length=80)
    capture_kind: str = Field(
        pattern="^(live|simulation)$",
    )
    min_examples: int = Field(default=ML_MIN_EXAMPLES, ge=4, le=10_000)
    min_distinct_sessions: int = Field(
        default=ML_MIN_DISTINCT_SESSIONS,
        ge=1,
        le=10_000,
    )
    epochs: int = Field(
        default=ML_TRAINING_EPOCHS,
        ge=100,
        le=20_000,
    )
    learning_rate: float = Field(
        default=ML_LEARNING_RATE,
        gt=0.0,
        le=1.0,
    )
    l2: float = Field(default=ML_L2, ge=0.0, le=10.0)
    activate: bool = True
