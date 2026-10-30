"""Learning / models: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .features import (
    _json_object,
    _predict,
    candidate_feature_vector,
)
from .shared import (
    Any,
    Counter,
    HTTPException,
    ML_BLEND_WEIGHT,
    ML_FEATURE_SCHEMA_VERSION,
    Optional,
    UUID,
)

async def ensure_ml_tables(conn: Any) -> None:
    labels_table = await conn.fetchval(
        "SELECT to_regclass('public.can_ml_labels')"
    )
    models_table = await conn.fetchval(
        "SELECT to_regclass('public.can_ml_models')"
    )

    hypotheses_table = await conn.fetchval(
        "SELECT to_regclass('public.can_signal_hypotheses')"
    )

    if not labels_table or not models_table or not hypotheses_table:
        raise HTTPException(
            status_code=503,
            detail=(
                "Supervised ML tables are not installed. Apply "
                "the supervised-ML and 20260713 integrity migrations first."
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


async def load_candidate_label_priors(
    conn: Any,
    *,
    session_id: UUID,
    vehicle_id: UUID,
    mission_code: Optional[str],
    bus_interface: Optional[str],
    bus_mode: Optional[str],
    capture_kind: str,
) -> dict[int, dict[str, Any]]:
    """Collapse labels into mission priors and safe vehicle-wide noise priors.

    Positive labels remain mission-specific because one CAN ID can carry
    unrelated signals in different missions. A negative label is inherited
    across missions only when the ID was rejected in at least two distinct
    missions and has never been labeled positive in the same vehicle/bus scope.
    """
    await ensure_ml_tables(conn)
    rows = await conn.fetch(
        """
        SELECT session_id, mission_code, can_id, label, signal_name, notes,
               metadata, updated_at,
               (session_id = $1) AS current_session,
               (mission_code IS NOT DISTINCT FROM $3) AS current_mission
        FROM can_ml_labels
        WHERE vehicle_id = $2
          AND bus_interface IS NOT DISTINCT FROM $4
          AND bus_mode IS NOT DISTINCT FROM $5
          AND capture_kind = $6
        ORDER BY (session_id = $1) DESC,
                 (mission_code IS NOT DISTINCT FROM $3) DESC,
                 updated_at DESC
        """,
        session_id,
        vehicle_id,
        mission_code,
        bus_interface,
        bus_mode,
        capture_kind,
    )

    by_id: dict[int, list[dict[str, Any]]] = {}
    for raw in rows:
        row = dict(raw)
        by_id.setdefault(int(row["can_id"]), []).append(row)

    priors: dict[int, dict[str, Any]] = {}
    for can_id, id_rows in by_id.items():
        current_rows = [
            row for row in id_rows if bool(row.get("current_session"))
        ]
        if current_rows:
            current = current_rows[0]
            priors[can_id] = {
                "label": str(current.get("label") or "uncertain"),
                "source": "current_session",
                "session_count": 1,
                "mission_count": 1,
                "counts": {
                    str(current.get("label") or "uncertain"): 1,
                },
                "signal_name": current.get("signal_name"),
                "notes": current.get("notes"),
            }
            continue

        latest_by_session: dict[str, dict[str, Any]] = {}
        for row in id_rows:
            latest_by_session.setdefault(str(row["session_id"]), row)
        historical = list(latest_by_session.values())
        mission_historical = [
            row for row in historical if bool(row.get("current_mission"))
        ]

        if mission_historical:
            counts = Counter(
                str(row.get("label") or "uncertain")
                for row in mission_historical
            )
            positives = int(counts.get("positive", 0))
            negatives = int(counts.get("negative", 0))
            if positives > 0 and negatives == 0:
                label = "positive"
            elif negatives > 0 and positives == 0:
                label = "negative"
            else:
                label = "uncertain"
            priors[can_id] = {
                "label": label,
                "source": "historical_consensus",
                "session_count": len(mission_historical),
                "mission_count": 1,
                "counts": dict(counts),
                "signal_name": mission_historical[0].get("signal_name"),
                "notes": (
                    f"{label} consensus from {len(mission_historical)} "
                    "compatible recording session(s)"
                ),
                "scope": (
                    "same vehicle, mission, bus interface, bus mode, and "
                    "capture kind"
                ),
            }
            continue

        cross_counts = Counter(
            str(row.get("label") or "uncertain")
            for row in historical
        )
        cross_positive = int(cross_counts.get("positive", 0))
        negative_rows = [
            row for row in historical
            if str(row.get("label") or "uncertain") == "negative"
        ]
        negative_missions = {
            str(row.get("mission_code") or "UNKNOWN")
            for row in negative_rows
        }
        if cross_positive == 0 and len(negative_missions) >= 2:
            priors[can_id] = {
                "label": "negative",
                "source": "vehicle_background_consensus",
                "session_count": len(negative_rows),
                "mission_count": len(negative_missions),
                "counts": dict(cross_counts),
                "signal_name": None,
                "notes": (
                    f"background consensus from {len(negative_rows)} session(s) "
                    f"across {len(negative_missions)} missions"
                ),
                "scope": (
                    "same vehicle, bus interface, bus mode, and capture kind; "
                    "negative-only across at least two missions"
                ),
            }

    return priors


def apply_candidate_label_priors(
    candidates: list[Any],
    priors: dict[int, dict[str, Any]],
    *,
    supervised_model_applied: bool,
) -> dict[str, Any]:
    """Use explicit prior labels immediately, without waiting for retraining."""
    applied = 0
    inherited = 0
    negative_filters = 0
    positive_support = 0
    uncertain_caps = 0

    for candidate in candidates:
        original_confidence = float(
            getattr(candidate, "confidence", 0.0) or 0.0
        )
        candidate.confidence_before_label_prior = original_confidence
        prior = priors.get(int(getattr(candidate, "can_id", -1)))
        if prior is None:
            candidate.label_prior_applied = False
            candidate.label_prior = {
                "applied": False,
                "reason": "no compatible candidate label",
            }
            continue

        label = str(prior.get("label") or "uncertain")
        source = str(prior.get("source") or "historical_consensus")
        session_count = max(int(prior.get("session_count") or 0), 1)
        if source in {
            "historical_consensus",
            "vehicle_background_consensus",
        }:
            inherited += 1

        adjusted_confidence = original_confidence
        if label == "negative":
            if source == "current_session":
                multiplier = 0.05
            elif source == "vehicle_background_consensus":
                multiplier = max(
                    0.25,
                    1.0 / (1.0 + session_count),
                )
            else:
                multiplier = max(
                    0.15,
                    1.0 / (1.0 + (2.0 * session_count)),
                )
            if supervised_model_applied:
                multiplier = min(0.50, multiplier + 0.10)
            adjusted_confidence *= multiplier
            candidate.candidate_role = "human_labeled_noise"
            negative_filters += 1
        elif label == "positive" and original_confidence > 0:
            support = (
                0.20
                if source == "current_session"
                else min(0.25, 0.08 + (0.04 * session_count))
            )
            if supervised_model_applied:
                support *= 0.50
            adjusted_confidence += (
                1.0 - adjusted_confidence
            ) * support
            candidate.candidate_role = "human_labeled_target_support"
            positive_support += 1
        elif label == "uncertain":
            cap = 0.55 if source == "current_session" else 0.70
            if session_count >= 2 and source == "historical_consensus":
                cap = 0.60
            if original_confidence > cap:
                adjusted_confidence = cap
                candidate.candidate_role = "human_labeled_uncertain"
                uncertain_caps += 1

        adjusted_confidence = min(
            1.0,
            max(0.0, adjusted_confidence),
        )
        candidate.confidence = round(adjusted_confidence, 5)
        candidate.label_prior_applied = (
            abs(adjusted_confidence - original_confidence) > 1e-9
        )
        candidate.label_prior = {
            **prior,
            "applied": candidate.label_prior_applied,
            "confidence_before": round(original_confidence, 5),
            "confidence_after": candidate.confidence,
        }
        if candidate.label_prior_applied:
            applied += 1

    candidates.sort(
        key=lambda candidate: (
            float(getattr(candidate, "confidence", 0.0) or 0.0),
            float(getattr(candidate, "correlation_score", 0.0) or 0.0),
            float(
                getattr(
                    candidate,
                    "baseline_adjusted_change_ratio",
                    0.0,
                )
                or 0.0
            ),
            int(getattr(candidate, "change_count", 0) or 0),
        ),
        reverse=True,
    )
    return {
        "compatible_id_priors": len(priors),
        "candidates_adjusted": applied,
        "historical_priors_reused": inherited,
        "negative_ids_filtered": negative_filters,
        "positive_ids_supported": positive_support,
        "uncertain_ids_capped": uncertain_caps,
        "supervised_model_also_applied": supervised_model_applied,
        "scope": (
            "mission-specific priors plus conservative repeated background "
            "negatives across missions in the same vehicle and bus scope"
        ),
    }
