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
import json
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import platform

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
    started_monotonic: float
    task: asyncio.Task[None]
    process: Optional[asyncio.subprocess.Process] = None
    frames_inserted: int = 0
    lines_seen: int = 0
    last_error: Optional[str] = None


ACTIVE_CAPTURES: Dict[str, CaptureState] = {}
SIMULATION_SIGNAL_STATE: Dict[str, Dict[str, float]] = {}

ACTION_MARKER_TYPES = {
    "action_start",
    "action",
    "target_action",
    "target_event",
}


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
    # Accepted only for diagnostics/backward compatibility. The canonical
    # marker timestamp is always assigned by the Pi when the request arrives.
    timestamp_ms: Optional[int] = None
    client_event_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StopSessionRequest(BaseModel):
    metadata: Dict[str, Any] = Field(default_factory=dict)


Frame = Tuple[int, List[int], str, str]


SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    slug = SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug or "custom-vehicle"


def json_object(value: Any) -> Dict[str, Any]:
    """Normalize asyncpg json/jsonb values to a plain dictionary."""
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


def optional_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return None
    return None


async def recon_step_columns() -> set[str]:
    rows = await fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'recon_steps'
        """
    )
    return {str(row["column_name"]) for row in rows}


async def upsert_recon_step(
    mission_id: str,
    step_payload: Dict[str, Any],
    *,
    sort_order: int,
    columns: set[str],
) -> Optional[str]:
    step_code = str(step_payload.get("step_code") or "").strip()
    if not step_code or "mission_id" not in columns or "step_code" not in columns:
        return None

    label = str(
        step_payload.get("label")
        or step_payload.get("action_text")
        or step_code
    )
    metadata = json_object(step_payload.get("metadata"))
    metadata = {
        **metadata,
        "source": "signal-recon-session-start",
        "frontend_step": step_payload,
    }
    values_by_column: dict[str, Any] = {
        "mission_id": mission_id,
        "step_code": step_code,
        "label": label,
        "title": label,
        "instruction": step_payload.get("instruction"),
        "action_text": step_payload.get("action_text"),
        "sort_order": sort_order,
        "baseline_ms": optional_int(step_payload.get("baseline_ms")),
        "countdown_ms": optional_int(step_payload.get("countdown_ms")),
        "action_ms": optional_int(step_payload.get("action_ms")),
        "capture_ms": optional_int(step_payload.get("capture_ms")),
        "metadata": jsonb_dumps(metadata),
    }

    existing = await fetchrow(
        """
        SELECT id
        FROM recon_steps
        WHERE mission_id = $1 AND step_code = $2
        """,
        mission_id,
        step_code,
    )

    usable_columns = [
        column
        for column, value in values_by_column.items()
        if column in columns and value is not None
    ]
    if existing:
        update_columns = [
            column
            for column in usable_columns
            if column not in {"mission_id", "step_code"}
        ]
        if not update_columns:
            return str(existing["id"])
        assignments = []
        args: list[Any] = [existing["id"]]
        for column in update_columns:
            args.append(values_by_column[column])
            placeholder = f"${len(args)}"
            if column == "metadata":
                placeholder += "::jsonb"
            assignments.append(f"{column} = {placeholder}")
        row = await fetchrow(
            f"""
            UPDATE recon_steps
            SET {', '.join(assignments)}
            WHERE id = $1
            RETURNING id
            """,
            *args,
        )
        return str(row["id"]) if row else str(existing["id"])

    insert_columns = usable_columns
    placeholders = []
    args = []
    for column in insert_columns:
        args.append(values_by_column[column])
        placeholder = f"${len(args)}"
        if column == "metadata":
            placeholder += "::jsonb"
        placeholders.append(placeholder)
    row = await fetchrow(
        f"""
        INSERT INTO recon_steps ({', '.join(insert_columns)})
        VALUES ({', '.join(placeholders)})
        RETURNING id
        """,
        *args,
    )
    return str(row["id"]) if row else None


async def ensure_recon_steps(
    mission_id: Optional[str],
    payload: StartSessionRequest,
) -> int:
    if not mission_id:
        return 0
    steps = payload.metadata.get("mission_steps")
    if not isinstance(steps, list):
        return 0
    try:
        columns = await recon_step_columns()
        count = 0
        for index, raw_step in enumerate(steps):
            if not isinstance(raw_step, dict):
                continue
            step_id = await upsert_recon_step(
                mission_id,
                raw_step,
                sort_order=index,
                columns=columns,
            )
            if step_id:
                count += 1
        return count
    except Exception as exc:
        print(f"[can_router] recon_step_upsert_failed mission_id={mission_id} error={exc}")
        return 0


async def ensure_marker_step(
    mission_id: Optional[str],
    step_code: Optional[str],
    label: Optional[str],
    metadata: Dict[str, Any],
) -> Optional[str]:
    if not mission_id or not step_code:
        return None
    try:
        columns = await recon_step_columns()
        return await upsert_recon_step(
            mission_id,
            {
                "step_code": step_code,
                "label": label or step_code,
                "instruction": metadata.get("instruction"),
                "action_text": metadata.get("action_text"),
                "baseline_ms": None,
                "countdown_ms": None,
                "action_ms": metadata.get("planned_duration_ms"),
                "capture_ms": None,
                "metadata": metadata.get("step_metadata") or metadata,
            },
            sort_order=0,
            columns=columns,
        )
    except Exception as exc:
        print(f"[can_router] marker_step_upsert_failed mission_id={mission_id} step_code={step_code} error={exc}")
        return None



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


def can_interface_state(name: str, default_mode: str) -> dict[str, Any]:
    app_env = os.getenv("APP_ENV", "development")
    is_dev = app_env != "production"
    is_linux = platform.system().lower() == "linux"
    ip_cmd = shutil.which("ip")

    # macOS/dev fallback:
    # macOS does not have Linux SocketCAN interfaces or the `ip` command.
    # Do not crash /data/can/status just because we are developing locally.
    if not is_linux or ip_cmd is None:
        return {
            "name": name,
            "exists": name == "vcan0" and is_dev,
            "up": name == "vcan0" and is_dev,
            "state": "up" if name == "vcan0" and is_dev else "missing",
            "mode": "simulation" if name == "vcan0" and is_dev else default_mode,
            "details": "dev fallback: linux ip command unavailable",
        }

    result = subprocess.run(
        [ip_cmd, "-details", "link", "show", name],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        return {
            "name": name,
            "exists": False,
            "up": False,
            "state": "missing",
            "mode": default_mode,
            "details": result.stderr.strip() or result.stdout.strip(),
        }

    output = result.stdout
    is_up = "UP" in output

    return {
        "name": name,
        "exists": True,
        "up": is_up,
        "state": "up" if is_up else "down",
        "mode": default_mode,
        "details": output,
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
        started_monotonic=time.monotonic(),
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


async def server_capture_timestamp_ms(
    session_id: str,
    started_at: Any,
) -> tuple[int, str]:
    """Return the Pi-authoritative elapsed capture time.

    Browser clocks are never used for persisted marker timestamps. Live
    captures use the same process start pair as candump; finalized/recovered or
    simulated sessions fall back to PostgreSQL clock_timestamp().
    """
    state = ACTIVE_CAPTURES.get(session_id)
    if state is not None:
        elapsed_ms = max(
            0,
            int((time.monotonic() - state.started_monotonic) * 1000),
        )
        return elapsed_ms, "capture_process_monotonic"

    row = await fetchrow(
        """
        SELECT GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000)
        )::bigint AS elapsed_ms
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    return int(row["elapsed_ms"] if row else 0), "postgres_clock"


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


def marker_metadata_value(
    metadata: Optional[Dict[str, Any]],
    key: str,
) -> Any:
    payload = metadata or {}
    if payload.get(key) is not None:
        return payload.get(key)
    step_metadata = json_object(payload.get("step_metadata"))
    return step_metadata.get(key)


def marker_number(
    metadata: Optional[Dict[str, Any]],
    key: str,
) -> Optional[float]:
    value = marker_metadata_value(metadata, key)
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def inferred_step_state(step_code: Optional[str]) -> float:
    tokens = set(
        re.findall(
            r"[a-z0-9]+",
            (step_code or "").lower().replace("-", "_"),
        )
    )
    if tokens & {
        "off", "release", "released", "close", "closed", "neutral",
        "stop", "stopped", "idle", "inactive", "disable", "disabled",
    }:
        return 0.0
    return 1.0


def simulation_signal_value(
    step_code: Optional[str],
    metadata: Optional[Dict[str, Any]],
) -> float:
    expected = marker_number(metadata, "expected_value")
    return expected if expected is not None else inferred_step_state(step_code)


def simulation_action_duration_ms(
    metadata: Optional[Dict[str, Any]],
) -> int:
    duration = marker_number(metadata, "planned_duration_ms")
    if duration is None:
        duration = marker_number(metadata, "hold_ms")
    if duration is None:
        duration = 1800.0
    return max(300, min(int(duration), 10_000))


def encoded_u8(value: float) -> int:
    return int(round(value)) & 0xFF


def encoded_u16(value: float) -> tuple[int, int]:
    encoded = int(round(value)) & 0xFFFF
    return encoded & 0xFF, (encoded >> 8) & 0xFF


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


def mission_frames(
    mission_code: str,
    step_code: Optional[str],
    marker_type: str,
    tick: int,
    *,
    signal_value: Optional[float] = None,
    marker_metadata: Optional[Dict[str, Any]] = None,
) -> List[Frame]:
    mission_code = (mission_code or "").upper()
    step_code_l = (step_code or "").lower()

    value = (
        float(signal_value)
        if signal_value is not None
        else simulation_signal_value(step_code, marker_metadata)
    )
    pulse = 1 if value != 0 else 0
    # Deliberate counter noise is useful for proving that an exact action bit
    # outranks a normal modulo nibble in the same synthetic payload.
    wobble = tick % 16

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
        angle = encoded_u8(value)
        return [frame(0x024, [angle, wobble, 0, 0, 0, 0, 0, 0], "steering_angle", f"steering angle signed={int(round(value))}")]
    if mission_code == "S02":
        pedal = encoded_u8(value)
        return [frame(0x210, [pedal, 0, 0, 0, 0, 0, 0, 0], "accelerator_pedal", f"accelerator {pedal}/255")]
    if mission_code == "S03":
        pressure = encoded_u8(value)
        return [
            frame(0x210, [0, pressure, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0], "brake_pressure", f"brake pressure {pressure}"),
            frame(0x321, [0, 0, 0b00000001 if pulse else 0, wobble, 0, 0, 0, 0], "brake_lights", "brake switch ON" if pulse else "brake switch OFF"),
        ]
    if mission_code == "S04":
        rpm = (
            value
            if marker_number(marker_metadata, "expected_value") is not None
            or signal_value is not None
            else 720.0
        )
        low, high = encoded_u16(rpm)
        return [frame(0x200, [low, high, 0, wobble, 0, 0, 0, 0], "engine_rpm", f"{int(round(rpm))} rpm")]
    if mission_code == "S05":
        speed = encoded_u8(value)
        return [frame(0x201, [speed, 0, 0, 0, 0, 0, 0, 0], "vehicle_speed", f"{speed} kph")]
    if mission_code == "S06":
        # Signed int8 makes Reverse (-1) observable as 0xFF while neutral,
        # first, and second remain 0x00, 0x01, and 0x02.
        gear = encoded_u8(value)
        return [frame(0x220, [gear, 0, 0, wobble, 0, 0, 0, 0], "gear_position", f"gear signed={int(round(value))} raw=0x{gear:02X}")]
    if mission_code == "S07":
        return [frame(0x220, [0, 0b00000001 if pulse else 0, 0, 0, 0, 0, 0, 0], "clutch_pedal", "clutch pressed" if pulse else "clutch released")]
    if mission_code == "S08":
        return [frame(0x338, [20 if pulse else 0, 8 if pulse else 0, 1 if pulse else 0, 0, 0, 0, 0, 0], "yaw_stability", "stability/yaw event" if pulse else "stable")]
    if mission_code == "S09":
        base = encoded_u8(
            value if signal_value is not None else (30 if pulse else 0)
        )
        return [frame(0x208, [base, base + wobble, base, base + wobble, 0, 0, 0, 0], "wheel_speeds_abs", f"wheel speed base={base}")]
    if mission_code == "S10":
        ignition_state = encoded_u8(value)
        return [frame(0x200, [ignition_state, 0x06 if ignition_state else 0, 1 if ignition_state >= 3 else 0, wobble, 0, 0, 0, 0], "ignition_engine_start", f"ignition state={ignition_state}")]

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
    marker_metadata: Optional[Dict[str, Any]] = None,
    client_event_id: Optional[str] = None,
) -> int:
    inserted = 0

    for i, base_frame in enumerate(baseline_frames(timestamp_ms)):
        await insert_raw_frame(
            session_id,
            max(0, timestamp_ms - 120 + i * 20),
            base_frame,
            bus_interface=bus_interface,
            extra_metadata={
                "frame_role": "baseline_around_marker",
                "marker_type": marker_type,
                "client_event_id": client_event_id,
            },
        )
        inserted += 1

    normalized_marker_type = (
        marker_type or ""
    ).strip().lower().replace("-", "_")
    if normalized_marker_type in ACTION_MARKER_TYPES:
        desired_value = simulation_signal_value(
            step_code,
            marker_metadata,
        )
        session_state = SIMULATION_SIGNAL_STATE.setdefault(
            session_id,
            {},
        )
        state_key = (mission_code or "").upper()
        previous_value = session_state.get(state_key)
        if previous_value is None:
            return_value = marker_number(
                marker_metadata,
                "return_value",
            )
            if return_value is not None:
                previous_value = return_value
            elif (
                desired_value == 0
                and inferred_step_state(step_code) == 0
            ):
                previous_value = 1.0
            else:
                previous_value = 0.0

        for tick in range(4):
            pre_timestamp = max(
                0,
                timestamp_ms - 200 + tick * 50,
            )
            for sim_frame in mission_frames(
                mission_code,
                step_code,
                marker_type,
                tick,
                signal_value=previous_value,
                marker_metadata=marker_metadata,
            ):
                await insert_raw_frame(
                    session_id,
                    pre_timestamp,
                    sim_frame,
                    bus_interface=bus_interface,
                    extra_metadata={
                        "frame_role": "mission_signal_pre_action",
                        "mission_code": mission_code,
                        "step_code": step_code,
                        "marker_type": marker_type,
                        "client_event_id": client_event_id,
                        "simulation_previous_value": previous_value,
                        "simulation_expected_value": desired_value,
                    },
                )
                inserted += 1

        action_duration_ms = simulation_action_duration_ms(
            marker_metadata,
        )
        tick_interval_ms = 100
        action_ticks = max(
            8,
            min(
                200,
                (action_duration_ms // tick_interval_ms) + 1,
            ),
        )
        for tick in range(action_ticks):
            for sim_frame in mission_frames(
                mission_code,
                step_code,
                marker_type,
                tick,
                signal_value=desired_value,
                marker_metadata=marker_metadata,
            ):
                await insert_raw_frame(
                    session_id,
                    timestamp_ms + tick * tick_interval_ms,
                    sim_frame,
                    bus_interface=bus_interface,
                    extra_metadata={
                        "frame_role": "mission_signal_action",
                        "mission_code": mission_code,
                        "step_code": step_code,
                        "marker_type": marker_type,
                        "client_event_id": client_event_id,
                        "simulation_previous_value": previous_value,
                        "simulation_expected_value": desired_value,
                    },
                )
                inserted += 1

        analyzer_profile = str(
            marker_metadata_value(
                marker_metadata,
                "analyzer_profile",
            )
            or ""
        ).strip().lower()
        if analyzer_profile == "pulse_event":
            return_value = marker_number(
                marker_metadata,
                "return_value",
            )
            post_value = (
                return_value
                if return_value is not None
                else 0.0
            )
        else:
            post_value = desired_value

        for tick in range(6):
            for sim_frame in mission_frames(
                mission_code,
                step_code,
                marker_type,
                tick,
                signal_value=post_value,
                marker_metadata=marker_metadata,
            ):
                await insert_raw_frame(
                    session_id,
                    timestamp_ms
                    + action_duration_ms
                    + ((tick + 1) * tick_interval_ms),
                    sim_frame,
                    bus_interface=bus_interface,
                    extra_metadata={
                        "frame_role": "mission_signal_post_action",
                        "mission_code": mission_code,
                        "step_code": step_code,
                        "marker_type": marker_type,
                        "client_event_id": client_event_id,
                        "simulation_expected_value": desired_value,
                        "simulation_post_value": post_value,
                    },
                )
                inserted += 1

        session_state[state_key] = post_value

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



def parse_can_id_filter(raw: Optional[str]) -> list[int]:
    if not raw or not raw.strip():
        return []

    parsed: list[int] = []
    for token in re.split(r"[\s,;]+", raw.strip()):
        if not token:
            continue
        try:
            value = int(token, 16) if token.lower().startswith("0x") else int(token, 10)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid CAN ID filter token: {token!r}",
            ) from exc
        if value < 0 or value > 0x1FFFFFFF:
            raise HTTPException(
                status_code=422,
                detail=f"CAN ID filter is outside the valid range: {token!r}",
            )
        parsed.append(value)
    return sorted(set(parsed))


def parse_byte_value_filter(raw: Optional[str]) -> Optional[int]:
    if raw is None or not raw.strip():
        return None

    token = raw.strip().lower()
    try:
        if token.startswith("0x"):
            value = int(token, 16)
        elif re.search(r"[a-f]", token):
            value = int(token, 16)
        else:
            value = int(token, 10)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid byte value filter: {raw!r}",
        ) from exc

    if value < 0 or value > 255:
        raise HTTPException(
            status_code=422,
            detail="Byte value filter must be between 0 and 255.",
        )
    return value


def playback_filter_cte(
    *,
    session_id: UUID,
    tolerance_ms: int,
    id_filter: Optional[str],
    search: Optional[str],
    byte_index: Optional[int],
    byte_value: Optional[str],
    deltas_only: bool,
    byte_changed_only: bool,
) -> tuple[str, list[Any]]:
    can_ids = parse_can_id_filter(id_filter)
    parsed_byte_value = parse_byte_value_filter(byte_value)

    params: list[Any] = [session_id, tolerance_ms]
    conditions: list[str] = []
    ordered_conditions: list[str] = ["session_id = $1"]

    def add_param(value: Any) -> str:
        params.append(value)
        return f"${len(params)}"

    if can_ids:
        placeholder = add_param(can_ids)
        conditions.append(f"can_id = ANY({placeholder}::bigint[])")
        # Restrict the LAG window to pinned IDs as well. LAG is partitioned by
        # CAN ID, so this preserves previous-byte semantics while avoiding a
        # full-session window scan when Top IDs opens selected candidates.
        ordered_conditions.append(
            f"can_id = ANY({placeholder}::bigint[])"
        )

    if byte_index is not None:
        byte_position = add_param(byte_index)
        byte_exists = f"{byte_position} < octet_length(data)"
        conditions.append(byte_exists)

        if parsed_byte_value is not None:
            value_placeholder = add_param(parsed_byte_value)
            conditions.append(
                f"get_byte(data, {byte_position}) = {value_placeholder}"
            )

        if byte_changed_only:
            conditions.append(
                "previous_data IS NOT NULL AND "
                f"{byte_position} < octet_length(previous_data) AND "
                f"get_byte(data, {byte_position}) "
                f"IS DISTINCT FROM get_byte(previous_data, {byte_position})"
            )
    elif parsed_byte_value is not None:
        value_placeholder = add_param(parsed_byte_value)
        conditions.append(
            "EXISTS ("
            "SELECT 1 FROM generate_series(0, octet_length(data) - 1) AS byte_pos "
            f"WHERE get_byte(data, byte_pos) = {value_placeholder}"
            ")"
        )

    if deltas_only:
        conditions.append("previous_data IS NOT NULL AND data IS DISTINCT FROM previous_data")

    normalized_search = (search or "").strip()
    if normalized_search:
        search_like = add_param(f"%{normalized_search.upper()}%")
        search_conditions = [
            f"UPPER(can_id_hex) LIKE {search_like}",
            f"can_id::text LIKE {search_like}",
            f"UPPER(encode(data, 'hex')) LIKE {search_like}",
        ]
        numeric_search: Optional[int] = None
        try:
            lowered = normalized_search.lower()
            if lowered.startswith("0x"):
                numeric_search = int(lowered, 16)
            elif re.fullmatch(r"\d+", lowered):
                numeric_search = int(lowered, 10)
        except ValueError:
            numeric_search = None

        if numeric_search is not None:
            numeric_placeholder = add_param(numeric_search)
            search_conditions.append(f"can_id = {numeric_placeholder}")
            if 0 <= numeric_search <= 255:
                search_conditions.append(
                    "EXISTS ("
                    "SELECT 1 FROM generate_series(0, octet_length(data) - 1) AS byte_pos "
                    f"WHERE get_byte(data, byte_pos) = {numeric_placeholder}"
                    ")"
                )
        conditions.append("(" + " OR ".join(search_conditions) + ")")

    where_clause = " AND ".join(conditions) if conditions else "TRUE"
    cte = f"""
        WITH ordered AS (
            SELECT
                id,
                timestamp_ms,
                can_id,
                can_id_hex,
                dlc,
                data,
                source,
                metadata,
                LAG(data) OVER (
                    PARTITION BY can_id
                    ORDER BY timestamp_ms ASC, id ASC
                ) AS previous_data
            FROM can_frames_raw
            WHERE {" AND ".join(ordered_conditions)}
        ),
        filtered AS (
            SELECT
                *,
                (timestamp_ms / $2::bigint) * $2::bigint AS bucket_ms
            FROM ordered
            WHERE {where_clause}
        )
    """
    return cte, params


@router.get("/session/{session_id}/playback/meta")
async def get_session_playback_meta(session_id: UUID) -> Dict[str, Any]:
    session = await fetchrow(
        """
        SELECT id, label, bus_interface, bus_mode, capture_status,
               started_at, ended_at, finalized_at, final_frame_count,
               final_marker_count, capture_quality
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    stats = await fetchrow(
        """
        SELECT
            COUNT(*)::bigint AS frame_count,
            COUNT(DISTINCT can_id)::int AS distinct_ids,
            ARRAY_AGG(DISTINCT can_id ORDER BY can_id) AS observed_ids,
            MIN(timestamp_ms)::bigint AS first_timestamp_ms,
            MAX(timestamp_ms)::bigint AS last_timestamp_ms
        FROM can_frames_raw
        WHERE session_id = $1
        """,
        session_id,
    )

    marker_rows = await fetch(
        """
        SELECT
            csm.id,
            csm.timestamp_ms,
            csm.marker_type,
            csm.label,
            csm.metadata,
            COALESCE(rs.step_code, csm.metadata->>'step_code') AS step_code,
            COALESCE(rm.mission_code, csm.metadata->>'mission_code') AS mission_code
        FROM can_session_markers csm
        LEFT JOIN recon_steps rs ON rs.id = csm.step_id
        LEFT JOIN recon_missions rm ON rm.id = csm.mission_id
        WHERE csm.session_id = $1
        ORDER BY csm.timestamp_ms ASC, csm.id ASC
        """,
        session_id,
    )
    markers = [
        {
            "id": str(row["id"]),
            "timestamp_ms": int(row["timestamp_ms"] or 0),
            "marker_type": str(row["marker_type"] or "unknown"),
            "label": row["label"],
            "step_code": row["step_code"],
            "mission_code": row["mission_code"],
            "metadata": json_object(row["metadata"]),
        }
        for row in marker_rows
    ]

    return {
        "ok": True,
        "session_id": str(session_id),
        "label": session["label"],
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "capture_status": session["capture_status"],
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "finalized_at": session["finalized_at"],
        "final_frame_count": int(session["final_frame_count"] or 0),
        "final_marker_count": int(session["final_marker_count"] or 0),
        "capture_quality": json_object(session["capture_quality"]),
        "frame_count": int(stats["frame_count"] or 0),
        "distinct_ids": int(stats["distinct_ids"] or 0),
        "observed_ids": [
            int(can_id)
            for can_id in (stats["observed_ids"] or [])
        ],
        "first_timestamp_ms": int(stats["first_timestamp_ms"] or 0),
        "last_timestamp_ms": int(stats["last_timestamp_ms"] or 0),
        "duration_ms": max(
            0,
            int(stats["last_timestamp_ms"] or 0)
            - int(stats["first_timestamp_ms"] or 0),
        ),
        "marker_count": len(markers),
        "markers": markers,
        "timestamp_authority": "server",
    }


@router.get("/session/{session_id}/playback")
async def get_session_playback_slices(
    session_id: UUID,
    cursor_ms: Optional[int] = None,
    direction: str = "start",
    tolerance_ms: int = 1,
    slice_limit: int = 160,
    id_filter: Optional[str] = None,
    search: Optional[str] = None,
    byte_index: Optional[int] = None,
    byte_value: Optional[str] = None,
    deltas_only: bool = False,
    byte_changed_only: bool = False,
    carry_selected: bool = False,
    include_stats: bool = True,
) -> Dict[str, Any]:
    direction = direction.strip().lower()
    if direction not in {"start", "end", "next", "prev", "nearest"}:
        raise HTTPException(
            status_code=422,
            detail="direction must be start, end, next, prev, or nearest",
        )
    tolerance_ms = max(1, min(int(tolerance_ms), 10_000))
    slice_limit = max(1, min(int(slice_limit), 500))
    if byte_index is not None and not 0 <= byte_index <= 7:
        raise HTTPException(status_code=422, detail="byte_index must be 0 through 7")

    selected_can_ids = parse_can_id_filter(id_filter)
    carry_selected = bool(carry_selected and selected_can_ids)

    session = await fetchrow(
        "SELECT id, capture_status, bus_interface, bus_mode FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    cte, params = playback_filter_cte(
        session_id=session_id,
        tolerance_ms=tolerance_ms,
        id_filter=id_filter,
        search=search,
        byte_index=byte_index,
        byte_value=byte_value,
        deltas_only=deltas_only,
        byte_changed_only=byte_changed_only,
    )

    # Initial loads and explicit seeks return full counts and timeline bounds.
    # Sequential next/previous prefetches can skip that aggregate query and
    # request one extra bucket to determine whether another page exists.
    lightweight_page = (
        not include_stats
        and direction in {"next", "prev"}
    )

    matching_frame_count: Optional[int] = None
    matching_slice_count: Optional[int] = None
    first_bucket_ms: Optional[int] = None
    last_bucket_ms: Optional[int] = None

    if not lightweight_page:
        stats_row = await fetchrow(
            cte
            + """
            SELECT
                COUNT(*)::bigint AS matching_frame_count,
                COUNT(DISTINCT bucket_ms)::bigint AS matching_slice_count,
                MIN(bucket_ms)::bigint AS first_bucket_ms,
                MAX(bucket_ms)::bigint AS last_bucket_ms
            FROM filtered
            """,
            *params,
        )

        matching_frame_count = int(stats_row["matching_frame_count"] or 0)
        matching_slice_count = int(stats_row["matching_slice_count"] or 0)
        first_bucket_ms = (
            int(stats_row["first_bucket_ms"])
            if stats_row["first_bucket_ms"] is not None
            else None
        )
        last_bucket_ms = (
            int(stats_row["last_bucket_ms"])
            if stats_row["last_bucket_ms"] is not None
            else None
        )

        if not matching_frame_count:
            return {
                "ok": True,
                "session_id": str(session_id),
                "capture_status": session["capture_status"],
                "timestamp_authority": "server",
                "tolerance_ms": tolerance_ms,
                "direction": direction,
                "stats_included": True,
                "filters": {
                    "id_filter": id_filter,
                    "search": search,
                    "byte_index": byte_index,
                    "byte_value": byte_value,
                    "deltas_only": deltas_only,
                    "byte_changed_only": byte_changed_only,
                    "carry_selected": carry_selected,
                },
                "matching_frame_count": 0,
                "matching_slice_count": 0,
                "first_bucket_ms": None,
                "last_bucket_ms": None,
                "page_frame_count": 0,
                "page_slice_count": 0,
                "has_before": False,
                "has_after": False,
                "slices": [],
            }
    elif cursor_ms is None:
        raise HTTPException(
            status_code=422,
            detail="cursor_ms is required when include_stats=false",
        )

    cursor_value = cursor_ms
    if cursor_value is None:
        cursor_value = (
            last_bucket_ms
            if direction in {"end", "prev"}
            else first_bucket_ms
        )
    assert cursor_value is not None

    # Only bind a cursor for directions that actually reference it.
    # Binding an unused positional parameter for start/end leaves PostgreSQL
    # unable to infer that parameter's type and causes an HTTP 500.
    cursor_placeholder: Optional[str] = None
    if direction in {"next", "prev", "nearest"}:
        params.append(cursor_value)
        cursor_placeholder = f"${len(params)}"

    query_slice_limit = slice_limit + 1 if lightweight_page else slice_limit
    params.append(query_slice_limit)
    limit_placeholder = f"${len(params)}"

    if direction == "start":
        bucket_selection = f"""
            SELECT DISTINCT bucket_ms
            FROM filtered
            ORDER BY bucket_ms ASC
            LIMIT {limit_placeholder}
        """
    elif direction == "end":
        bucket_selection = f"""
            SELECT bucket_ms
            FROM (
                SELECT DISTINCT bucket_ms
                FROM filtered
                ORDER BY bucket_ms DESC
                LIMIT {limit_placeholder}
            ) recent
            ORDER BY bucket_ms ASC
        """
    elif direction == "next":
        assert cursor_placeholder is not None
        bucket_selection = f"""
            SELECT DISTINCT bucket_ms
            FROM filtered
            WHERE bucket_ms > (({cursor_placeholder}::bigint / $2::bigint) * $2::bigint)
            ORDER BY bucket_ms ASC
            LIMIT {limit_placeholder}
        """
    elif direction == "prev":
        assert cursor_placeholder is not None
        bucket_selection = f"""
            SELECT bucket_ms
            FROM (
                SELECT DISTINCT bucket_ms
                FROM filtered
                WHERE bucket_ms < (({cursor_placeholder}::bigint / $2::bigint) * $2::bigint)
                ORDER BY bucket_ms DESC
                LIMIT {limit_placeholder}
            ) previous
            ORDER BY bucket_ms ASC
        """
    else:
        assert cursor_placeholder is not None
        bucket_selection = f"""
            WITH anchor AS (
                SELECT bucket_ms
                FROM (
                    SELECT DISTINCT bucket_ms
                    FROM filtered
                ) available_buckets
                ORDER BY
                    ABS(bucket_ms - {cursor_placeholder}::bigint),
                    bucket_ms ASC
                LIMIT 1
            )
            SELECT DISTINCT filtered.bucket_ms
            FROM filtered
            CROSS JOIN anchor
            WHERE filtered.bucket_ms >= anchor.bucket_ms
            ORDER BY filtered.bucket_ms ASC
            LIMIT {limit_placeholder}
        """

    rows = await fetch(
        cte
        + f"""
        , selected_buckets AS (
            {bucket_selection}
        )
        SELECT
            filtered.id,
            filtered.timestamp_ms,
            filtered.bucket_ms,
            filtered.can_id,
            filtered.can_id_hex,
            filtered.dlc,
            filtered.data,
            filtered.previous_data,
            filtered.source,
            filtered.metadata
        FROM filtered
        JOIN selected_buckets USING (bucket_ms)
        ORDER BY filtered.bucket_ms ASC,
                 filtered.timestamp_ms ASC,
                 filtered.can_id ASC,
                 filtered.id ASC
        """,
        *params,
    )

    def playback_frame_payload(
        raw_row: Any,
        *,
        bucket_override: Optional[int] = None,
    ) -> dict[str, Any]:
        row = dict(raw_row)
        data = bytes(row.get("data") or b"")
        previous_data_raw = row.get("previous_data")
        previous_data = (
            bytes(previous_data_raw)
            if previous_data_raw is not None
            else None
        )
        delta_positions = [
            index
            for index in range(max(len(data), len(previous_data or b"")))
            if (
                (data[index] if index < len(data) else None)
                != (
                    previous_data[index]
                    if previous_data is not None and index < len(previous_data)
                    else None
                )
            )
        ]
        metadata = json_object(row.get("metadata"))
        return {
            "id": int(row["id"]),
            "timestamp_ms": int(row["timestamp_ms"]),
            "bucket_ms": int(
                bucket_override
                if bucket_override is not None
                else row.get("bucket_ms", row["timestamp_ms"])
            ),
            "can_id": int(row["can_id"]),
            "can_id_hex": row["can_id_hex"],
            "dlc": int(row["dlc"]),
            "data_hex": data.hex().upper(),
            "bytes": list(data),
            "previous_data_hex": (
                previous_data.hex().upper()
                if previous_data is not None
                else None
            ),
            "previous_bytes": (
                list(previous_data)
                if previous_data is not None
                else None
            ),
            "delta_positions": delta_positions,
            "changed": bool(delta_positions),
            "signal_name": metadata.get("signal_name"),
            "decoded": metadata.get("decoded"),
            "source": row.get("source"),
            "observed_in_slice": True,
            "state_carried": False,
            "state_available": True,
            "state_age_ms": 0,
        }

    slices_by_bucket: Dict[int, list[dict[str, Any]]] = {}
    for raw_row in rows:
        frame = playback_frame_payload(raw_row)
        slices_by_bucket.setdefault(frame["bucket_ms"], []).append(frame)

    slices = [
        {
            "bucket_ms": bucket_ms,
            "start_ms": min(frame["timestamp_ms"] for frame in frames),
            "end_ms": max(frame["timestamp_ms"] for frame in frames),
            "frame_count": len(frames),
            "frames": frames,
        }
        for bucket_ms, frames in sorted(slices_by_bucket.items())
    ]

    lightweight_has_before: Optional[bool] = None
    lightweight_has_after: Optional[bool] = None
    if lightweight_page:
        has_extra_bucket = len(slices) > slice_limit
        if direction == "next":
            if has_extra_bucket:
                slices = slices[:slice_limit]
            lightweight_has_before = bool(slices)
            lightweight_has_after = has_extra_bucket
        else:
            # PREV selects nearest buckets in descending order and returns them
            # ascending. The extra bucket is therefore the oldest one.
            if has_extra_bucket:
                slices = slices[1:]
            lightweight_has_before = has_extra_bucket
            lightweight_has_after = bool(slices)

    # When the UI pins selected IDs, return a second stable state lane. Each
    # slice contains exactly one row per selected ID in numeric order. IDs that
    # did not transmit in the current slice carry their last database state
    # forward with change heat disabled. The seed query makes this accurate
    # after seeks, previous-page navigation, and direct marker jumps.
    if carry_selected and selected_can_ids and slices:
        first_returned_bucket = int(slices[0]["bucket_ms"])
        seed_rows = await fetch(
            """
            WITH ordered AS (
                SELECT
                    id, timestamp_ms, can_id, can_id_hex, dlc, data, source, metadata,
                    LAG(data) OVER (
                        PARTITION BY can_id
                        ORDER BY timestamp_ms ASC, id ASC
                    ) AS previous_data
                FROM can_frames_raw
                WHERE session_id = $1
            )
            SELECT DISTINCT ON (can_id)
                id, timestamp_ms, can_id, can_id_hex, dlc, data,
                previous_data, source, metadata
            FROM ordered
            WHERE can_id = ANY($2::bigint[])
              AND timestamp_ms < $3
            ORDER BY can_id ASC, timestamp_ms DESC, id DESC
            """,
            session_id,
            selected_can_ids,
            first_returned_bucket,
        )

        state_by_id: Dict[int, dict[str, Any]] = {
            int(row["can_id"]): playback_frame_payload(
                row,
                bucket_override=first_returned_bucket,
            )
            for row in seed_rows
        }

        for slice_payload in slices:
            bucket_ms = int(slice_payload["bucket_ms"])
            latest_in_slice: Dict[int, dict[str, Any]] = {}
            for frame in slice_payload["frames"]:
                latest_in_slice[int(frame["can_id"])] = frame

            state_frames: list[dict[str, Any]] = []
            for can_id in selected_can_ids:
                current = latest_in_slice.get(can_id)
                if current is not None:
                    state_by_id[can_id] = current
                    state_frames.append(dict(current))
                    continue

                previous = state_by_id.get(can_id)
                if previous is not None:
                    carried = dict(previous)
                    carried.update({
                        "bucket_ms": bucket_ms,
                        "delta_positions": [],
                        "changed": False,
                        "observed_in_slice": False,
                        "state_carried": True,
                        "state_available": True,
                        "state_age_ms": max(
                            0,
                            bucket_ms - int(previous["timestamp_ms"]),
                        ),
                    })
                    state_frames.append(carried)
                    continue

                width = 3 if can_id <= 0x7FF else 8
                state_frames.append({
                    "id": -(can_id + 1),
                    "timestamp_ms": 0,
                    "bucket_ms": bucket_ms,
                    "can_id": can_id,
                    "can_id_hex": f"0x{can_id:0{width}X}",
                    "dlc": 0,
                    "data_hex": "",
                    "bytes": [],
                    "previous_data_hex": None,
                    "previous_bytes": None,
                    "delta_positions": [],
                    "changed": False,
                    "signal_name": None,
                    "decoded": None,
                    "source": None,
                    "observed_in_slice": False,
                    "state_carried": True,
                    "state_available": False,
                    "state_age_ms": None,
                })

            slice_payload["state_frames"] = state_frames

    returned_first = slices[0]["bucket_ms"] if slices else None
    returned_last = slices[-1]["bucket_ms"] if slices else None

    return {
        "ok": True,
        "session_id": str(session_id),
        "capture_status": session["capture_status"],
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "timestamp_authority": "server",
        "tolerance_ms": tolerance_ms,
        "direction": direction,
        "cursor_ms": cursor_value,
        "filters": {
            "id_filter": id_filter,
            "search": search,
            "byte_index": byte_index,
            "byte_value": byte_value,
            "deltas_only": deltas_only,
            "byte_changed_only": byte_changed_only,
            "carry_selected": carry_selected,
        },
        "stats_included": not lightweight_page,
        "matching_frame_count": matching_frame_count,
        "matching_slice_count": matching_slice_count,
        "first_bucket_ms": first_bucket_ms,
        "last_bucket_ms": last_bucket_ms,
        "page_frame_count": sum(
            int(slice_payload["frame_count"])
            for slice_payload in slices
        ),
        "page_slice_count": len(slices),
        "returned_first_bucket_ms": returned_first,
        "returned_last_bucket_ms": returned_last,
        "has_before": (
            bool(lightweight_has_before)
            if lightweight_page
            else bool(
                returned_first is not None
                and first_bucket_ms is not None
                and returned_first > first_bucket_ms
            )
        ),
        "has_after": (
            bool(lightweight_has_after)
            if lightweight_page
            else bool(
                returned_last is not None
                and last_bucket_ms is not None
                and returned_last < last_bucket_ms
            )
        ),
        "slices": slices,
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