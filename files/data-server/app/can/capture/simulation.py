"""Capture / simulation: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .identity import (
    json_object,
)
from .shared import (
    ACTION_MARKER_TYPES,
    Any,
    Dict,
    Frame,
    List,
    Optional,
    SIMULATION_SIGNAL_STATE,
    execute,
    jsonb_dumps,
    re,
)
from .socketcan import (
    runtime_metadata,
)

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
