"""Analysis / scoring: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .bytes import (
    build_byte_evidence,
    has_opposing_action_markers,
    marker_expected_value,
    quick_id_method_for_profile,
    strongest_byte_transition,
)
from .fields import (
    build_bit_signal_hypotheses,
    build_field_signal_hypotheses,
)
from .roles import (
    classify_byte_roles,
)
from .shared import (
    ANALYSIS_MODE_TARGET,
    ANALYZER_PROFILE_BOOLEAN,
    Any,
    Candidate,
    Counter,
    FIELD_ANALYZER_PROFILES,
    FrameRow,
    MAX_DELTAS_TO_STORE,
    Optional,
    bisect_left,
    bisect_right,
    defaultdict,
    statistics,
)
from .utilities import (
    build_interval_index,
    can_hex,
    frame_byte,
    interval_coverage_fraction,
    is_baseline_mode,
    marker_action_duration_ms,
    score_candidate_confidence,
    select_analysis_markers,
    timestamp_in_intervals,
)

def analyze_frames(
    frames: list[FrameRow],
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str = ANALYSIS_MODE_TARGET,
    analyzer_profile: str = ANALYZER_PROFILE_BOOLEAN,
    session: Optional[dict[str, Any]] = None,
) -> tuple[
    list[Candidate],
    list[dict[str, Any]],
    dict[str, Any],
    dict[str, Any],
]:
    baseline_mode = is_baseline_mode(analysis_mode)
    selected_markers, marker_context = select_analysis_markers(
        markers,
        baseline_mode=baseline_mode,
    )
    opposing_actions = (
        not baseline_mode
        and has_opposing_action_markers(selected_markers)
    )
    bit_first_required = (
        analyzer_profile == ANALYZER_PROFILE_BOOLEAN
        and bool(selected_markers)
    )
    field_first_required = analyzer_profile in FIELD_ANALYZER_PROFILES
    numeric_expected_values = [
        value
        for marker in selected_markers
        if (value := marker_expected_value(marker)) is not None
    ]
    secondary_bit_scan = (
        field_first_required
        and numeric_expected_values
        and min(numeric_expected_values) <= 0
        and max(numeric_expected_values) > 0
    )
    quick_id_method = quick_id_method_for_profile(
        analyzer_profile,
        opposing_actions,
    )
    marker_context["analyzer_profile"] = analyzer_profile
    marker_context["quick_id_method"] = quick_id_method
    marker_context["numeric_expected_markers"] = len(numeric_expected_values)
    marker_context["secondary_bit_scan"] = bool(secondary_bit_scan)

    by_id: dict[int, list[FrameRow]] = defaultdict(list)
    for frame in frames:
        by_id[frame.can_id].append(frame)

    all_deltas: list[dict[str, Any]] = []
    candidates: list[Candidate] = []
    heatmap: dict[str, Any] = {}

    marker_windows: list[tuple[int, int, dict[str, Any]]] = []
    for marker in selected_markers:
        timestamp_ms = int(marker.get("timestamp_ms") or 0)
        marker_windows.append(
            (
                timestamp_ms,
                timestamp_ms + marker_action_duration_ms(
                    marker,
                    marker_window_ms,
                ),
                marker,
            )
        )

    correlation_intervals, correlation_starts = build_interval_index(
        [(start, end) for start, end, _ in marker_windows]
    )

    session_start_ms = min(
        (frame.timestamp_ms for frame in frames),
        default=0,
    )
    session_end_ms = max(
        (frame.timestamp_ms for frame in frames),
        default=session_start_ms,
    )
    marker_window_coverage = interval_coverage_fraction(
        correlation_intervals,
        session_start_ms,
        session_end_ms,
    )

    for can_id, rows in sorted(by_id.items()):
        rows.sort(key=lambda row: (row.timestamp_ms, row.id))

        byte_change_counts = [0] * 8
        changed_frame_timestamps: set[tuple[int, int]] = set()
        byte_change_events: list[tuple[int, int]] = []

        previous: Optional[FrameRow] = None
        for row in rows:
            if (
                previous is not None
                and previous.segment_id == row.segment_id
            ):
                frame_changed = False
                for byte_index in range(8):
                    previous_byte = frame_byte(previous, byte_index)
                    current_byte = frame_byte(row, byte_index)

                    if previous_byte == current_byte:
                        continue

                    frame_changed = True
                    byte_change_counts[byte_index] += 1
                    byte_change_events.append((row.timestamp_ms, byte_index))

                    if len(all_deltas) < MAX_DELTAS_TO_STORE:
                        all_deltas.append(
                            {
                                "session_id": None,
                                "can_id": can_id,
                                "timestamp_ms": row.timestamp_ms,
                                "byte_index": byte_index,
                                "previous_value": previous_byte,
                                "current_value": current_byte,
                                "delta": int(current_byte) - int(previous_byte),
                                "metadata": {
                                    "can_id_hex": can_hex(can_id),
                                    "raw_frame_id": row.id,
                                    "analysis_mode": analysis_mode,
                                },
                            }
                        )

                if frame_changed:
                    changed_frame_timestamps.add((row.segment_id, row.timestamp_ms))

            previous = row

        byte_evidence, byte_entropy = build_byte_evidence(
            rows,
            marker_windows,
            marker_window_ms,
        )
        byte_role_hypotheses = classify_byte_roles(rows, byte_entropy)
        top_byte_transition, byte_transition_score, byte_transition_payload = (
            strongest_byte_transition(
                byte_evidence,
                byte_role_hypotheses,
            )
        )
        signal_hypotheses = (
            build_bit_signal_hypotheses(
                rows,
                marker_windows,
                marker_window_ms,
                marker_window_coverage,
            )
            if bit_first_required or secondary_bit_scan
            else []
        )
        top_signal_hypothesis = (
            signal_hypotheses[0]
            if signal_hypotheses
            else None
        )
        field_hypotheses = (
            build_field_signal_hypotheses(
                rows,
                selected_markers,
                marker_window_ms,
                analyzer_profile,
                session,
            )
            if field_first_required
            else []
        )
        top_field_hypothesis = (
            field_hypotheses[0]
            if field_hypotheses
            else None
        )

        active_entropy_values = [
            byte_entropy[str(byte_index)]
            for byte_index, count in enumerate(byte_change_counts)
            if count > 0
        ]
        entropy_score = (
            float(statistics.mean(active_entropy_values))
            if active_entropy_values
            else 0.0
        )

        rows_by_segment: dict[int, list[FrameRow]] = defaultdict(list)
        for row in rows:
            rows_by_segment[row.segment_id].append(row)

        observed_duration_seconds = 0.0
        observed_frame_count = 0
        for segment_rows in rows_by_segment.values():
            if len(segment_rows) < 2:
                continue
            segment_rows.sort(key=lambda item: (item.timestamp_ms, item.id))
            observed_duration_seconds += max(
                (
                    segment_rows[-1].timestamp_ms
                    - segment_rows[0].timestamp_ms
                )
                / 1000.0,
                0.001,
            )
            observed_frame_count += len(segment_rows)

        frequency_hz = (
            observed_frame_count / observed_duration_seconds
            if observed_duration_seconds > 0.0
            else None
        )

        change_count = sum(byte_change_counts)
        valid_frame_transitions = sum(
            max(len(segment_rows) - 1, 0)
            for segment_rows in rows_by_segment.values()
        )

        # Byte changes are measured only across adjacent frames from the same
        # selected time segment. Truncation gaps never become synthetic changes.
        possible_byte_transitions = max(valid_frame_transitions * 8, 1)
        change_ratio = change_count / possible_byte_transitions

        changed_frame_count = len(changed_frame_timestamps)
        changed_frame_ratio = (
            changed_frame_count / max(valid_frame_transitions, 1)
        )

        frame_volume_score = min(len(rows) / 200.0, 1.0)
        entropy_norm = min(entropy_score / 8.0, 1.0)
        baseline_score = min(
            1.0,
            (frame_volume_score * 0.35)
            + (change_ratio * 0.35)
            + (entropy_norm * 0.30),
        )

        marker_hits: Counter[str] = Counter()
        in_window_events = [
            event
            for event in byte_change_events
            if timestamp_in_intervals(
                event[0],
                correlation_intervals,
                correlation_starts,
            )
        ]
        window_delta_count = len(in_window_events)

        # Count each byte-change event once overall, while still recording which
        # marker labels had activity for analyst context.
        event_timestamps = [
            timestamp_ms
            for timestamp_ms, _ in byte_change_events
        ]

        for start, end, marker in marker_windows:
            left_index = bisect_left(event_timestamps, start)
            right_index = bisect_right(event_timestamps, end)
            hits = right_index - left_index
            if hits:
                marker_type = marker.get("marker_type") or "unknown_marker"
                step_code = (
                    marker.get("step_code")
                    or marker.get("label")
                    or marker_type
                )
                marker_hits[str(step_code)] += hits

        if baseline_mode:
            raw_marker_fraction = 0.0
            correlation_lift = 0.0
            correlation_score = 0.0
            confidence = 0.0

            if change_count == 0 and frequency_hz is not None and frequency_hz >= 5:
                candidate_role = "periodic_stable_background"
                notes = (
                    "baseline periodic traffic; useful for down-weighting "
                    "future false positives"
                )
            elif change_count > 0:
                candidate_role = "baseline_noisy_background"
                notes = (
                    "naturally changing baseline traffic; filter before "
                    "target correlation"
                )
            else:
                candidate_role = "stable_background"
                notes = "stable/background traffic observed during passive profile"
        else:
            if field_first_required:
                if top_field_hypothesis is not None:
                    raw_marker_fraction = 1.0 - top_field_hypothesis.outside_action_drift
                    correlation_lift = top_field_hypothesis.monotonicity
                    correlation_score = top_field_hypothesis.score
                    confidence = top_field_hypothesis.score
                    candidate_role = (
                        "exact_field_signal_candidate"
                        if confidence >= 0.45
                        else "weak_field_signal_candidate"
                    )
                    notes = (
                        f"field-first Quick ID: B{top_field_hypothesis.start_byte} "
                        f"{top_field_hypothesis.width_bits}-bit "
                        f"{top_field_hypothesis.endianness}; "
                        f"levels={len(top_field_hypothesis.expected_levels)}; "
                        f"outside drift={top_field_hypothesis.outside_action_drift:.3f}"
                    )
                else:
                    raw_marker_fraction = (
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0
                    )
                    correlation_lift = 0.0
                    if byte_transition_score > 0.0:
                        correlation_score = byte_transition_score
                        confidence = score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        candidate_role = (
                            "byte_transition_candidate"
                            if byte_transition_score >= 0.20
                            else "weak_byte_transition_candidate"
                        )
                        notes = (
                            "field-first fallback: byte movement repeated near "
                            "action markers, but no exact numeric field was decoded"
                        )
                    else:
                        correlation_score = 0.0
                        confidence = 0.0
                        candidate_role = "no_exact_field_candidate"
                        notes = "no exact numeric field or marker-linked byte transition was found"
            elif bit_first_required:
                if (
                    top_signal_hypothesis is not None
                    and top_signal_hypothesis.score > 0.0
                ):
                    byte_fallback_confidence = (
                        score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        if byte_transition_score > 0.0
                        else 0.0
                    )
                    exact_bit_wins = (
                        top_signal_hypothesis.score >= byte_fallback_confidence
                    )
                    raw_marker_fraction = max(
                        top_signal_hypothesis.window_purity,
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0,
                    )
                    correlation_lift = top_signal_hypothesis.marker_lift
                    correlation_score = max(
                        top_signal_hypothesis.score,
                        byte_transition_score,
                    )
                    confidence = max(
                        top_signal_hypothesis.score,
                        byte_fallback_confidence,
                    )
                    candidate_role = (
                        "exact_bit_signal_candidate"
                        if exact_bit_wins and confidence >= 0.45
                        else "weak_bit_signal_candidate"
                        if exact_bit_wins
                        else "byte_transition_candidate"
                        if byte_transition_score >= 0.20
                        else "weak_byte_transition_candidate"
                    )
                    notes = (
                        f"boolean hybrid Quick ID: exact B{top_signal_hypothesis.byte_index} "
                        f"bit {top_signal_hypothesis.bit_index} matched "
                        f"{top_signal_hypothesis.matched_repetitions}/"
                        f"{top_signal_hypothesis.total_repetitions} markers; "
                        f"byte transition score={byte_transition_score:.3f}; "
                        f"outside flips={top_signal_hypothesis.out_of_window_flips}"
                    )
                else:
                    raw_marker_fraction = (
                        top_byte_transition.marker_transition_coverage
                        if top_byte_transition is not None
                        else 0.0
                    )
                    correlation_lift = 0.0
                    if byte_transition_score > 0.0:
                        correlation_score = byte_transition_score
                        confidence = score_candidate_confidence(
                            byte_transition_score,
                            change_ratio,
                            len(rows),
                        )
                        candidate_role = (
                            "byte_transition_candidate"
                            if byte_transition_score >= 0.20
                            else "weak_byte_transition_candidate"
                        )
                        notes = (
                            "bit-first fallback: marker-linked byte movement was "
                            "found, but no exact bit transition was isolated"
                        )
                    else:
                        correlation_score = 0.0
                        confidence = 0.0
                        candidate_role = "no_exact_bit_candidate"
                        notes = "no exact bit or marker-linked byte transition was found"
            else:
                raw_marker_fraction = (
                    min(1.0, window_delta_count / max(change_count, 1))
                    if change_count > 0
                    else 0.0
                )
                if (
                    raw_marker_fraction > marker_window_coverage
                    and marker_window_coverage < 1.0
                ):
                    correlation_lift = (
                        raw_marker_fraction - marker_window_coverage
                    ) / max(1.0 - marker_window_coverage, 1e-9)
                else:
                    correlation_lift = 0.0
                correlation_score = min(
                    1.0,
                    max(0.0, correlation_lift, byte_transition_score),
                )
                confidence = score_candidate_confidence(
                    correlation_score,
                    change_ratio,
                    len(rows),
                )
                candidate_role = (
                    "byte_transition_candidate"
                    if byte_transition_score >= correlation_lift
                    and byte_transition_score >= 0.20
                    else "target_candidate"
                    if correlation_score >= 0.05
                    else "weak_or_background_candidate"
                )
                if candidate_role == "byte_transition_candidate":
                    notes = (
                        "byte-level fallback: action windows repeatedly "
                        "changed a byte, but bit/field encoding remains "
                        "unconfirmed"
                    )
                elif correlation_score >= 0.05:
                    notes = "aggregate fallback: correlated byte changes near markers"
                elif change_count > 0:
                    notes = "changed during session but weak marker correlation"
                else:
                    notes = "stable/background traffic"

        byte_change_map = {
            str(byte_index): int(count)
            for byte_index, count in enumerate(byte_change_counts)
        }
        top_markers = (
            []
            if baseline_mode
            else [name for name, _ in marker_hits.most_common(5)]
        )

        candidate = Candidate(
            can_id=can_id,
            can_id_hex=can_hex(can_id),
            frame_count=len(rows),
            frequency_hz=(
                round(frequency_hz, 3)
                if frequency_hz is not None
                else None
            ),
            change_count=change_count,
            change_ratio=round(change_ratio, 6),
            changed_frame_count=changed_frame_count,
            changed_frame_ratio=round(changed_frame_ratio, 6),
            byte_change_counts=byte_change_map,
            byte_entropy=byte_entropy,
            byte_evidence=byte_evidence,
            byte_role_hypotheses=byte_role_hypotheses,
            signal_hypotheses=signal_hypotheses,
            field_hypotheses=field_hypotheses,
            analyzer_profile=analyzer_profile,
            quick_id_method=quick_id_method,
            entropy=round(entropy_score, 4),
            raw_marker_fraction=round(raw_marker_fraction, 5),
            marker_window_coverage=round(marker_window_coverage, 5),
            correlation_lift=round(correlation_lift, 5),
            correlation_score=round(correlation_score, 5),
            confidence=round(confidence, 5),
            likely_marker_types=top_markers,
            notes=notes,
            analysis_mode=analysis_mode,
            candidate_role=candidate_role,
            baseline_score=round(baseline_score, 5),
            byte_transition_score=byte_transition_score,
            byte_transition_evidence=byte_transition_payload,
        )
        candidates.append(candidate)

        heatmap[can_hex(can_id)] = {
            "can_id": can_id,
            "analysis_mode": analysis_mode,
            "candidate_role": candidate_role,
            "byte_change_counts": byte_change_map,
            "byte_entropy": byte_entropy,
            "byte_evidence": [
                item.model_dump()
                for item in byte_evidence
            ],
            "byte_role_hypotheses": [
                item.model_dump()
                for item in byte_role_hypotheses
            ],
            "signal_hypotheses": [
                item.model_dump()
                for item in signal_hypotheses[:8]
            ],
            "field_hypotheses": [
                item.model_dump()
                for item in field_hypotheses[:8]
            ],
            "analyzer_profile": analyzer_profile,
            "quick_id_method": quick_id_method,
            "change_count": change_count,
            "change_ratio": round(change_ratio, 6),
            "changed_frame_count": changed_frame_count,
            "changed_frame_ratio": round(changed_frame_ratio, 6),
            "frame_count": len(rows),
            "frequency_hz": (
                round(frequency_hz, 3)
                if frequency_hz is not None
                else None
            ),
            "baseline_score": round(baseline_score, 5),
            "byte_transition_score": byte_transition_score,
            "byte_transition_evidence": byte_transition_payload,
            "raw_marker_fraction": round(raw_marker_fraction, 5),
            "marker_window_coverage": round(marker_window_coverage, 5),
            "correlation_lift": round(correlation_lift, 5),
            "correlation_score": round(correlation_score, 5),
            "confidence": round(confidence, 5),
        }

    if baseline_mode:
        candidates.sort(
            key=lambda candidate: (
                candidate.baseline_score,
                candidate.change_count,
                candidate.frame_count,
            ),
            reverse=True,
        )
    else:
        candidates.sort(
            key=lambda candidate: (
                candidate.confidence,
                candidate.correlation_score,
                candidate.change_count,
                candidate.frame_count,
            ),
            reverse=True,
        )

    marker_context["window_coverage"] = round(marker_window_coverage, 5)
    marker_context["adaptive_action_windows"] = True
    marker_context["action_window_durations_ms"] = [
        max(0, end - start)
        for start, end, _ in marker_windows
    ]
    marker_context["selected_marker_timestamps"] = [
        int(marker.get("timestamp_ms") or 0)
        for marker in selected_markers
    ]
    return candidates, all_deltas, heatmap, marker_context
