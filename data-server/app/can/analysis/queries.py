"""Analysis / queries: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .ollama import (
    is_embedding_only_model,
    list_ollama_models,
)
from .shared import (
    Any,
    BASELINE_PENALTY_WEIGHT,
    CONFIDENCE_SEMANTICS,
    DEFAULT_EMBED_MODEL,
    DEFAULT_LLM_MODEL,
    DEFAULT_MARKER_WINDOW_MS,
    LLM_BYTE_EVIDENCE_LIMIT,
    LLM_CANDIDATE_LIMIT,
    LLM_DEADLINE_SECONDS,
    LLM_HTTP_READ_TIMEOUT_SECONDS,
    LLM_NUM_CTX,
    LLM_NUM_PREDICT,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_URL,
    QUICK_ID_BIT_FIRST_METHOD,
    QUICK_ID_CONTINUOUS_FIELD_METHOD,
    QUICK_ID_ENUM_FIELD_METHOD,
    QUICK_ID_FALLBACK_METHOD,
    QUICK_ID_ORDINAL_FIELD_METHOD,
    UUID,
    VECTOR_MEMORY_LIMIT,
    VECTOR_MEMORY_MIN_SIMILARITY,
    VECTOR_MEMORY_SCHEMA_VERSION,
    ml_configuration,
    router,
)
from .utilities import (
    is_baseline_mode,
    select_analysis_markers,
)

@router.get("/ai/status")
async def get_ai_status() -> dict[str, Any]:
    models = await list_ollama_models()
    generate_models = [name for name in models if not is_embedding_only_model(name)]
    embedding_models = [name for name in models if is_embedding_only_model(name)]
    return {
        "ok": True,
        "ollama_url": OLLAMA_URL,
        "models": models,
        "generate_models": generate_models,
        "embedding_models": embedding_models,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "default_embed_model": DEFAULT_EMBED_MODEL,
        "llm_ready": len(generate_models) > 0,
        "llm_deadline_seconds": LLM_DEADLINE_SECONDS,
        "llm_http_read_timeout_seconds": LLM_HTTP_READ_TIMEOUT_SECONDS,
        "llm_num_ctx": LLM_NUM_CTX,
        "llm_num_predict": LLM_NUM_PREDICT,
        "llm_candidate_limit": LLM_CANDIDATE_LIMIT,
        "llm_byte_evidence_limit": LLM_BYTE_EVIDENCE_LIMIT,
        "ollama_keep_alive": OLLAMA_KEEP_ALIVE,
        "baseline_penalty_weight": BASELINE_PENALTY_WEIGHT,
        "baseline_matching": (
            "same vehicle + interface + bus mode; newest completed "
            "analyzed baseline recorded before target"
        ),
        "baseline_subtraction_method": (
            "normalized per-byte transition-rate subtraction with bounded "
            "activity-overlap penalty"
        ),
        "candidate_confidence_method": (
            "mission-aware: discrete controls rank exact bits; numeric sensors "
            "rank exact byte fields against marker-declared levels"
        ),
        "quick_id": {
            "boolean_method": QUICK_ID_BIT_FIRST_METHOD,
            "ordinal_method": QUICK_ID_ORDINAL_FIELD_METHOD,
            "continuous_method": QUICK_ID_CONTINUOUS_FIELD_METHOD,
            "enum_method": QUICK_ID_ENUM_FIELD_METHOD,
            "digital_ranking_unit": "can_id + byte_index + bit_index",
            "field_ranking_unit": "can_id + start_byte + width + endianness + signedness",
            "outside_action_changes": "direct score penalty",
            "marker_contract": (
                "analyzer_profile + expected_value + expected_unit + "
                "expected_direction + return_value + hold_ms"
            ),
            "aggregate_fallback": QUICK_ID_FALLBACK_METHOD,
        },
        "confidence_semantics": CONFIDENCE_SEMANTICS,
        "marker_selection": {
            "target_windows": "post-marker windows from explicit action_start/action markers only",
            "control_markers": (
                "baseline/countdown/capture/step markers are retained as "
                "controls but excluded from correlation"
            ),
            "legacy_fallback": (
                "unknown marker types are used only when no explicit action "
                "markers exist"
            ),
        },
        "frame_limit_strategy": (
            "all frames when within limit; otherwise contiguous action-marker "
            "strata plus an initial control stratum, with no cross-segment "
            "transitions"
        ),
        "report_storage": "replace latest ai_analysis report per session",
        "session_integrity": {
            "analysis_requires": "capture_status=finalized",
            "timestamp_authority": "server only",
            "browser_timestamps": "ignored for persisted markers",
        },
        "byte_role_detection": {
            "automatic": True,
            "roles": [
                "constant", "rolling_counter", "checksum_candidate",
                "periodic_or_state_bits", "payload_or_noise"
            ],
            "checksum_semantics": "candidate only; requires validation",
        },
        "default_marker_window_ms": DEFAULT_MARKER_WINDOW_MS,
        "vector_memory": {
            "storage": True,
            "retrieval": True,
            "schema_version": VECTOR_MEMORY_SCHEMA_VERSION,
            "limit": VECTOR_MEMORY_LIMIT,
            "minimum_similarity": VECTOR_MEMORY_MIN_SIMILARITY,
            "scope": (
                "same vehicle + mission + capture kind + analysis mode + "
                "embedding model; exact interface/mode preferred"
            ),
            "confidence_influence": False,
            "usage": "LLM context and transparent historical support only",
        },
        "supervised_ml": ml_configuration(),
    }


async def load_analysis_frame_rows(
    conn: Any,
    *,
    session_id: UUID,
    max_frames: int,
    markers: list[dict[str, Any]],
    marker_window_ms: int,
    analysis_mode: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Load a bounded but temporally representative frame set.

    Full sessions are unchanged. Truncated target sessions prioritize contiguous
    pre/action/post slices around every explicit action marker plus an initial
    control slice. Baseline/no-marker sessions use four contiguous time strata.
    """
    total_frames = int(
        await conn.fetchval(
            """
            SELECT COUNT(*)::bigint
            FROM can_frames_raw
            WHERE session_id = $1
            """,
            session_id,
        )
        or 0
    )

    context: dict[str, Any] = {
        "total_frames": total_frames,
        "max_frames": max_frames,
        "truncated": total_frames > max_frames,
        "selected_frames": 0,
        "strategy": "all_frames",
        "segment_count": 1,
        "transition_rule": "adjacent frames within the same selected segment",
    }

    if total_frames <= max_frames:
        rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
            ORDER BY timestamp_ms ASC, id ASC
            """,
            session_id,
        )
        items = [dict(row) for row in rows]
        for item in items:
            item["_segment_id"] = 0
        context["selected_frames"] = len(items)
        return items, context

    baseline_mode = is_baseline_mode(analysis_mode)
    action_markers, marker_context = select_analysis_markers(
        markers,
        baseline_mode=baseline_mode,
    )

    async def fetch_phase(
        *,
        start_ms: int,
        end_ms: int,
        limit: int,
        segment_id: int,
        descending: bool = False,
    ) -> list[dict[str, Any]]:
        if limit <= 0 or end_ms < start_ms:
            return []
        direction = "DESC" if descending else "ASC"
        rows = await conn.fetch(
            f"""
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
              AND timestamp_ms BETWEEN $2 AND $3
            ORDER BY timestamp_ms {direction}, id {direction}
            LIMIT $4
            """,
            session_id,
            int(start_ms),
            int(end_ms),
            int(limit),
        )
        items = [dict(row) for row in rows]
        if descending:
            items.reverse()
        for item in items:
            item["_segment_id"] = segment_id
        return items

    selected_action: dict[int, dict[str, Any]] = {}
    selected_control: dict[int, dict[str, Any]] = {}

    if action_markers:
        target_budget = max(1, int(max_frames * 0.85))
        control_budget = max_frames - target_budget
        per_marker_budget = max(
            3,
            target_budget // max(len(action_markers), 1),
        )

        for marker_index, marker in enumerate(action_markers, start=1):
            marker_time = int(marker.get("timestamp_ms") or 0)
            pre_budget = max(1, per_marker_budget // 4)
            action_budget = max(1, (per_marker_budget * 3) // 8)
            post_budget = max(
                1,
                per_marker_budget - pre_budget - action_budget,
            )

            phase_rows = []
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time - marker_window_ms,
                    end_ms=marker_time - 1,
                    limit=pre_budget,
                    segment_id=(marker_index * 3) - 2,
                    descending=True,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time,
                    end_ms=marker_time + marker_window_ms,
                    limit=action_budget,
                    segment_id=(marker_index * 3) - 1,
                )
            )
            phase_rows.extend(
                await fetch_phase(
                    start_ms=marker_time + marker_window_ms + 1,
                    end_ms=marker_time + (2 * marker_window_ms),
                    limit=post_budget,
                    segment_id=marker_index * 3,
                )
            )

            for item in phase_rows:
                selected_action.setdefault(int(item["id"]), item)

        first_action_time = min(
            int(marker.get("timestamp_ms") or 0)
            for marker in action_markers
        )
        control_rows = await conn.fetch(
            """
            SELECT id, timestamp_ms, can_id, dlc, data
            FROM can_frames_raw
            WHERE session_id = $1
              AND timestamp_ms < $2
            ORDER BY timestamp_ms DESC, id DESC
            LIMIT $3
            """,
            session_id,
            first_action_time,
            control_budget,
        )
        control_items = [dict(row) for row in control_rows]
        control_items.reverse()
        for item in control_items:
            item["_segment_id"] = 0
            selected_control.setdefault(int(item["id"]), item)

        ordered_action = sorted(
            selected_action.values(),
            key=lambda item: (item["timestamp_ms"], item["id"]),
        )
        ordered_control = sorted(
            (
                item
                for frame_id, item in selected_control.items()
                if frame_id not in selected_action
            ),
            key=lambda item: (item["timestamp_ms"], item["id"]),
        )

        selected = ordered_action[:target_budget]
        remaining = max_frames - len(selected)
        selected.extend(ordered_control[-remaining:] if remaining > 0 else [])
        selected.sort(key=lambda item: (item["timestamp_ms"], item["id"]))

        context.update({
            "strategy": "action_marker_stratified",
            "selected_frames": len(selected),
            "segment_count": (len(action_markers) * 3) + (1 if ordered_control else 0),
            "action_marker_count": len(action_markers),
            "control_frame_budget": control_budget,
            "action_frame_budget": target_budget,
            "marker_selection": marker_context,
            "warning": (
                "Session exceeded the frame limit. Candidate activity and "
                "frequency are calculated only from selected contiguous "
                "segments; no transitions cross segment boundaries."
            ),
        })
        return selected, context

    bounds = await conn.fetchrow(
        """
        SELECT
            MIN(timestamp_ms)::bigint AS min_timestamp_ms,
            MAX(timestamp_ms)::bigint AS max_timestamp_ms
        FROM can_frames_raw
        WHERE session_id = $1
        """,
        session_id,
    )
    min_timestamp = int(bounds["min_timestamp_ms"] or 0)
    max_timestamp = int(bounds["max_timestamp_ms"] or min_timestamp)
    stratum_count = 4
    per_stratum = max(1, max_frames // stratum_count)
    duration = max(max_timestamp - min_timestamp + 1, 1)

    selected: list[dict[str, Any]] = []
    for stratum_index in range(stratum_count):
        start_ms = min_timestamp + (duration * stratum_index) // stratum_count
        end_ms = (
            max_timestamp
            if stratum_index == stratum_count - 1
            else min_timestamp
            + (duration * (stratum_index + 1)) // stratum_count
            - 1
        )
        selected.extend(
            await fetch_phase(
                start_ms=start_ms,
                end_ms=end_ms,
                limit=per_stratum,
                segment_id=stratum_index,
            )
        )

    selected = selected[:max_frames]
    selected.sort(key=lambda item: (item["timestamp_ms"], item["id"]))
    context.update({
        "strategy": "time_stratified_contiguous",
        "selected_frames": len(selected),
        "segment_count": stratum_count,
        "action_marker_count": 0,
        "marker_selection": marker_context,
        "warning": (
            "Session exceeded the frame limit and had no explicit action "
            "markers. Four contiguous time strata were analyzed."
        ),
    })
    return selected, context
