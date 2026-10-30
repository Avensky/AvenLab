"""Capture / socketcan: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    ACTIVE_CAPTURES,
    Any,
    CANDUMP_RE,
    CAN_FORCE_FAKE,
    CaptureState,
    Dict,
    HTTPException,
    IS_PRODUCTION,
    List,
    Optional,
    RUNTIME_ENV,
    SIMULATION_MODES,
    asyncio,
    connect_db,
    fetchrow,
    jsonb_dumps,
    os,
    platform,
    shutil,
    subprocess,
    time,
)

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
