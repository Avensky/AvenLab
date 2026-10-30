"""Analysis / roles: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .bytes import (
    byte_role_map,
    byte_role_score_factor,
    strongest_byte_transition,
)
from .shared import (
    Any,
    BACKGROUND_BYTE_ROLE_KINDS,
    BASELINE_CODE_PREFIXES,
    ByteRoleHypothesis,
    Candidate,
    Counter,
    FrameRow,
    Optional,
    UUID,
    defaultdict,
    statistics,
)
from .utilities import (
    frame_byte,
    metadata_dict,
    score_candidate_confidence,
)

def _modulo_counter_score(
    value_sequences: list[list[int]],
    modulus: int,
) -> tuple[float, Optional[int]]:
    deltas: list[int] = []
    for values in value_sequences:
        deltas.extend(
            (current - previous) % modulus
            for previous, current in zip(values, values[1:])
            if current != previous
        )
    if len(deltas) < 3:
        return 0.0, None
    counts = Counter(deltas)
    delta, count = counts.most_common(1)[0]
    score = count / len(deltas)
    if delta not in {1, modulus - 1}:
        score *= 0.5
    return score, int(delta)


def classify_byte_roles(
    rows: list[FrameRow],
    byte_entropy: dict[str, float],
) -> list[ByteRoleHypothesis]:
    """Conservatively identify normal baseline byte mechanics.

    `checksum_candidate` is intentionally a hypothesis, never a confirmed
    checksum. Rolling counters are detected across full bytes and nibbles.
    """
    roles: list[ByteRoleHypothesis] = []

    transition_pairs: list[tuple[FrameRow, FrameRow]] = []
    for previous, current in zip(rows, rows[1:]):
        if previous.segment_id == current.segment_id:
            transition_pairs.append((previous, current))

    for byte_index in range(8):
        values = [frame_byte(row, byte_index) for row in rows]
        unique_values = len(set(values))
        entropy_value = float(byte_entropy.get(str(byte_index), 0.0) or 0.0)

        changed = 0
        co_changed = 0
        for previous, current in transition_pairs:
            before = frame_byte(previous, byte_index)
            after = frame_byte(current, byte_index)
            if before == after:
                continue
            changed += 1
            if any(
                frame_byte(previous, other) != frame_byte(current, other)
                for other in range(8)
                if other != byte_index
            ):
                co_changed += 1

        transitions = max(len(transition_pairs), 1)
        change_rate = changed / transitions
        co_change_ratio = co_changed / max(changed, 1)

        rows_by_segment: dict[int, list[FrameRow]] = defaultdict(list)
        for row in rows:
            rows_by_segment[row.segment_id].append(row)
        full_sequences = [
            [frame_byte(row, byte_index) for row in segment_rows]
            for segment_rows in rows_by_segment.values()
        ]
        low_sequences = [
            [value & 0x0F for value in sequence]
            for sequence in full_sequences
        ]
        high_sequences = [
            [(value >> 4) & 0x0F for value in sequence]
            for sequence in full_sequences
        ]

        full_score, full_delta = _modulo_counter_score(full_sequences, 256)
        low_score, low_delta = _modulo_counter_score(low_sequences, 16)
        high_score, high_delta = _modulo_counter_score(high_sequences, 16)

        best_counter = max(
            (full_score, 0xFF, full_delta, "full byte"),
            (low_score, 0x0F, low_delta, "low nibble"),
            (high_score, 0xF0, high_delta, "high nibble"),
            key=lambda item: item[0],
        )

        metrics = {
            "unique_values": unique_values,
            "entropy": round(entropy_value, 4),
            "change_rate": round(change_rate, 6),
            "co_change_ratio": round(co_change_ratio, 6),
            "full_counter_score": round(full_score, 6),
            "low_nibble_counter_score": round(low_score, 6),
            "high_nibble_counter_score": round(high_score, 6),
        }

        if changed == 0:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="constant",
                confidence=1.0,
                reason="byte did not change in the analyzed recording",
                metrics=metrics,
            ))
            continue

        if best_counter[0] >= 0.72 and unique_values >= 4:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="rolling_counter",
                confidence=round(min(0.99, best_counter[0]), 5),
                bit_mask=best_counter[1],
                reason=(
                    f"{best_counter[3]} follows a dominant modulo "
                    f"delta of {best_counter[2]}"
                ),
                metrics=metrics,
            ))
            continue

        checksum_score = min(
            1.0,
            (min(entropy_value / 8.0, 1.0) * 0.45)
            + (min(change_rate, 1.0) * 0.30)
            + (co_change_ratio * 0.25),
        )
        if (
            entropy_value >= 4.0
            and change_rate >= 0.25
            and co_change_ratio >= 0.60
            and best_counter[0] < 0.55
            and unique_values >= 12
        ):
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="checksum_candidate",
                confidence=round(checksum_score, 5),
                bit_mask=0xFF,
                reason=(
                    "high-entropy byte changes with other payload bytes and "
                    "does not resemble a simple modulo counter"
                ),
                metrics=metrics,
            ))
            continue

        varying_mask = 0
        for previous, current in transition_pairs:
            varying_mask |= (
                frame_byte(previous, byte_index)
                ^ frame_byte(current, byte_index)
            )

        if unique_values <= 4 and varying_mask:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="periodic_or_state_bits",
                confidence=round(min(0.9, 0.45 + change_rate), 5),
                bit_mask=int(varying_mask),
                reason="few observed values with a repeatable changing bit mask",
                metrics=metrics,
            ))
        else:
            roles.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind="payload_or_noise",
                confidence=round(min(0.8, 0.25 + entropy_value / 16.0), 5),
                bit_mask=int(varying_mask) if varying_mask else None,
                reason="changing byte did not meet conservative counter/checksum heuristics",
                metrics=metrics,
            ))

    return roles


async def load_human_byte_hypotheses(
    conn: Any,
    session_id: UUID,
) -> list[dict[str, Any]]:
    """Load current reviews plus conservative compatible-session consensus.

    Current-session decisions always win. Rolling-counter and checksum roles
    may carry across matching vehicle/interface/mode sessions after two
    independent confirmations. Constant/noise roles require three confirmations
    from baseline-style missions because state-dependent bytes can otherwise be
    incorrectly suppressed.
    """
    target = await conn.fetchrow(
        """
        SELECT vehicle_id, bus_interface, bus_mode
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    if target is None:
        return []

    rows = await conn.fetch(
        """
        SELECT h.session_id, h.can_id, h.byte_index, h.bit_mask,
               h.hypothesis_kind, h.action_group, h.confidence,
               h.validation_status, h.notes, h.evidence, h.metadata,
               h.updated_at, rm.mission_code
        FROM can_signal_hypotheses h
        JOIN can_sessions cs ON cs.id = h.session_id
        LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
        WHERE h.source = 'human'
          AND cs.capture_status = 'finalized'
          AND cs.vehicle_id = $2
          AND cs.bus_interface IS NOT DISTINCT FROM $3
          AND cs.bus_mode IS NOT DISTINCT FROM $4
        ORDER BY h.updated_at DESC
        """,
        session_id,
        target["vehicle_id"],
        target["bus_interface"],
        target["bus_mode"],
    )

    # Keep one canonical/latest decision per session and structural role.
    per_session: dict[tuple[str, int, int, int, str], dict[str, Any]] = {}
    for raw in rows:
        row = dict(raw)
        key = (
            str(row.get("session_id")),
            int(row.get("can_id") or 0),
            int(row.get("byte_index") or 0),
            int(row.get("bit_mask") or 0),
            str(row.get("hypothesis_kind") or "unknown"),
        )
        current = per_session.get(key)
        if current is None:
            per_session[key] = row
            continue
        row_canonical = not bool(row.get("action_group"))
        current_canonical = not bool(current.get("action_group"))
        if row_canonical and not current_canonical:
            per_session[key] = row

    current_rows: dict[tuple[int, int, int, str], dict[str, Any]] = {}
    prior_groups: dict[
        tuple[int, int, int, str],
        list[dict[str, Any]],
    ] = defaultdict(list)

    for row in per_session.values():
        role_key = (
            int(row.get("can_id") or 0),
            int(row.get("byte_index") or 0),
            int(row.get("bit_mask") or 0),
            str(row.get("hypothesis_kind") or "unknown"),
        )
        if str(row.get("session_id")) == str(session_id):
            current_rows[role_key] = row
        else:
            prior_groups[role_key].append(row)

    inherited: list[dict[str, Any]] = []
    for role_key, group in prior_groups.items():
        if role_key in current_rows:
            continue

        kind = role_key[3]
        if kind not in BACKGROUND_BYTE_ROLE_KINDS:
            continue
        statuses = {
            str(row.get("validation_status") or "unreviewed")
            for row in group
            if str(row.get("validation_status") or "unreviewed")
            in {"positive", "negative"}
        }
        if len(statuses) != 1:
            continue
        status = next(iter(statuses))
        matching = [
            row
            for row in group
            if str(row.get("validation_status") or "") == status
        ]
        distinct_sessions = {str(row.get("session_id")) for row in matching}

        baseline_only = kind in {"constant", "payload_or_noise"}
        if baseline_only:
            matching = [
                row
                for row in matching
                if str(row.get("mission_code") or "").upper().startswith(
                    BASELINE_CODE_PREFIXES
                )
            ]
            distinct_sessions = {str(row.get("session_id")) for row in matching}

        minimum_sessions = 3 if baseline_only else 2
        if len(distinct_sessions) < minimum_sessions:
            continue

        template = dict(max(
            matching,
            key=lambda row: row.get("updated_at") or 0,
        ))
        confidences = [
            float(row.get("confidence") or 0.5)
            for row in matching
        ]
        template["confidence"] = min(
            0.95,
            float(statistics.mean(confidences)),
        )
        template["notes"] = (
            f"Inherited {status} consensus from "
            f"{len(distinct_sessions)} compatible finalized sessions"
        )
        template["evidence"] = {
            **metadata_dict(template.get("evidence")),
            "inherited_consensus": True,
            "independent_sessions": len(distinct_sessions),
            "source_session_ids": sorted(distinct_sessions),
        }
        template["metadata"] = {
            **metadata_dict(template.get("metadata")),
            "inherited_consensus": True,
            "scope": "same_vehicle_interface_mode",
        }
        inherited.append(template)

    return [*current_rows.values(), *inherited]


def apply_human_byte_hypotheses(
    candidates: list[Candidate],
    human_rows: list[dict[str, Any]],
) -> None:
    by_id = {candidate.can_id: candidate for candidate in candidates}
    for row in human_rows:
        candidate = by_id.get(int(row.get("can_id") or -1))
        if candidate is None:
            continue
        byte_index = int(row.get("byte_index") or 0)
        kind = str(row.get("hypothesis_kind") or "unknown")
        validation_status = str(row.get("validation_status") or "unreviewed")
        match = next(
            (
                item
                for item in candidate.byte_role_hypotheses
                if item.byte_index == byte_index
                and item.hypothesis_kind == kind
                and (item.bit_mask or 0) == int(row.get("bit_mask") or 0)
            ),
            None,
        )
        if match is None:
            candidate.byte_role_hypotheses.append(ByteRoleHypothesis(
                byte_index=byte_index,
                hypothesis_kind=kind,
                confidence=float(row.get("confidence") or 0.5),
                bit_mask=(
                    int(row["bit_mask"])
                    if row.get("bit_mask") is not None
                    else None
                ),
                auto_detected=False,
                source="human",
                validation_status=validation_status,
                reason=str(row.get("notes") or "human analyst hypothesis"),
                metrics=metadata_dict(row.get("evidence")),
            ))
        else:
            match.source = "human"
            match.validation_status = validation_status
            if row.get("notes"):
                match.reason = str(row["notes"])
            if row.get("confidence") is not None:
                match.confidence = float(row["confidence"])


def rescore_candidates_after_human_byte_roles(
    candidates: list[Candidate],
    heatmap: dict[str, Any],
    *,
    apply_confidence_penalty: bool = True,
) -> None:
    """Apply saved structural-byte reviews to the current session ranking.

    The review affects only the byte it classifies. A confirmed counter,
    checksum, or constant can suppress that byte as a target explanation while
    leaving other bytes on the same CAN ID available for consideration.
    """
    for candidate in candidates:
        roles_by_byte = byte_role_map(candidate.byte_role_hypotheses)
        best_item, best_score, best_payload = strongest_byte_transition(
            candidate.byte_evidence,
            candidate.byte_role_hypotheses,
        )
        candidate.byte_transition_score = best_score
        candidate.byte_transition_evidence = best_payload

        decisive_byte: Optional[int] = None
        decisive_source = "byte_transition"
        if candidate.field_hypotheses:
            decisive_byte = candidate.field_hypotheses[0].start_byte
            decisive_source = "field"
        elif candidate.signal_hypotheses:
            decisive_byte = candidate.signal_hypotheses[0].byte_index
            decisive_source = "bit"
        elif best_item is not None:
            decisive_byte = best_item.byte_index

        decisive_role = (
            roles_by_byte.get(decisive_byte)
            if decisive_byte is not None
            else None
        )
        factor = byte_role_score_factor(decisive_role)
        human_applied = bool(
            decisive_role is not None
            and decisive_role.source == "human"
            and decisive_role.validation_status in {"positive", "uncertain"}
            and decisive_role.hypothesis_kind in BACKGROUND_BYTE_ROLE_KINDS
            and factor < 1.0
        )

        candidate.confidence_before_human_byte_roles = candidate.confidence
        if (
            decisive_role is not None
            and human_applied
            and apply_confidence_penalty
        ):
            candidate.confidence = round(candidate.confidence * factor, 5)
            candidate.correlation_score = round(
                candidate.correlation_score * factor,
                5,
            )
            candidate.human_byte_role_applied = True
            candidate.human_byte_role_penalty = round(1.0 - factor, 6)
            candidate.human_byte_role_evidence = {
                "byte_index": decisive_byte,
                "decisive_source": decisive_source,
                "hypothesis_kind": decisive_role.hypothesis_kind,
                "validation_status": decisive_role.validation_status,
                "factor": round(factor, 6),
            }
            candidate.notes = (
                f"{candidate.notes}; human review marked decisive B{decisive_byte} "
                f"as {decisive_role.hypothesis_kind} "
                f"({decisive_role.validation_status})"
            )
        elif decisive_source == "byte_transition" and apply_confidence_penalty:
            # A rejected auto background suggestion restores the raw byte
            # transition as a valid lead for the next analysis.
            candidate.correlation_score = round(
                max(candidate.correlation_lift, best_score),
                5,
            )
            candidate.confidence = round(
                score_candidate_confidence(
                    candidate.correlation_score,
                    candidate.change_ratio,
                    candidate.frame_count,
                ),
                5,
            )

        row = heatmap.get(candidate.can_id_hex)
        if isinstance(row, dict):
            row["byte_role_hypotheses"] = [
                item.model_dump()
                for item in candidate.byte_role_hypotheses
            ]
            row["byte_transition_score"] = candidate.byte_transition_score
            row["byte_transition_evidence"] = candidate.byte_transition_evidence
            row["correlation_score"] = candidate.correlation_score
            row["confidence"] = candidate.confidence
            row["human_byte_role_applied"] = candidate.human_byte_role_applied
            row["human_byte_role_penalty"] = candidate.human_byte_role_penalty

    candidates.sort(
        key=lambda item: (
            item.confidence,
            item.correlation_score,
            item.byte_transition_score,
            item.change_count,
        ),
        reverse=True,
    )
