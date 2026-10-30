"""Analysis / memory: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    Any,
    Candidate,
    MAX_RESPONSE_BYTE_EVIDENCE,
    Optional,
    UUID,
    VECTOR_MEMORY_LIMIT,
    VECTOR_MEMORY_MIN_SIMILARITY,
    defaultdict,
    statistics,
)
from .utilities import (
    can_hex,
    capture_kind_for,
    metadata_dict,
)

def compact_byte_evidence(candidate: Candidate, limit: int = 3) -> str:
    active = [
        item
        for item in candidate.byte_evidence
        if item.change_count > 0
    ]
    active.sort(
        key=lambda item: (
            item.in_window_changes,
            item.change_count,
        ),
        reverse=True,
    )

    if not active:
        return "no changing bytes"

    summaries: list[str] = []
    for item in active[:limit]:
        nonzero_bit_flips = {
            bit: count
            for bit, count in item.bit_flip_counts.items()
            if count > 0
        }
        summaries.append(
            f"B{item.byte_index}: changes={item.change_count}, "
            f"in_window={item.in_window_changes}, "
            f"out_window={item.out_of_window_changes}, "
            f"marker_coverage={item.marker_transition_coverage}, "
            f"transition_score={item.transition_score}, "
            f"transition_symmetry={item.transition_symmetry_score}, "
            f"encoding_hint={item.encoding_hint}, "
            f"consensus_pre={item.pre_marker_mode}, "
            f"consensus_action={item.action_window_mode}, "
            f"consensus_post={item.post_marker_mode}, "
            f"action_groups={item.action_group_modes}, "
            f"inverse_pairs={item.inverse_transition_pairs[:3]}, "
            f"transition_steps={item.transition_step_counts}, "
            f"latency_ms={item.median_marker_latency_ms}, "
            f"common={item.most_common_values[:4]}, "
            f"byte_delta={item.byte_delta_counts}, "
            f"mod_delta={item.byte_modulo_delta_counts}, "
            f"low_nibble_delta={item.low_nibble_delta_counts}, "
            f"high_nibble_delta={item.high_nibble_delta_counts}, "
            f"hamming={item.hamming_distance_counts}, "
            f"bit_flips={nonzero_bit_flips}"
        )

    return "; ".join(summaries)


def compact_byte_roles(candidate: Candidate) -> str:
    if not candidate.byte_role_hypotheses:
        return "none"
    return "; ".join(
        f"B{item.byte_index}={item.hypothesis_kind}"
        + (f" mask=0x{item.bit_mask:02X}" if item.bit_mask is not None else "")
        + f" confidence={item.confidence:.3f}"
        for item in candidate.byte_role_hypotheses
    )


def compact_signal_hypothesis(candidate: Candidate) -> str:
    if candidate.field_hypotheses:
        field = candidate.field_hypotheses[0]
        return (
            f"B{field.start_byte} width={field.width_bits} "
            f"endianness={field.endianness} signed={field.signed} "
            f"score={field.score:.3f} monotonicity={field.monotonicity:.3f} "
            f"separation={field.level_separation:.3f} "
            f"repeatability={field.repeatability:.3f} "
            f"outside_drift={field.outside_action_drift:.3f} "
            f"levels={field.observed_level_medians}"
        )
    if not candidate.signal_hypotheses:
        return "none"
    top = candidate.signal_hypotheses[0]
    groups = ", ".join(
        f"{name}:{group.get('consensus_pre_state')}->{group.get('consensus_action_state')}"
        for name, group in top.action_groups.items()
    )
    return (
        f"B{top.byte_index} bit={top.bit_index} mask=0x{top.bit_mask:02X} "
        f"score={top.score:.3f} matched={top.matched_repetitions}/"
        f"{top.total_repetitions} outside={top.out_of_window_flips} "
        f"inverse={top.inverse_pair_verified} groups=[{groups}]"
    )


def embedding_candidate_metadata(candidate: Candidate) -> dict[str, Any]:
    active_evidence = [
        item
        for item in candidate.byte_evidence
        if item.change_count > 0
    ]
    active_evidence.sort(
        key=lambda item: (
            item.in_window_changes,
            item.change_count,
        ),
        reverse=True,
    )

    return {
        "can_id": candidate.can_id,
        "can_id_hex": candidate.can_id_hex,
        "confidence": candidate.confidence,
        "candidate_role": candidate.candidate_role,
        "correlation_score": candidate.correlation_score,
        "byte_transition_score": candidate.byte_transition_score,
        "byte_transition_evidence": candidate.byte_transition_evidence,
        "baseline_overlap_score": candidate.baseline_overlap_score,
        "baseline_adjusted_change_ratio": (
            candidate.baseline_adjusted_change_ratio
        ),
        "ml_probability": candidate.ml_probability,
        "byte_change_counts": candidate.byte_change_counts,
        "byte_role_hypotheses": [
            item.model_dump()
            for item in candidate.byte_role_hypotheses
        ],
        "signal_hypotheses": [
            item.model_dump()
            for item in candidate.signal_hypotheses[:8]
        ],
        "field_hypotheses": [
            item.model_dump()
            for item in candidate.field_hypotheses[:8]
        ],
        "analyzer_profile": candidate.analyzer_profile,
        "quick_id_method": candidate.quick_id_method,
        "byte_evidence": [
            item.model_dump()
            for item in active_evidence[:2]
        ],
    }


def build_embedding_document(
    session: dict[str, Any],
    candidates: list[Candidate],
    analysis_mode: str,
    marker_window_ms: int,
    baseline_context: Optional[dict[str, Any]] = None,
    ml_context: Optional[dict[str, Any]] = None,
) -> str:
    """Create evidence-rich text for both storage and similarity search."""
    baseline_context = baseline_context or {}
    ml_context = ml_context or {}
    capture_kind = capture_kind_for(
        session.get("bus_interface"),
        session.get("bus_mode"),
    )

    lines = [
        f"Vehicle: {session.get('vehicle_slug')}",
        f"Mission: {session.get('mission_code')}",
        f"Target: {session.get('mission_target')}",
        f"Analysis mode: {analysis_mode}",
        f"Capture kind: {capture_kind}",
        (
            "CAN source: "
            f"{session.get('bus_interface')}/{session.get('bus_mode')}"
        ),
        f"Post-marker action window: {marker_window_ms} ms",
        (
            "Matched baseline: "
            f"{baseline_context.get('session_id') or 'none'}"
        ),
        (
            "Supervised model: "
            f"{ml_context.get('model_id') or 'none'}"
        ),
        "Ranked candidate evidence:",
    ]

    for candidate in candidates[:10]:
        lines.append(
            " | ".join(
                [
                    candidate.can_id_hex,
                    f"confidence={candidate.confidence}",
                    f"role={candidate.candidate_role}",
                    f"correlation={candidate.correlation_score}",
                    f"baseline_overlap={candidate.baseline_overlap_score}",
                    (
                        "baseline_excess="
                        f"{candidate.baseline_adjusted_change_ratio}"
                    ),
                    f"ml_probability={candidate.ml_probability}",
                    f"changes={candidate.change_count}",
                    f"bytes={candidate.byte_change_counts}",
                    f"byte_roles={compact_byte_roles(candidate)}",
                    f"top_signal={compact_signal_hypothesis(candidate)}",
                    f"quick_id_method={candidate.quick_id_method}",
                    (
                        "evidence="
                        f"{compact_byte_evidence(candidate, limit=2)}"
                    ),
                ]
            )
        )

    return "\n".join(lines)


def vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


async def retrieve_vector_memory(
    conn: Any,
    *,
    query_embedding: list[float],
    session: dict[str, Any],
    analysis_mode: str,
    embed_model: str,
) -> dict[str, Any]:
    """Retrieve latest exact-scope memories, deduplicated by session."""
    mission_code = session.get("mission_code")
    capture_kind = capture_kind_for(
        session.get("bus_interface"),
        session.get("bus_mode"),
    )

    context: dict[str, Any] = {
        "requested": True,
        "query_embedded": True,
        "retrieved": False,
        "scope": {
            "vehicle_slug": session.get("vehicle_slug"),
            "mission_code": mission_code,
            "capture_kind": capture_kind,
            "analysis_mode": analysis_mode,
            "embed_model": embed_model,
        },
        "limit": VECTOR_MEMORY_LIMIT,
        "minimum_similarity": VECTOR_MEMORY_MIN_SIMILARITY,
        "confidence_influence": False,
        "matches": [],
        "match_count": 0,
    }

    if not mission_code:
        context["reason"] = "Session has no mission code for scoped retrieval."
        return context

    query_vector = vector_literal(query_embedding)

    try:
        rows = await conn.fetch(
            """
            WITH latest_embeddings AS (
                SELECT DISTINCT ON (se.session_id)
                    se.id AS embedding_id,
                    se.session_id,
                    se.text,
                    se.embedding,
                    se.metadata,
                    se.created_at,
                    cs.bus_interface,
                    cs.bus_mode,
                    rm.mission_code
                FROM signal_embeddings se
                JOIN can_sessions cs ON cs.id = se.session_id
                LEFT JOIN recon_missions rm ON rm.id = cs.mission_id
                WHERE se.vehicle_id = $2
                  AND se.session_id <> $3
                  AND rm.mission_code = $4
                  AND COALESCE(se.metadata->>'model', '') = $5
                  AND COALESCE(se.metadata->>'analysis_mode', '') = $6
                  AND se.embedding IS NOT NULL
                  AND (
                        (
                            $7 = 'simulation'
                            AND (
                                LOWER(COALESCE(cs.bus_mode, '')) IN (
                                    'simulation', 'replay', 'offline'
                                )
                                OR LOWER(COALESCE(cs.bus_interface, '')) = 'vcan0'
                            )
                        )
                        OR
                        (
                            $7 = 'live'
                            AND LOWER(COALESCE(cs.bus_mode, '')) NOT IN (
                                'simulation', 'replay', 'offline'
                            )
                            AND LOWER(COALESCE(cs.bus_interface, '')) <> 'vcan0'
                        )
                  )
                ORDER BY se.session_id, se.created_at DESC
            ),
            scored AS (
                SELECT
                    latest_embeddings.*,
                    1.0 - (embedding <=> $1::vector) AS similarity
                FROM latest_embeddings
            )
            SELECT *
            FROM scored
            WHERE similarity >= $8
            ORDER BY
                CASE WHEN bus_interface IS NOT DISTINCT FROM $9 THEN 0 ELSE 1 END,
                CASE WHEN bus_mode IS NOT DISTINCT FROM $10 THEN 0 ELSE 1 END,
                similarity DESC,
                created_at DESC
            LIMIT $11
            """,
            query_vector,
            session.get("vehicle_id"),
            session.get("id"),
            mission_code,
            embed_model,
            analysis_mode,
            capture_kind,
            VECTOR_MEMORY_MIN_SIMILARITY,
            session.get("bus_interface"),
            session.get("bus_mode"),
            VECTOR_MEMORY_LIMIT,
        )
    except Exception as exc:
        context["error"] = f"{type(exc).__name__}: {exc}"
        context["reason"] = "Vector-memory query failed."
        return context

    matches: list[dict[str, Any]] = []
    for raw_row in rows:
        row = dict(raw_row)
        metadata = metadata_dict(row.get("metadata"))
        matches.append({
            "embedding_id": str(row["embedding_id"]),
            "session_id": str(row["session_id"]),
            "similarity": round(float(row.get("similarity") or 0.0), 6),
            "mission_code": row.get("mission_code"),
            "bus_interface": row.get("bus_interface"),
            "bus_mode": row.get("bus_mode"),
            "capture_kind": capture_kind_for(
                row.get("bus_interface"),
                row.get("bus_mode"),
            ),
            "analysis_mode": metadata.get("analysis_mode"),
            "created_at": row.get("created_at"),
            "text": str(row.get("text") or "")[:2_000],
            "metadata": metadata,
            "labels": {},
        })

    if matches:
        session_ids = [UUID(match["session_id"]) for match in matches]
        try:
            label_rows = await conn.fetch(
                """
                SELECT
                    session_id,
                    can_id,
                    label,
                    signal_name,
                    notes,
                    metadata
                FROM can_ml_labels
                WHERE session_id = ANY($1::uuid[])
                """,
                session_ids,
            )
            labels_by_session: dict[str, dict[str, Any]] = defaultdict(dict)
            for raw_label in label_rows:
                label = dict(raw_label)
                labels_by_session[str(label["session_id"])][
                    str(label["can_id"])
                ] = {
                    "label": label.get("label"),
                    "signal_name": label.get("signal_name"),
                    "notes": label.get("notes"),
                    "metadata": metadata_dict(label.get("metadata")),
                }
            for match in matches:
                match["labels"] = labels_by_session.get(
                    match["session_id"],
                    {},
                )
        except Exception as exc:
            context["label_lookup_error"] = f"{type(exc).__name__}: {exc}"

    context["matches"] = matches
    context["match_count"] = len(matches)
    context["retrieved"] = bool(matches)
    if not matches:
        context["reason"] = "No compatible historical embeddings met the similarity threshold."
    return context


def apply_vector_historical_support(
    candidates: list[Candidate],
    vector_context: dict[str, Any],
) -> None:
    """Attach transparent support counts without changing confidence."""
    matches = vector_context.get("matches")
    if not isinstance(matches, list):
        return

    for candidate in candidates:
        seen_sessions = 0
        top_five_sessions = 0
        same_active_bytes_sessions = 0
        similarities: list[float] = []
        label_counts = {
            "positive": 0,
            "negative": 0,
            "uncertain": 0,
        }
        current_active_bytes = {
            str(byte_index)
            for byte_index in range(8)
            if int(candidate.byte_change_counts.get(str(byte_index), 0) or 0) > 0
        }

        for match in matches:
            metadata = metadata_dict(match.get("metadata"))
            historical_candidates = metadata.get("top_candidates")
            if not isinstance(historical_candidates, list):
                historical_candidates = []

            historical_candidate: Optional[dict[str, Any]] = None
            historical_index: Optional[int] = None
            for index, item in enumerate(historical_candidates):
                if not isinstance(item, dict):
                    continue
                if int(item.get("can_id") or -1) == candidate.can_id:
                    historical_candidate = item
                    historical_index = index
                    break

            if historical_candidate is not None:
                seen_sessions += 1
                if historical_index is not None and historical_index < 5:
                    top_five_sessions += 1
                similarities.append(float(match.get("similarity") or 0.0))

                historical_counts = metadata_dict(
                    historical_candidate.get("byte_change_counts")
                )
                historical_active_bytes = {
                    str(byte_index)
                    for byte_index in range(8)
                    if int(historical_counts.get(str(byte_index), 0) or 0) > 0
                }
                if current_active_bytes and (
                    current_active_bytes == historical_active_bytes
                ):
                    same_active_bytes_sessions += 1

            labels = metadata_dict(match.get("labels"))
            label = metadata_dict(labels.get(str(candidate.can_id)))
            label_value = label.get("label")
            if label_value in label_counts:
                label_counts[label_value] += 1

        candidate.historical_support = {
            "retrieved_sessions": len(matches),
            "seen_sessions": seen_sessions,
            "top_five_sessions": top_five_sessions,
            "same_active_bytes_sessions": same_active_bytes_sessions,
            "mean_similarity": (
                round(float(statistics.mean(similarities)), 6)
                if similarities
                else None
            ),
            "label_counts": label_counts,
            "confidence_influence": False,
        }


def vector_memory_prompt_text(vector_context: dict[str, Any]) -> str:
    matches = vector_context.get("matches")
    if not isinstance(matches, list) or not matches:
        return (
            "No compatible historical vector memories were retrieved. "
            f"Reason: {vector_context.get('reason') or 'none available'}."
        )

    lines = [
        (
            f"Retrieved {len(matches)} scoped historical sessions. "
            "Similarity is contextual evidence only and must not override "
            "the current raw CAN observations."
        )
    ]
    for index, match in enumerate(matches, 1):
        metadata = metadata_dict(match.get("metadata"))
        historical_candidates = metadata.get("top_candidates")
        summaries: list[str] = []
        if isinstance(historical_candidates, list):
            for candidate in historical_candidates[:3]:
                if not isinstance(candidate, dict):
                    continue
                summaries.append(
                    f"{candidate.get('can_id_hex')} "
                    f"confidence={candidate.get('confidence')} "
                    f"bytes={candidate.get('byte_change_counts')}"
                )
        labels = metadata_dict(match.get("labels"))
        label_summary = ", ".join(
            f"{can_hex(int(can_id))}:{metadata_dict(value).get('label')}"
            for can_id, value in list(labels.items())[:5]
            if str(can_id).isdigit()
        ) or "none"
        memory_excerpt = " ".join(
            str(match.get("text") or "").split()
        )[:400]
        lines.append(
            f"{index}. session={match.get('session_id')} "
            f"similarity={match.get('similarity')} "
            f"source={match.get('bus_interface')}/{match.get('bus_mode')} "
            f"top=[{'; '.join(summaries) or 'not stored'}] "
            f"human_labels=[{label_summary}] "
            f"memory_excerpt={memory_excerpt or 'none'}"
        )
    return "\n".join(lines)


def compact_candidate_payload(
    candidate: Candidate,
    *,
    include_byte_evidence: bool,
    byte_evidence_limit: int = MAX_RESPONSE_BYTE_EVIDENCE,
) -> dict[str, Any]:
    """Serialize a candidate without returning all eight evidence objects by default."""
    payload = candidate.model_dump(exclude={"byte_evidence"})

    if include_byte_evidence:
        active_evidence = [
            item
            for item in candidate.byte_evidence
            if item.change_count > 0
        ]
        active_evidence.sort(
            key=lambda item: (
                item.in_window_changes,
                item.change_count,
            ),
            reverse=True,
        )
        payload["byte_evidence"] = [
            item.model_dump()
            for item in active_evidence[:byte_evidence_limit]
        ]
    else:
        payload["byte_evidence"] = []

    return payload
