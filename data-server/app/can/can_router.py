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

import asyncio
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import connect_db, execute, fetch, fetchrow, jsonb_dumps

APP_ENV = os.getenv("APP_ENV", "").strip().lower()
IS_PRODUCTION = APP_ENV == "production"
RUNTIME_ENV = "production" if IS_PRODUCTION else "development"

router = APIRouter(prefix="/data/can", tags=["can"])

SIMULATION_MODES = {"simulation", "sim", "replay", "offline", "fake", "dev"}
REAL_CAPTURE_MODES = {"listen-only", "listen_only", "live"}
INTERFACES_TO_REPORT = ("vcan0", "can0", "can1", "can2")
CAN_FORCE_FAKE = os.getenv("CAN_FORCE_FAKE", "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class CaptureState:
    session_id: str
    bus_interface: str
    bus_mode: str
    started_epoch: float
    task: asyncio.Task[None]
    process: Optional[asyncio.subprocess.Process] = None
    frames_inserted: int = 0
    lines_seen: int = 0
    last_error: Optional[str] = None


ACTIVE_CAPTURES: Dict[str, CaptureState] = {}


class StartSessionRequest(BaseModel):
    # The frontend may send either vehicle_slug or a full vehicle object.
    # The router will create/update vehicles automatically; no seed SQL required.
    vehicle_slug: Optional[str] = None
    vehicle: Dict[str, Any] = Field(default_factory=dict)
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


SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    slug = SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug or "custom-vehicle"


def vehicle_payload_value(payload: StartSessionRequest, *keys: str) -> Any:
    for key in keys:
        if key in payload.vehicle and payload.vehicle[key] not in (None, ""):
            return payload.vehicle[key]
        if key in payload.metadata and payload.metadata[key] not in (None, ""):
            return payload.metadata[key]
    return None


def normalized_vehicle_payload(payload: StartSessionRequest) -> Dict[str, Any]:
    raw_name = vehicle_payload_value(payload, "displayName", "display_name", "name")
    raw_slug = payload.vehicle_slug or vehicle_payload_value(payload, "slug", "vehicle_slug", "id")

    make = vehicle_payload_value(payload, "make", "manufacturer")
    model = vehicle_payload_value(payload, "model")

    if not raw_slug:
        raw_slug = " ".join(str(part) for part in [make, model, raw_name] if part)

    slug = slugify(str(raw_slug or "custom-vehicle"))
    display_name = str(raw_name or " ".join(str(part) for part in [make, model] if part) or slug)

    year_value = vehicle_payload_value(payload, "year")
    try:
        year = int(year_value) if year_value not in (None, "") else None
    except (TypeError, ValueError):
        year = None

    dataset_kind = vehicle_payload_value(payload, "datasetKind", "dataset_kind") or "practice"
    notes = vehicle_payload_value(payload, "notes", "description")

    # vehicles.make and vehicles.model are NOT NULL in schema.sql.
    safe_make = str(make or "Custom")
    safe_model = str(model or display_name or slug)

    metadata = {
        "source": "auto-vehicle-upsert",
        "display_name": display_name,
        "dataset_kind": dataset_kind,
        "notes": notes,
        "frontend_vehicle": payload.vehicle,
        "session_metadata_vehicle": {
            key: value
            for key, value in payload.metadata.items()
            if key.startswith("vehicle") or key in {"dataset_kind", "datasetKind"}
        },
    }

    return {
        "slug": slug,
        "year": year,
        "make": safe_make,
        "model": safe_model,
        "trim": vehicle_payload_value(payload, "trim"),
        "alias": vehicle_payload_value(payload, "alias") or vehicle_payload_value(payload, "name"),
        "vin": vehicle_payload_value(payload, "vin"),
        "metadata": metadata,
    }


async def ensure_vehicle(payload: StartSessionRequest) -> Dict[str, Any]:
    vehicle = normalized_vehicle_payload(payload)
    row = await fetchrow(
        """
        INSERT INTO vehicles (slug, year, make, model, trim, alias, vin, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (slug) DO UPDATE
        SET
            year = COALESCE(EXCLUDED.year, vehicles.year),
            make = COALESCE(NULLIF(EXCLUDED.make, ''), vehicles.make),
            model = COALESCE(NULLIF(EXCLUDED.model, ''), vehicles.model),
            trim = COALESCE(EXCLUDED.trim, vehicles.trim),
            alias = COALESCE(EXCLUDED.alias, vehicles.alias),
            vin = COALESCE(EXCLUDED.vin, vehicles.vin),
            metadata = vehicles.metadata || EXCLUDED.metadata
        RETURNING id, slug, year, make, model, trim, alias, vin, metadata
        """,
        vehicle["slug"],
        vehicle["year"],
        vehicle["make"],
        vehicle["model"],
        vehicle["trim"],
        vehicle["alias"],
        vehicle["vin"],
        jsonb_dumps(vehicle["metadata"]),
    )
    return dict(row)


async def ensure_recon_mission(vehicle_id: str, payload: StartSessionRequest) -> Optional[Dict[str, Any]]:
    if not payload.mission_code:
        return None

    mission_metadata = {
        "source": "auto-mission-upsert",
        "rank": payload.metadata.get("rank"),
        "category": payload.metadata.get("category"),
        "difficulty": payload.metadata.get("difficulty"),
        "recording_stage": payload.metadata.get("recording_stage"),
        "default_timing": payload.metadata.get("default_timing"),
        "frontend_metadata": payload.metadata,
    }

    title = payload.label or payload.metadata.get("mission_title") or payload.mission_code
    target = payload.metadata.get("target") or title
    description = payload.metadata.get("description")

    row = await fetchrow(
        """
        INSERT INTO recon_missions (
            vehicle_id,
            mission_code,
            title,
            target,
            status,
            description,
            metadata
        )
        VALUES ($1, $2, $3, $4, 'READY', $5, $6::jsonb)
        ON CONFLICT (vehicle_id, mission_code) DO UPDATE
        SET
            title = COALESCE(NULLIF(EXCLUDED.title, ''), recon_missions.title),
            target = COALESCE(NULLIF(EXCLUDED.target, ''), recon_missions.target),
            description = COALESCE(EXCLUDED.description, recon_missions.description),
            metadata = recon_missions.metadata || EXCLUDED.metadata
        RETURNING id, mission_code, title, target
        """,
        vehicle_id,
        payload.mission_code,
        title,
        target,
        description,
        jsonb_dumps(mission_metadata),
    )
    return dict(row) if row else None



def normalize_mode(bus_mode: Optional[str]) -> str:
    return (bus_mode or "").strip().lower().replace("_", "-")


def should_use_fake_capture(bus_interface: Optional[str], bus_mode: Optional[str]) -> bool:
    iface = (bus_interface or "").strip().lower()
    mode = normalize_mode(bus_mode)
    if CAN_FORCE_FAKE:
        return True
    if iface == "vcan0" or mode in SIMULATION_MODES:
        return True
    return False


def capture_kind_for(bus_interface: Optional[str], bus_mode: Optional[str]) -> str:
    return "simulation" if should_use_fake_capture(bus_interface, bus_mode) else "live"


def can_interface_state(name: str, bus_mode: Optional[str] = None) -> Dict[str, Any]:
    fake_data = should_use_fake_capture(name, bus_mode)
    result = subprocess.run(
        ["ip", "-details", "link", "show", name],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    output = result.stdout or ""
    exists = result.returncode == 0
    up = exists and "<" in output and "UP" in output.split(">", 1)[0]
    lower_up = exists and "LOWER_UP" in output.split("\n", 1)[0]

    can_state_match = re.search(r"can state\s+([^\s]+)", output)
    can_state = can_state_match.group(1) if can_state_match else ("UP" if up else "DOWN")
    bitrate_match = re.search(r"bitrate\s+(\d+)", output)
    bitrate = int(bitrate_match.group(1)) if bitrate_match else None

    if not exists:
        state = "MISSING"
    elif fake_data:
        state = "SIMULATION_READY" if up else "SIMULATION_DOWN"
    elif up:
        state = can_state or "REAL_CAN_READY"
    else:
        state = "DOWN"

    return {
        "exists": exists,
        "up": up,
        "lower_up": lower_up,
        "state": state,
        "can_state": can_state,
        "bitrate": bitrate,
        "virtual": name == "vcan0",
        "fake_data": fake_data,
        "bus_interface": name,
        "bus_mode": bus_mode,
        "capture_kind": capture_kind_for(name, bus_mode),
        "details": output.strip() if exists else (result.stderr or "").strip(),
    }


CANDUMP_RE = re.compile(
    r"^\((?P<epoch>\d+(?:\.\d+)?)\)\s+"
    r"(?P<iface>\S+)\s+"
    r"(?P<can_id>[0-9A-Fa-f]+)(?:##[0-9A-Fa-f]|#)(?P<data>[0-9A-Fa-f]*)"
)


def parse_candump_line(line: str, started_epoch: float) -> Optional[Dict[str, Any]]:
    match = CANDUMP_RE.match(line.strip())
    if not match:
        return None

    can_id_hex = match.group("can_id").upper()
    data_hex = match.group("data").upper()
    if len(data_hex) % 2:
        return None

    try:
        epoch = float(match.group("epoch"))
        can_id = int(can_id_hex, 16)
        data = bytes.fromhex(data_hex)
    except ValueError:
        return None

    elapsed_ms = max(0, int((epoch - started_epoch) * 1000))
    return {
        "timestamp_ms": elapsed_ms,
        "elapsed_ms": elapsed_ms / 1000.0,
        "can_id": can_id,
        "can_id_hex": f"0x{can_id:03X}",
        "dlc": len(data),
        "data": data,
        "data_hex": data_hex,
        "epoch": epoch,
        "iface": match.group("iface"),
    }


async def insert_socketcan_batch(
    session_id: str,
    bus_interface: str,
    bus_mode: str,
    rows: List[Dict[str, Any]],
) -> int:
    if not rows:
        return 0

    pool = await connect_db()
    async with pool.acquire() as conn:
        await conn.executemany(
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
            [
                (
                    session_id,
                    row["timestamp_ms"],
                    row["elapsed_ms"],
                    row["can_id"],
                    row["can_id_hex"],
                    row["dlc"],
                    row["data"],
                    bus_interface,
                    jsonb_dumps(runtime_metadata(
                        {
                            "source": "socketcan-candump",
                            "capture_source": "real-socketcan",
                            "epoch": row["epoch"],
                            "data_hex": row["data_hex"],
                            "candump_iface": row["iface"],
                        },
                        bus_interface=bus_interface,
                        bus_mode=bus_mode,
                        fake_can=False,
                    )),
                )
                for row in rows
            ],
        )
    return len(rows)


async def capture_socketcan_session(state: CaptureState) -> None:
    buffer: List[Dict[str, Any]] = []
    last_flush = time.monotonic()

    try:
        if shutil.which("candump") is None:
            state.last_error = "candump is not installed. Install can-utils."
            return

        state.process = await asyncio.create_subprocess_exec(
            "candump",
            "-L",
            state.bus_interface,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        assert state.process.stdout is not None
        while True:
            line_bytes = await state.process.stdout.readline()
            if not line_bytes:
                break

            line = line_bytes.decode("utf-8", errors="replace").strip()
            state.lines_seen += 1
            parsed = parse_candump_line(line, state.started_epoch)
            if parsed:
                buffer.append(parsed)

            now = time.monotonic()
            if len(buffer) >= 100 or (buffer and now - last_flush >= 0.25):
                inserted = await insert_socketcan_batch(
                    state.session_id,
                    state.bus_interface,
                    state.bus_mode,
                    buffer,
                )
                state.frames_inserted += inserted
                buffer.clear()
                last_flush = now

        if buffer:
            inserted = await insert_socketcan_batch(
                state.session_id,
                state.bus_interface,
                state.bus_mode,
                buffer,
            )
            state.frames_inserted += inserted
            buffer.clear()

        if state.process.stderr is not None:
            try:
                stderr = (await asyncio.wait_for(state.process.stderr.read(), timeout=0.25)).decode("utf-8", errors="replace").strip()
                if stderr:
                    state.last_error = stderr
            except asyncio.TimeoutError:
                pass
    except asyncio.CancelledError:
        if buffer:
            inserted = await insert_socketcan_batch(
                state.session_id,
                state.bus_interface,
                state.bus_mode,
                buffer,
            )
            state.frames_inserted += inserted
        raise
    except Exception as exc:
        state.last_error = str(exc)
    finally:
        if state.process and state.process.returncode is None:
            state.process.terminate()
            try:
                await asyncio.wait_for(state.process.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                state.process.kill()
                await state.process.wait()


async def start_socketcan_capture(session_id: str, bus_interface: str, bus_mode: str) -> CaptureState:
    iface = can_interface_state(bus_interface, bus_mode)
    if not iface["exists"]:
        raise HTTPException(status_code=400, detail=f"CAN interface {bus_interface} does not exist")
    if not iface["up"]:
        raise HTTPException(status_code=400, detail=f"CAN interface {bus_interface} is not UP")
    if shutil.which("candump") is None:
        raise HTTPException(status_code=500, detail="candump is not installed. Run: sudo apt install -y can-utils")

    # End any old capture for this session id before starting a new one.
    old = ACTIVE_CAPTURES.pop(session_id, None)
    if old and old.process and old.process.returncode is None:
        old.process.terminate()

    state = CaptureState(
        session_id=session_id,
        bus_interface=bus_interface,
        bus_mode=bus_mode,
        started_epoch=time.time(),
        task=asyncio.create_task(asyncio.sleep(0)),
    )
    state.task = asyncio.create_task(capture_socketcan_session(state))
    ACTIVE_CAPTURES[session_id] = state
    await asyncio.sleep(0.05)
    return state


async def stop_socketcan_capture(session_id: str) -> Optional[CaptureState]:
    state = ACTIVE_CAPTURES.pop(session_id, None)
    if not state:
        return None

    if state.process and state.process.returncode is None:
        state.process.terminate()

    try:
        await asyncio.wait_for(state.task, timeout=2.0)
    except asyncio.TimeoutError:
        if state.process and state.process.returncode is None:
            state.process.kill()
        state.task.cancel()
    except Exception as exc:
        state.last_error = str(exc)
    return state


def runtime_metadata(
    extra: Optional[Dict[str, Any]] = None,
    *,
    bus_interface: Optional[str] = None,
    bus_mode: Optional[str] = None,
    fake_can: Optional[bool] = None,
) -> Dict[str, Any]:
    fake = should_use_fake_capture(bus_interface, bus_mode) if fake_can is None else fake_can
    return {
        **(extra or {}),
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "development": not IS_PRODUCTION,
        "fake_can": fake,
        "virtual": (bus_interface == "vcan0") or not IS_PRODUCTION,
        "capture_kind": "simulation" if fake else "live",
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
            "capture_source": "generated-fake-can",
            "signal_name": signal_name,
            "decoded": decoded,
            "data_hex": "".join(f"{byte:02X}" for byte in data),
        }, bus_interface=bus_interface, fake_can=True)),
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
        jsonb_dumps(session_metadata),
    )

    session_id = str(session["id"])
    fake_capture = should_use_fake_capture(payload.bus_interface, payload.bus_mode)
    capture_state: Optional[CaptureState] = None

    if fake_capture:
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

    fake_capture = should_use_fake_capture(session["bus_interface"], session["bus_mode"])
    frames_inserted = 0
    capture_source = "socketcan-candump"
    if fake_capture:
        capture_source = "generated-fake-can"
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
        "bus_mode": session["bus_mode"],
        "capture_kind": "simulation" if fake_capture else "live",
        "capture_source": capture_source,
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
    }


@router.post("/session/{session_id}/stop")
async def stop_session(session_id: str, payload: StopSessionRequest) -> Dict[str, Any]:
    existing_session = await fetchrow(
        "SELECT id, bus_interface, bus_mode FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not existing_session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    capture_state = await stop_socketcan_capture(session_id)
    fake_capture = should_use_fake_capture(existing_session["bus_interface"], existing_session["bus_mode"])

    session = await fetchrow(
        """
        UPDATE can_sessions
        SET ended_at = NOW(),
            metadata = metadata || $2::jsonb
        WHERE id = $1
        RETURNING id, bus_interface, bus_mode, started_at, ended_at
        """,
        session_id,
        jsonb_dumps(runtime_metadata({
            "stop_metadata": payload.metadata,
            "capture_frames_inserted": capture_state.frames_inserted if capture_state else None,
            "capture_lines_seen": capture_state.lines_seen if capture_state else None,
            "capture_error": capture_state.last_error if capture_state else None,
        }, bus_interface=existing_session["bus_interface"], bus_mode=existing_session["bus_mode"], fake_can=fake_capture)),
    )

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
        "bus_mode": session["bus_mode"],
        "capture_kind": "simulation" if fake_capture else "live",
        "fake_can": fake_capture,
        "capture_frames_inserted": capture_state.frames_inserted if capture_state else None,
        "capture_lines_seen": capture_state.lines_seen if capture_state else None,
        "capture_error": capture_state.last_error if capture_state else None,
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
            COALESCE(metadata->>'capture_source', metadata->>'source', 'unknown') AS source
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
