from __future__ import annotations

import asyncio
import json
import math
import os
import secrets
import statistics
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


ML_FEATURE_SCHEMA_VERSION = 2
ML_MIN_EXAMPLES = _env_int("ML_MIN_EXAMPLES", 8, minimum=4)
ML_MIN_DISTINCT_SESSIONS = _env_int(
    "ML_MIN_DISTINCT_SESSIONS",
    2,
    minimum=2,
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
)

ml_router = APIRouter(tags=["can-ai"])


class CandidateLabelRequest(BaseModel):
    label: str = Field(pattern="^(positive|negative|uncertain)$")
    signal_name: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=2_000)
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
        ge=2,
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


def _json_dumps(value: Any) -> str:
    return json.dumps(
        value,
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    )


def _json_object(value: Any) -> dict[str, Any]:
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


def _can_hex(can_id: int) -> str:
    return f"0x{can_id:03X}"


def _capture_kind(
    bus_interface: Optional[str],
    bus_mode: Optional[str],
) -> str:
    interface = (bus_interface or "").lower()
    mode = (bus_mode or "").lower()
    if mode in {"simulation", "replay", "offline"} or interface == "vcan0":
        return "simulation"
    return "live"


def _require_ml_admin(token: Optional[str]) -> None:
    """Require the configured token for write operations.

    Development remains backward-compatible when ML_ADMIN_TOKEN is unset.
    Production should always configure a token and keep it out of public
    frontend bundles.
    """
    if not ML_ADMIN_TOKEN:
        return
    if not token or not secrets.compare_digest(token, ML_ADMIN_TOKEN):
        raise HTTPException(
            status_code=403,
            detail="A valid X-AvenLab-ML-Token header is required.",
        )


def _validated_positive_label(payload: CandidateLabelRequest) -> None:
    if payload.label != "positive":
        return

    if not payload.signal_name or not payload.signal_name.strip():
        raise HTTPException(
            status_code=422,
            detail="Positive labels require signal_name.",
        )
    if not payload.notes or len(payload.notes.strip()) < 20:
        raise HTTPException(
            status_code=422,
            detail="Positive labels require meaningful validation notes.",
        )

    validation_method = payload.metadata.get("validation_method")
    independent_sessions = payload.metadata.get("independent_sessions", 0)
    try:
        independent_sessions = int(independent_sessions)
    except (TypeError, ValueError):
        independent_sessions = 0

    if not validation_method or independent_sessions < 2:
        raise HTTPException(
            status_code=422,
            detail=(
                "Positive labels require metadata.validation_method and "
                "metadata.independent_sessions >= 2. Use uncertain until "
                "the candidate is independently validated."
            ),
        )


def ml_configuration() -> dict[str, Any]:
    return {
        "model_type": "balanced_logistic_regression",
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
        "feature_names": list(ML_FEATURE_NAMES),
        "minimum_examples": ML_MIN_EXAMPLES,
        "minimum_distinct_sessions": ML_MIN_DISTINCT_SESSIONS,
        "recommended_distinct_sessions": ML_RECOMMENDED_DISTINCT_SESSIONS,
        "training_epochs": ML_TRAINING_EPOCHS,
        "learning_rate": ML_LEARNING_RATE,
        "l2": ML_L2,
        "blend_weight": ML_BLEND_WEIGHT,
        "label_source": "explicit_human_labels_only",
        "cross_validation": "grouped_by_recording_session",
        "write_routes_protected": bool(ML_ADMIN_TOKEN),
        "runtime_dependencies": "python_standard_library",
    }


def _sigmoid(value: float) -> float:
    if value >= 0:
        exponent = math.exp(-value)
        return 1.0 / (1.0 + exponent)
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def _safe_probability(value: float) -> float:
    return min(1.0 - 1e-9, max(1e-9, float(value)))


def _feature_vector_from_values(
    *,
    frame_count: int,
    frequency_hz: Optional[float],
    entropy_value: float,
    byte_change_counts: dict[str, int],
    byte_evidence: list[dict[str, Any]],
    correlation_score: float,
    raw_marker_fraction: float,
    correlation_lift: float,
    change_ratio: float,
    changed_frame_ratio: float,
    baseline_overlap_score: float,
    baseline_adjusted_change_ratio: float,
    baseline_penalty: float,
) -> dict[str, float]:
    transitions = max(int(frame_count) - 1, 1)
    byte_rates = [
        float(byte_change_counts.get(str(index), 0) or 0) / transitions
        for index in range(8)
    ]
    active_byte_fraction = (
        sum(1 for rate in byte_rates if rate > 0.0) / 8.0
    )
    max_byte_change_rate = max(byte_rates, default=0.0)

    latencies: list[float] = []
    action_shift_count = 0
    evidence_count = 0

    for item in byte_evidence:
        if not isinstance(item, dict):
            continue
        evidence_count += 1

        marker_observations = item.get("marker_observations")
        observation_shift_found = False

        if isinstance(marker_observations, list) and marker_observations:
            for observation in marker_observations:
                if not isinstance(observation, dict):
                    continue

                latency = observation.get("latency_ms")
                if (
                    isinstance(latency, (int, float))
                    and latency >= 0
                ):
                    latencies.append(float(latency))

                pre_value = observation.get("pre_mode")
                action_value = observation.get("action_mode")
                if (
                    pre_value is not None
                    and action_value is not None
                    and pre_value != action_value
                ):
                    observation_shift_found = True

            if observation_shift_found:
                action_shift_count += 1
            continue

        # Backward-compatible fallback for schema-v1 evidence that predates
        # explicit per-marker observations.
        latency = item.get("median_marker_latency_ms")
        if isinstance(latency, (int, float)) and latency >= 0:
            latencies.append(float(latency))

        pre_value = item.get("pre_marker_mode")
        action_value = item.get("action_window_mode")
        if (
            pre_value is not None
            and action_value is not None
            and pre_value != action_value
        ):
            action_shift_count += 1

    marker_latency_score = 0.0
    if latencies:
        median_latency = float(statistics.median(latencies))
        marker_latency_score = 1.0 / (
            1.0 + (median_latency / 1_000.0)
        )

    action_shift_fraction = (
        action_shift_count / evidence_count
        if evidence_count > 0
        else 0.0
    )

    frequency_value = max(0.0, float(frequency_hz or 0.0))
    frequency_norm = min(
        1.0,
        math.log1p(frequency_value) / math.log1p(100.0),
    )

    return {
        "correlation_score": float(correlation_score),
        "raw_marker_fraction": float(raw_marker_fraction),
        "correlation_lift": float(correlation_lift),
        "change_ratio": float(change_ratio),
        "changed_frame_ratio": float(changed_frame_ratio),
        "entropy_norm": min(
            1.0,
            max(0.0, float(entropy_value) / 8.0),
        ),
        "frequency_norm": frequency_norm,
        "frame_volume_score": min(
            max(int(frame_count), 0) / 200.0,
            1.0,
        ),
        "active_byte_fraction": active_byte_fraction,
        "max_byte_change_rate": max_byte_change_rate,
        "marker_latency_score": marker_latency_score,
        "action_shift_fraction": action_shift_fraction,
        "baseline_overlap_score": float(baseline_overlap_score),
        "baseline_adjusted_change_ratio": float(
            baseline_adjusted_change_ratio
        ),
        "baseline_penalty": float(baseline_penalty),
    }


def candidate_feature_vector(candidate: Any) -> dict[str, float]:
    evidence = []
    for item in getattr(candidate, "byte_evidence", []):
        if hasattr(item, "model_dump"):
            evidence.append(item.model_dump())
        elif isinstance(item, dict):
            evidence.append(item)

    return _feature_vector_from_values(
        frame_count=int(getattr(candidate, "frame_count", 0) or 0),
        frequency_hz=getattr(candidate, "frequency_hz", None),
        entropy_value=float(getattr(candidate, "entropy", 0.0) or 0.0),
        byte_change_counts=dict(
            getattr(candidate, "byte_change_counts", {}) or {}
        ),
        byte_evidence=evidence,
        correlation_score=float(
            getattr(candidate, "correlation_score", 0.0) or 0.0
        ),
        raw_marker_fraction=float(
            getattr(candidate, "raw_marker_fraction", 0.0) or 0.0
        ),
        correlation_lift=float(
            getattr(candidate, "correlation_lift", 0.0) or 0.0
        ),
        change_ratio=float(
            getattr(candidate, "change_ratio", 0.0) or 0.0
        ),
        changed_frame_ratio=float(
            getattr(candidate, "changed_frame_ratio", 0.0) or 0.0
        ),
        baseline_overlap_score=float(
            getattr(candidate, "baseline_overlap_score", 0.0) or 0.0
        ),
        baseline_adjusted_change_ratio=float(
            getattr(
                candidate,
                "baseline_adjusted_change_ratio",
                getattr(candidate, "change_ratio", 0.0),
            )
            or 0.0
        ),
        baseline_penalty=float(
            getattr(candidate, "baseline_penalty", 0.0) or 0.0
        ),
    )


def _persisted_feature_vector(
    feature_row: dict[str, Any],
    correlation_row: Optional[dict[str, Any]],
) -> dict[str, float]:
    feature_metadata = _json_object(feature_row.get("metadata"))
    correlation_metadata = _json_object(
        correlation_row.get("metadata")
        if correlation_row
        else None
    )

    evidence = feature_metadata.get("byte_evidence")
    if not isinstance(evidence, list):
        evidence = correlation_metadata.get("byte_evidence")
    if not isinstance(evidence, list):
        evidence = []

    byte_counts_raw = _json_object(
        feature_row.get("byte_change_counts")
    )
    byte_counts = {
        str(index): int(byte_counts_raw.get(str(index), 0) or 0)
        for index in range(8)
    }

    correlation_score = 0.0
    if correlation_row:
        correlation_score = float(
            correlation_row.get("score") or 0.0
        )

    return _feature_vector_from_values(
        frame_count=int(feature_row.get("frame_count") or 0),
        frequency_hz=(
            float(feature_row["frequency_hz"])
            if feature_row.get("frequency_hz") is not None
            else None
        ),
        entropy_value=float(feature_row.get("entropy") or 0.0),
        byte_change_counts=byte_counts,
        byte_evidence=[
            item
            for item in evidence
            if isinstance(item, dict)
        ],
        correlation_score=correlation_score,
        raw_marker_fraction=float(
            correlation_metadata.get(
                "raw_marker_fraction",
                feature_metadata.get("raw_marker_fraction", 0.0),
            )
            or 0.0
        ),
        correlation_lift=float(
            correlation_metadata.get(
                "correlation_lift",
                feature_metadata.get("correlation_lift", 0.0),
            )
            or 0.0
        ),
        change_ratio=float(
            feature_metadata.get("change_ratio") or 0.0
        ),
        changed_frame_ratio=float(
            feature_metadata.get("changed_frame_ratio") or 0.0
        ),
        baseline_overlap_score=float(
            correlation_metadata.get(
                "baseline_overlap_score",
                feature_metadata.get("baseline_overlap_score", 0.0),
            )
            or 0.0
        ),
        baseline_adjusted_change_ratio=float(
            correlation_metadata.get(
                "baseline_adjusted_change_ratio",
                feature_metadata.get(
                    "baseline_adjusted_change_ratio",
                    feature_metadata.get("change_ratio", 0.0),
                ),
            )
            or 0.0
        ),
        baseline_penalty=float(
            correlation_metadata.get(
                "baseline_penalty",
                feature_metadata.get("baseline_penalty", 0.0),
            )
            or 0.0
        ),
    )


def _standardization_parameters(
    examples: list[tuple[dict[str, float], int]],
) -> tuple[dict[str, float], dict[str, float]]:
    means: dict[str, float] = {}
    scales: dict[str, float] = {}

    for name in ML_FEATURE_NAMES:
        values = [
            float(features.get(name, 0.0))
            for features, _ in examples
        ]
        mean_value = (
            float(statistics.mean(values))
            if values
            else 0.0
        )
        variance = (
            float(
                statistics.mean(
                    (value - mean_value) ** 2
                    for value in values
                )
            )
            if values
            else 0.0
        )
        means[name] = mean_value
        scales[name] = max(math.sqrt(variance), 1e-6)

    return means, scales


def _standardized_vector(
    features: dict[str, float],
    means: dict[str, float],
    scales: dict[str, float],
) -> list[float]:
    return [
        (
            float(features.get(name, 0.0))
            - float(means.get(name, 0.0))
        )
        / max(float(scales.get(name, 1.0)), 1e-6)
        for name in ML_FEATURE_NAMES
    ]


def _train_logistic_model(
    examples: list[tuple[dict[str, float], int]],
    *,
    epochs: int,
    learning_rate: float,
    l2: float,
) -> dict[str, Any]:
    positive_count = sum(label for _, label in examples)
    negative_count = len(examples) - positive_count

    if positive_count < 1 or negative_count < 1:
        raise ValueError(
            "Training requires at least one positive and one negative label."
        )

    means, scales = _standardization_parameters(examples)
    rows = [
        (_standardized_vector(features, means, scales), label)
        for features, label in examples
    ]

    weights = [0.0 for _ in ML_FEATURE_NAMES]
    base_rate = _safe_probability(
        positive_count / len(examples)
    )
    bias = math.log(base_rate / (1.0 - base_rate))

    positive_weight = len(examples) / (2.0 * positive_count)
    negative_weight = len(examples) / (2.0 * negative_count)

    for _ in range(epochs):
        weight_gradients = [0.0 for _ in ML_FEATURE_NAMES]
        bias_gradient = 0.0

        for vector, label in rows:
            score = bias + sum(
                weight * value
                for weight, value in zip(weights, vector)
            )
            prediction = _sigmoid(score)
            sample_weight = (
                positive_weight
                if label == 1
                else negative_weight
            )
            error = (prediction - label) * sample_weight

            bias_gradient += error
            for index, value in enumerate(vector):
                weight_gradients[index] += error * value

        count = max(len(rows), 1)
        bias -= learning_rate * (bias_gradient / count)

        for index in range(len(weights)):
            gradient = (
                weight_gradients[index] / count
            ) + (l2 * weights[index])
            weights[index] -= learning_rate * gradient

    return {
        "feature_names": list(ML_FEATURE_NAMES),
        "means": means,
        "scales": scales,
        "weights": {
            name: float(weights[index])
            for index, name in enumerate(ML_FEATURE_NAMES)
        },
        "bias": float(bias),
    }


def _predict(
    model: dict[str, Any],
    features: dict[str, float],
) -> float:
    means = {
        str(key): float(value)
        for key, value in _json_object(model.get("means")).items()
    }
    scales = {
        str(key): float(value)
        for key, value in _json_object(model.get("scales")).items()
    }
    weights = {
        str(key): float(value)
        for key, value in _json_object(model.get("weights")).items()
    }

    vector = _standardized_vector(features, means, scales)
    score = float(model.get("bias") or 0.0)

    for index, name in enumerate(ML_FEATURE_NAMES):
        score += float(weights.get(name, 0.0)) * vector[index]

    return _sigmoid(score)


def _binary_metrics(
    probabilities: list[float],
    labels: list[int],
) -> dict[str, float]:
    true_positive = 0
    false_positive = 0
    true_negative = 0
    false_negative = 0
    log_loss = 0.0

    for probability, label in zip(probabilities, labels):
        probability = _safe_probability(probability)
        prediction = 1 if probability >= 0.5 else 0

        log_loss += -(
            label * math.log(probability)
            + (1 - label) * math.log(1.0 - probability)
        )

        if prediction == 1 and label == 1:
            true_positive += 1
        elif prediction == 1 and label == 0:
            false_positive += 1
        elif prediction == 0 and label == 0:
            true_negative += 1
        else:
            false_negative += 1

    total = max(len(labels), 1)
    precision = true_positive / max(
        true_positive + false_positive,
        1,
    )
    recall = true_positive / max(
        true_positive + false_negative,
        1,
    )
    f1 = (
        2.0 * precision * recall
        / max(precision + recall, 1e-9)
    )

    return {
        "accuracy": (true_positive + true_negative) / total,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "log_loss": log_loss / total,
        "true_positive": float(true_positive),
        "false_positive": float(false_positive),
        "true_negative": float(true_negative),
        "false_negative": float(false_negative),
    }


def _evaluate(
    model: dict[str, Any],
    examples: list[tuple[dict[str, float], int]],
) -> dict[str, float]:
    return _binary_metrics(
        [
            _predict(model, features)
            for features, _ in examples
        ],
        [label for _, label in examples],
    )


def _cross_validate_grouped(
    examples: list[tuple[dict[str, float], int, str]],
    *,
    epochs: int,
    learning_rate: float,
    l2: float,
) -> dict[str, Any]:
    """Evaluate without placing candidates from one session in both sets."""
    session_ids = sorted({session_id for _, _, session_id in examples})
    if len(session_ids) < 2:
        return {
            "available": False,
            "folds": 0,
            "grouping": "session_id",
            "reason": "Grouped validation requires at least two sessions.",
        }

    fold_count = min(5, len(session_ids))
    fold_sessions: list[set[str]] = [set() for _ in range(fold_count)]
    for index, session_id in enumerate(session_ids):
        fold_sessions[index % fold_count].add(session_id)

    fold_results: list[dict[str, Any]] = []
    skipped_folds: list[dict[str, Any]] = []

    for fold_index, test_session_ids in enumerate(fold_sessions):
        training_rows = [
            (features, label)
            for features, label, session_id in examples
            if session_id not in test_session_ids
        ]
        testing_rows = [
            (features, label)
            for features, label, session_id in examples
            if session_id in test_session_ids
        ]

        training_positive = sum(label for _, label in training_rows)
        training_negative = len(training_rows) - training_positive
        if (
            not training_rows
            or not testing_rows
            or training_positive < 1
            or training_negative < 1
        ):
            skipped_folds.append({
                "fold": fold_index + 1,
                "test_sessions": sorted(test_session_ids),
                "reason": "Training fold did not contain both classes.",
            })
            continue

        model = _train_logistic_model(
            training_rows,
            epochs=epochs,
            learning_rate=learning_rate,
            l2=l2,
        )
        metrics = _evaluate(model, testing_rows)
        fold_results.append({
            "fold": fold_index + 1,
            "test_sessions": sorted(test_session_ids),
            "training_examples": len(training_rows),
            "testing_examples": len(testing_rows),
            **metrics,
        })

    if not fold_results:
        return {
            "available": False,
            "folds": 0,
            "grouping": "session_id",
            "distinct_sessions": len(session_ids),
            "skipped_folds": skipped_folds,
            "reason": "No valid session-grouped folds could be trained.",
        }

    metric_names = ("accuracy", "precision", "recall", "f1", "log_loss")
    return {
        "available": True,
        "folds": len(fold_results),
        "grouping": "session_id",
        "distinct_sessions": len(session_ids),
        "mean": {
            name: float(statistics.mean(fold[name] for fold in fold_results))
            for name in metric_names
        },
        "per_fold": fold_results,
        "skipped_folds": skipped_folds,
    }


def _train_and_evaluate(
    examples: list[tuple[dict[str, float], int, str]],
    *,
    epochs: int,
    learning_rate: float,
    l2: float,
) -> tuple[dict[str, Any], dict[str, float], dict[str, Any]]:
    flat_examples = [(features, label) for features, label, _ in examples]
    model = _train_logistic_model(
        flat_examples,
        epochs=epochs,
        learning_rate=learning_rate,
        l2=l2,
    )
    training_metrics = _evaluate(model, flat_examples)
    cross_validation = _cross_validate_grouped(
        examples,
        epochs=max(200, epochs // 2),
        learning_rate=learning_rate,
        l2=l2,
    )
    return model, training_metrics, cross_validation


async def ensure_ml_tables(conn: Any) -> None:
    labels_table = await conn.fetchval(
        "SELECT to_regclass('public.can_ml_labels')"
    )
    models_table = await conn.fetchval(
        "SELECT to_regclass('public.can_ml_models')"
    )

    if not labels_table or not models_table:
        raise HTTPException(
            status_code=503,
            detail=(
                "Supervised ML tables are not installed. Apply "
                "20260712_add_can_supervised_ml.sql first."
            ),
        )


async def load_active_ml_model(
    conn: Any,
    *,
    vehicle_id: UUID,
    mission_code: Optional[str],
    bus_interface: Optional[str],
    bus_mode: Optional[str],
    capture_kind: str,
    requested_model_id: Optional[UUID],
) -> tuple[dict[str, Any], dict[str, Any]]:
    await ensure_ml_tables(conn)

    if requested_model_id is not None:
        row = await conn.fetchrow(
            """
            SELECT *
            FROM can_ml_models
            WHERE id = $1
              AND vehicle_id = $2
              AND (bus_interface = $3 OR bus_interface IS NULL)
              AND (bus_mode = $4 OR bus_mode IS NULL)
              AND capture_kind = $5
            """,
            requested_model_id,
            vehicle_id,
            bus_interface,
            bus_mode,
            capture_kind,
        )
        selection = "explicit"
    else:
        row = await conn.fetchrow(
            """
            SELECT *
            FROM can_ml_models
            WHERE vehicle_id = $1
              AND is_active = true
              AND (mission_code = $2 OR mission_code IS NULL)
              AND (bus_interface = $3 OR bus_interface IS NULL)
              AND (bus_mode = $4 OR bus_mode IS NULL)
              AND capture_kind = $5
            ORDER BY
                CASE WHEN mission_code = $2 THEN 0 ELSE 1 END,
                CASE WHEN bus_interface = $3 THEN 0 ELSE 1 END,
                CASE WHEN bus_mode = $4 THEN 0 ELSE 1 END,
                created_at DESC
            LIMIT 1
            """,
            vehicle_id,
            mission_code,
            bus_interface,
            bus_mode,
            capture_kind,
        )
        selection = "automatic"

    if row is None:
        return (
            {
                "applied": False,
                "found": False,
                "selection": selection,
                "scope": {
                    "mission_code": mission_code,
                    "bus_interface": bus_interface,
                    "bus_mode": bus_mode,
                    "capture_kind": capture_kind,
                },
                "reason": (
                    "No active supervised model was found for this vehicle, "
                    "mission, and capture-source scope."
                ),
            },
            {},
        )

    model = dict(row)
    model["means"] = _json_object(model.get("feature_means"))
    model["scales"] = _json_object(model.get("feature_scales"))
    model["weights"] = _json_object(model.get("weights"))
    model["metrics"] = _json_object(model.get("metrics"))
    model["metadata"] = _json_object(model.get("metadata"))

    model_version = int(
        model["metadata"].get("feature_schema_version", 0) or 0
    )
    if model_version != ML_FEATURE_SCHEMA_VERSION:
        return (
            {
                "applied": False,
                "found": True,
                "selection": selection,
                "model_id": str(model["id"]),
                "reason": (
                    f"Model feature schema {model_version} does not match "
                    f"runtime schema {ML_FEATURE_SCHEMA_VERSION}. Retrain it."
                ),
            },
            {},
        )

    return (
        {
            "applied": True,
            "found": True,
            "selection": selection,
            "model_id": str(model["id"]),
            "model_type": model.get("model_type"),
            "feature_schema_version": model_version,
            "mission_code": model.get("mission_code"),
            "bus_interface": model.get("bus_interface"),
            "bus_mode": model.get("bus_mode"),
            "capture_kind": model.get("capture_kind"),
            "label_count": int(model.get("label_count") or 0),
            "positive_count": int(model.get("positive_count") or 0),
            "negative_count": int(model.get("negative_count") or 0),
            "metrics": model["metrics"],
            "blend_weight": ML_BLEND_WEIGHT,
            "created_at": model.get("created_at"),
        },
        model,
    )


def apply_supervised_model(
    candidates: list[Any],
    model: dict[str, Any],
    model_context: dict[str, Any],
) -> None:
    if not model_context.get("applied") or not model:
        return

    model_id = str(model.get("id"))

    for candidate in candidates:
        features = candidate_feature_vector(candidate)
        probability = _predict(model, features)
        original_confidence = float(
            getattr(candidate, "confidence", 0.0) or 0.0
        )
        blended_confidence = (
            ((1.0 - ML_BLEND_WEIGHT) * original_confidence)
            + (ML_BLEND_WEIGHT * probability)
        )

        candidate.ml_applied = True
        candidate.ml_model_id = model_id
        candidate.ml_probability = round(probability, 6)
        candidate.ml_blend_weight = ML_BLEND_WEIGHT
        candidate.confidence_before_ml = original_confidence
        candidate.ml_feature_vector = {
            key: round(value, 8)
            for key, value in features.items()
        }
        candidate.confidence = round(
            min(1.0, max(0.0, blended_confidence)),
            5,
        )
        candidate.notes = (
            f"{candidate.notes}; supervised probability="
            f"{candidate.ml_probability:.3f}"
        )

    candidates.sort(
        key=lambda candidate: (
            candidate.confidence,
            candidate.ml_probability or 0.0,
            candidate.correlation_score,
            candidate.baseline_adjusted_change_ratio,
            candidate.change_count,
        ),
        reverse=True,
    )


@ml_router.post("/session/{session_id}/candidate/{can_id}/label")
async def label_candidate(
    session_id: UUID,
    can_id: int,
    payload: CandidateLabelRequest,
    x_avenlab_ml_token: Optional[str] = Header(
        default=None,
        alias="X-AvenLab-ML-Token",
    ),
) -> dict[str, Any]:
    """Store an explicit human candidate label and immutable feature snapshot."""
    _require_ml_admin(x_avenlab_ml_token)
    _validated_positive_label(payload)
    pool = await connect_db()

    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        session = await conn.fetchrow(
            """
            SELECT
                cs.id,
                cs.vehicle_id,
                cs.mission_id,
                cs.bus_interface,
                cs.bus_mode,
                v.slug AS vehicle_slug,
                rm.mission_code
            FROM can_sessions cs
            JOIN vehicles v ON v.id = cs.vehicle_id
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if session is None:
            raise HTTPException(status_code=404, detail="CAN session not found")

        feature = await conn.fetchrow(
            """
            SELECT can_id, frame_count, change_count, byte_change_counts,
                   entropy, frequency_hz, metadata
            FROM can_id_features
            WHERE session_id = $1 AND can_id = $2
            """,
            session_id,
            can_id,
        )
        if feature is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Candidate features were not found. Analyze and persist "
                    "the session before labeling it."
                ),
            )

        correlation = await conn.fetchrow(
            """
            SELECT score, confidence, notes, metadata
            FROM can_id_correlations
            WHERE session_id = $1 AND can_id = $2
            ORDER BY created_at DESC
            LIMIT 1
            """,
            session_id,
            can_id,
        )

        feature_vector = _persisted_feature_vector(
            dict(feature),
            dict(correlation) if correlation else None,
        )
        capture_kind = _capture_kind(
            session["bus_interface"],
            session["bus_mode"],
        )
        label_metadata = {
            **payload.metadata,
            "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
            "vehicle_slug": session["vehicle_slug"],
            "capture_kind": capture_kind,
        }

        await conn.execute(
            """
            INSERT INTO can_ml_labels (
                id, session_id, vehicle_id, mission_id, mission_code,
                bus_interface, bus_mode, capture_kind,
                can_id, label, signal_name, notes, feature_vector,
                source, metadata, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13::jsonb,
                'human', $14::jsonb, now(), now()
            )
            ON CONFLICT (session_id, can_id)
            DO UPDATE SET
                mission_code = EXCLUDED.mission_code,
                bus_interface = EXCLUDED.bus_interface,
                bus_mode = EXCLUDED.bus_mode,
                capture_kind = EXCLUDED.capture_kind,
                label = EXCLUDED.label,
                signal_name = EXCLUDED.signal_name,
                notes = EXCLUDED.notes,
                feature_vector = EXCLUDED.feature_vector,
                source = EXCLUDED.source,
                metadata = EXCLUDED.metadata,
                updated_at = now()
            """,
            uuid4(),
            session_id,
            session["vehicle_id"],
            session["mission_id"],
            session["mission_code"],
            session["bus_interface"],
            session["bus_mode"],
            capture_kind,
            can_id,
            payload.label,
            payload.signal_name,
            payload.notes,
            _json_dumps(feature_vector),
            _json_dumps(label_metadata),
        )

    return {
        "ok": True,
        "session_id": str(session_id),
        "can_id": can_id,
        "can_id_hex": _can_hex(can_id),
        "label": payload.label,
        "scope": {
            "vehicle_slug": session["vehicle_slug"],
            "mission_code": session["mission_code"],
            "bus_interface": session["bus_interface"],
            "bus_mode": session["bus_mode"],
            "capture_kind": capture_kind,
        },
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
        "included_in_training": payload.label in {"positive", "negative"},
        "feature_vector": feature_vector,
    }


@ml_router.get("/session/{session_id}/ml-labels")
async def get_session_ml_labels(session_id: UUID) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        rows = await conn.fetch(
            """
            SELECT can_id, label, signal_name, notes, source, metadata,
                   bus_interface, bus_mode, capture_kind,
                   created_at, updated_at
            FROM can_ml_labels
            WHERE session_id = $1
            ORDER BY can_id ASC
            """,
            session_id,
        )

    labels = {}
    for row in rows:
        item = dict(row)
        item["metadata"] = _json_object(item.get("metadata"))
        item["can_id_hex"] = _can_hex(int(item["can_id"]))
        labels[str(item["can_id"])] = item

    return {
        "ok": True,
        "session_id": str(session_id),
        "label_count": len(labels),
        "labels": labels,
    }


async def _load_training_rows(
    conn: Any,
    *,
    vehicle_id: UUID,
    mission_code: Optional[str],
    bus_interface: Optional[str],
    bus_mode: Optional[str],
    capture_kind: Optional[str],
    include_uncertain: bool = False,
) -> list[Any]:
    labels = ("positive", "negative", "uncertain") if include_uncertain else (
        "positive",
        "negative",
    )
    return list(await conn.fetch(
        """
        SELECT id, session_id, can_id, label, mission_code,
               bus_interface, bus_mode, capture_kind,
               feature_vector, metadata, created_at, updated_at
        FROM can_ml_labels
        WHERE vehicle_id = $1
          AND label = ANY($2::text[])
          AND ($3::text IS NULL OR mission_code = $3)
          AND ($4::text IS NULL OR bus_interface = $4)
          AND ($5::text IS NULL OR bus_mode = $5)
          AND ($6::text IS NULL OR capture_kind = $6)
        ORDER BY created_at ASC, id ASC
        """,
        vehicle_id,
        list(labels),
        mission_code,
        bus_interface,
        bus_mode,
        capture_kind,
    ))


def _training_examples(rows: list[Any]) -> tuple[
    list[tuple[dict[str, float], int, str]],
    list[str],
    set[str],
]:
    examples: list[tuple[dict[str, float], int, str]] = []
    label_ids: list[str] = []
    session_ids: set[str] = set()

    for row in rows:
        metadata = _json_object(row["metadata"])
        version = int(metadata.get("feature_schema_version", 0) or 0)
        if version != ML_FEATURE_SCHEMA_VERSION:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Label {row['id']} uses feature schema {version}; "
                    f"runtime expects {ML_FEATURE_SCHEMA_VERSION}. Relabel "
                    "the candidate after reanalysis."
                ),
            )

        raw_vector = _json_object(row["feature_vector"])
        vector = {
            name: float(raw_vector.get(name, 0.0) or 0.0)
            for name in ML_FEATURE_NAMES
        }
        label = 1 if row["label"] == "positive" else 0
        session_id = str(row["session_id"])
        examples.append((vector, label, session_id))
        label_ids.append(str(row["id"]))
        session_ids.add(session_id)

    return examples, label_ids, session_ids


@ml_router.get("/ml/readiness")
async def get_ml_readiness(
    vehicle_slug: str = Query(...),
    mission_code: Optional[str] = Query(default=None),
    bus_interface: Optional[str] = Query(default=None),
    bus_mode: Optional[str] = Query(default=None),
    capture_kind: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        vehicle = await conn.fetchrow(
            "SELECT id FROM vehicles WHERE slug = $1",
            vehicle_slug,
        )
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        rows = await _load_training_rows(
            conn,
            vehicle_id=vehicle["id"],
            mission_code=mission_code,
            bus_interface=bus_interface,
            bus_mode=bus_mode,
            capture_kind=capture_kind,
            include_uncertain=True,
        )

    counts = {"positive": 0, "negative": 0, "uncertain": 0}
    trainable_sessions: set[str] = set()
    compatible_counts = {"positive": 0, "negative": 0}
    compatible_trainable = 0
    incompatible = 0

    for row in rows:
        counts[row["label"]] = counts.get(row["label"], 0) + 1
        metadata = _json_object(row["metadata"])
        version = int(metadata.get("feature_schema_version", 0) or 0)
        if row["label"] in {"positive", "negative"}:
            if version == ML_FEATURE_SCHEMA_VERSION:
                compatible_trainable += 1
                compatible_counts[row["label"]] += 1
                trainable_sessions.add(str(row["session_id"]))
            else:
                incompatible += 1

    missing = {
        "total": max(0, ML_MIN_EXAMPLES - compatible_trainable),
        "positive": max(0, 2 - compatible_counts["positive"]),
        "negative": max(0, 2 - compatible_counts["negative"]),
        "distinct_sessions": max(
            0,
            ML_MIN_DISTINCT_SESSIONS - len(trainable_sessions),
        ),
    }
    ready = all(value == 0 for value in missing.values())

    return {
        "ok": True,
        "ready_to_train": ready,
        "scope": {
            "vehicle_slug": vehicle_slug,
            "mission_code": mission_code,
            "bus_interface": bus_interface,
            "bus_mode": bus_mode,
            "capture_kind": capture_kind,
        },
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
        "counts": counts,
        "compatible_counts": compatible_counts,
        "compatible_trainable_labels": compatible_trainable,
        "incompatible_feature_labels": incompatible,
        "distinct_sessions": len(trainable_sessions),
        "minimum_examples": ML_MIN_EXAMPLES,
        "minimum_distinct_sessions": ML_MIN_DISTINCT_SESSIONS,
        "recommended_distinct_sessions": ML_RECOMMENDED_DISTINCT_SESSIONS,
        "missing": missing,
    }


@ml_router.post("/ml/train")
async def train_candidate_model(
    payload: TrainCandidateModelRequest,
    x_avenlab_ml_token: Optional[str] = Header(
        default=None,
        alias="X-AvenLab-ML-Token",
    ),
) -> dict[str, Any]:
    """Train a scoped model and evaluate it by recording session."""
    _require_ml_admin(x_avenlab_ml_token)
    pool = await connect_db()

    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        vehicle = await conn.fetchrow(
            """
            SELECT id, slug, year, make, model
            FROM vehicles
            WHERE slug = $1
            """,
            payload.vehicle_slug,
        )
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")

        rows = await _load_training_rows(
            conn,
            vehicle_id=vehicle["id"],
            mission_code=payload.mission_code,
            bus_interface=payload.bus_interface,
            bus_mode=payload.bus_mode,
            capture_kind=payload.capture_kind,
        )

    examples, label_ids, session_ids = _training_examples(rows)
    positive_count = sum(label for _, label, _ in examples)
    negative_count = len(examples) - positive_count

    if len(examples) < payload.min_examples:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need at least {payload.min_examples} compatible labels; "
                f"found {len(examples)}."
            ),
        )
    if positive_count < 2 or negative_count < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "Need at least two positive and two negative labels. "
                f"Found positives={positive_count}, negatives={negative_count}."
            ),
        )
    if len(session_ids) < payload.min_distinct_sessions:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need labels from at least {payload.min_distinct_sessions} "
                f"distinct sessions; found {len(session_ids)}."
            ),
        )

    model, training_metrics, cross_validation = await asyncio.to_thread(
        _train_and_evaluate,
        examples,
        epochs=payload.epochs,
        learning_rate=payload.learning_rate,
        l2=payload.l2,
    )

    metrics = {
        "training": training_metrics,
        "cross_validation": cross_validation,
    }
    metadata = {
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
        "training_method": "balanced_batch_gradient_descent",
        "label_source": "explicit_human_labels_only",
        "cross_validation_grouping": "session_id",
        "feature_snapshot": True,
        "label_ids": label_ids,
        "session_ids": sorted(session_ids),
        "epochs": payload.epochs,
        "learning_rate": payload.learning_rate,
        "l2": payload.l2,
        "blend_weight": ML_BLEND_WEIGHT,
    }
    model_id = uuid4()

    async with pool.acquire() as conn:
        async with conn.transaction():
            if payload.activate:
                await conn.execute(
                    """
                    UPDATE can_ml_models
                    SET is_active = false
                    WHERE vehicle_id = $1
                      AND mission_code IS NOT DISTINCT FROM $2
                      AND bus_interface IS NOT DISTINCT FROM $3
                      AND bus_mode IS NOT DISTINCT FROM $4
                      AND capture_kind IS NOT DISTINCT FROM $5
                    """,
                    vehicle["id"],
                    payload.mission_code,
                    payload.bus_interface,
                    payload.bus_mode,
                    payload.capture_kind,
                )

            await conn.execute(
                """
                INSERT INTO can_ml_models (
                    id, vehicle_id, vehicle_slug, mission_code,
                    bus_interface, bus_mode, capture_kind,
                    model_type, feature_names, feature_means,
                    feature_scales, weights, bias,
                    label_count, positive_count, negative_count,
                    metrics, metadata, is_active, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    'balanced_logistic_regression',
                    $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb,
                    $12, $13, $14, $15,
                    $16::jsonb, $17::jsonb, $18, now()
                )
                """,
                model_id,
                vehicle["id"],
                vehicle["slug"],
                payload.mission_code,
                payload.bus_interface,
                payload.bus_mode,
                payload.capture_kind,
                _json_dumps(model["feature_names"]),
                _json_dumps(model["means"]),
                _json_dumps(model["scales"]),
                _json_dumps(model["weights"]),
                model["bias"],
                len(examples),
                positive_count,
                negative_count,
                _json_dumps(metrics),
                _json_dumps(metadata),
                payload.activate,
            )

    return {
        "ok": True,
        "model_id": str(model_id),
        "vehicle_slug": payload.vehicle_slug,
        "mission_code": payload.mission_code,
        "bus_interface": payload.bus_interface,
        "bus_mode": payload.bus_mode,
        "capture_kind": payload.capture_kind,
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
        "model_type": "balanced_logistic_regression",
        "active": payload.activate,
        "label_count": len(examples),
        "positive_count": positive_count,
        "negative_count": negative_count,
        "distinct_sessions": len(session_ids),
        "feature_names": list(ML_FEATURE_NAMES),
        "metrics": metrics,
        "training": {
            "epochs": payload.epochs,
            "learning_rate": payload.learning_rate,
            "l2": payload.l2,
            "blend_weight": ML_BLEND_WEIGHT,
        },
    }


@ml_router.get("/ml/status")
async def get_ml_status(
    vehicle_slug: Optional[str] = Query(default=None),
    mission_code: Optional[str] = Query(default=None),
    bus_interface: Optional[str] = Query(default=None),
    bus_mode: Optional[str] = Query(default=None),
    capture_kind: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)

        label_conditions: list[str] = []
        label_values: list[Any] = []
        if vehicle_slug:
            label_values.append(vehicle_slug)
            label_conditions.append(f"v.slug = ${len(label_values)}")
        for column, value in (
            ("mission_code", mission_code),
            ("bus_interface", bus_interface),
            ("bus_mode", bus_mode),
            ("capture_kind", capture_kind),
        ):
            if value is not None:
                label_values.append(value)
                label_conditions.append(
                    f"l.{column} = ${len(label_values)}"
                )
        label_where = (
            "WHERE " + " AND ".join(label_conditions)
            if label_conditions
            else ""
        )
        label_rows = await conn.fetch(
            f"""
            SELECT l.label, COUNT(*)::int AS count,
                   COUNT(DISTINCT l.session_id)::int AS sessions
            FROM can_ml_labels l
            JOIN vehicles v ON v.id = l.vehicle_id
            {label_where}
            GROUP BY l.label
            ORDER BY l.label
            """,
            *label_values,
        )

        model_conditions: list[str] = []
        model_values: list[Any] = []
        for column, value in (
            ("vehicle_slug", vehicle_slug),
            ("mission_code", mission_code),
            ("bus_interface", bus_interface),
            ("bus_mode", bus_mode),
            ("capture_kind", capture_kind),
        ):
            if value is not None:
                model_values.append(value)
                model_conditions.append(
                    f"{column} = ${len(model_values)}"
                )
        model_where = (
            "WHERE " + " AND ".join(model_conditions)
            if model_conditions
            else ""
        )
        model_rows = await conn.fetch(
            f"""
            SELECT id, vehicle_slug, mission_code,
                   bus_interface, bus_mode, capture_kind,
                   model_type, label_count, positive_count,
                   negative_count, metrics, metadata,
                   is_active, created_at
            FROM can_ml_models
            {model_where}
            ORDER BY created_at DESC
            LIMIT 20
            """,
            *model_values,
        )

    return {
        "ok": True,
        "filters": {
            "vehicle_slug": vehicle_slug,
            "mission_code": mission_code,
            "bus_interface": bus_interface,
            "bus_mode": bus_mode,
            "capture_kind": capture_kind,
        },
        "labels": {
            row["label"]: {
                "count": int(row["count"]),
                "sessions": int(row["sessions"]),
            }
            for row in label_rows
        },
        "models": [
            {
                **dict(row),
                "id": str(row["id"]),
                "metrics": _json_object(row["metrics"]),
                "metadata": _json_object(row["metadata"]),
            }
            for row in model_rows
        ],
        "configuration": ml_configuration(),
    }