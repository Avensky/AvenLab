"""Analysis / fields: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .bytes import (
    combined_marker_metadata,
    has_opposing_action_markers,
    marker_expected_value,
    marker_polarity,
    median_absolute_deviation,
    median_float,
)
from .shared import (
    ANALYZER_PROFILE_ENUM,
    Any,
    BitSignalHypothesis,
    FieldMarkerObservation,
    FieldSignalHypothesis,
    FrameRow,
    Optional,
    bisect_left,
    bisect_right,
    defaultdict,
    math,
    statistics,
)
from .utilities import (
    build_interval_index,
    frame_byte,
    marker_action_key,
    merge_intervals,
    metadata_dict,
    mode_value,
    normalized_marker_type,
    strict_consensus,
    timestamp_in_intervals,
)

def field_value(
    row: FrameRow,
    start_byte: int,
    width_bits: int,
    endianness: str,
    signed: bool,
) -> int:
    width_bytes = width_bits // 8
    payload = bytes(frame_byte(row, start_byte + index) for index in range(width_bytes))
    byteorder = "little" if endianness == "little" else "big"
    return int.from_bytes(payload, byteorder=byteorder, signed=signed)


def field_specs(
    markers: list[dict[str, Any]],
    session: Optional[dict[str, Any]] = None,
) -> list[tuple[int, int, str, bool]]:
    widths: set[int] = {8, 16}
    allow_signed = False
    allow_little = True
    allow_big = True
    metadata_sources: list[dict[str, Any]] = [
        combined_marker_metadata(marker) for marker in markers
    ]
    if session:
        session_metadata = metadata_dict(session.get("session_metadata"))
        mission_metadata = metadata_dict(session.get("mission_metadata"))
        metadata_sources.extend([session_metadata, mission_metadata])

    for metadata in metadata_sources:
        raw_widths = metadata.get("field_widths")
        if isinstance(raw_widths, list):
            parsed = {
                int(value)
                for value in raw_widths
                if isinstance(value, (int, float)) and int(value) in {8, 16, 24, 32}
            }
            if parsed:
                widths = parsed
        allow_signed = allow_signed or bool(metadata.get("allow_signed"))
        if metadata.get("allow_little_endian") is False:
            allow_little = False
        if metadata.get("allow_big_endian") is False:
            allow_big = False

    expected_values = [
        value
        for marker in markers
        if (value := marker_expected_value(marker)) is not None
    ]
    if any(value < 0 for value in expected_values):
        allow_signed = True

    specs: list[tuple[int, int, str, bool]] = []
    for width_bits in sorted(widths):
        width_bytes = width_bits // 8
        for start_byte in range(0, 9 - width_bytes):
            if width_bits == 8:
                specs.append((start_byte, width_bits, "big", False))
                if allow_signed:
                    specs.append((start_byte, width_bits, "big", True))
                continue
            for endianness, allowed in (("little", allow_little), ("big", allow_big)):
                if not allowed:
                    continue
                specs.append((start_byte, width_bits, endianness, False))
                if allow_signed:
                    specs.append((start_byte, width_bits, endianness, True))
    return specs


def pairwise_monotonicity(
    expected: list[float],
    observed: list[float],
) -> tuple[float, str]:
    concordant = 0
    discordant = 0
    for left in range(len(expected)):
        for right in range(left + 1, len(expected)):
            expected_delta = expected[right] - expected[left]
            observed_delta = observed[right] - observed[left]
            if expected_delta == 0 or observed_delta == 0:
                continue
            if expected_delta * observed_delta > 0:
                concordant += 1
            else:
                discordant += 1
    total = concordant + discordant
    if total == 0:
        return 0.0, "unknown"
    if concordant >= discordant:
        return concordant / total, "increasing"
    return discordant / total, "decreasing"


def build_field_signal_hypotheses(
    rows: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analyzer_profile: str,
    session: Optional[dict[str, Any]] = None,
) -> list[FieldSignalHypothesis]:
    """Rank exact numeric fields against marker-declared expected levels.

    Aggregate CAN-ID activity never increases this score. A field wins by
    matching expected marker levels, remaining stable during holds, returning
    consistently, and avoiding significant unexplained movement outside action
    intervals.
    """
    numeric_markers = [
        marker for marker in markers if marker_expected_value(marker) is not None
    ]
    if not rows or len(numeric_markers) < 2:
        return []

    rows = sorted(rows, key=lambda row: (row.timestamp_ms, row.id))
    timestamps = [row.timestamp_ms for row in rows]
    provisional: list[FieldSignalHypothesis] = []

    for start_byte, width_bits, endianness, signed in field_specs(numeric_markers, session):
        values = [
            float(field_value(row, start_byte, width_bits, endianness, signed))
            for row in rows
        ]
        if len(set(values)) < 2:
            continue

        observations: list[FieldMarkerObservation] = []
        action_intervals: list[tuple[int, int]] = []
        expected_values: list[float] = []
        observed_values: list[float] = []
        plateau_mads: list[float] = []
        latencies: list[float] = []

        for marker in numeric_markers:
            expected = marker_expected_value(marker)
            if expected is None:
                continue
            metadata = combined_marker_metadata(marker)
            marker_time = int(marker.get("timestamp_ms") or 0)
            planned_duration: object = metadata.get(
                "hold_ms",
                metadata.get("planned_duration_ms"),
            )
            hold_ms = marker_window_ms
            if (
                not isinstance(planned_duration, bool)
                and isinstance(planned_duration, (int, float, str))
            ):
                try:
                    hold_ms = int(planned_duration)
                except ValueError:
                    hold_ms = marker_window_ms
            hold_ms = max(marker_window_ms, min(hold_ms, 60_000))
            settle_ms = min(marker_window_ms, max(0, hold_ms // 3))
            action_start = marker_time + settle_ms
            action_end = marker_time + hold_ms
            action_intervals.append((marker_time, action_end))

            def values_between(start_ms: int, end_ms: int) -> list[float]:
                left = bisect_left(timestamps, start_ms)
                right = bisect_right(timestamps, end_ms)
                return values[left:right]

            pre_values = values_between(marker_time - marker_window_ms, marker_time - 1)
            action_values = values_between(action_start, action_end)
            post_values = values_between(
                action_end + 1,
                action_end + marker_window_ms,
            )
            pre_value = median_float(pre_values)
            action_value = median_float(action_values)
            post_value = median_float(post_values)
            plateau_mad = median_absolute_deviation(action_values)
            if action_value is None:
                continue

            response_latency: Optional[float] = None
            if pre_value is not None:
                raw_span = max(values) - min(values)
                threshold = max(1.0, raw_span * 0.02)
                left = bisect_left(timestamps, marker_time)
                right = bisect_right(timestamps, min(action_end, marker_time + (2 * marker_window_ms)))
                for index in range(left, right):
                    if abs(values[index] - pre_value) >= threshold:
                        response_latency = float(timestamps[index] - marker_time)
                        break

            observation = FieldMarkerObservation(
                marker_type=normalized_marker_type(marker),
                step_code=(str(marker.get("step_code")) if marker.get("step_code") is not None else None),
                label=(str(marker.get("label")) if marker.get("label") is not None else None),
                action_key=marker_action_key(marker),
                timestamp_ms=marker_time,
                expected_value=expected,
                expected_unit=(str(metadata.get("expected_unit")) if metadata.get("expected_unit") is not None else None),
                expected_direction=(str(metadata.get("expected_direction")) if metadata.get("expected_direction") is not None else None),
                pre_value=pre_value,
                action_value=action_value,
                post_value=post_value,
                plateau_mad=plateau_mad,
                response_latency_ms=response_latency,
                hold_ms=hold_ms,
            )
            observations.append(observation)
            expected_values.append(expected)
            observed_values.append(action_value)
            if plateau_mad is not None:
                plateau_mads.append(plateau_mad)
            if response_latency is not None:
                latencies.append(response_latency)

        if len(observations) < 2 or len(set(expected_values)) < 2:
            continue

        observed_span = max(observed_values) - min(observed_values)
        if observed_span <= 0:
            continue

        monotonicity, observed_direction = pairwise_monotonicity(
            expected_values,
            observed_values,
        )

        by_level: dict[float, list[float]] = defaultdict(list)
        for expected, observed in zip(expected_values, observed_values):
            by_level[expected].append(observed)
        level_medians = {
            level: float(statistics.median(level_values))
            for level, level_values in by_level.items()
        }
        ordered_levels = sorted(level_medians)
        adjacent_gaps = [
            abs(level_medians[right] - level_medians[left])
            for left, right in zip(ordered_levels, ordered_levels[1:])
        ]
        level_separation = (
            min(1.0, (min(adjacent_gaps) * max(len(adjacent_gaps), 1)) / observed_span)
            if adjacent_gaps
            else 0.0
        )

        repeated_deviations: list[float] = []
        for level, level_values in by_level.items():
            if len(level_values) < 2:
                continue
            center = float(statistics.median(level_values))
            repeated_deviations.extend(abs(value - center) for value in level_values)
        repeatability = 1.0 - min(
            1.0,
            (float(statistics.median(repeated_deviations)) / observed_span)
            if repeated_deviations else 0.0,
        )
        plateau_stability = 1.0 - min(
            1.0,
            (float(statistics.median(plateau_mads)) / observed_span)
            if plateau_mads else 1.0,
        )

        return_values = [
            combined_marker_metadata(marker).get("return_value")
            for marker in numeric_markers
        ]
        numeric_returns = [
            float(value)
            for value in return_values
            if isinstance(value, (int, float)) and math.isfinite(float(value))
        ]
        return_level = (
            float(statistics.median(numeric_returns))
            if numeric_returns
            else min(expected_values)
        )
        return_observed = [
            observed
            for expected, observed in zip(expected_values, observed_values)
            if abs(expected - return_level) < 1e-9
        ]
        if return_observed:
            return_center = float(statistics.median(return_observed))
            return_consistency = 1.0 - min(
                1.0,
                float(statistics.median(abs(value - return_center) for value in return_observed))
                / observed_span,
            )
        else:
            return_consistency = 0.5

        significant_threshold = max(1.0, observed_span * 0.02)
        merged_actions = merge_intervals(action_intervals)
        action_starts = [start for start, _ in merged_actions]
        significant_total = 0
        significant_outside = 0
        for previous, current in zip(rows, rows[1:]):
            if previous.segment_id != current.segment_id:
                continue
            previous_value = float(field_value(previous, start_byte, width_bits, endianness, signed))
            current_value = float(field_value(current, start_byte, width_bits, endianness, signed))
            if abs(current_value - previous_value) < significant_threshold:
                continue
            significant_total += 1
            if not timestamp_in_intervals(current.timestamp_ms, merged_actions, action_starts):
                significant_outside += 1
        outside_action_drift = (
            significant_outside / significant_total if significant_total else 0.0
        )

        response_latency_score = 0.5
        if latencies:
            median_latency = float(statistics.median(latencies))
            response_latency_score = 1.0 / (1.0 + median_latency / max(marker_window_ms, 1))
        marker_coverage = len(observations) / max(len(numeric_markers), 1)

        score = (
            (monotonicity * 0.30)
            + (level_separation * 0.20)
            + (repeatability * 0.15)
            + (return_consistency * 0.15)
            + (plateau_stability * 0.10)
            + (response_latency_score * 0.10)
        )
        score *= marker_coverage
        score *= (1.0 - outside_action_drift) ** 2

        if analyzer_profile == ANALYZER_PROFILE_ENUM:
            # Enum states need repeatable, well-separated levels but do not
            # require numeric order to carry meaning.
            score = (
                (level_separation * 0.35)
                + (repeatability * 0.25)
                + (plateau_stability * 0.15)
                + (return_consistency * 0.10)
                + (marker_coverage * 0.15)
            ) * ((1.0 - outside_action_drift) ** 2)

        provisional.append(FieldSignalHypothesis(
            start_byte=start_byte,
            width_bits=width_bits,
            endianness=endianness,
            signed=signed,
            score=round(min(1.0, max(0.0, score)), 6),
            monotonicity=round(monotonicity, 6),
            observed_direction=observed_direction,
            level_separation=round(level_separation, 6),
            repeatability=round(repeatability, 6),
            plateau_stability=round(plateau_stability, 6),
            return_consistency=round(return_consistency, 6),
            outside_action_drift=round(outside_action_drift, 6),
            response_latency_score=round(response_latency_score, 6),
            marker_coverage=round(marker_coverage, 6),
            expected_levels=ordered_levels,
            observed_level_medians={
                str(level): round(level_medians[level], 6)
                for level in ordered_levels
            },
            observations=observations,
            reason=(
                f"{width_bits}-bit {endianness} field at B{start_byte}; "
                f"monotonicity={monotonicity:.3f}, separation={level_separation:.3f}, "
                f"repeatability={repeatability:.3f}, outside_drift={outside_action_drift:.3f}"
            ),
        ))

    provisional.sort(key=lambda item: item.score, reverse=True)
    total_score = sum(item.score for item in provisional[:8])
    for item in provisional:
        item.location_dominance = round(
            item.score / max(total_score, 1e-9),
            6,
        )
    return provisional[:20]


def build_bit_signal_hypotheses(
    rows: list[FrameRow],
    marker_windows: list[tuple[int, int, dict[str, Any]]],
    marker_window_ms: int,
    marker_window_coverage: float,
) -> list[BitSignalHypothesis]:
    """Rank exact byte/bit locations for discrete ON/OFF-style missions.

    The score rewards one repeatable state transition at the same location for
    each action and directly penalizes flips outside action windows. Aggregate
    CAN-ID activity cannot increase this score.
    """
    if not rows or not marker_windows:
        return []

    row_timestamps = [row.timestamp_ms for row in rows]
    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )
    opposing_actions_present = has_opposing_action_markers(
        [marker for _, _, marker in marker_windows]
    )

    provisional: list[dict[str, Any]] = []
    total_in_window_flips_all_bits = 0

    for byte_index in range(8):
        byte_values = [frame_byte(row, byte_index) for row in rows]
        for bit_index in range(8):
            bit_mask = 1 << bit_index
            transition_events: list[tuple[int, int, int]] = []

            for previous, current in zip(rows, rows[1:]):
                if previous.segment_id != current.segment_id:
                    continue
                previous_state = 1 if frame_byte(previous, byte_index) & bit_mask else 0
                current_state = 1 if frame_byte(current, byte_index) & bit_mask else 0
                if previous_state != current_state:
                    transition_events.append(
                        (current.timestamp_ms, previous_state, current_state)
                    )

            if not transition_events:
                continue

            event_timestamps = [event[0] for event in transition_events]
            in_window_flips = sum(
                1
                for timestamp_ms in event_timestamps
                if timestamp_in_intervals(
                    timestamp_ms,
                    correlation_intervals,
                    correlation_starts,
                )
            )
            if in_window_flips == 0:
                continue

            total_flips = len(transition_events)
            out_of_window_flips = total_flips - in_window_flips
            total_in_window_flips_all_bits += in_window_flips

            observations: list[dict[str, Any]] = []
            grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
            matched_repetitions = 0
            exact_single_flips = 0
            latencies: list[float] = []

            bit_values = [1 if value & bit_mask else 0 for value in byte_values]

            def states_between(start_ms: int, end_ms: int) -> list[int]:
                left = bisect_left(row_timestamps, start_ms)
                right = bisect_right(row_timestamps, end_ms)
                return bit_values[left:right]

            for action_start, action_end, marker in marker_windows:
                marker_time = int(marker.get("timestamp_ms") or action_start)
                pre_states = states_between(
                    marker_time - marker_window_ms,
                    marker_time - 1,
                )
                action_states = states_between(action_start, action_end)
                post_states = states_between(
                    action_end + 1,
                    action_end + marker_window_ms,
                )

                left_event = bisect_left(event_timestamps, action_start)
                right_event = bisect_right(event_timestamps, action_end)
                window_events = transition_events[left_event:right_event]
                flip_count = len(window_events)
                pre_state = mode_value(pre_states)
                action_state = mode_value(action_states)
                post_state = mode_value(post_states)
                transition_matched = (
                    pre_state is not None
                    and action_state is not None
                    and pre_state != action_state
                    and flip_count >= 1
                )
                if transition_matched:
                    matched_repetitions += 1
                if flip_count == 1:
                    exact_single_flips += 1

                latency_ms: Optional[float] = None
                if window_events:
                    latency_ms = float(window_events[0][0] - marker_time)
                    if latency_ms >= 0:
                        latencies.append(latency_ms)

                action_key = marker_action_key(marker)
                observation = {
                    "action_key": action_key,
                    "polarity": marker_polarity(marker),
                    "timestamp_ms": marker_time,
                    "pre_state": pre_state,
                    "action_state": action_state,
                    "post_state": post_state,
                    "flip_count": flip_count,
                    "transition_matched": transition_matched,
                    "latency_ms": (
                        round(latency_ms, 2)
                        if latency_ms is not None
                        else None
                    ),
                }
                observations.append(observation)
                grouped[action_key].append(observation)

            total_repetitions = len(marker_windows)
            repetition_score = (
                matched_repetitions / total_repetitions
                if total_repetitions
                else 0.0
            )
            single_flip_score = (
                exact_single_flips / total_repetitions
                if total_repetitions
                else 0.0
            )
            window_purity = in_window_flips / max(total_flips, 1)
            outside_action_fraction = out_of_window_flips / max(total_flips, 1)
            marker_lift = (
                (window_purity - marker_window_coverage)
                / max(1.0 - marker_window_coverage, 1e-9)
                if window_purity > marker_window_coverage
                and marker_window_coverage < 1.0
                else 0.0
            )
            latency_score = 0.0
            median_latency_ms: Optional[float] = None
            if latencies:
                median_latency_ms = float(statistics.median(latencies))
                latency_score = 1.0 / (
                    1.0 + (median_latency_ms / max(marker_window_ms, 1))
                )

            action_groups: dict[str, Any] = {}
            valid_on_groups: list[dict[str, Any]] = []
            valid_off_groups: list[dict[str, Any]] = []
            for action_key, group_observations in grouped.items():
                pre_consensus = strict_consensus(
                    [item.get("pre_state") for item in group_observations]
                )
                action_consensus = strict_consensus(
                    [item.get("action_state") for item in group_observations]
                )
                post_consensus = strict_consensus(
                    [item.get("post_state") for item in group_observations]
                )
                polarity_values = {
                    item.get("polarity")
                    for item in group_observations
                    if item.get("polarity") is not None
                }
                polarity = (
                    next(iter(polarity_values))
                    if len(polarity_values) == 1
                    else None
                )
                matched = sum(
                    1
                    for item in group_observations
                    if item.get("transition_matched")
                )
                group_payload = {
                    "polarity": polarity,
                    "repetitions": len(group_observations),
                    "matched_repetitions": matched,
                    "consensus_pre_state": pre_consensus,
                    "consensus_action_state": action_consensus,
                    "consensus_post_state": post_consensus,
                    "flip_counts": [
                        int(item.get("flip_count") or 0)
                        for item in group_observations
                    ],
                }
                action_groups[action_key] = group_payload
                if (
                    pre_consensus is not None
                    and action_consensus is not None
                    and pre_consensus != action_consensus
                ):
                    if polarity == "on":
                        valid_on_groups.append(group_payload)
                    elif polarity == "off":
                        valid_off_groups.append(group_payload)

            inverse_pair_verified = any(
                on_group["consensus_pre_state"]
                    == off_group["consensus_action_state"]
                and off_group["consensus_pre_state"]
                    == on_group["consensus_action_state"]
                and on_group["consensus_action_state"]
                    != off_group["consensus_action_state"]
                for on_group in valid_on_groups
                for off_group in valid_off_groups
            )

            provisional.append({
                "byte_index": byte_index,
                "bit_index": bit_index,
                "bit_mask": bit_mask,
                "marker_lift": min(1.0, max(0.0, marker_lift)),
                "window_purity": window_purity,
                "outside_action_fraction": outside_action_fraction,
                "repetition_score": repetition_score,
                "single_flip_score": single_flip_score,
                "total_flips": total_flips,
                "in_window_flips": in_window_flips,
                "out_of_window_flips": out_of_window_flips,
                "matched_repetitions": matched_repetitions,
                "total_repetitions": total_repetitions,
                "inverse_pair_verified": inverse_pair_verified,
                "median_latency_ms": median_latency_ms,
                "latency_score": latency_score,
                "action_groups": action_groups,
                "opposing_actions_present": opposing_actions_present,
            })

    hypotheses: list[BitSignalHypothesis] = []
    for item in provisional:
        location_dominance = (
            item["in_window_flips"] / max(total_in_window_flips_all_bits, 1)
        )
        if item["opposing_actions_present"]:
            score = (
                (item["repetition_score"] * 0.32)
                + (item["window_purity"] * 0.25)
                + ((1.0 if item["inverse_pair_verified"] else 0.0) * 0.20)
                + (item["single_flip_score"] * 0.10)
                + (item["latency_score"] * 0.08)
                + (location_dominance * 0.05)
            )
            if not item["inverse_pair_verified"]:
                score = min(score, 0.35)
        else:
            score = (
                (item["repetition_score"] * 0.40)
                + (item["window_purity"] * 0.30)
                + (item["single_flip_score"] * 0.12)
                + (item["latency_score"] * 0.10)
                + (location_dominance * 0.08)
            )

        # A clean command/state bit should not continue changing outside the
        # action. This multiplier makes one exact transition beat hundreds of
        # unrelated changes elsewhere in the CAN ID.
        score *= max(0.02, (1.0 - item["outside_action_fraction"]) ** 2)
        average_action_flips = (
            item["in_window_flips"] / max(item["total_repetitions"], 1)
        )
        if average_action_flips > 1.0:
            score /= average_action_flips
        if item["matched_repetitions"] == 0:
            score = 0.0

        score = min(1.0, max(0.0, score))
        reason = (
            f"B{item['byte_index']} bit {item['bit_index']} matched "
            f"{item['matched_repetitions']}/{item['total_repetitions']} "
            f"action markers; in-window flips={item['in_window_flips']}, "
            f"outside flips={item['out_of_window_flips']}, "
            f"inverse ON/OFF={item['inverse_pair_verified']}"
        )
        hypotheses.append(BitSignalHypothesis(
            byte_index=int(item["byte_index"]),
            bit_index=int(item["bit_index"]),
            bit_mask=int(item["bit_mask"]),
            score=round(score, 6),
            marker_lift=round(float(item["marker_lift"]), 6),
            window_purity=round(float(item["window_purity"]), 6),
            outside_action_fraction=round(
                float(item["outside_action_fraction"]),
                6,
            ),
            repetition_score=round(float(item["repetition_score"]), 6),
            single_flip_score=round(float(item["single_flip_score"]), 6),
            location_dominance=round(location_dominance, 6),
            total_flips=int(item["total_flips"]),
            in_window_flips=int(item["in_window_flips"]),
            out_of_window_flips=int(item["out_of_window_flips"]),
            matched_repetitions=int(item["matched_repetitions"]),
            total_repetitions=int(item["total_repetitions"]),
            inverse_pair_verified=bool(item["inverse_pair_verified"]),
            median_latency_ms=(
                round(float(item["median_latency_ms"]), 2)
                if item["median_latency_ms"] is not None
                else None
            ),
            action_groups=dict(item["action_groups"]),
            reason=reason,
        ))

    hypotheses.sort(
        key=lambda item: (
            item.score,
            item.inverse_pair_verified,
            item.repetition_score,
            item.window_purity,
            -item.out_of_window_flips,
        ),
        reverse=True,
    )
    return hypotheses[:24]
