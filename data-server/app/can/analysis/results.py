"""Analysis / results: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    ANALYSIS_MODE_BASELINE,
    Any,
    CONFIDENCE_SEMANTICS,
    HTTPException,
    Optional,
    Query,
    Response,
    UUID,
    connect_db,
    json,
    router,
)
from .utilities import (
    can_hex,
    capture_kind_for,
    infer_analysis_mode,
    metadata_dict,
    safe_float,
    source_label_for,
)

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
