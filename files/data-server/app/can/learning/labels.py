"""Learning / labels: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .features import (
    _can_hex,
    _capture_kind,
    _json_dumps,
    _json_object,
    _persisted_feature_vector,
    _validated_positive_label,
)
from .models import (
    ensure_ml_tables,
    load_candidate_label_priors,
)
from .shared import (
    Any,
    CANONICAL_BYTE_ROLE_KINDS,
    CandidateLabelRequest,
    HTTPException,
    ML_FEATURE_SCHEMA_VERSION,
    SignalHypothesisRequest,
    UUID,
    connect_db,
    ml_router,
    uuid4,
)

@ml_router.get("/session/{session_id}/hypotheses")
async def get_session_hypotheses(session_id: UUID) -> dict[str, Any]:
    pool = await connect_db()
    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        rows = await conn.fetch(
            """
            SELECT id, can_id, byte_index, bit_mask, hypothesis_kind,
                   action_group, confidence, source, validation_status,
                   notes, evidence, metadata, created_at, updated_at
            FROM can_signal_hypotheses
            WHERE session_id = $1
            ORDER BY
                can_id,
                byte_index,
                CASE WHEN source = 'human' THEN 0 ELSE 1 END,
                CASE WHEN action_group IS NULL OR action_group = '' THEN 0 ELSE 1 END,
                updated_at DESC,
                confidence DESC
            """,
            session_id,
        )
    items = []
    for raw in rows:
        item = dict(raw)
        item["id"] = str(item["id"])
        item["can_id_hex"] = _can_hex(int(item["can_id"]))
        item["evidence"] = _json_object(item.get("evidence"))
        item["metadata"] = _json_object(item.get("metadata"))
        items.append(item)
    return {
        "ok": True,
        "session_id": str(session_id),
        "hypothesis_count": len(items),
        "hypotheses": items,
    }


@ml_router.post("/session/{session_id}/hypotheses")
async def upsert_signal_hypothesis(
    session_id: UUID,
    payload: SignalHypothesisRequest,
) -> dict[str, Any]:
    """Store one human byte/bit review for a finalized session.

    Structural byte roles use a canonical key shared by Playback and Top IDs.
    This prevents a review context such as ``baseline_playback_review`` from
    creating a second human decision for the same byte role.
    """
    pool = await connect_db()
    async with pool.acquire() as conn:
        await ensure_ml_tables(conn)
        session = await conn.fetchrow(
            """
            SELECT cs.id, cs.vehicle_id, cs.mission_id, cs.capture_status,
                   rm.mission_code
            FROM can_sessions cs
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if session is None:
            raise HTTPException(status_code=404, detail="CAN session not found")
        if session["capture_status"] != "finalized":
            raise HTTPException(
                status_code=409,
                detail="Signal hypotheses may be saved only for finalized sessions.",
            )

        canonical_action_group = (
            None
            if payload.hypothesis_kind in CANONICAL_BYTE_ROLE_KINDS
            else payload.action_group
        )
        hypothesis_key = (
            f"{payload.can_id}:{payload.byte_index}:"
            f"{payload.bit_mask or 0}:{payload.hypothesis_kind}:"
            f"{canonical_action_group or ''}"
        )

        async with conn.transaction():
            if payload.hypothesis_kind in CANONICAL_BYTE_ROLE_KINDS:
                # Remove legacy human duplicates created by older UI-specific
                # action_group values before writing the canonical decision.
                await conn.execute(
                    """
                    DELETE FROM can_signal_hypotheses
                    WHERE session_id = $1
                      AND source = 'human'
                      AND can_id = $2
                      AND byte_index = $3
                      AND COALESCE(bit_mask, 0) = COALESCE($4::integer, 0)
                      AND hypothesis_kind = $5
                      AND hypothesis_key <> $6
                    """,
                    session_id,
                    payload.can_id,
                    payload.byte_index,
                    payload.bit_mask,
                    payload.hypothesis_kind,
                    hypothesis_key,
                )

            row = await conn.fetchrow(
                """
                INSERT INTO can_signal_hypotheses (
                    session_id, vehicle_id, mission_id, mission_code,
                    hypothesis_key, can_id, byte_index, bit_mask,
                    hypothesis_kind, action_group, confidence, source,
                    validation_status, notes, evidence, metadata
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                    'human',$12,$13,$14::jsonb,$15::jsonb
                )
                ON CONFLICT (session_id, hypothesis_key)
                DO UPDATE SET
                    confidence = EXCLUDED.confidence,
                    source = 'human',
                    validation_status = EXCLUDED.validation_status,
                    notes = EXCLUDED.notes,
                    evidence = EXCLUDED.evidence,
                    metadata = can_signal_hypotheses.metadata || EXCLUDED.metadata,
                    updated_at = now()
                RETURNING id, hypothesis_key, action_group, created_at, updated_at
                """,
                session_id,
                session["vehicle_id"],
                session["mission_id"],
                session["mission_code"],
                hypothesis_key,
                payload.can_id,
                payload.byte_index,
                payload.bit_mask,
                payload.hypothesis_kind,
                canonical_action_group,
                payload.confidence,
                payload.validation_status,
                payload.notes,
                _json_dumps(payload.evidence),
                _json_dumps({
                    **payload.metadata,
                    "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
                    "manual_override": True,
                }),
            )
    return {
        "ok": True,
        "id": str(row["id"]),
        "session_id": str(session_id),
        "hypothesis_key": row["hypothesis_key"],
        "can_id": payload.can_id,
        "can_id_hex": _can_hex(payload.can_id),
        "byte_index": payload.byte_index,
        "bit_mask": payload.bit_mask,
        "hypothesis_kind": payload.hypothesis_kind,
        "action_group": row["action_group"],
        "source": "human",
        "validation_status": payload.validation_status,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "feature_schema_version": ML_FEATURE_SCHEMA_VERSION,
    }


@ml_router.post("/session/{session_id}/candidate/{can_id}/label")
async def label_candidate(
    session_id: UUID,
    can_id: int,
    payload: CandidateLabelRequest,
) -> dict[str, Any]:
    """Store a human label and immutable feature snapshot.

    The finalized-session and positive-label evidence gates remain enforced.
    Model training continues to require the ML admin token.
    """
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
                cs.capture_status,
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
        if session["capture_status"] != "finalized":
            raise HTTPException(
                status_code=409,
                detail="Candidate labels require a finalized immutable session.",
            )

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
        session = await conn.fetchrow(
            """
            SELECT cs.vehicle_id, cs.bus_interface, cs.bus_mode,
                   rm.mission_code
            FROM can_sessions cs
            LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
            WHERE cs.id = $1
            """,
            session_id,
        )
        if session is None:
            raise HTTPException(
                status_code=404,
                detail="CAN session not found",
            )
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
        priors = await load_candidate_label_priors(
            conn,
            session_id=session_id,
            vehicle_id=session["vehicle_id"],
            mission_code=session["mission_code"],
            bus_interface=session["bus_interface"],
            bus_mode=session["bus_mode"],
            capture_kind=_capture_kind(
                session["bus_interface"],
                session["bus_mode"],
            ),
        )

    labels = {}
    for row in rows:
        item = dict(row)
        item["metadata"] = _json_object(item.get("metadata"))
        item["can_id_hex"] = _can_hex(int(item["can_id"]))
        labels[str(item["can_id"])] = item

    inherited_labels: dict[str, dict[str, Any]] = {}
    for can_id, prior in priors.items():
        if str(can_id) in labels:
            continue
        if prior.get("source") != "historical_consensus":
            continue
        inherited_labels[str(can_id)] = {
            "can_id": can_id,
            "can_id_hex": _can_hex(can_id),
            "label": prior.get("label", "uncertain"),
            "signal_name": prior.get("signal_name"),
            "notes": prior.get("notes"),
            "source": "historical_consensus",
            "metadata": {
                "inherited": True,
                "session_count": prior.get("session_count", 0),
                "counts": prior.get("counts", {}),
                "scope": prior.get("scope"),
            },
            "bus_interface": session["bus_interface"],
            "bus_mode": session["bus_mode"],
            "capture_kind": _capture_kind(
                session["bus_interface"],
                session["bus_mode"],
            ),
        }

    return {
        "ok": True,
        "session_id": str(session_id),
        "label_count": len(labels),
        "labels": labels,
        "inherited_label_count": len(inherited_labels),
        "inherited_labels": inherited_labels,
    }
