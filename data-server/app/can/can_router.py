# data-server/app/can/can_router.py
"""
PostgreSQL-backed CAN router for Aven Data Server.

Only APP_ENV matters:
- APP_ENV=production -> production behavior
- any other value / missing -> development behavior

The router still supports fake/generated CAN frames in production, but writes them
to the real PostgreSQL schema:
- can_sessions
- can_session_markers
- can_frames_raw
- can_frames_decoded
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import execute, fetch, fetchrow, jsonb_dumps

APP_ENV = os.getenv("APP_ENV", "").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
RUNTIME_ENV = "production" if IS_PRODUCTION else "development"

router = APIRouter(prefix="/data/can", tags=["can"])


class StartSessionRequest(BaseModel):
    vehicle_slug: str = "2015-scion-frs"
    mission_code: Optional[str] = None
    label: Optional[str] = None
    bus_interface: str = "can2"
    bus_mode: str = "listen-only"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class MarkerRequest(BaseModel):
    mission_code: Optional[str] = None
    step_code: Optional[str] = None
    marker_type: str
    label: Optional[str] = None
    timestamp_ms: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StopSessionRequest(BaseModel):
    metadata: Dict[str, Any] = Field(default_factory=dict)


Frame = Tuple[int, List[int], str, str]


def runtime_metadata(extra: Optional[Dict[str, Any]] = None, *, bus_interface: Optional[str] = None, bus_mode: Optional[str] = None) -> Dict[str, Any]:
    return {
        **(extra or {}),
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": True,
        "virtual": not IS_PRODUCTION,
        **({"bus_interface": bus_interface} if bus_interface else {}),
        **({"bus_mode": bus_mode} if bus_mode else {}),
    }


def clamp_byte(value: int) -> int:
    return max(0, min(255, int(value)))


def frame(can_id: int, data: List[int], signal_name: str, decoded: str) -> Frame:
    padded = (data + [0] * 8)[:8]
    return can_id, [clamp_byte(x) for x in padded], signal_name, decoded


def baseline_frames(seed: int = 0) -> List[Frame]:
    rpm = 720 + (seed % 30)
    return [
        frame(0x200, [rpm & 0xFF, rpm >> 8, 0, 0, 0, 0, 0, 0], "engine_rpm", f"idle {rpm} rpm"),
        frame(0x201, [0, 0, 0, 0, 0, 0, 0, 0], "vehicle_speed", "0 kph"),
        frame(0x210, [0, 0, 0, 0, 0, 0, 0, 0], "pedals", "no pedal input"),
        frame(0x320, [0, 0, 0, 0, 0, 0, 0, 0], "body_status", "body idle"),
        frame(0x321, [0, 0, 0, 0, 0, 0, 0, 0], "lighting_status", "lights idle"),
        frame(0x322, [0, 0, 0, 0, 0, 0, 0, 0], "doors_locks", "doors closed / unlocked"),
    ]


def mission_frames(mission_code: str, step_code: Optional[str], marker_type: str, tick: int) -> List[Frame]:
    mission_code = (mission_code or "").upper()
    step_code_l = (step_code or "").lower()

    active = marker_type in {"action_start", "capture_start", "step_complete"}
    pulse = 1 if active else 0
    wobble = tick % 4

    if mission_code == "A01":
        return [frame(0x321, [0b00000001 if pulse else 0, wobble, 0, 0, 0, 0, 0, 0], "left_turn_signal", "left blinker ON" if pulse else "left blinker OFF")]
    if mission_code == "A02":
        return [frame(0x321, [0b00000010 if pulse else 0, wobble, 0, 0, 0, 0, 0, 0], "right_turn_signal", "right blinker ON" if pulse else "right blinker OFF")]
    if mission_code == "A03":
        return [frame(0x321, [0b00000011 if pulse else 0, wobble, 0, 0, 0, 0, 0, 0], "hazards", "hazards ON" if pulse else "hazards OFF")]
    if mission_code == "A04":
        return [frame(0x321, [0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0, 0], "headlights", "headlights ON" if pulse else "headlights OFF")]
    if mission_code == "A05":
        return [frame(0x321, [0, 0b00000010 if pulse else 0, 0, 0, 0, 0, 0, 0], "high_beams", "high beams ON" if pulse else "high beams OFF")]
    if mission_code == "A06":
        return [frame(0x321, [0, 0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0], "brake_lights", "brake lights ON" if pulse else "brake lights OFF")]
    if mission_code == "A07":
        return [frame(0x320, [0, 0b00010000 if pulse else 0, 0, 0, 0, 0, 0, 0], "parking_brake", "parking brake SET" if pulse else "parking brake RELEASED")]
    if mission_code == "A08":
        side_bit = 0b00000001 if "driver" in step_code_l else 0b00000010
        side = "driver" if "driver" in step_code_l else "passenger"
        return [frame(0x322, [side_bit if pulse else 0, 0, 0, 0, 0, 0, 0, 0], f"{side}_door", f"{side} door OPEN" if pulse else f"{side} door CLOSED")]
    if mission_code == "A09":
        src = "fob" if "fob" in step_code_l else "switch"
        return [frame(0x322, [0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0, 0], "lock", f"lock via {src}" if pulse else "lock idle")]
    if mission_code == "A10":
        src = "fob" if "fob" in step_code_l else "switch"
        return [frame(0x322, [0, 0b00000010 if pulse else 0, 0, 0, 0, 0, 0, 0], "unlock", f"unlock via {src}" if pulse else "unlock idle")]
    if mission_code == "A11":
        return [frame(0x320, [0, 0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0], "seatbelt", "seatbelt latched" if pulse else "seatbelt unlatched")]
    if mission_code == "A12":
        return [frame(0x220, [0, 0, 0, 0b00000001 if pulse else 0, 0, 0, 0, 0], "reverse_gear", "reverse selected" if pulse else "reverse not selected")]

    if mission_code == "S01":
        angle = 128 + (40 if pulse else 0) + wobble
        return [frame(0x024, [angle, 0, 0, 0, 0, 0, 0, 0], "steering_angle", f"steering angle raw={angle}")]
    if mission_code == "S02":
        pedal = 80 if pulse else 0
        return [frame(0x210, [pedal, 0, 0, 0, 0, 0, 0, 0], "accelerator_pedal", f"accelerator {pedal}/255")]
    if mission_code == "S03":
        pressure = 120 if pulse else 0
        return [
            frame(0x210, [0, pressure, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0], "brake_pressure", f"brake pressure {pressure}"),
            frame(0x321, [0, 0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0], "brake_lights", "brake switch ON" if pulse else "brake switch OFF"),
        ]
    if mission_code == "S04":
        rpm = 720 + (900 if pulse else 0) + tick * 8
        return [frame(0x200, [rpm & 0xFF, rpm >> 8, 0, 0, 0, 0, 0, 0], "engine_rpm", f"{rpm} rpm")]
    if mission_code == "S05":
        speed = 12 + tick if pulse else 0
        return [frame(0x201, [speed, 0, 0, 0, 0, 0, 0, 0], "vehicle_speed", f"{speed} kph")]
    if mission_code == "S06":
        gear = 1 if pulse else 0
        return [frame(0x220, [gear, 0, 0, 0, 0, 0, 0, 0], "gear_position", f"gear raw={gear}")]
    if mission_code == "S07":
        return [frame(0x220, [0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0, 0], "clutch_pedal", "clutch pressed" if pulse else "clutch released")]
    if mission_code == "S08":
        return [frame(0x338, [20 if pulse else 0, 8 if pulse else 0, 1 if pulse else 0, 0, 0, 0, 0, 0], "yaw_stability", "stability/yaw event" if pulse else "stable")]
    if mission_code == "S09":
        base = 30 if pulse else 0
        return [frame(0x208, [base, base + wobble, base, base + wobble, 0, 0, 0, 0], "wheel_speeds_abs", f"wheel speed base={base}")]
    if mission_code == "S10":
        return [frame(0x200, [0x40 if pulse else 0, 0x06 if pulse else 0, 1 if pulse else 0, 0, 0, 0, 0, 0], "ignition_engine_start", "engine start / ignition ON" if pulse else "ignition idle")]

    rank_hint = mission_code[0] if mission_code else "X"
    return [frame(0x342, [ord(rank_hint) & 0xFF, pulse, tick & 0xFF, 0, 0, 0, 0, 0], "generic_body_control", f"{mission_code} pulse={pulse}")]


async def insert_raw_frame(
    session_id: str,
    timestamp_ms: int,
    item: Frame,
    *,
    bus_interface: str,
    extra_metadata: Optional[Dict[str, Any]] = None,
) -> None:
    can_id, data, signal_name, decoded = item
    await execute(
        """
        INSERT INTO can_frames_raw (
            session_id,
            timestamp_ms,
            elapsed_ms,
            can_id,
            can_id_hex,
            dlc,
            data,
            source,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::bytea, $8, $9::jsonb)
        """,
        session_id,
        timestamp_ms,
        timestamp_ms / 1000.0,
        can_id,
        f"0x{can_id:03X}",
        len(data),
        bytes(data),
        bus_interface,
        jsonb_dumps(runtime_metadata({
            **(extra_metadata or {}),
            "signal_name": signal_name,
            "decoded": decoded,
            "data_hex": "".join(f"{byte:02X}" for byte in data),
        }, bus_interface=bus_interface)),
    )


async def insert_fake_burst(
    *,
    session_id: str,
    mission_code: str,
    step_code: Optional[str],
    marker_type: str,
    timestamp_ms: int,
    bus_interface: str,
) -> int:
    inserted = 0

    for i, base_frame in enumerate(baseline_frames(timestamp_ms)):
        await insert_raw_frame(
            session_id,
            max(0, timestamp_ms - 120 + i * 20),
            base_frame,
            bus_interface=bus_interface,
            extra_metadata={"frame_role": "baseline_around_marker", "marker_type": marker_type},
        )
        inserted += 1

    if marker_type in {"action_start", "capture_start", "step_complete"}:
        for tick in range(10):
            for sim_frame in mission_frames(mission_code, step_code, marker_type, tick):
                await insert_raw_frame(
                    session_id,
                    timestamp_ms + tick * 75,
                    sim_frame,
                    bus_interface=bus_interface,
                    extra_metadata={
                        "frame_role": "mission_signal_burst",
                        "mission_code": mission_code,
                        "step_code": step_code,
                        "marker_type": marker_type,
                    },
                )
                inserted += 1

    return inserted


@router.get("/status")
async def can_status() -> Dict[str, Any]:
    default_active = "can2" if IS_PRODUCTION else "vcan0"
    default_mode = "listen-only" if IS_PRODUCTION else "simulation"

    def iface(name: str) -> Dict[str, Any]:
        return {
            "exists": True,
            "up": True,
            "state": "PRODUCTION_FAKE_RECORDING_READY" if IS_PRODUCTION else "DEV_VIRTUAL_READY",
            "virtual": not IS_PRODUCTION,
            "fake_data": True,
            "bus_interface": name,
        }

    return {
        "active": default_active,
        "mode": default_mode,
        "app_env": RUNTIME_ENV,
        "env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "virtual": not IS_PRODUCTION,
        "fake_data": True,
        "database": "postgres",
        "vcan0": iface("vcan0"),
        "can0": iface("can0"),
        "can1": iface("can1"),
        "can2": iface("can2"),
    }


@router.post("/session/start")
async def start_session(payload: StartSessionRequest) -> Dict[str, Any]:
    vehicle = await fetchrow(
        "SELECT id FROM vehicles WHERE slug = $1",
        payload.vehicle_slug,
    )

    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle not found: {payload.vehicle_slug}")

    mission = None
    if payload.mission_code:
        mission = await fetchrow(
            """
            SELECT id FROM recon_missions
            WHERE vehicle_id = $1 AND mission_code = $2
            """,
            vehicle["id"],
            payload.mission_code,
        )

    session = await fetchrow(
        """
        INSERT INTO can_sessions (
            vehicle_id,
            mission_id,
            label,
            bus_interface,
            bus_mode,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING id, started_at
        """,
        vehicle["id"],
        mission["id"] if mission else None,
        payload.label,
        payload.bus_interface,
        payload.bus_mode,
        jsonb_dumps(runtime_metadata(payload.metadata, bus_interface=payload.bus_interface, bus_mode=payload.bus_mode)),
    )

    session_id = str(session["id"])

    for t in range(0, 1000, 100):
        for base_frame in baseline_frames(t):
            await insert_raw_frame(
                session_id,
                t,
                base_frame,
                bus_interface=payload.bus_interface,
                extra_metadata={"frame_role": "initial_baseline"},
            )

    return {
        "ok": True,
        "session_id": session_id,
        "started_at": session["started_at"],
        "mode": payload.bus_mode,
        "bus_interface": payload.bus_interface,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": True,
        "virtual": not IS_PRODUCTION,
        "database": "postgres",
    }


@router.post("/session/{session_id}/marker")
async def post_marker(session_id: str, payload: MarkerRequest) -> Dict[str, Any]:
    session = await fetchrow(
        """
        SELECT cs.id, cs.vehicle_id, cs.mission_id, cs.bus_interface, cs.bus_mode, cs.ended_at
        FROM can_sessions cs
        WHERE cs.id = $1
        """,
        session_id,
    )

    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    if session["ended_at"] is not None:
        raise HTTPException(status_code=409, detail="CAN session is already stopped")

    mission_id = session["mission_id"]
    mission_code = payload.mission_code

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

    marker = await fetchrow(
        """
        INSERT INTO can_session_markers (
            session_id,
            mission_id,
            step_id,
            marker_type,
            label,
            timestamp_ms,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id, created_at
        """,
        session_id,
        mission_id,
        step_id,
        payload.marker_type,
        payload.label,
        payload.timestamp_ms,
        jsonb_dumps(runtime_metadata(payload.metadata, bus_interface=session["bus_interface"], bus_mode=session["bus_mode"])),
    )

    frames_inserted = await insert_fake_burst(
        session_id=session_id,
        mission_code=mission_code or "",
        step_code=payload.step_code,
        marker_type=payload.marker_type,
        timestamp_ms=payload.timestamp_ms,
        bus_interface=session["bus_interface"],
    )

    return {
        "ok": True,
        "marker_id": str(marker["id"]),
        "created_at": marker["created_at"],
        "frames_inserted": frames_inserted,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.post("/session/{session_id}/stop")
async def stop_session(session_id: str, payload: StopSessionRequest) -> Dict[str, Any]:
    session = await fetchrow(
        """
        UPDATE can_sessions
        SET ended_at = NOW(),
            metadata = metadata || $2::jsonb
        WHERE id = $1
        RETURNING id, bus_interface, bus_mode, started_at, ended_at
        """,
        session_id,
        jsonb_dumps(runtime_metadata({"stop_metadata": payload.metadata})),
    )

    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    frame_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_frames_raw WHERE session_id = $1",
        session_id,
    )
    marker_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_session_markers WHERE session_id = $1",
        session_id,
    )

    return {
        "ok": True,
        "session_id": str(session["id"]),
        "status": "stopped",
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "frames": frame_count["count"],
        "markers": marker_count["count"],
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.get("/session/{session_id}/frames")
async def get_session_frames(session_id: str, limit: int = 250) -> Dict[str, Any]:
    limit = max(1, min(limit, 5000))
    session = await fetchrow(
        "SELECT id, bus_interface FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    rows = await fetch(
        """
        SELECT
            timestamp_ms,
            can_id_hex,
            dlc,
            upper(encode(data, 'hex')) AS data_hex,
            metadata->>'signal_name' AS signal_name,
            metadata->>'decoded' AS decoded,
            source AS bus_interface,
            metadata->>'app_env' AS app_env,
            CASE
                WHEN metadata->>'production' = 'true'
                THEN 'fake-can-production'
                ELSE 'fake-can-development'
            END AS source
        FROM can_frames_raw
        WHERE session_id = $1
        ORDER BY timestamp_ms ASC, can_id ASC
        LIMIT $2
        """,
        session_id,
        limit,
    )

    return {
        "ok": True,
        "session_id": session_id,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames": [dict(row) for row in rows],
    }


@router.get("/session/{session_id}/summary")
async def get_session_summary(session_id: str) -> Dict[str, Any]:
    session = await fetchrow(
        "SELECT * FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    frame_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_frames_raw WHERE session_id = $1",
        session_id,
    )
    marker_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_session_markers WHERE session_id = $1",
        session_id,
    )
    by_id = await fetch(
        """
        SELECT
            source AS bus_interface,
            can_id_hex,
            COALESCE(metadata->>'signal_name', 'unknown') AS signal_name,
            COUNT(*) AS count
        FROM can_frames_raw
        WHERE session_id = $1
        GROUP BY source, can_id_hex, COALESCE(metadata->>'signal_name', 'unknown')
        ORDER BY count DESC
        """,
        session_id,
    )

    return {
        "ok": True,
        "session": dict(session),
        "markers": marker_count["count"],
        "frames": frame_count["count"],
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames_by_id": [dict(row) for row in by_id],
    }
