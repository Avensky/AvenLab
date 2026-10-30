"""Analysis / bytes: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    ANALYZER_PROFILE_BASELINE,
    ANALYZER_PROFILE_BOOLEAN,
    ANALYZER_PROFILE_CONTINUOUS,
    ANALYZER_PROFILE_ENUM,
    ANALYZER_PROFILE_ORDINAL,
    ANALYZER_PROFILE_PULSE,
    Any,
    ByteEvidence,
    ByteRoleHypothesis,
    Counter,
    FrameRow,
    MarkerObservation,
    Optional,
    QUICK_ID_BIT_FIRST_METHOD,
    QUICK_ID_CONTINUOUS_FIELD_METHOD,
    QUICK_ID_ENUM_FIELD_METHOD,
    QUICK_ID_FALLBACK_METHOD,
    QUICK_ID_ORDINAL_FIELD_METHOD,
    QUICK_ID_PULSE_METHOD,
    bisect_left,
    bisect_right,
    defaultdict,
    math,
    re,
    statistics,
)
from .utilities import (
    build_interval_index,
    dominant_count_fraction,
    entropy,
    frame_byte,
    is_baseline_mode,
    marker_action_key,
    metadata_dict,
    mode_value,
    normalized_marker_type,
    select_analysis_markers,
    strict_consensus,
    timestamp_in_intervals,
    top_count_map,
)

def byte_encoding_hint(
    *,
    unique_values: int,
    hamming_distance_counts: Counter[int],
    byte_modulo_delta_counts: Counter[int],
    low_nibble_delta_counts: Counter[int],
    high_nibble_delta_counts: Counter[int],
) -> str:
    full_counter_fraction = dominant_count_fraction(
        byte_modulo_delta_counts,
        {1, 255},
    )
    low_counter_fraction = dominant_count_fraction(
        low_nibble_delta_counts,
        {1, 15},
    )
    high_counter_fraction = dominant_count_fraction(
        high_nibble_delta_counts,
        {1, 15},
    )
    bit_flip_fraction = dominant_count_fraction(
        hamming_distance_counts,
        {1},
    )

    if unique_values <= 1:
        return "constant"
    if unique_values >= 4 and full_counter_fraction >= 0.70:
        return "full_byte_modulo_counter"
    if unique_values >= 4 and low_counter_fraction >= 0.70:
        return "low_nibble_modulo_counter"
    if unique_values >= 4 and high_counter_fraction >= 0.70:
        return "high_nibble_modulo_counter"
    if unique_values <= 4 and bit_flip_fraction >= 0.65:
        return "sparse_bitfield_or_enum"
    if unique_values <= 16:
        return "enum_or_small_encoded_field"
    return "encoded_byte_or_noise"


def byte_role_map(
    roles: list[ByteRoleHypothesis],
) -> dict[int, ByteRoleHypothesis]:
    """Select the effective structural role for each byte.

    A human rejection vetoes the matching auto suggestion. Confirmed human
    classifications outrank uncertain and auto suggestions. This lets Playback
    and Top IDs share one saved decision without allowing an old auto role to
    silently override it during the next analysis.
    """
    by_byte: dict[int, list[ByteRoleHypothesis]] = defaultdict(list)
    for role in roles:
        by_byte[role.byte_index].append(role)

    selected: dict[int, ByteRoleHypothesis] = {}
    for byte_index, items in by_byte.items():
        rejected_kinds = {
            item.hypothesis_kind
            for item in items
            if item.source == "human"
            and item.validation_status == "negative"
        }
        eligible = [
            item
            for item in items
            if item.validation_status != "negative"
            and not (
                item.source != "human"
                and item.hypothesis_kind in rejected_kinds
            )
        ]
        if not eligible:
            continue

        def priority(item: ByteRoleHypothesis) -> tuple[int, float]:
            if item.source == "human" and item.validation_status == "positive":
                rank = 4
            elif item.source == "human" and item.validation_status == "uncertain":
                rank = 3
            elif item.source == "human":
                rank = 2
            else:
                rank = 1
            return rank, float(item.confidence)

        selected[byte_index] = max(eligible, key=priority)
    return selected


def byte_role_score_factor(role: Optional[ByteRoleHypothesis]) -> float:
    if role is None or role.validation_status == "negative":
        return 1.0

    kind = role.hypothesis_kind
    human = role.source == "human"
    status = role.validation_status

    if kind == "constant":
        if human and status == "positive":
            return 0.0
        if human and status == "uncertain":
            return 0.45
        return 0.20
    if kind == "rolling_counter":
        if human and status == "positive":
            return 0.20
        if human and status == "uncertain":
            return 0.55
        return 0.35
    if kind == "checksum_candidate":
        if human and status == "positive":
            return 0.15
        if human and status == "uncertain":
            return 0.45
        return 0.25
    if kind == "payload_or_noise":
        if human and status == "positive":
            return 0.50
        if human and status == "uncertain":
            return 0.75
    return 1.0


def byte_inverse_transition_evidence(
    observations: list[MarkerObservation],
) -> tuple[dict[str, int], list[dict[str, Any]], float]:
    transition_step_counts: Counter[int] = Counter()
    transition_groups: dict[tuple[int, int], list[int]] = defaultdict(list)

    for observation in observations:
        if observation.change_count > 0:
            transition_step_counts[int(observation.change_count)] += 1

        source = observation.pre_mode
        target = (
            observation.action_mode
            if observation.action_mode is not None
            else observation.post_mode
        )
        if source is None or target is None or source == target:
            continue
        transition_groups[(int(source), int(target))].append(
            max(0, int(observation.change_count)),
        )

    pairs: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    weighted_score = 0.0
    weight_total = 0

    for transition, forward_counts in transition_groups.items():
        if transition in seen:
            continue
        inverse = (transition[1], transition[0])
        inverse_counts = transition_groups.get(inverse)
        if not inverse_counts:
            continue
        seen.add(transition)
        seen.add(inverse)

        forward_median = float(statistics.median(forward_counts))
        inverse_median = float(statistics.median(inverse_counts))
        denominator = max(forward_median, inverse_median, 1.0)
        symmetry = 1.0 - min(
            1.0,
            abs(forward_median - inverse_median) / denominator,
        )
        support = len(forward_counts) + len(inverse_counts)
        weighted_score += symmetry * support
        weight_total += support
        pairs.append(
            {
                "from": transition[0],
                "to": transition[1],
                "from_hex": f"0x{transition[0]:02X}",
                "to_hex": f"0x{transition[1]:02X}",
                "forward_samples": len(forward_counts),
                "inverse_samples": len(inverse_counts),
                "forward_median_steps": round(forward_median, 3),
                "inverse_median_steps": round(inverse_median, 3),
                "symmetry_score": round(symmetry, 6),
            }
        )

    pairs.sort(
        key=lambda item: (
            item.get("symmetry_score", 0),
            item.get("forward_samples", 0) + item.get("inverse_samples", 0),
        ),
        reverse=True,
    )
    symmetry_score = (
        weighted_score / weight_total
        if weight_total > 0
        else 0.0
    )
    return top_count_map(transition_step_counts), pairs[:8], round(symmetry_score, 6)


def strongest_byte_transition(
    evidence: list[ByteEvidence],
    roles: list[ByteRoleHypothesis],
) -> tuple[Optional[ByteEvidence], float, dict[str, Any]]:
    roles_by_byte = byte_role_map(roles)
    best_item: Optional[ByteEvidence] = None
    best_score = 0.0
    best_payload: dict[str, Any] = {}

    for item in evidence:
        if item.change_count <= 0:
            continue
        role = roles_by_byte.get(item.byte_index)
        raw_score = float(item.transition_score)
        factor = byte_role_score_factor(role)
        score = raw_score * factor
        role_kind = role.hypothesis_kind if role else "unknown"
        if role_kind == "rolling_counter" and factor < 1.0:
            score = min(score, 0.15 if role and role.source == "human" else 0.25)
        elif role_kind == "checksum_candidate" and factor < 1.0:
            score = min(score, 0.12 if role and role.source == "human" else 0.20)
        elif role_kind == "constant" and factor < 1.0:
            score = min(score, 0.10)

        if score <= best_score:
            continue

        best_item = item
        best_score = score
        best_payload = {
            "byte_index": item.byte_index,
            "score": round(score, 6),
            "raw_transition_score": item.transition_score,
            "marker_transition_coverage": item.marker_transition_coverage,
            "in_window_changes": item.in_window_changes,
            "out_of_window_changes": item.out_of_window_changes,
            "change_count": item.change_count,
            "encoding_hint": item.encoding_hint,
            "transition_step_counts": item.transition_step_counts,
            "transition_symmetry_score": item.transition_symmetry_score,
            "inverse_transition_pairs": item.inverse_transition_pairs,
            "byte_role": role_kind,
            "byte_role_source": role.source if role else None,
            "byte_role_validation_status": role.validation_status if role else None,
            "byte_role_score_factor": round(factor, 6),
            "byte_modulo_delta_counts": item.byte_modulo_delta_counts,
            "low_nibble_delta_counts": item.low_nibble_delta_counts,
            "high_nibble_delta_counts": item.high_nibble_delta_counts,
            "hamming_distance_counts": item.hamming_distance_counts,
        }

    return best_item, round(best_score, 6), best_payload


def build_byte_evidence(
    rows: list[FrameRow],
    marker_windows: list[tuple[int, int, dict[str, Any]]],
    marker_window_ms: int,
) -> tuple[list[ByteEvidence], dict[str, float]]:
    """Build per-action evidence without pooling ON and OFF marker states."""
    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )

    evidence_rows: list[ByteEvidence] = []
    byte_entropy: dict[str, float] = {}
    row_timestamps = [row.timestamp_ms for row in rows]

    for byte_index in range(8):
        values = [frame_byte(row, byte_index) for row in rows]
        byte_entropy[str(byte_index)] = round(
            max(0.0, entropy(values)),
            4,
        )

        change_timestamps: list[int] = []
        bit_flip_counts = [0] * 8
        byte_delta_counts: Counter[int] = Counter()
        byte_modulo_delta_counts: Counter[int] = Counter()
        low_nibble_delta_counts: Counter[int] = Counter()
        high_nibble_delta_counts: Counter[int] = Counter()
        hamming_distance_counts: Counter[int] = Counter()

        for previous, current in zip(rows, rows[1:]):
            if previous.segment_id != current.segment_id:
                continue

            previous_value = frame_byte(previous, byte_index)
            current_value = frame_byte(current, byte_index)
            if previous_value == current_value:
                continue

            change_timestamps.append(current.timestamp_ms)
            changed_bits = previous_value ^ current_value
            byte_delta_counts[int(current_value) - int(previous_value)] += 1
            byte_modulo_delta_counts[
                (int(current_value) - int(previous_value)) % 256
            ] += 1
            previous_low = previous_value & 0x0F
            current_low = current_value & 0x0F
            if previous_low != current_low:
                low_nibble_delta_counts[(current_low - previous_low) % 16] += 1
            previous_high = (previous_value >> 4) & 0x0F
            current_high = (current_value >> 4) & 0x0F
            if previous_high != current_high:
                high_nibble_delta_counts[(current_high - previous_high) % 16] += 1
            hamming_distance_counts[int(changed_bits).bit_count()] += 1
            for bit_index in range(8):
                if changed_bits & (1 << bit_index):
                    bit_flip_counts[bit_index] += 1

        in_window_changes = sum(
            1
            for timestamp_ms in change_timestamps
            if timestamp_in_intervals(
                timestamp_ms,
                correlation_intervals,
                correlation_starts,
            )
        )
        out_of_window_changes = len(change_timestamps) - in_window_changes

        observations: list[MarkerObservation] = []
        grouped: dict[str, list[MarkerObservation]] = defaultdict(list)

        for action_start, action_end, marker in marker_windows:
            marker_time = int(marker.get("timestamp_ms") or action_start)
            pre_start = marker_time - marker_window_ms
            pre_end = marker_time - 1
            post_start = action_end + 1
            post_end = action_end + marker_window_ms

            def values_between(start_ms: int, end_ms: int) -> list[int]:
                left = bisect_left(row_timestamps, start_ms)
                right = bisect_right(row_timestamps, end_ms)
                return values[left:right]

            pre_values = values_between(pre_start, pre_end)
            action_values = values_between(action_start, action_end)
            post_values = values_between(post_start, post_end)

            left_change = bisect_left(change_timestamps, action_start)
            right_change = bisect_right(change_timestamps, action_end)
            marker_change_count = right_change - left_change

            latency: Optional[float] = None
            if left_change < len(change_timestamps):
                first_change = change_timestamps[left_change]
                if first_change <= action_end:
                    latency = float(first_change - marker_time)

            action_key = marker_action_key(marker)
            observation = MarkerObservation(
                marker_type=normalized_marker_type(marker),
                step_code=(
                    str(marker.get("step_code"))
                    if marker.get("step_code") is not None
                    else None
                ),
                label=(
                    str(marker.get("label"))
                    if marker.get("label") is not None
                    else None
                ),
                action_key=action_key,
                timestamp_ms=marker_time,
                pre_mode=mode_value(pre_values),
                action_mode=mode_value(action_values),
                post_mode=mode_value(post_values),
                change_count=marker_change_count,
                latency_ms=(
                    round(latency, 2)
                    if latency is not None
                    else None
                ),
            )
            observations.append(observation)
            grouped[action_key].append(observation)

        action_group_modes: dict[str, Any] = {}
        group_pre_modes: list[Optional[int]] = []
        group_action_modes: list[Optional[int]] = []
        group_post_modes: list[Optional[int]] = []
        all_latencies: list[float] = []

        for action_key, group_observations in grouped.items():
            pre_modes = [item.pre_mode for item in group_observations]
            action_modes = [item.action_mode for item in group_observations]
            post_modes = [item.post_mode for item in group_observations]
            latencies = [
                float(item.latency_ms)
                for item in group_observations
                if item.latency_ms is not None
            ]

            group_pre = strict_consensus(pre_modes)
            group_action = strict_consensus(action_modes)
            group_post = strict_consensus(post_modes)
            group_pre_modes.append(group_pre)
            group_action_modes.append(group_action)
            group_post_modes.append(group_post)
            all_latencies.extend(latencies)

            action_group_modes[action_key] = {
                "repetitions": len(group_observations),
                "pre_modes": pre_modes,
                "action_modes": action_modes,
                "post_modes": post_modes,
                "consensus_pre_mode": group_pre,
                "consensus_action_mode": group_action,
                "consensus_post_mode": group_post,
                "total_action_window_changes": sum(
                    item.change_count
                    for item in group_observations
                ),
                "median_latency_ms": (
                    round(float(statistics.median(latencies)), 2)
                    if latencies
                    else None
                ),
            }

        (
            transition_step_counts,
            inverse_transition_pairs,
            transition_symmetry_score,
        ) = byte_inverse_transition_evidence(observations)
        marker_transition_coverage = (
            sum(1 for observation in observations if observation.change_count > 0)
            / max(len(observations), 1)
            if marker_windows
            else 0.0
        )
        window_purity = (
            in_window_changes / max(len(change_timestamps), 1)
            if change_timestamps
            else 0.0
        )
        latency_score = 0.0
        if all_latencies:
            median_latency = float(statistics.median(all_latencies))
            latency_score = 1.0 / (
                1.0 + (median_latency / max(marker_window_ms, 1))
            )
        transition_score = (
            (marker_transition_coverage * 0.55)
            + (window_purity * 0.30)
            + (latency_score * 0.15)
        )
        if inverse_transition_pairs:
            transition_score = min(
                1.0,
                transition_score + (transition_symmetry_score * 0.10),
            )
        unique_value_count = len(set(values))

        evidence_rows.append(
            ByteEvidence(
                byte_index=byte_index,
                change_count=len(change_timestamps),
                unique_values=sorted(set(values))[:32],
                most_common_values=[
                    (int(value), int(count))
                    for value, count in Counter(values).most_common(5)
                ],
                byte_delta_counts=top_count_map(byte_delta_counts),
                byte_modulo_delta_counts=top_count_map(
                    byte_modulo_delta_counts,
                ),
                low_nibble_delta_counts=top_count_map(
                    low_nibble_delta_counts,
                ),
                high_nibble_delta_counts=top_count_map(
                    high_nibble_delta_counts,
                ),
                hamming_distance_counts=top_count_map(
                    hamming_distance_counts,
                ),
                transition_step_counts=transition_step_counts,
                inverse_transition_pairs=inverse_transition_pairs,
                transition_symmetry_score=transition_symmetry_score,
                # Do not collapse opposing action groups. These remain None
                # whenever ON/OFF or press/release groups disagree.
                pre_marker_mode=strict_consensus(group_pre_modes),
                action_window_mode=strict_consensus(group_action_modes),
                post_marker_mode=strict_consensus(group_post_modes),
                bit_flip_counts={
                    str(bit_index): int(count)
                    for bit_index, count in enumerate(bit_flip_counts)
                },
                median_marker_latency_ms=(
                    round(float(statistics.median(all_latencies)), 2)
                    if all_latencies
                    else None
                ),
                in_window_changes=in_window_changes,
                out_of_window_changes=out_of_window_changes,
                marker_transition_coverage=round(
                    marker_transition_coverage,
                    6,
                ),
                transition_score=round(
                    min(1.0, max(0.0, transition_score)),
                    6,
                ),
                encoding_hint=byte_encoding_hint(
                    unique_values=unique_value_count,
                    hamming_distance_counts=hamming_distance_counts,
                    byte_modulo_delta_counts=byte_modulo_delta_counts,
                    low_nibble_delta_counts=low_nibble_delta_counts,
                    high_nibble_delta_counts=high_nibble_delta_counts,
                ),
                marker_observations=observations,
                action_group_modes=action_group_modes,
            )
        )

    return evidence_rows, byte_entropy


def marker_polarity(marker: dict[str, Any]) -> Optional[str]:
    """Classify explicit opposing actions without substring false positives."""
    text = " ".join(
        str(value or "")
        for value in (
            marker.get("step_code"),
            marker.get("label"),
            marker_action_key(marker),
        )
    ).lower().replace("-", "_")
    tokens = set(re.findall(r"[a-z0-9]+", text))

    negative_tokens = {
        "off", "release", "released", "close", "closed", "disable",
        "disabled", "deactivate", "deactivated", "inactive", "down",
    }
    positive_tokens = {
        "on", "press", "pressed", "open", "opened", "enable", "enabled",
        "activate", "activated", "active", "up",
    }
    if tokens & negative_tokens:
        return "off"
    if tokens & positive_tokens:
        return "on"
    return None


def has_opposing_action_markers(markers: list[dict[str, Any]]) -> bool:
    polarities = {
        polarity
        for marker in markers
        if (polarity := marker_polarity(marker)) is not None
    }
    return {"on", "off"}.issubset(polarities)


def combined_marker_metadata(marker: dict[str, Any]) -> dict[str, Any]:
    metadata = metadata_dict(marker.get("metadata"))
    step_metadata = metadata_dict(metadata.get("step_metadata"))
    return {**step_metadata, **metadata}


def marker_expected_value(marker: dict[str, Any]) -> Optional[float]:
    metadata = combined_marker_metadata(marker)
    value = metadata.get("expected_value")
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        try:
            parsed = float(value.strip())
        except ValueError:
            return None
        return parsed if math.isfinite(parsed) else None
    return None


def normalize_analyzer_profile(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    profile = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "boolean": ANALYZER_PROFILE_BOOLEAN,
        "bit": ANALYZER_PROFILE_BOOLEAN,
        "digital": ANALYZER_PROFILE_BOOLEAN,
        "ordinal": ANALYZER_PROFILE_ORDINAL,
        "levels": ANALYZER_PROFILE_ORDINAL,
        "analog_levels": ANALYZER_PROFILE_ORDINAL,
        "continuous": ANALYZER_PROFILE_CONTINUOUS,
        "analog": ANALYZER_PROFILE_CONTINUOUS,
        "trace": ANALYZER_PROFILE_CONTINUOUS,
        "enum": ANALYZER_PROFILE_ENUM,
        "categorical": ANALYZER_PROFILE_ENUM,
        "pulse": ANALYZER_PROFILE_PULSE,
        "baseline": ANALYZER_PROFILE_BASELINE,
    }
    profile = aliases.get(profile, profile)
    valid = {
        ANALYZER_PROFILE_BASELINE,
        ANALYZER_PROFILE_BOOLEAN,
        ANALYZER_PROFILE_ORDINAL,
        ANALYZER_PROFILE_CONTINUOUS,
        ANALYZER_PROFILE_ENUM,
        ANALYZER_PROFILE_PULSE,
    }
    return profile if profile in valid else None


def resolve_analyzer_profile(
    session: dict[str, Any],
    markers: list[dict[str, Any]],
    analysis_mode: str,
) -> str:
    if is_baseline_mode(analysis_mode):
        return ANALYZER_PROFILE_BASELINE

    # Step/marker metadata is the most specific contract.
    marker_profiles = [
        normalize_analyzer_profile(
            combined_marker_metadata(marker).get("analyzer_profile")
        )
        for marker in markers
    ]
    explicit_marker_profiles = [profile for profile in marker_profiles if profile]
    if explicit_marker_profiles:
        counts = Counter(explicit_marker_profiles)
        return counts.most_common(1)[0][0]

    session_metadata = metadata_dict(session.get("session_metadata"))
    mission_metadata = metadata_dict(session.get("mission_metadata"))
    frontend_metadata = metadata_dict(mission_metadata.get("frontend_metadata"))
    for metadata in (session_metadata, mission_metadata, frontend_metadata):
        profile = normalize_analyzer_profile(metadata.get("analyzer_profile"))
        if profile:
            return profile

    selected, _ = select_analysis_markers(markers, baseline_mode=False)
    if has_opposing_action_markers(selected):
        return ANALYZER_PROFILE_BOOLEAN

    numeric_values = [
        value
        for marker in selected
        if (value := marker_expected_value(marker)) is not None
    ]
    unique_values = sorted(set(numeric_values))
    if len(unique_values) >= 3:
        if any(value < 0 for value in unique_values):
            return ANALYZER_PROFILE_CONTINUOUS
        return ANALYZER_PROFILE_ORDINAL
    if len(unique_values) >= 2:
        return ANALYZER_PROFILE_CONTINUOUS
    return ANALYZER_PROFILE_BOOLEAN


def quick_id_method_for_profile(profile: str, opposing_actions: bool) -> str:
    if profile == ANALYZER_PROFILE_ORDINAL:
        return QUICK_ID_ORDINAL_FIELD_METHOD
    if profile == ANALYZER_PROFILE_CONTINUOUS:
        return QUICK_ID_CONTINUOUS_FIELD_METHOD
    if profile == ANALYZER_PROFILE_ENUM:
        return QUICK_ID_ENUM_FIELD_METHOD
    if profile == ANALYZER_PROFILE_PULSE:
        return QUICK_ID_PULSE_METHOD
    if profile == ANALYZER_PROFILE_BOOLEAN:
        return QUICK_ID_BIT_FIRST_METHOD
    return QUICK_ID_FALLBACK_METHOD


def median_float(values: list[float]) -> Optional[float]:
    return float(statistics.median(values)) if values else None


def median_absolute_deviation(values: list[float]) -> Optional[float]:
    if not values:
        return None
    center = float(statistics.median(values))
    return float(statistics.median(abs(value - center) for value in values))
