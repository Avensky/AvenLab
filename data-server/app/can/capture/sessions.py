"""Capture / sessions: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .identity import (
    ensure_marker_step,
    ensure_recon_mission,
    ensure_recon_steps,
    ensure_vehicle,
    json_object,
)
from .shared import (
    ACTION_MARKER_TYPES,
    ACTIVE_CAPTURES,
    Any,
    CaptureState,
    Dict,
    HTTPException,
    INTERFACES_TO_REPORT,
    IS_PRODUCTION,
    MarkerRequest,
    Optional,
    RUNTIME_ENV,
    SIMULATION_SIGNAL_STATE,
    StartSessionRequest,
    StopSessionRequest,
    execute,
    fetch,
    fetchrow,
    jsonb_dumps,
    os,
    router,
    time,
)
from .simulation import (
    baseline_frames,
    insert_fake_burst,
    insert_raw_frame,
)
from .socketcan import (
    can_interface_state,
    runtime_metadata,
    server_capture_timestamp_ms,
    should_use_fake_capture,
    start_socketcan_capture,
    stop_socketcan_capture,
)

@router.get("/status")
async def can_status() -> Dict[str, Any]:
    default_mode = "listen-only" if IS_PRODUCTION else "simulation"
    statuses = {name: can_interface_state(name, default_mode) for name in INTERFACES_TO_REPORT}

    configured_active = os.getenv("CAN_ACTIVE_INTERFACE", "").strip()
    if configured_active and configured_active in statuses:
        default_active = configured_active
    else:
        real_ready = [name for name in ("can2", "can0", "can1") if statuses[name]["exists"] and statuses[name]["up"]]
        default_active = real_ready[0] if real_ready else "vcan0"

    active_status = statuses.get(default_active, can_interface_state(default_active, default_mode))
    active_fake = bool(active_status.get("fake_data"))

    return {
        "active": default_active,
        "mode": default_mode,
        "app_env": RUNTIME_ENV,
        "env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "virtual": default_active == "vcan0",
        "fake_data": active_fake,
        "capture_kind": "simulation" if active_fake else "live",
        "database": "postgres",
        "active_captures": {
            sid: {
                "bus_interface": state.bus_interface,
                "bus_mode": state.bus_mode,
                "frames_inserted": state.frames_inserted,
                "lines_seen": state.lines_seen,
                "last_error": state.last_error,
                "running": not state.task.done(),
            }
            for sid, state in ACTIVE_CAPTURES.items()
        },
        **statuses,
    }


@router.post("/session/start")
async def start_session(payload: StartSessionRequest) -> Dict[str, Any]:
    vehicle = await ensure_vehicle(payload)
    mission = await ensure_recon_mission(vehicle["id"], payload)
    recon_steps_upserted = await ensure_recon_steps(
        str(mission["id"]) if mission else None,
        payload,
    )

    session_metadata = runtime_metadata(
        {
            **payload.metadata,
            "vehicle_slug": vehicle["slug"],
            "vehicle_id": str(vehicle["id"]),
            "vehicle_make": vehicle["make"],
            "vehicle_model": vehicle["model"],
            "vehicle_year": vehicle["year"],
            "vehicle_identity": payload.vehicle,
            "auto_vehicle_upsert": True,
            "auto_mission_upsert": bool(mission),
            "auto_steps_upserted": recon_steps_upserted,
        },
        bus_interface=payload.bus_interface,
        bus_mode=payload.bus_mode,
    )

    session = await fetchrow(
        """
        INSERT INTO can_sessions (
            vehicle_id,
            mission_id,
            label,
            bus_interface,
            bus_mode,
            metadata,
            capture_status
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'recording')
        RETURNING id, started_at, capture_status
        """,
        vehicle["id"],
        mission["id"] if mission else None,
        payload.label,
        payload.bus_interface,
        payload.bus_mode,
        jsonb_dumps(session_metadata),
    )

    session_id = str(session["id"])
    fake_capture = should_use_fake_capture(payload.bus_interface, payload.bus_mode)
    capture_state: Optional[CaptureState] = None

    if fake_capture:
        SIMULATION_SIGNAL_STATE[session_id] = {}
        for t in range(0, 1000, 100):
            for base_frame in baseline_frames(t):
                await insert_raw_frame(
                    session_id,
                    t,
                    base_frame,
                    bus_interface=payload.bus_interface,
                    extra_metadata={"frame_role": "initial_baseline"},
                )
    else:
        capture_state = await start_socketcan_capture(session_id, payload.bus_interface, payload.bus_mode)

    return {
        "ok": True,
        "session_id": session_id,
        "started_at": session["started_at"],
        "mode": payload.bus_mode,
        "bus_interface": payload.bus_interface,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": fake_capture,
        "virtual": payload.bus_interface == "vcan0",
        "capture_kind": "simulation" if fake_capture else "live",
        "capture_source": "generated-fake-can" if fake_capture else "socketcan-candump",
        "capture_running": bool(capture_state and not capture_state.task.done()),
        "capture_status": session["capture_status"],
        "timestamp_authority": "server",
        "database": "postgres",
        "vehicle": {
            "id": str(vehicle["id"]),
            "slug": vehicle["slug"],
            "year": vehicle["year"],
            "make": vehicle["make"],
            "model": vehicle["model"],
            "trim": vehicle["trim"],
            "alias": vehicle["alias"],
        },
        "mission": {
            "id": str(mission["id"]),
            "mission_code": mission["mission_code"],
            "title": mission["title"],
            "target": mission["target"],
            "steps_upserted": recon_steps_upserted,
        } if mission else None,
    }


@router.get("/vehicles")
async def list_vehicles() -> Dict[str, Any]:
    rows = await fetch(
        """
        SELECT
            id, slug, year, make, model, trim, alias, vin, metadata, created_at
        FROM vehicles
        ORDER BY created_at DESC, slug ASC
        """
    )
    return {
        "ok": True,
        "vehicles": [
            {
                **dict(row),
                "id": str(row["id"]),
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ],
    }


@router.post("/session/{session_id}/marker")
async def post_marker(session_id: str, payload: MarkerRequest) -> Dict[str, Any]:
    session = await fetchrow(
        """
        SELECT cs.id, cs.vehicle_id, cs.mission_id, cs.bus_interface,
               cs.bus_mode, cs.started_at, cs.ended_at, cs.capture_status,
               rm.mission_code AS session_mission_code
        FROM can_sessions cs
        LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
        WHERE cs.id = $1
        """,
        session_id,
    )

    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    if session["capture_status"] != "recording" or session["ended_at"] is not None:
        raise HTTPException(
            status_code=409,
            detail="CAN session is not recording; markers require an active capture",
        )

    fake_capture = should_use_fake_capture(
        session["bus_interface"],
        session["bus_mode"],
    )
    mission_code = payload.mission_code or session["session_mission_code"]
    if payload.client_event_id:
        existing_marker = await fetchrow(
            """
            SELECT id, created_at, timestamp_ms, metadata
            FROM can_session_markers
            WHERE session_id = $1
              AND metadata->>'client_event_id' = $2
            ORDER BY created_at ASC
            LIMIT 1
            """,
            session_id,
            payload.client_event_id,
        )
        if existing_marker:
            existing_metadata = json_object(
                existing_marker["metadata"],
            )
            repaired_frames = 0
            if (
                fake_capture
                and "simulation_frames_inserted"
                not in existing_metadata
            ):
                repaired_frames = await insert_fake_burst(
                    session_id=session_id,
                    mission_code=mission_code or "",
                    step_code=payload.step_code,
                    marker_type=payload.marker_type,
                    timestamp_ms=int(
                        existing_marker["timestamp_ms"] or 0
                    ),
                    bus_interface=session["bus_interface"],
                    marker_metadata=payload.metadata,
                    client_event_id=payload.client_event_id,
                )
                await execute(
                    """
                    UPDATE can_session_markers
                    SET metadata = metadata || $2::jsonb
                    WHERE id = $1
                    """,
                    existing_marker["id"],
                    jsonb_dumps({
                        "simulation_frames_inserted": repaired_frames,
                        "simulation_ground_truth": True,
                        "simulation_burst_repaired": True,
                    }),
                )
            return {
                "ok": True,
                "marker_id": str(existing_marker["id"]),
                "created_at": existing_marker["created_at"],
                "timestamp_ms": int(
                    existing_marker["timestamp_ms"] or 0
                ),
                "timestamp_authority": "server",
                "timestamp_source": existing_metadata.get(
                    "timestamp_source",
                    "idempotent_retry",
                ),
                "frames_inserted": int(
                    repaired_frames
                    or existing_metadata.get(
                            "simulation_frames_inserted",
                            0,
                        )
                    or 0
                ),
                "deduplicated": True,
                "bus_interface": session["bus_interface"],
                "bus_mode": session["bus_mode"],
                "capture_kind": (
                    "simulation"
                    if fake_capture
                    else "live"
                ),
                "capture_source": (
                    "generated-fake-can"
                    if fake_capture
                    else "socketcan-candump"
                ),
                "app_env": RUNTIME_ENV,
                "production": IS_PRODUCTION,
            }

    canonical_timestamp_ms, timestamp_source = await server_capture_timestamp_ms(
        session_id,
        session["started_at"],
    )

    mission_id = session["mission_id"]

    if payload.mission_code:
        mission = await fetchrow(
            """
            SELECT id FROM recon_missions
            WHERE vehicle_id = $1 AND mission_code = $2
            """,
            session["vehicle_id"],
            payload.mission_code,
        )
        if mission:
            mission_id = mission["id"]

    step_id = None
    if payload.step_code and mission_id:
        step = await fetchrow(
            """
            SELECT id FROM recon_steps
            WHERE mission_id = $1 AND step_code = $2
            """,
            mission_id,
            payload.step_code,
        )
        if step:
            step_id = step["id"]
        else:
            step_id = await ensure_marker_step(
                str(mission_id),
                payload.step_code,
                payload.label,
                payload.metadata,
            )

    marker_metadata = runtime_metadata(
        {
            **payload.metadata,
            "mission_code": mission_code,
            "step_code": payload.step_code,
            "marker_type": payload.marker_type,
            "label": payload.label,
            "timestamp_authority": "server",
            "timestamp_source": timestamp_source,
            "server_timestamp_ms": canonical_timestamp_ms,
            "client_timestamp_ms_ignored": payload.timestamp_ms,
            "client_event_id": payload.client_event_id,
            "server_received_epoch_ms": int(time.time() * 1000),
        },
        bus_interface=session["bus_interface"],
        bus_mode=session["bus_mode"],
    )

    marker = await fetchrow(
        """
        INSERT INTO can_session_markers (
            session_id, mission_id, step_id, marker_type, label,
            timestamp_ms, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id, created_at, timestamp_ms
        """,
        session_id,
        mission_id,
        step_id,
        payload.marker_type,
        payload.label,
        canonical_timestamp_ms,
        jsonb_dumps(marker_metadata),
    )

    frames_inserted = 0
    capture_source = "socketcan-candump"
    if fake_capture:
        capture_source = "generated-fake-can"
        frames_inserted = await insert_fake_burst(
            session_id=session_id,
            mission_code=mission_code or "",
            step_code=payload.step_code,
            marker_type=payload.marker_type,
            timestamp_ms=canonical_timestamp_ms,
            bus_interface=session["bus_interface"],
            marker_metadata=payload.metadata,
            client_event_id=payload.client_event_id,
        )
        await execute(
            """
            UPDATE can_session_markers
            SET metadata = metadata || $2::jsonb
            WHERE id = $1
            """,
            marker["id"],
            jsonb_dumps({
                "simulation_frames_inserted": frames_inserted,
                "simulation_ground_truth": True,
            }),
        )

    return {
        "ok": True,
        "marker_id": str(marker["id"]),
        "created_at": marker["created_at"],
        "timestamp_ms": canonical_timestamp_ms,
        "timestamp_authority": "server",
        "timestamp_source": timestamp_source,
        "frames_inserted": frames_inserted,
        "deduplicated": False,
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "capture_kind": "simulation" if fake_capture else "live",
        "capture_source": capture_source,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


async def finalize_session_capture(
    session_id: str,
    payload: StopSessionRequest,
) -> Dict[str, Any]:
    existing_session = await fetchrow(
        """
        SELECT id, bus_interface, bus_mode, started_at, ended_at,
               capture_status, finalized_at, final_frame_count,
               final_marker_count, final_frame_id, capture_quality, metadata
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    if not existing_session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    # Finalization is idempotent. This makes UI retries safe.
    if existing_session["capture_status"] == "finalized":
        SIMULATION_SIGNAL_STATE.pop(session_id, None)
        return {
            "ok": True,
            "session_id": str(existing_session["id"]),
            "status": "finalized",
            "capture_status": "finalized",
            "finalized_at": existing_session["finalized_at"],
            "frames": int(existing_session["final_frame_count"] or 0),
            "markers": int(existing_session["final_marker_count"] or 0),
            "final_frame_id": existing_session["final_frame_id"],
            "capture_quality": existing_session["capture_quality"] or {},
            "already_finalized": True,
            "timestamp_authority": "server",
        }

    await execute(
        "UPDATE can_sessions SET capture_status = 'finalizing' WHERE id = $1",
        session_id,
    )

    capture_state = await stop_socketcan_capture(session_id)
    fake_capture = should_use_fake_capture(
        existing_session["bus_interface"],
        existing_session["bus_mode"],
    )

    stats = await fetchrow(
        """
        SELECT
            COUNT(*)::bigint AS frame_count,
            MAX(id)::bigint AS final_frame_id,
            MIN(timestamp_ms)::bigint AS first_frame_timestamp_ms,
            MAX(timestamp_ms)::bigint AS last_frame_timestamp_ms
        FROM can_frames_raw
        WHERE session_id = $1
        """,
        session_id,
    )
    marker_stats = await fetchrow(
        """
        SELECT COUNT(*)::int AS marker_count,
               COUNT(*) FILTER (
                   WHERE marker_type IN (
                       'action_start','action',
                       'target_action','target_event'
                   )
                   OR metadata->>'marker_trigger' = 'action'
                   OR metadata->>'phase' = 'action'
               )::int AS action_marker_count
        FROM can_session_markers
        WHERE session_id = $1
        """,
        session_id,
    )

    frame_count = int(stats["frame_count"] or 0)
    marker_count = int(marker_stats["marker_count"] or 0)
    action_marker_count = int(marker_stats["action_marker_count"] or 0)
    session_metadata = json_object(existing_session["metadata"])
    analysis_mode = str(
        session_metadata.get("analysis_mode") or "target_correlation"
    ).strip().lower().replace("-", "_")
    target_markers_required = analysis_mode != "baseline_profile"
    mission_steps = session_metadata.get("mission_steps")
    mission_protocol = json_object(
        session_metadata.get("mission_protocol")
    )
    configured_markers = mission_protocol.get("markers")
    configured_action_markers = 0
    if isinstance(configured_markers, list):
        for marker_definition in configured_markers:
            if not isinstance(marker_definition, dict):
                continue
            if marker_definition.get("enabled") is False:
                continue
            trigger = str(
                marker_definition.get("trigger") or ""
            ).strip().lower()
            marker_type = str(
                marker_definition.get("marker_type") or ""
            ).strip().lower()
            if (
                trigger == "action"
                or marker_type in ACTION_MARKER_TYPES
            ):
                configured_action_markers += 1
    expected_action_marker_count = (
        len(mission_steps) * configured_action_markers
        if isinstance(mission_steps, list)
        else 0
    )
    marker_completion_ratio = (
        min(
            1.0,
            action_marker_count / expected_action_marker_count,
        )
        if expected_action_marker_count > 0
        else (
            1.0
            if not target_markers_required
            or action_marker_count > 0
            else 0.0
        )
    )
    capture_error = capture_state.last_error if capture_state else None
    final_flush_completed = capture_error is None
    duration_ms = max(
        0,
        int((time.time() - existing_session["started_at"].timestamp()) * 1000),
    )
    quality_score = 1.0
    if frame_count <= 0:
        quality_score -= 0.60
    if capture_error:
        quality_score -= 0.25
    if not final_flush_completed:
        quality_score -= 0.15
    if target_markers_required and action_marker_count <= 0:
        quality_score -= 0.35
    elif (
        expected_action_marker_count > 0
        and action_marker_count < expected_action_marker_count
    ):
        quality_score -= min(
            0.25,
            (1.0 - marker_completion_ratio) * 0.25,
        )
    quality_score = max(0.0, min(1.0, quality_score))
    marker_quality_ok = (
        not target_markers_required
        or action_marker_count > 0
    )
    quality_issue = None
    if target_markers_required and action_marker_count <= 0:
        quality_issue = (
            "target-correlation session finalized without an action marker"
        )
    elif (
        expected_action_marker_count > 0
        and action_marker_count < expected_action_marker_count
    ):
        quality_issue = (
            f"received {action_marker_count} of "
            f"{expected_action_marker_count} expected action markers"
        )

    capture_quality = {
        "duration_ms": duration_ms,
        "frames_received": frame_count,
        "markers_received": marker_count,
        "action_markers": action_marker_count,
        "expected_action_markers": expected_action_marker_count,
        "marker_completion_ratio": round(
            marker_completion_ratio,
            4,
        ),
        "marker_quality_ok": marker_quality_ok,
        "quality_issue": quality_issue,
        "lines_seen": capture_state.lines_seen if capture_state else None,
        "capture_frames_inserted": capture_state.frames_inserted if capture_state else None,
        "capture_error": capture_error,
        "final_flush_completed": final_flush_completed,
        "first_frame_timestamp_ms": stats["first_frame_timestamp_ms"],
        "last_frame_timestamp_ms": stats["last_frame_timestamp_ms"],
        "quality_score": round(quality_score, 4),
        "usable_for_analysis": (
            frame_count > 0
            and final_flush_completed
            and marker_quality_ok
        ),
        "timestamp_authority": "server",
    }

    session = await fetchrow(
        """
        UPDATE can_sessions
        SET ended_at = COALESCE(ended_at, clock_timestamp()),
            finalized_at = clock_timestamp(),
            capture_status = 'finalized',
            final_frame_id = $2,
            final_frame_count = $3,
            final_marker_count = $4,
            capture_quality = $5::jsonb,
            metadata = metadata || $6::jsonb
        WHERE id = $1
        RETURNING id, bus_interface, bus_mode, started_at, ended_at, finalized_at
        """,
        session_id,
        stats["final_frame_id"],
        frame_count,
        marker_count,
        jsonb_dumps(capture_quality),
        jsonb_dumps(runtime_metadata({
            "finalize_metadata": payload.metadata,
            "capture_quality": capture_quality,
        }, bus_interface=existing_session["bus_interface"], bus_mode=existing_session["bus_mode"], fake_can=fake_capture)),
    )
    SIMULATION_SIGNAL_STATE.pop(session_id, None)

    return {
        "ok": True,
        "session_id": str(session["id"]),
        "status": "finalized",
        "capture_status": "finalized",
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "finalized_at": session["finalized_at"],
        "frames": frame_count,
        "markers": marker_count,
        "final_frame_id": stats["final_frame_id"],
        "capture_quality": capture_quality,
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "capture_kind": "simulation" if fake_capture else "live",
        "fake_can": fake_capture,
        "timestamp_authority": "server",
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.post("/session/{session_id}/finalize")
async def finalize_session(session_id: str, payload: StopSessionRequest) -> Dict[str, Any]:
    return await finalize_session_capture(session_id, payload)


@router.post("/session/{session_id}/stop")
async def stop_session(session_id: str, payload: StopSessionRequest) -> Dict[str, Any]:
    # Backward-compatible alias. Stop now means finalize.
    return await finalize_session_capture(session_id, payload)
