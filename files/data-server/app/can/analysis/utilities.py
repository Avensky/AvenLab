"""Analysis / utilities: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    ACTION_MARKER_TYPES,
    ANALYSIS_MODE_BASELINE,
    ANALYSIS_MODE_TARGET,
    Any,
    BASELINE_CODE_PREFIXES,
    CONTROL_MARKER_TYPES,
    Counter,
    FrameRow,
    IGNORED_MARKER_TYPES,
    Optional,
    REPORT_SECTION_PATTERN,
    bisect_right,
    json,
    math,
)

def json_dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True, default=str)


def can_hex(can_id: int) -> str:
    return f"0x{can_id:03X}"


def entropy(values: list[int]) -> float:
    if not values:
        return 0.0
    total = len(values)
    counts = Counter(values)
    return float(-sum((n / total) * math.log2(n / total) for n in counts.values()))


def normalize_data(data: Any, dlc: int = 8) -> list[int]:
    """Return an eight-byte analysis buffer while preserving the original DLC separately.

    Classical CAN frames may legitimately have DLC values below eight. The statistical
    analyzer still iterates over byte positions 0 through 7, so absent positions are
    represented as zero instead of producing IndexError.
    """
    frame_width = 8

    if data is None:
        return [0] * frame_width

    if isinstance(data, memoryview):
        raw = data.tobytes()
    elif isinstance(data, bytes):
        raw = data
    elif isinstance(data, bytearray):
        raw = bytes(data)
    else:
        raw = bytes(data)

    try:
        reported_dlc = max(0, min(int(dlc), frame_width))
    except (TypeError, ValueError):
        reported_dlc = min(len(raw), frame_width)

    usable_length = reported_dlc if reported_dlc > 0 else min(len(raw), frame_width)
    padded = list(raw[:usable_length])

    while len(padded) < frame_width:
        padded.append(0)

    return padded[:frame_width]


def can_ai_log(event: str, **fields: Any) -> None:
    """Emit one-line structured diagnostics to journald/stdout."""
    details = " ".join(
        f"{key}={value}"
        for key, value in fields.items()
        if value is not None
    )
    message = f"[can-ai] {event}"
    if details:
        message = f"{message} {details}"
    print(message, flush=True)


def frame_byte(row: FrameRow, byte_index: int) -> int:
    """Read one byte defensively from legacy or short-DLC frame rows."""
    if 0 <= byte_index < len(row.data):
        return int(row.data[byte_index])
    return 0


def metadata_dict(value: Any) -> dict[str, Any]:
    """Return a safe dict from asyncpg json/jsonb, JSON text, or None."""
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


def normalize_analysis_mode(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None

    mode = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "baseline": ANALYSIS_MODE_BASELINE,
        "baseline_noise": ANALYSIS_MODE_BASELINE,
        "noise": ANALYSIS_MODE_BASELINE,
        "noise_profile": ANALYSIS_MODE_BASELINE,
        "noise_sniffing": ANALYSIS_MODE_BASELINE,
        "sniff": ANALYSIS_MODE_BASELINE,
        "sniffing": ANALYSIS_MODE_BASELINE,
        "passive": ANALYSIS_MODE_BASELINE,
        "passive_sniff": ANALYSIS_MODE_BASELINE,
        "target": ANALYSIS_MODE_TARGET,
        "action": ANALYSIS_MODE_TARGET,
        "decode": ANALYSIS_MODE_TARGET,
        "correlation": ANALYSIS_MODE_TARGET,
        "target_correlation": ANALYSIS_MODE_TARGET,
    }
    if mode in aliases:
        return aliases[mode]
    if mode in {ANALYSIS_MODE_BASELINE, ANALYSIS_MODE_TARGET, "state_compare", "playback_validation"}:
        return mode
    return None


def infer_analysis_mode(session: dict[str, Any], markers: list[dict[str, Any]]) -> str:
    """Decide whether this session is baseline profiling or target correlation.

    Priority:
    1. Explicit analysis_mode in session / mission metadata.
    2. Baseline-looking mission code or label.
    3. Explicit marker metadata.
    4. Default to target correlation.
    """
    session_metadata = metadata_dict(session.get("session_metadata"))
    mission_metadata = metadata_dict(session.get("mission_metadata"))

    for metadata in (session_metadata, mission_metadata):
        mode = normalize_analysis_mode(metadata.get("analysis_mode"))
        if mode:
            return mode

    mission_code = str(session.get("mission_code") or "").upper()
    label = str(session.get("label") or "").upper()
    if mission_code.startswith(BASELINE_CODE_PREFIXES) or "BASELINE" in label or "NOISE" in label:
        return ANALYSIS_MODE_BASELINE

    for marker in markers:
        marker_metadata = metadata_dict(marker.get("metadata"))
        mode = normalize_analysis_mode(marker_metadata.get("analysis_mode"))
        if mode:
            return mode

    return ANALYSIS_MODE_TARGET


def is_baseline_mode(analysis_mode: str) -> bool:
    return normalize_analysis_mode(analysis_mode) == ANALYSIS_MODE_BASELINE


def mode_value(values: list[int]) -> Optional[int]:
    if not values:
        return None
    return int(Counter(values).most_common(1)[0][0])


def top_count_map(counter: Counter[Any], limit: int = 8) -> dict[str, int]:
    return {
        str(value): int(count)
        for value, count in counter.most_common(limit)
        if count > 0
    }


def dominant_count_fraction(counter: Counter[Any], keys: set[Any]) -> float:
    total = sum(counter.values())
    if total <= 0:
        return 0.0
    return sum(count for value, count in counter.items() if value in keys) / total


def merge_intervals(
    intervals: list[tuple[int, int]],
) -> list[tuple[int, int]]:
    """Merge overlapping inclusive timestamp intervals."""
    if not intervals:
        return []

    ordered = sorted(
        (min(start, end), max(start, end))
        for start, end in intervals
    )
    merged: list[tuple[int, int]] = [ordered[0]]

    for start, end in ordered[1:]:
        previous_start, previous_end = merged[-1]
        if start <= previous_end + 1:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))

    return merged


def build_interval_index(
    intervals: list[tuple[int, int]],
) -> tuple[list[tuple[int, int]], list[int]]:
    merged = merge_intervals(intervals)
    return merged, [start for start, _ in merged]


def interval_coverage_fraction(
    intervals: list[tuple[int, int]],
    session_start_ms: int,
    session_end_ms: int,
) -> float:
    """Return the fraction of the recorded timeline covered by marker windows."""
    if session_end_ms <= session_start_ms:
        return 0.0

    covered_ms = 0
    for start, end in intervals:
        clipped_start = max(start, session_start_ms)
        clipped_end = min(end, session_end_ms)
        if clipped_end >= clipped_start:
            covered_ms += clipped_end - clipped_start + 1

    duration_ms = session_end_ms - session_start_ms + 1
    return min(1.0, covered_ms / max(duration_ms, 1))


def split_numbered_report_sections(report: str) -> dict[int, str]:
    """Split a Markdown report into numbered sections 1 through 5."""
    matches = list(REPORT_SECTION_PATTERN.finditer(report or ""))
    sections: dict[int, str] = {}

    for index, match in enumerate(matches):
        section_number = int(match.group(1))
        section_end = (
            matches[index + 1].start()
            if index + 1 < len(matches)
            else len(report)
        )
        sections.setdefault(
            section_number,
            report[match.start():section_end].strip(),
        )

    return sections


def ensure_complete_five_section_report(
    report: str,
    fallback_report: str,
) -> tuple[str, list[int]]:
    """Append deterministic fallback sections when a model omits or truncates them."""
    model_sections = split_numbered_report_sections(report)
    fallback_sections = split_numbered_report_sections(fallback_report)

    missing_sections = [
        section_number
        for section_number in range(1, 6)
        if section_number not in model_sections
    ]

    if not missing_sections:
        return report.strip(), []

    repaired = report.rstrip()
    for section_number in missing_sections:
        fallback_section = fallback_sections.get(section_number)
        if fallback_section:
            repaired += "\n\n" + fallback_section

    return repaired.strip(), missing_sections


def timestamp_in_intervals(
    timestamp_ms: int,
    intervals: list[tuple[int, int]],
    starts: list[int],
) -> bool:
    if not intervals:
        return False

    index = bisect_right(starts, timestamp_ms) - 1
    if index < 0:
        return False

    start, end = intervals[index]
    return start <= timestamp_ms <= end


def timestamp_in_any_window(
    timestamp_ms: int,
    windows: list[tuple[int, int, dict[str, Any]]],
) -> bool:
    # Compatibility helper for callers that do not already have an interval index.
    intervals, starts = build_interval_index(
        [(start, end) for start, end, _ in windows]
    )
    return timestamp_in_intervals(timestamp_ms, intervals, starts)


def normalized_marker_type(marker: dict[str, Any]) -> str:
    return str(marker.get("marker_type") or "").strip().lower().replace("-", "_")


def marker_action_key(marker: dict[str, Any]) -> str:
    return str(
        marker.get("step_code")
        or marker.get("label")
        or normalized_marker_type(marker)
        or "unknown_action"
    )


def classify_marker_role(marker: dict[str, Any]) -> str:
    marker_type = normalized_marker_type(marker)
    metadata = metadata_dict(marker.get("metadata"))
    phase = str(metadata.get("phase") or "").strip().lower().replace("-", "_")

    if marker_type in ACTION_MARKER_TYPES or phase == "action":
        return "action"
    if marker_type in CONTROL_MARKER_TYPES or phase in {
        "baseline",
        "countdown",
        "capture",
    }:
        return "control"
    if marker_type in IGNORED_MARKER_TYPES:
        return "ignored"
    if marker_type.startswith("action_"):
        return "action"
    return "unknown"


def select_analysis_markers(
    markers: list[dict[str, Any]],
    *,
    baseline_mode: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Select explicit action markers and retain structural markers as controls."""
    roles = {
        "action": [],
        "control": [],
        "ignored": [],
        "unknown": [],
    }
    for marker in markers:
        roles[classify_marker_role(marker)].append(marker)

    selected = [] if baseline_mode else list(roles["action"])
    fallback_used = False

    # Legacy captures may predate action_start. Only use unknown markers when
    # there are no explicit action markers at all; structural controls remain
    # excluded.
    if not baseline_mode and not selected and roles["unknown"]:
        selected = list(roles["unknown"])
        fallback_used = True

    context = {
        "strategy": (
            "baseline_profile_no_target_windows"
            if baseline_mode
            else (
                "legacy_unknown_marker_fallback"
                if fallback_used
                else "explicit_action_markers_only"
            )
        ),
        "action_markers": len(selected),
        "explicit_action_markers": len(roles["action"]),
        "control_markers": len(roles["control"]),
        "ignored_markers": len(roles["ignored"]),
        "unknown_markers": len(roles["unknown"]),
        "fallback_used": fallback_used,
        "action_keys": sorted({
            marker_action_key(marker)
            for marker in selected
        }),
        "confidence_influence": (
            "selected action markers define correlation windows; controls do not"
        ),
    }
    return selected, context


def marker_action_duration_ms(
    marker: dict[str, Any],
    default_window_ms: int,
) -> int:
    """Return the expected action hold plus a bounded recovery tolerance.

    Mission markers are posted at action onset, while many vehicle ECUs update
    later in the hold or again when the control returns to rest. Restricting the
    evidence window to the first 300 ms discards both legitimate delayed updates
    and the return transition.
    """
    metadata = metadata_dict(marker.get("metadata"))
    step_metadata = metadata_dict(metadata.get("step_metadata"))
    combined = {**step_metadata, **metadata}

    raw_duration = combined.get(
        "hold_ms",
        combined.get("planned_duration_ms", default_window_ms),
    )
    try:
        duration_ms = int(float(raw_duration))
    except (TypeError, ValueError):
        duration_ms = int(default_window_ms)

    duration_ms = max(int(default_window_ms), min(duration_ms, 10_000))
    recovery_ms = max(100, min(int(default_window_ms), 1_000))
    return duration_ms + recovery_ms


def strict_consensus(values: list[Optional[int]]) -> Optional[int]:
    """Return a mode only when every group supplied and agreed on one value."""
    if not values or any(value is None for value in values):
        return None
    unique = {int(value) for value in values if value is not None}
    return next(iter(unique)) if len(unique) == 1 else None


def score_candidate_confidence(
    correlation_score: float,
    activity_ratio: float,
    frame_count: int,
) -> float:
    """Score evidence without allowing frame volume to create evidence.

    Frame count is sample support only. A high-volume CAN ID with no marker
    correlation and no changing bytes must receive zero confidence.
    """
    correlation = min(1.0, max(0.0, float(correlation_score)))
    activity = min(1.0, max(0.0, float(activity_ratio)))
    sample_support = min(max(int(frame_count), 0) / 200.0, 1.0)

    evidence_score = (
        (correlation * 0.80)
        + (activity * 0.20)
    )
    support_multiplier = 0.50 + (sample_support * 0.50)

    return min(
        1.0,
        max(0.0, evidence_score * support_multiplier),
    )


def capture_kind_for(bus_interface: str | None, bus_mode: str | None) -> str:
    iface = (bus_interface or "").lower()
    mode = (bus_mode or "").lower()
    if mode in {"simulation", "replay", "offline"} or iface == "vcan0":
        return "simulation"
    return "live"


def source_label_for(bus_interface: str | None, bus_mode: str | None) -> str:
    mode = (bus_mode or "").lower()
    if mode == "listen-only":
        return "LIVE / LISTEN-ONLY"
    if mode == "live":
        return "LIVE / ACTIVE"
    if mode == "simulation":
        return "SIMULATION"
    return (bus_mode or "UNKNOWN").upper()


def safe_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return None
