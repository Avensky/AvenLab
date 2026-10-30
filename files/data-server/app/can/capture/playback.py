"""Capture / playback: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .identity import (
    json_object,
)
from .shared import (
    Any,
    Dict,
    HTTPException,
    IS_PRODUCTION,
    Optional,
    RUNTIME_ENV,
    UUID,
    fetch,
    fetchrow,
    re,
    router,
)
from .simulation import (
    frame,
)

def parse_can_id_filter(raw: Optional[str]) -> list[int]:
    if not raw or not raw.strip():
        return []

    parsed: list[int] = []
    for token in re.split(r"[\s,;]+", raw.strip()):
        if not token:
            continue
        try:
            value = int(token, 16) if token.lower().startswith("0x") else int(token, 10)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid CAN ID filter token: {token!r}",
            ) from exc
        if value < 0 or value > 0x1FFFFFFF:
            raise HTTPException(
                status_code=422,
                detail=f"CAN ID filter is outside the valid range: {token!r}",
            )
        parsed.append(value)
    return sorted(set(parsed))


def parse_byte_value_filter(raw: Optional[str]) -> Optional[int]:
    if raw is None or not raw.strip():
        return None

    token = raw.strip().lower()
    try:
        if token.startswith("0x"):
            value = int(token, 16)
        elif re.search(r"[a-f]", token):
            value = int(token, 16)
        else:
            value = int(token, 10)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid byte value filter: {raw!r}",
        ) from exc

    if value < 0 or value > 255:
        raise HTTPException(
            status_code=422,
            detail="Byte value filter must be between 0 and 255.",
        )
    return value


def playback_filter_cte(
    *,
    session_id: UUID,
    tolerance_ms: int,
    id_filter: Optional[str],
    search: Optional[str],
    byte_index: Optional[int],
    byte_value: Optional[str],
    deltas_only: bool,
    byte_changed_only: bool,
) -> tuple[str, list[Any]]:
    can_ids = parse_can_id_filter(id_filter)
    parsed_byte_value = parse_byte_value_filter(byte_value)

    params: list[Any] = [session_id, tolerance_ms]
    conditions: list[str] = []
    ordered_conditions: list[str] = ["session_id = $1"]

    def add_param(value: Any) -> str:
        params.append(value)
        return f"${len(params)}"

    if can_ids:
        placeholder = add_param(can_ids)
        conditions.append(f"can_id = ANY({placeholder}::bigint[])")
        # Restrict the LAG window to pinned IDs as well. LAG is partitioned by
        # CAN ID, so this preserves previous-byte semantics while avoiding a
        # full-session window scan when Top IDs opens selected candidates.
        ordered_conditions.append(
            f"can_id = ANY({placeholder}::bigint[])"
        )

    if byte_index is not None:
        byte_position = add_param(byte_index)
        byte_exists = f"{byte_position} < octet_length(data)"
        conditions.append(byte_exists)

        if parsed_byte_value is not None:
            value_placeholder = add_param(parsed_byte_value)
            conditions.append(
                f"get_byte(data, {byte_position}) = {value_placeholder}"
            )

        if byte_changed_only:
            conditions.append(
                "previous_data IS NOT NULL AND "
                f"{byte_position} < octet_length(previous_data) AND "
                f"get_byte(data, {byte_position}) "
                f"IS DISTINCT FROM get_byte(previous_data, {byte_position})"
            )
    elif parsed_byte_value is not None:
        value_placeholder = add_param(parsed_byte_value)
        conditions.append(
            "EXISTS ("
            "SELECT 1 FROM generate_series(0, octet_length(data) - 1) AS byte_pos "
            f"WHERE get_byte(data, byte_pos) = {value_placeholder}"
            ")"
        )

    if deltas_only:
        conditions.append("previous_data IS NOT NULL AND data IS DISTINCT FROM previous_data")

    normalized_search = (search or "").strip()
    if normalized_search:
        search_like = add_param(f"%{normalized_search.upper()}%")
        search_conditions = [
            f"UPPER(can_id_hex) LIKE {search_like}",
            f"can_id::text LIKE {search_like}",
            f"UPPER(encode(data, 'hex')) LIKE {search_like}",
        ]
        numeric_search: Optional[int] = None
        try:
            lowered = normalized_search.lower()
            if lowered.startswith("0x"):
                numeric_search = int(lowered, 16)
            elif re.fullmatch(r"\d+", lowered):
                numeric_search = int(lowered, 10)
        except ValueError:
            numeric_search = None

        if numeric_search is not None:
            numeric_placeholder = add_param(numeric_search)
            search_conditions.append(f"can_id = {numeric_placeholder}")
            if 0 <= numeric_search <= 255:
                search_conditions.append(
                    "EXISTS ("
                    "SELECT 1 FROM generate_series(0, octet_length(data) - 1) AS byte_pos "
                    f"WHERE get_byte(data, byte_pos) = {numeric_placeholder}"
                    ")"
                )
        conditions.append("(" + " OR ".join(search_conditions) + ")")

    where_clause = " AND ".join(conditions) if conditions else "TRUE"
    cte = f"""
        WITH ordered AS (
            SELECT
                id,
                timestamp_ms,
                can_id,
                can_id_hex,
                dlc,
                data,
                source,
                metadata,
                LAG(data) OVER (
                    PARTITION BY can_id
                    ORDER BY timestamp_ms ASC, id ASC
                ) AS previous_data
            FROM can_frames_raw
            WHERE {" AND ".join(ordered_conditions)}
        ),
        filtered AS (
            SELECT
                *,
                (timestamp_ms / $2::bigint) * $2::bigint AS bucket_ms
            FROM ordered
            WHERE {where_clause}
        )
    """
    return cte, params


@router.get("/session/{session_id}/playback/meta")
async def get_session_playback_meta(session_id: UUID) -> Dict[str, Any]:
    session = await fetchrow(
        """
        SELECT id, label, bus_interface, bus_mode, capture_status,
               started_at, ended_at, finalized_at, final_frame_count,
               final_marker_count, capture_quality
        FROM can_sessions
        WHERE id = $1
        """,
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    stats = await fetchrow(
        """
        SELECT
            COUNT(*)::bigint AS frame_count,
            COUNT(DISTINCT can_id)::int AS distinct_ids,
            ARRAY_AGG(DISTINCT can_id ORDER BY can_id) AS observed_ids,
            MIN(timestamp_ms)::bigint AS first_timestamp_ms,
            MAX(timestamp_ms)::bigint AS last_timestamp_ms
        FROM can_frames_raw
        WHERE session_id = $1
        """,
        session_id,
    )

    marker_rows = await fetch(
        """
        SELECT
            csm.id,
            csm.timestamp_ms,
            csm.marker_type,
            csm.label,
            csm.metadata,
            COALESCE(rs.step_code, csm.metadata->>'step_code') AS step_code,
            COALESCE(rm.mission_code, csm.metadata->>'mission_code') AS mission_code
        FROM can_session_markers csm
        LEFT JOIN recon_steps rs ON rs.id = csm.step_id
        LEFT JOIN recon_missions rm ON rm.id = csm.mission_id
        WHERE csm.session_id = $1
        ORDER BY csm.timestamp_ms ASC, csm.id ASC
        """,
        session_id,
    )
    markers = [
        {
            "id": str(row["id"]),
            "timestamp_ms": int(row["timestamp_ms"] or 0),
            "marker_type": str(row["marker_type"] or "unknown"),
            "label": row["label"],
            "step_code": row["step_code"],
            "mission_code": row["mission_code"],
            "metadata": json_object(row["metadata"]),
        }
        for row in marker_rows
    ]

    return {
        "ok": True,
        "session_id": str(session_id),
        "label": session["label"],
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "capture_status": session["capture_status"],
        "started_at": session["started_at"],
        "ended_at": session["ended_at"],
        "finalized_at": session["finalized_at"],
        "final_frame_count": int(session["final_frame_count"] or 0),
        "final_marker_count": int(session["final_marker_count"] or 0),
        "capture_quality": json_object(session["capture_quality"]),
        "frame_count": int(stats["frame_count"] or 0),
        "distinct_ids": int(stats["distinct_ids"] or 0),
        "observed_ids": [
            int(can_id)
            for can_id in (stats["observed_ids"] or [])
        ],
        "first_timestamp_ms": int(stats["first_timestamp_ms"] or 0),
        "last_timestamp_ms": int(stats["last_timestamp_ms"] or 0),
        "duration_ms": max(
            0,
            int(stats["last_timestamp_ms"] or 0)
            - int(stats["first_timestamp_ms"] or 0),
        ),
        "marker_count": len(markers),
        "markers": markers,
        "timestamp_authority": "server",
    }


@router.get("/session/{session_id}/playback")
async def get_session_playback_slices(
    session_id: UUID,
    cursor_ms: Optional[int] = None,
    direction: str = "start",
    tolerance_ms: int = 1,
    slice_limit: int = 160,
    id_filter: Optional[str] = None,
    search: Optional[str] = None,
    byte_index: Optional[int] = None,
    byte_value: Optional[str] = None,
    deltas_only: bool = False,
    byte_changed_only: bool = False,
    carry_selected: bool = False,
    include_stats: bool = True,
) -> Dict[str, Any]:
    direction = direction.strip().lower()
    if direction not in {"start", "end", "next", "prev", "nearest"}:
        raise HTTPException(
            status_code=422,
            detail="direction must be start, end, next, prev, or nearest",
        )
    tolerance_ms = max(1, min(int(tolerance_ms), 10_000))
    slice_limit = max(1, min(int(slice_limit), 500))
    if byte_index is not None and not 0 <= byte_index <= 7:
        raise HTTPException(status_code=422, detail="byte_index must be 0 through 7")

    selected_can_ids = parse_can_id_filter(id_filter)
    carry_selected = bool(carry_selected and selected_can_ids)

    session = await fetchrow(
        "SELECT id, capture_status, bus_interface, bus_mode FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    cte, params = playback_filter_cte(
        session_id=session_id,
        tolerance_ms=tolerance_ms,
        id_filter=id_filter,
        search=search,
        byte_index=byte_index,
        byte_value=byte_value,
        deltas_only=deltas_only,
        byte_changed_only=byte_changed_only,
    )

    # Initial loads and explicit seeks return full counts and timeline bounds.
    # Sequential next/previous prefetches can skip that aggregate query and
    # request one extra bucket to determine whether another page exists.
    lightweight_page = (
        not include_stats
        and direction in {"next", "prev"}
    )

    matching_frame_count: Optional[int] = None
    matching_slice_count: Optional[int] = None
    first_bucket_ms: Optional[int] = None
    last_bucket_ms: Optional[int] = None

    if not lightweight_page:
        stats_row = await fetchrow(
            cte
            + """
            SELECT
                COUNT(*)::bigint AS matching_frame_count,
                COUNT(DISTINCT bucket_ms)::bigint AS matching_slice_count,
                MIN(bucket_ms)::bigint AS first_bucket_ms,
                MAX(bucket_ms)::bigint AS last_bucket_ms
            FROM filtered
            """,
            *params,
        )

        matching_frame_count = int(stats_row["matching_frame_count"] or 0)
        matching_slice_count = int(stats_row["matching_slice_count"] or 0)
        first_bucket_ms = (
            int(stats_row["first_bucket_ms"])
            if stats_row["first_bucket_ms"] is not None
            else None
        )
        last_bucket_ms = (
            int(stats_row["last_bucket_ms"])
            if stats_row["last_bucket_ms"] is not None
            else None
        )

        if not matching_frame_count:
            return {
                "ok": True,
                "session_id": str(session_id),
                "capture_status": session["capture_status"],
                "timestamp_authority": "server",
                "tolerance_ms": tolerance_ms,
                "direction": direction,
                "stats_included": True,
                "filters": {
                    "id_filter": id_filter,
                    "search": search,
                    "byte_index": byte_index,
                    "byte_value": byte_value,
                    "deltas_only": deltas_only,
                    "byte_changed_only": byte_changed_only,
                    "carry_selected": carry_selected,
                },
                "matching_frame_count": 0,
                "matching_slice_count": 0,
                "first_bucket_ms": None,
                "last_bucket_ms": None,
                "page_frame_count": 0,
                "page_slice_count": 0,
                "has_before": False,
                "has_after": False,
                "slices": [],
            }
    elif cursor_ms is None:
        raise HTTPException(
            status_code=422,
            detail="cursor_ms is required when include_stats=false",
        )

    cursor_value = cursor_ms
    if cursor_value is None:
        cursor_value = (
            last_bucket_ms
            if direction in {"end", "prev"}
            else first_bucket_ms
        )
    assert cursor_value is not None

    # Only bind a cursor for directions that actually reference it.
    # Binding an unused positional parameter for start/end leaves PostgreSQL
    # unable to infer that parameter's type and causes an HTTP 500.
    cursor_placeholder: Optional[str] = None
    if direction in {"next", "prev", "nearest"}:
        params.append(cursor_value)
        cursor_placeholder = f"${len(params)}"

    query_slice_limit = slice_limit + 1 if lightweight_page else slice_limit
    params.append(query_slice_limit)
    limit_placeholder = f"${len(params)}"

    if direction == "start":
        bucket_selection = f"""
            SELECT DISTINCT bucket_ms
            FROM filtered
            ORDER BY bucket_ms ASC
            LIMIT {limit_placeholder}
        """
    elif direction == "end":
        bucket_selection = f"""
            SELECT bucket_ms
            FROM (
                SELECT DISTINCT bucket_ms
                FROM filtered
                ORDER BY bucket_ms DESC
                LIMIT {limit_placeholder}
            ) recent
            ORDER BY bucket_ms ASC
        """
    elif direction == "next":
        assert cursor_placeholder is not None
        bucket_selection = f"""
            SELECT DISTINCT bucket_ms
            FROM filtered
            WHERE bucket_ms > (({cursor_placeholder}::bigint / $2::bigint) * $2::bigint)
            ORDER BY bucket_ms ASC
            LIMIT {limit_placeholder}
        """
    elif direction == "prev":
        assert cursor_placeholder is not None
        bucket_selection = f"""
            SELECT bucket_ms
            FROM (
                SELECT DISTINCT bucket_ms
                FROM filtered
                WHERE bucket_ms < (({cursor_placeholder}::bigint / $2::bigint) * $2::bigint)
                ORDER BY bucket_ms DESC
                LIMIT {limit_placeholder}
            ) previous
            ORDER BY bucket_ms ASC
        """
    else:
        assert cursor_placeholder is not None
        bucket_selection = f"""
            WITH anchor AS (
                SELECT bucket_ms
                FROM (
                    SELECT DISTINCT bucket_ms
                    FROM filtered
                ) available_buckets
                ORDER BY
                    ABS(bucket_ms - {cursor_placeholder}::bigint),
                    bucket_ms ASC
                LIMIT 1
            )
            SELECT DISTINCT filtered.bucket_ms
            FROM filtered
            CROSS JOIN anchor
            WHERE filtered.bucket_ms >= anchor.bucket_ms
            ORDER BY filtered.bucket_ms ASC
            LIMIT {limit_placeholder}
        """

    rows = await fetch(
        cte
        + f"""
        , selected_buckets AS (
            {bucket_selection}
        )
        SELECT
            filtered.id,
            filtered.timestamp_ms,
            filtered.bucket_ms,
            filtered.can_id,
            filtered.can_id_hex,
            filtered.dlc,
            filtered.data,
            filtered.previous_data,
            filtered.source,
            filtered.metadata
        FROM filtered
        JOIN selected_buckets USING (bucket_ms)
        ORDER BY filtered.bucket_ms ASC,
                 filtered.timestamp_ms ASC,
                 filtered.can_id ASC,
                 filtered.id ASC
        """,
        *params,
    )

    def playback_frame_payload(
        raw_row: Any,
        *,
        bucket_override: Optional[int] = None,
    ) -> dict[str, Any]:
        row = dict(raw_row)
        data = bytes(row.get("data") or b"")
        previous_data_raw = row.get("previous_data")
        previous_data = (
            bytes(previous_data_raw)
            if previous_data_raw is not None
            else None
        )
        delta_positions = [
            index
            for index in range(max(len(data), len(previous_data or b"")))
            if (
                (data[index] if index < len(data) else None)
                != (
                    previous_data[index]
                    if previous_data is not None and index < len(previous_data)
                    else None
                )
            )
        ]
        metadata = json_object(row.get("metadata"))
        return {
            "id": int(row["id"]),
            "timestamp_ms": int(row["timestamp_ms"]),
            "bucket_ms": int(
                bucket_override
                if bucket_override is not None
                else row.get("bucket_ms", row["timestamp_ms"])
            ),
            "can_id": int(row["can_id"]),
            "can_id_hex": row["can_id_hex"],
            "dlc": int(row["dlc"]),
            "data_hex": data.hex().upper(),
            "bytes": list(data),
            "previous_data_hex": (
                previous_data.hex().upper()
                if previous_data is not None
                else None
            ),
            "previous_bytes": (
                list(previous_data)
                if previous_data is not None
                else None
            ),
            "delta_positions": delta_positions,
            "changed": bool(delta_positions),
            "signal_name": metadata.get("signal_name"),
            "decoded": metadata.get("decoded"),
            "source": row.get("source"),
            "observed_in_slice": True,
            "state_carried": False,
            "state_available": True,
            "state_age_ms": 0,
        }

    slices_by_bucket: Dict[int, list[dict[str, Any]]] = {}
    for raw_row in rows:
        frame = playback_frame_payload(raw_row)
        slices_by_bucket.setdefault(frame["bucket_ms"], []).append(frame)

    slices = [
        {
            "bucket_ms": bucket_ms,
            "start_ms": min(frame["timestamp_ms"] for frame in frames),
            "end_ms": max(frame["timestamp_ms"] for frame in frames),
            "frame_count": len(frames),
            "frames": frames,
        }
        for bucket_ms, frames in sorted(slices_by_bucket.items())
    ]

    lightweight_has_before: Optional[bool] = None
    lightweight_has_after: Optional[bool] = None
    if lightweight_page:
        has_extra_bucket = len(slices) > slice_limit
        if direction == "next":
            if has_extra_bucket:
                slices = slices[:slice_limit]
            lightweight_has_before = bool(slices)
            lightweight_has_after = has_extra_bucket
        else:
            # PREV selects nearest buckets in descending order and returns them
            # ascending. The extra bucket is therefore the oldest one.
            if has_extra_bucket:
                slices = slices[1:]
            lightweight_has_before = has_extra_bucket
            lightweight_has_after = bool(slices)

    # When the UI pins selected IDs, return a second stable state lane. Each
    # slice contains exactly one row per selected ID in numeric order. IDs that
    # did not transmit in the current slice carry their last database state
    # forward with change heat disabled. The seed query makes this accurate
    # after seeks, previous-page navigation, and direct marker jumps.
    if carry_selected and selected_can_ids and slices:
        first_returned_bucket = int(slices[0]["bucket_ms"])
        seed_rows = await fetch(
            """
            WITH ordered AS (
                SELECT
                    id, timestamp_ms, can_id, can_id_hex, dlc, data, source, metadata,
                    LAG(data) OVER (
                        PARTITION BY can_id
                        ORDER BY timestamp_ms ASC, id ASC
                    ) AS previous_data
                FROM can_frames_raw
                WHERE session_id = $1
            )
            SELECT DISTINCT ON (can_id)
                id, timestamp_ms, can_id, can_id_hex, dlc, data,
                previous_data, source, metadata
            FROM ordered
            WHERE can_id = ANY($2::bigint[])
              AND timestamp_ms < $3
            ORDER BY can_id ASC, timestamp_ms DESC, id DESC
            """,
            session_id,
            selected_can_ids,
            first_returned_bucket,
        )

        state_by_id: Dict[int, dict[str, Any]] = {
            int(row["can_id"]): playback_frame_payload(
                row,
                bucket_override=first_returned_bucket,
            )
            for row in seed_rows
        }

        for slice_payload in slices:
            bucket_ms = int(slice_payload["bucket_ms"])
            latest_in_slice: Dict[int, dict[str, Any]] = {}
            for frame in slice_payload["frames"]:
                latest_in_slice[int(frame["can_id"])] = frame

            state_frames: list[dict[str, Any]] = []
            for can_id in selected_can_ids:
                current = latest_in_slice.get(can_id)
                if current is not None:
                    state_by_id[can_id] = current
                    state_frames.append(dict(current))
                    continue

                previous = state_by_id.get(can_id)
                if previous is not None:
                    carried = dict(previous)
                    carried.update({
                        "bucket_ms": bucket_ms,
                        "delta_positions": [],
                        "changed": False,
                        "observed_in_slice": False,
                        "state_carried": True,
                        "state_available": True,
                        "state_age_ms": max(
                            0,
                            bucket_ms - int(previous["timestamp_ms"]),
                        ),
                    })
                    state_frames.append(carried)
                    continue

                width = 3 if can_id <= 0x7FF else 8
                state_frames.append({
                    "id": -(can_id + 1),
                    "timestamp_ms": 0,
                    "bucket_ms": bucket_ms,
                    "can_id": can_id,
                    "can_id_hex": f"0x{can_id:0{width}X}",
                    "dlc": 0,
                    "data_hex": "",
                    "bytes": [],
                    "previous_data_hex": None,
                    "previous_bytes": None,
                    "delta_positions": [],
                    "changed": False,
                    "signal_name": None,
                    "decoded": None,
                    "source": None,
                    "observed_in_slice": False,
                    "state_carried": True,
                    "state_available": False,
                    "state_age_ms": None,
                })

            slice_payload["state_frames"] = state_frames

    returned_first = slices[0]["bucket_ms"] if slices else None
    returned_last = slices[-1]["bucket_ms"] if slices else None

    return {
        "ok": True,
        "session_id": str(session_id),
        "capture_status": session["capture_status"],
        "bus_interface": session["bus_interface"],
        "bus_mode": session["bus_mode"],
        "timestamp_authority": "server",
        "tolerance_ms": tolerance_ms,
        "direction": direction,
        "cursor_ms": cursor_value,
        "filters": {
            "id_filter": id_filter,
            "search": search,
            "byte_index": byte_index,
            "byte_value": byte_value,
            "deltas_only": deltas_only,
            "byte_changed_only": byte_changed_only,
            "carry_selected": carry_selected,
        },
        "stats_included": not lightweight_page,
        "matching_frame_count": matching_frame_count,
        "matching_slice_count": matching_slice_count,
        "first_bucket_ms": first_bucket_ms,
        "last_bucket_ms": last_bucket_ms,
        "page_frame_count": sum(
            int(slice_payload["frame_count"])
            for slice_payload in slices
        ),
        "page_slice_count": len(slices),
        "returned_first_bucket_ms": returned_first,
        "returned_last_bucket_ms": returned_last,
        "has_before": (
            bool(lightweight_has_before)
            if lightweight_page
            else bool(
                returned_first is not None
                and first_bucket_ms is not None
                and returned_first > first_bucket_ms
            )
        ),
        "has_after": (
            bool(lightweight_has_after)
            if lightweight_page
            else bool(
                returned_last is not None
                and last_bucket_ms is not None
                and returned_last < last_bucket_ms
            )
        ),
        "slices": slices,
    }


@router.get("/session/{session_id}/frames")
async def get_session_frames(session_id: str, limit: int = 250) -> Dict[str, Any]:
    limit = max(1, min(limit, 5000))
    session = await fetchrow(
        "SELECT id, bus_interface FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    rows = await fetch(
        """
        SELECT
            timestamp_ms,
            can_id_hex,
            dlc,
            upper(encode(data, 'hex')) AS data_hex,
            metadata->>'signal_name' AS signal_name,
            metadata->>'decoded' AS decoded,
            source AS bus_interface,
            metadata->>'app_env' AS app_env,
            COALESCE(metadata->>'capture_source', metadata->>'source', 'unknown') AS source
        FROM can_frames_raw
        WHERE session_id = $1
        ORDER BY timestamp_ms ASC, can_id ASC
        LIMIT $2
        """,
        session_id,
        limit,
    )

    return {
        "ok": True,
        "session_id": session_id,
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames": [dict(row) for row in rows],
    }


@router.get("/session/{session_id}/summary")
async def get_session_summary(session_id: str) -> Dict[str, Any]:
    session = await fetchrow(
        "SELECT * FROM can_sessions WHERE id = $1",
        session_id,
    )
    if not session:
        raise HTTPException(status_code=404, detail="Unknown CAN session")

    frame_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_frames_raw WHERE session_id = $1",
        session_id,
    )
    marker_count = await fetchrow(
        "SELECT COUNT(*) AS count FROM can_session_markers WHERE session_id = $1",
        session_id,
    )
    by_id = await fetch(
        """
        SELECT
            source AS bus_interface,
            can_id_hex,
            COALESCE(metadata->>'signal_name', 'unknown') AS signal_name,
            COUNT(*) AS count
        FROM can_frames_raw
        WHERE session_id = $1
        GROUP BY source, can_id_hex, COALESCE(metadata->>'signal_name', 'unknown')
        ORDER BY count DESC
        """,
        session_id,
    )

    return {
        "ok": True,
        "session": dict(session),
        "markers": marker_count["count"],
        "frames": frame_count["count"],
        "bus_interface": session["bus_interface"],
        "app_env": RUNTIME_ENV,
        "production": IS_PRODUCTION,
        "frames_by_id": [dict(row) for row in by_id],
    }
