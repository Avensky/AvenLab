"""Capture / identity: see this folder's README.md for ownership and editing examples."""
from __future__ import annotations

from .shared import (
    Any,
    Dict,
    Optional,
    SLUG_RE,
    StartSessionRequest,
    fetch,
    fetchrow,
    json,
    jsonb_dumps,
)

def slugify(value: str) -> str:
    slug = SLUG_RE.sub("-", value.strip().lower()).strip("-")
    return slug or "custom-vehicle"


def json_object(value: Any) -> Dict[str, Any]:
    """Normalize asyncpg json/jsonb values to a plain dictionary."""
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


def vehicle_payload_value(payload: StartSessionRequest, *keys: str) -> Any:
    for key in keys:
        if key in payload.vehicle and payload.vehicle[key] not in (None, ""):
            return payload.vehicle[key]
        if key in payload.metadata and payload.metadata[key] not in (None, ""):
            return payload.metadata[key]
    return None


def normalized_vehicle_payload(payload: StartSessionRequest) -> Dict[str, Any]:
    raw_name = vehicle_payload_value(payload, "displayName", "display_name", "name")
    raw_slug = payload.vehicle_slug or vehicle_payload_value(payload, "slug", "vehicle_slug", "id")

    make = vehicle_payload_value(payload, "make", "manufacturer")
    model = vehicle_payload_value(payload, "model")

    if not raw_slug:
        raw_slug = " ".join(str(part) for part in [make, model, raw_name] if part)

    slug = slugify(str(raw_slug or "custom-vehicle"))
    display_name = str(raw_name or " ".join(str(part) for part in [make, model] if part) or slug)

    year_value = vehicle_payload_value(payload, "year")
    try:
        year = int(year_value) if year_value not in (None, "") else None
    except (TypeError, ValueError):
        year = None

    dataset_kind = vehicle_payload_value(payload, "datasetKind", "dataset_kind") or "practice"
    notes = vehicle_payload_value(payload, "notes", "description")

    # vehicles.make and vehicles.model are NOT NULL in schema.sql.
    safe_make = str(make or "Custom")
    safe_model = str(model or display_name or slug)

    metadata = {
        "source": "auto-vehicle-upsert",
        "display_name": display_name,
        "dataset_kind": dataset_kind,
        "notes": notes,
        "frontend_vehicle": payload.vehicle,
        "session_metadata_vehicle": {
            key: value
            for key, value in payload.metadata.items()
            if key.startswith("vehicle") or key in {"dataset_kind", "datasetKind"}
        },
    }

    return {
        "slug": slug,
        "year": year,
        "make": safe_make,
        "model": safe_model,
        "trim": vehicle_payload_value(payload, "trim"),
        "alias": vehicle_payload_value(payload, "alias") or vehicle_payload_value(payload, "name"),
        "vin": vehicle_payload_value(payload, "vin"),
        "metadata": metadata,
    }


async def ensure_vehicle(payload: StartSessionRequest) -> Dict[str, Any]:
    vehicle = normalized_vehicle_payload(payload)
    row = await fetchrow(
        """
        INSERT INTO vehicles (slug, year, make, model, trim, alias, vin, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (slug) DO UPDATE
        SET
            year = COALESCE(EXCLUDED.year, vehicles.year),
            make = COALESCE(NULLIF(EXCLUDED.make, ''), vehicles.make),
            model = COALESCE(NULLIF(EXCLUDED.model, ''), vehicles.model),
            trim = COALESCE(EXCLUDED.trim, vehicles.trim),
            alias = COALESCE(EXCLUDED.alias, vehicles.alias),
            vin = COALESCE(EXCLUDED.vin, vehicles.vin),
            metadata = vehicles.metadata || EXCLUDED.metadata
        RETURNING id, slug, year, make, model, trim, alias, vin, metadata
        """,
        vehicle["slug"],
        vehicle["year"],
        vehicle["make"],
        vehicle["model"],
        vehicle["trim"],
        vehicle["alias"],
        vehicle["vin"],
        jsonb_dumps(vehicle["metadata"]),
    )
    return dict(row)


async def ensure_recon_mission(vehicle_id: str, payload: StartSessionRequest) -> Optional[Dict[str, Any]]:
    if not payload.mission_code:
        return None

    mission_metadata = {
        "source": "auto-mission-upsert",
        "rank": payload.metadata.get("rank"),
        "category": payload.metadata.get("category"),
        "difficulty": payload.metadata.get("difficulty"),
        "recording_stage": payload.metadata.get("recording_stage"),
        "default_timing": payload.metadata.get("default_timing"),
        "frontend_metadata": payload.metadata,
    }

    title = payload.label or payload.metadata.get("mission_title") or payload.mission_code
    target = payload.metadata.get("target") or title
    description = payload.metadata.get("description")

    row = await fetchrow(
        """
        INSERT INTO recon_missions (
            vehicle_id,
            mission_code,
            title,
            target,
            status,
            description,
            metadata
        )
        VALUES ($1, $2, $3, $4, 'READY', $5, $6::jsonb)
        ON CONFLICT (vehicle_id, mission_code) DO UPDATE
        SET
            title = COALESCE(NULLIF(EXCLUDED.title, ''), recon_missions.title),
            target = COALESCE(NULLIF(EXCLUDED.target, ''), recon_missions.target),
            description = COALESCE(EXCLUDED.description, recon_missions.description),
            metadata = recon_missions.metadata || EXCLUDED.metadata
        RETURNING id, mission_code, title, target
        """,
        vehicle_id,
        payload.mission_code,
        title,
        target,
        description,
        jsonb_dumps(mission_metadata),
    )
    return dict(row) if row else None


def optional_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return None
    return None


async def recon_step_columns() -> set[str]:
    rows = await fetch(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'recon_steps'
        """
    )
    return {str(row["column_name"]) for row in rows}


async def upsert_recon_step(
    mission_id: str,
    step_payload: Dict[str, Any],
    *,
    sort_order: int,
    columns: set[str],
) -> Optional[str]:
    step_code = str(step_payload.get("step_code") or "").strip()
    if not step_code or "mission_id" not in columns or "step_code" not in columns:
        return None

    label = str(
        step_payload.get("label")
        or step_payload.get("action_text")
        or step_code
    )
    metadata = json_object(step_payload.get("metadata"))
    metadata = {
        **metadata,
        "source": "signal-recon-session-start",
        "frontend_step": step_payload,
    }
    values_by_column: dict[str, Any] = {
        "mission_id": mission_id,
        "step_code": step_code,
        "label": label,
        "title": label,
        "instruction": step_payload.get("instruction"),
        "action_text": step_payload.get("action_text"),
        "sort_order": sort_order,
        "baseline_ms": optional_int(step_payload.get("baseline_ms")),
        "countdown_ms": optional_int(step_payload.get("countdown_ms")),
        "action_ms": optional_int(step_payload.get("action_ms")),
        "capture_ms": optional_int(step_payload.get("capture_ms")),
        "metadata": jsonb_dumps(metadata),
    }

    existing = await fetchrow(
        """
        SELECT id
        FROM recon_steps
        WHERE mission_id = $1 AND step_code = $2
        """,
        mission_id,
        step_code,
    )

    usable_columns = [
        column
        for column, value in values_by_column.items()
        if column in columns and value is not None
    ]
    if existing:
        update_columns = [
            column
            for column in usable_columns
            if column not in {"mission_id", "step_code"}
        ]
        if not update_columns:
            return str(existing["id"])
        assignments = []
        args: list[Any] = [existing["id"]]
        for column in update_columns:
            args.append(values_by_column[column])
            placeholder = f"${len(args)}"
            if column == "metadata":
                placeholder += "::jsonb"
            assignments.append(f"{column} = {placeholder}")
        row = await fetchrow(
            f"""
            UPDATE recon_steps
            SET {', '.join(assignments)}
            WHERE id = $1
            RETURNING id
            """,
            *args,
        )
        return str(row["id"]) if row else str(existing["id"])

    insert_columns = usable_columns
    placeholders = []
    args = []
    for column in insert_columns:
        args.append(values_by_column[column])
        placeholder = f"${len(args)}"
        if column == "metadata":
            placeholder += "::jsonb"
        placeholders.append(placeholder)
    row = await fetchrow(
        f"""
        INSERT INTO recon_steps ({', '.join(insert_columns)})
        VALUES ({', '.join(placeholders)})
        RETURNING id
        """,
        *args,
    )
    return str(row["id"]) if row else None


async def ensure_recon_steps(
    mission_id: Optional[str],
    payload: StartSessionRequest,
) -> int:
    if not mission_id:
        return 0
    steps = payload.metadata.get("mission_steps")
    if not isinstance(steps, list):
        return 0
    try:
        columns = await recon_step_columns()
        count = 0
        for index, raw_step in enumerate(steps):
            if not isinstance(raw_step, dict):
                continue
            step_id = await upsert_recon_step(
                mission_id,
                raw_step,
                sort_order=index,
                columns=columns,
            )
            if step_id:
                count += 1
        return count
    except Exception as exc:
        print(f"[can_router] recon_step_upsert_failed mission_id={mission_id} error={exc}")
        return 0


async def ensure_marker_step(
    mission_id: Optional[str],
    step_code: Optional[str],
    label: Optional[str],
    metadata: Dict[str, Any],
) -> Optional[str]:
    if not mission_id or not step_code:
        return None
    try:
        columns = await recon_step_columns()
        return await upsert_recon_step(
            mission_id,
            {
                "step_code": step_code,
                "label": label or step_code,
                "instruction": metadata.get("instruction"),
                "action_text": metadata.get("action_text"),
                "baseline_ms": None,
                "countdown_ms": None,
                "action_ms": metadata.get("planned_duration_ms"),
                "capture_ms": None,
                "metadata": metadata.get("step_metadata") or metadata,
            },
            sort_order=0,
            columns=columns,
        )
    except Exception as exc:
        print(f"[can_router] marker_step_upsert_failed mission_id={mission_id} step_code={step_code} error={exc}")
        return None
