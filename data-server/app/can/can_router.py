"""
FastAPI CAN router for Aven Data Server.

Only one environment switch is used:
    APP_ENV=production

Behavior:
- If APP_ENV is exactly "production", production=True.
- If APP_ENV is missing or anything else, assume development.
- Development mode virtualizes every selected interface so macOS can test DB/session flows.
- Production mode still allows fake/generated CAN recording for database testing, but labels
  every session/frame by the frontend-selected CAN interface: can0, can1, can2, or vcan0.

Routes:
    GET  /data/can/status
    POST /data/can/session/start
    POST /data/can/session/{session_id}/marker
    POST /data/can/session/{session_id}/stop
    GET  /data/can/session/{session_id}/frames
    GET  /data/can/session/{session_id}/summary
"""

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/data/can", tags=["can"])

APP_ENV = os.getenv("APP_ENV", "").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
RUNTIME_ENV = "production" if IS_PRODUCTION else "development"

# No DB env var. Development writes to the dev DB by default; production is the
# only signal to write to the production fake-CAN DB.
DB_PATH = Path("./data/can_prod.sqlite3" if IS_PRODUCTION else "./data/can_dev.sqlite3")
FRAME_SOURCE = "fake-can-production" if IS_PRODUCTION else "fake-can-development"

CAN_INTERFACES = ("vcan0", "can0", "can1", "can2")
DEFAULT_INTERFACE = "can2"
DEFAULT_MODE = "listen-only" if IS_PRODUCTION else "simulation"


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class StartSessionRequest(BaseModel):
    vehicle_slug: str = "2015-scion-frs"
    mission_code: str
    label: Optional[str] = None
    bus_interface: str = DEFAULT_INTERFACE
    bus_mode: str = DEFAULT_MODE
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


# -----------------------------------------------------------------------------
# SQLite helpers
# -----------------------------------------------------------------------------

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    init_db(conn)
    return conn


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS can_sessions (
            session_id TEXT PRIMARY KEY,
            vehicle_slug TEXT NOT NULL,
            mission_code TEXT NOT NULL,
            label TEXT,
            bus_interface TEXT NOT NULL,
            bus_mode TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            stopped_at TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS can_markers (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            mission_code TEXT,
            step_code TEXT,
            marker_type TEXT NOT NULL,
            label TEXT,
            timestamp_ms INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(session_id) REFERENCES can_sessions(session_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS can_frames (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            can_id INTEGER NOT NULL,
            can_id_hex TEXT NOT NULL,
            dlc INTEGER NOT NULL,
            data_hex TEXT NOT NULL,
            data_json TEXT NOT NULL,
            signal_name TEXT,
            decoded TEXT,
            bus_interface TEXT NOT NULL DEFAULT 'can2',
            app_env TEXT NOT NULL DEFAULT 'development',
            source TEXT NOT NULL DEFAULT 'fake-can-development',
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES can_sessions(session_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_can_markers_session_time
            ON can_markers(session_id, timestamp_ms);

        CREATE INDEX IF NOT EXISTS idx_can_frames_session_time
            ON can_frames(session_id, timestamp_ms);

        CREATE INDEX IF NOT EXISTS idx_can_frames_session_canid
            ON can_frames(session_id, can_id_hex);

        CREATE INDEX IF NOT EXISTS idx_can_frames_session_interface
            ON can_frames(session_id, bus_interface);
        """
    )

    # Lightweight migration for earlier local dev DBs created before interface/env labels existed.
    ensure_column(conn, "can_frames", "bus_interface", "TEXT NOT NULL DEFAULT 'can2'")
    ensure_column(conn, "can_frames", "app_env", "TEXT NOT NULL DEFAULT 'development'")
    conn.commit()


def require_session(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM can_sessions WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown CAN session")
    return row


# -----------------------------------------------------------------------------
# Fake CAN generation
# -----------------------------------------------------------------------------

Frame = Tuple[int, List[int], str, str]


def clamp_byte(value: int) -> int:
    return max(0, min(255, int(value)))


def frame(can_id: int, data: List[int], signal_name: str, decoded: str) -> Frame:
    padded = (data + [0] * 8)[:8]
    return can_id, [clamp_byte(x) for x in padded], signal_name, decoded


def baseline_frames(seed: int = 0) -> List[Frame]:
    # Stable-ish Toyota/Subaru-like fake IDs for recon testing. They are not meant
    # to claim true FR-S decoding; they just give the database enough structured
    # traffic to validate session/marker/correlation workflows.
    rpm = 720 + (seed % 30)
    speed_kph = 0
    return [
        frame(0x200, [rpm & 0xFF, rpm >> 8, 0, 0, 0, 0, 0, 0], "engine_rpm", f"idle {rpm} rpm"),
        frame(0x201, [speed_kph, 0, 0, 0, 0, 0, 0, 0], "vehicle_speed", "0 kph"),
        frame(0x210, [0, 0, 0, 0, 0, 0, 0, 0], "pedals", "no pedal input"),
        frame(0x320, [0, 0, 0, 0, 0, 0, 0, 0], "body_status", "body idle"),
        frame(0x321, [0, 0, 0, 0, 0, 0, 0, 0], "lighting_status", "lights idle"),
        frame(0x322, [0, 0, 0, 0, 0, 0, 0, 0], "doors_locks", "doors closed / unlocked"),
    ]


def mission_frames(mission_code: str, step_code: Optional[str], marker_type: str, tick: int) -> List[Frame]:
    """Return fake frames correlated to mission action/capture markers."""
    mission_code = mission_code.upper()
    step_code_l = (step_code or "").lower()

    active = marker_type in {"action_start", "capture_start", "step_complete"}
    pulse = 1 if active else 0
    wobble = tick % 4

    # Rank A: demo-critical body/light signals.
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

    # Rank S: driving/control signals.
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

    # Rank B/C fallback: make a consistent body-control pulse.
    rank_hint = mission_code[0] if mission_code else "X"
    return [frame(0x342, [ord(rank_hint) & 0xFF, pulse, tick & 0xFF, 0, 0, 0, 0, 0], "generic_body_control", f"{mission_code} pulse={pulse}")]


def insert_frame(
    conn: sqlite3.Connection,
    session_id: str,
    timestamp_ms: int,
    item: Frame,
    bus_interface: str,
) -> None:
    can_id, data, signal_name, decoded = item
    data_hex = "".join(f"{byte:02X}" for byte in data)
    conn.execute(
        """
        INSERT INTO can_frames (
            id, session_id, timestamp_ms, can_id, can_id_hex, dlc,
            data_hex, data_json, signal_name, decoded, bus_interface,
            app_env, source, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            session_id,
            timestamp_ms,
            can_id,
            f"0x{can_id:03X}",
            len(data),
            data_hex,
            json_dumps(data),
            signal_name,
            decoded,
            bus_interface,
            RUNTIME_ENV,
            FRAME_SOURCE,
            utc_now(),
        ),
    )


def insert_fake_burst(
    conn: sqlite3.Connection,
    session_id: str,
    mission_code: str,
    step_code: Optional[str],
    marker_type: str,
    timestamp_ms: int,
    bus_interface: str,
) -> int:
    inserted = 0

    # Keep normal background traffic around every marker.
    for i, base_frame in enumerate(baseline_frames(timestamp_ms)):
        insert_frame(conn, session_id, max(0, timestamp_ms - 120 + i * 20), base_frame, bus_interface)
        inserted += 1

    # Only produce strong signal bursts around useful mission phases.
    if marker_type in {"action_start", "capture_start", "step_complete"}:
        for tick in range(10):
            for sim_frame in mission_frames(mission_code, step_code, marker_type, tick):
                insert_frame(conn, session_id, timestamp_ms + tick * 75, sim_frame, bus_interface)
                inserted += 1

    return inserted


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

def interface_status(name: str) -> Dict[str, Any]:
    if IS_PRODUCTION:
        state = "PRODUCTION_FAKE_RECORDING_READY"
    else:
        state = "DEV_VIRTUAL_READY"

    return {
        "exists": True,
        "up": True,
        "state": state,
        "virtual": not IS_PRODUCTION,
        "fake_data": True,
        "bus_interface": name,
    }


@router.get("/status")
def can_status() -> Dict[str, Any]:
    interfaces = {name: interface_status(name) for name in CAN_INTERFACES}

    return {
        "active": DEFAULT_INTERFACE,
        "mode": DEFAULT_MODE,
        "app_env": RUNTIME_ENV,
        "env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "virtual": not IS_PRODUCTION,
        "fake_data": True,
        "database": str(DB_PATH),
        **interfaces,
    }


@router.post("/session/start")
def start_session(payload: StartSessionRequest) -> Dict[str, Any]:
    session_id = str(uuid.uuid4())
    now = utc_now()
    bus_interface = (payload.bus_interface or DEFAULT_INTERFACE).strip() or DEFAULT_INTERFACE
    bus_mode = (payload.bus_mode or DEFAULT_MODE).strip() or DEFAULT_MODE

    metadata = {
        **payload.metadata,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": True,
        "virtual": not IS_PRODUCTION,
        "bus_interface": bus_interface,
        "bus_mode": bus_mode,
        "database": str(DB_PATH),
    }

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO can_sessions (
                session_id, vehicle_slug, mission_code, label, bus_interface,
                bus_mode, status, started_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                payload.vehicle_slug,
                payload.mission_code,
                payload.label,
                bus_interface,
                bus_mode,
                "recording",
                now,
                json_dumps(metadata),
            ),
        )

        for t in range(0, 1000, 100):
            for base_frame in baseline_frames(t):
                insert_frame(conn, session_id, t, base_frame, bus_interface)

        conn.commit()

    return {
        "ok": True,
        "session_id": session_id,
        "mode": bus_mode,
        "bus_interface": bus_interface,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": True,
        "virtual": not IS_PRODUCTION,
        "database": str(DB_PATH),
    }


@router.post("/session/{session_id}/marker")
def post_marker(session_id: str, payload: MarkerRequest) -> Dict[str, Any]:
    marker_id = str(uuid.uuid4())
    created_at = utc_now()

    with get_conn() as conn:
        session = require_session(conn, session_id)
        if session["status"] != "recording":
            raise HTTPException(status_code=409, detail="CAN session is not recording")

        mission_code = payload.mission_code or session["mission_code"]
        bus_interface = session["bus_interface"]
        marker_metadata = {
            **payload.metadata,
            "app_env": RUNTIME_ENV,
            "production": IS_PRODUCTION,
            "fake_can": True,
            "virtual": not IS_PRODUCTION,
            "bus_interface": bus_interface,
        }

        conn.execute(
            """
            INSERT INTO can_markers (
                id, session_id, mission_code, step_code, marker_type, label,
                timestamp_ms, created_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                marker_id,
                session_id,
                mission_code,
                payload.step_code,
                payload.marker_type,
                payload.label,
                payload.timestamp_ms,
                created_at,
                json_dumps(marker_metadata),
            ),
        )

        frames_inserted = insert_fake_burst(
            conn=conn,
            session_id=session_id,
            mission_code=mission_code,
            step_code=payload.step_code,
            marker_type=payload.marker_type,
            timestamp_ms=payload.timestamp_ms,
            bus_interface=bus_interface,
        )
        conn.commit()

    return {
        "ok": True,
        "marker_id": marker_id,
        "frames_inserted": frames_inserted,
        "bus_interface": bus_interface,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.post("/session/{session_id}/stop")
def stop_session(session_id: str, payload: StopSessionRequest) -> Dict[str, Any]:
    with get_conn() as conn:
        session = require_session(conn, session_id)
        stopped_at = utc_now()
        existing_metadata = json.loads(session["metadata_json"] or "{}")
        merged_metadata = {
            **existing_metadata,
            "stop_metadata": payload.metadata,
            "app_env": RUNTIME_ENV,
            "production": IS_PRODUCTION,
        }
        conn.execute(
            """
            UPDATE can_sessions
            SET status = ?, stopped_at = ?, metadata_json = ?
            WHERE session_id = ?
            """,
            (
                "stopped",
                stopped_at,
                json_dumps(merged_metadata),
                session_id,
            ),
        )
        frame_count = conn.execute(
            "SELECT COUNT(*) AS count FROM can_frames WHERE session_id = ?",
            (session_id,),
        ).fetchone()["count"]
        marker_count = conn.execute(
            "SELECT COUNT(*) AS count FROM can_markers WHERE session_id = ?",
            (session_id,),
        ).fetchone()["count"]
        conn.commit()

    return {
        "ok": True,
        "session_id": session_id,
        "status": "stopped",
        "frames": frame_count,
        "markers": marker_count,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.get("/session/{session_id}/frames")
def get_session_frames(session_id: str, limit: int = 250) -> Dict[str, Any]:
    limit = max(1, min(limit, 5000))
    with get_conn() as conn:
        session = require_session(conn, session_id)
        rows = conn.execute(
            """
            SELECT
                timestamp_ms,
                can_id_hex,
                dlc,
                data_hex,
                data_json,
                signal_name,
                decoded,
                bus_interface,
                app_env,
                source
            FROM can_frames
            WHERE session_id = ?
            ORDER BY timestamp_ms ASC, can_id ASC
            LIMIT ?
            """,
            (session_id, limit),
        ).fetchall()

    return {
        "ok": True,
        "session_id": session_id,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames": [dict(row) for row in rows],
    }


@router.get("/session/{session_id}/summary")
def get_session_summary(session_id: str) -> Dict[str, Any]:
    with get_conn() as conn:
        session = require_session(conn, session_id)
        frame_count = conn.execute(
            "SELECT COUNT(*) AS count FROM can_frames WHERE session_id = ?",
            (session_id,),
        ).fetchone()["count"]
        marker_count = conn.execute(
            "SELECT COUNT(*) AS count FROM can_markers WHERE session_id = ?",
            (session_id,),
        ).fetchone()["count"]
        by_id = conn.execute(
            """
            SELECT bus_interface, can_id_hex, signal_name, COUNT(*) AS count
            FROM can_frames
            WHERE session_id = ?
            GROUP BY bus_interface, can_id_hex, signal_name
            ORDER BY count DESC
            """,
            (session_id,),
        ).fetchall()

    return {
        "ok": True,
        "session": dict(session),
        "markers": marker_count,
        "frames": frame_count,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames_by_id": [dict(row) for row in by_id],
    }
