"""Learning / features: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    Any,
    BaseModel,
    CandidateLabelRequest,
    Counter,
    HTTPException,
    ML_ADMIN_TOKEN,
    ML_BLEND_WEIGHT,
    ML_FEATURE_NAMES,
    ML_FEATURE_SCHEMA_VERSION,
    ML_L2,
    ML_LEARNING_RATE,
    ML_MIN_DISTINCT_SESSIONS,
    ML_MIN_EXAMPLES,
    ML_RECOMMENDED_DISTINCT_SESSIONS,
    ML_TRAINING_EPOCHS,
    Optional,
    json,
    math,
    secrets,
    statistics,
)

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


def _model_or_dict(value: Any) -> Optional[dict[str, Any]]:
    """Return a plain dict from a Pydantic model or mapping.

    Using isinstance(..., BaseModel) gives Pylance a concrete type before
    model_dump() is called; hasattr() alone does not provide that narrowing.
    """
    if isinstance(value, BaseModel):
        return value.model_dump()
    if isinstance(value, dict):
        return dict(value)
    return None


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
    validation_method = payload.metadata.get("validation_method")
    independent_sessions = payload.metadata.get("independent_sessions", 0)
    try:
        independent_sessions = int(independent_sessions)
    except (TypeError, ValueError):
        independent_sessions = 0

    if not validation_method or independent_sessions < 1:
        raise HTTPException(
            status_code=422,
            detail=(
                "Positive labels require metadata.validation_method and "
                "metadata.independent_sessions >= 1. Additional independent "
                "sessions improve confidence but are not required to begin labeling."
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
        "label_reuse": (
            "compatible prior-session ID labels are applied immediately as "
            "bounded ranking priors; only explicit labels enter training"
        ),
        "label_reuse_scope": (
            "mission-specific labels plus repeated cross-mission negative "
            "background consensus within the same vehicle and bus scope"
        ),
        "positive_label_min_independent_sessions": 1,
        "validation_notes_limit": None,
        "cross_validation": "grouped_by_recording_session",
        # Human annotation routes are intentionally usable from the local UI
        # without exposing the server-only ML_ADMIN_TOKEN to the browser.
        "write_routes_protected": bool(ML_ADMIN_TOKEN),
        "annotation_routes_protected": False,
        "training_routes_protected": bool(ML_ADMIN_TOKEN),
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
    byte_role_hypotheses: Optional[list[dict[str, Any]]] = None,
    signal_hypotheses: Optional[list[dict[str, Any]]] = None,
    field_hypotheses: Optional[list[dict[str, Any]]] = None,
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

    role_items = byte_role_hypotheses or []
    role_counts = Counter(
        str(item.get("hypothesis_kind") or "")
        for item in role_items
        if isinstance(item, dict)
        and str(item.get("validation_status") or "unreviewed") != "negative"
    )
    role_denominator = max(len(role_items), 1)

    signal_items = [
        item
        for item in (signal_hypotheses or [])
        if isinstance(item, dict)
    ]
    top_signal = max(
        signal_items,
        key=lambda item: float(item.get("score") or 0.0),
        default={},
    )
    field_items = [
        item
        for item in (field_hypotheses or [])
        if isinstance(item, dict)
    ]
    top_field = max(
        field_items,
        key=lambda item: float(item.get("score") or 0.0),
        default={},
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
        "rolling_counter_byte_fraction": (
            role_counts.get("rolling_counter", 0) / role_denominator
        ),
        "checksum_candidate_byte_fraction": (
            role_counts.get("checksum_candidate", 0) / role_denominator
        ),
        "constant_byte_fraction": (
            role_counts.get("constant", 0) / role_denominator
        ),
        "top_bit_signal_score": float(top_signal.get("score") or 0.0),
        "top_bit_window_purity": float(
            top_signal.get("window_purity") or 0.0
        ),
        "top_bit_outside_action_fraction": float(
            top_signal.get("outside_action_fraction") or 0.0
        ),
        "top_bit_repetition_score": float(
            top_signal.get("repetition_score") or 0.0
        ),
        "top_bit_inverse_pair_verified": (
            1.0 if top_signal.get("inverse_pair_verified") else 0.0
        ),
        "top_bit_location_dominance": float(
            top_signal.get("location_dominance") or 0.0
        ),
        "top_field_signal_score": float(top_field.get("score") or 0.0),
        "top_field_monotonicity": float(top_field.get("monotonicity") or 0.0),
        "top_field_level_separation": float(top_field.get("level_separation") or 0.0),
        "top_field_repeatability": float(top_field.get("repeatability") or 0.0),
        "top_field_plateau_stability": float(top_field.get("plateau_stability") or 0.0),
        "top_field_return_consistency": float(top_field.get("return_consistency") or 0.0),
        "top_field_outside_action_drift": float(top_field.get("outside_action_drift") or 0.0),
        "top_field_response_latency_score": float(top_field.get("response_latency_score") or 0.0),
        "top_field_marker_coverage": float(top_field.get("marker_coverage") or 0.0),
        "top_field_location_dominance": float(top_field.get("location_dominance") or 0.0),
    }


def candidate_feature_vector(candidate: Any) -> dict[str, float]:
    evidence: list[dict[str, Any]] = []
    for item in getattr(candidate, "byte_evidence", []) or []:
        converted = _model_or_dict(item)
        if converted is not None:
            evidence.append(converted)

    byte_role_hypotheses: list[dict[str, Any]] = []
    for item in getattr(candidate, "byte_role_hypotheses", []) or []:
        converted = _model_or_dict(item)
        if converted is not None:
            byte_role_hypotheses.append(converted)

    signal_hypotheses: list[dict[str, Any]] = []
    for item in getattr(candidate, "signal_hypotheses", []) or []:
        converted = _model_or_dict(item)
        if converted is not None:
            signal_hypotheses.append(converted)

    field_hypotheses: list[dict[str, Any]] = []
    for item in getattr(candidate, "field_hypotheses", []) or []:
        converted = _model_or_dict(item)
        if converted is not None:
            field_hypotheses.append(converted)

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
        byte_role_hypotheses=byte_role_hypotheses,
        signal_hypotheses=signal_hypotheses,
        field_hypotheses=field_hypotheses,
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
        byte_role_hypotheses=(
            feature_metadata.get("byte_role_hypotheses")
            if isinstance(feature_metadata.get("byte_role_hypotheses"), list)
            else []
        ),
        signal_hypotheses=(
            feature_metadata.get("signal_hypotheses")
            if isinstance(feature_metadata.get("signal_hypotheses"), list)
            else []
        ),
        field_hypotheses=(
            feature_metadata.get("field_hypotheses")
            if isinstance(feature_metadata.get("field_hypotheses"), list)
            else []
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
