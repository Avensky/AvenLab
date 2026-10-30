"""Learning / training: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .features import (
    _json_dumps,
    _json_object,
    _require_ml_admin,
    _train_and_evaluate,
    ml_configuration,
)
from .models import (
    ensure_ml_tables,
)
from .shared import (
    Any,
    HTTPException,
    Header,
    ML_BLEND_WEIGHT,
    ML_FEATURE_NAMES,
    ML_FEATURE_SCHEMA_VERSION,
    ML_MIN_DISTINCT_SESSIONS,
    ML_MIN_EXAMPLES,
    ML_RECOMMENDED_DISTINCT_SESSIONS,
    Optional,
    Query,
    TrainCandidateModelRequest,
    UUID,
    asyncio,
    connect_db,
    ml_router,
    uuid4,
)

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
