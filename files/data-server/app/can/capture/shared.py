"""Single owner of configuration, request schemas, router and process/session state.
Edit feature modules for behavior; never create a second router or capture registry.
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

CANDUMP_RE = re.compile(
    r"^\((?P<epoch>\d+(?:\.\d+)?)\)\s+"
    r"(?P<iface>\S+)\s+"
    r"(?P<can_id>[0-9A-Fa-f]+)(?:##[0-9A-Fa-f]|#)(?P<data>[0-9A-Fa-f]*)"
)
