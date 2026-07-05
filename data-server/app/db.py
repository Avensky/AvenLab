# data-server/app/db.py
import json
import os
from contextlib import asynccontextmanager
from typing import Any

import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://localhost/avenlab_data",
)

_pool: asyncpg.Pool | None = None


def jsonb_dumps(value: Any) -> str:
    """Encode values safely for $n::jsonb asyncpg parameters."""
    return json.dumps(value or {}, separators=(",", ":"), sort_keys=True)


def safe_database_url() -> str:
    """Return DATABASE_URL with password masked for health output."""
    if "@" not in DATABASE_URL or ":" not in DATABASE_URL.split("@", 1)[0]:
        return DATABASE_URL
    prefix, suffix = DATABASE_URL.split("@", 1)
    scheme_and_user = prefix.rsplit(":", 1)[0]
    return f"{scheme_and_user}:***@{suffix}"


async def connect_db():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    return _pool


async def close_db():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def transaction():
    pool = await connect_db()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def fetch(query: str, *args):
    pool = await connect_db()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    pool = await connect_db()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args):
    pool = await connect_db()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args):
    pool = await connect_db()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


REQUIRED_TABLES = [
    "vehicles",
    "recon_missions",
    "recon_steps",
    "can_sessions",
    "can_session_markers",
    "can_frames_raw",
    "can_frames_decoded",
    "session_reports",
]


async def check_database() -> dict[str, Any]:
    try:
        pool = await connect_db()
    except Exception as exc:
        return {
            "ok": False,
            "error": "database_connection_failed",
            "detail": str(exc),
            "database_url": safe_database_url(),
        }

    async with pool.acquire() as conn:
        version = await conn.fetchval("SHOW server_version")
        database = await conn.fetchval("SELECT current_database()")
        user = await conn.fetchval("SELECT current_user")
        now = await conn.fetchval("SELECT NOW()")

        extensions = await conn.fetch(
            """
            SELECT extname
            FROM pg_extension
            WHERE extname IN ('pgcrypto', 'vector')
            ORDER BY extname
            """
        )

        table_rows = await conn.fetch(
            """
            SELECT name, to_regclass('public.' || name) IS NOT NULL AS exists
            FROM unnest($1::text[]) AS name
            ORDER BY name
            """,
            REQUIRED_TABLES,
        )

        missing = [row["name"] for row in table_rows if not row["exists"]]

        counts: dict[str, int] = {}
        for table in REQUIRED_TABLES:
            if table not in missing:
                counts[table] = await conn.fetchval(f"SELECT COUNT(*) FROM {table}")

        vehicle = None
        if "vehicles" not in missing:
            vehicle = await conn.fetchrow(
                "SELECT id, slug, year, make, model FROM vehicles WHERE slug = $1",
                "2015-scion-frs",
            )

    return {
        "ok": len(missing) == 0,
        "database_url": safe_database_url(),
        "database": database,
        "user": user,
        "server_version": version,
        "now": now.isoformat() if now else None,
        "extensions": [row["extname"] for row in extensions],
        "required_tables": {row["name"]: bool(row["exists"]) for row in table_rows},
        "missing_tables": missing,
        "counts": counts,
        "seed_vehicle": dict(vehicle) if vehicle else None,
    }

async def smoke_test_database(persist: bool = False) -> dict[str, Any]:
    """
    Validates write paths for vehicles -> sessions -> markers -> raw frames ->
    decoded frames -> reports. By default it rolls back, so deploy checks do not
    leave junk data behind.
    """
    pool = await connect_db()
    async with pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        try:
            vehicle = await conn.fetchrow(
                """
                INSERT INTO vehicles (slug, year, make, model, trim, alias, metadata)
                VALUES (
                    '2015-scion-frs',
                    2015,
                    'Scion',
                    'FR-S',
                    'Manual',
                    'FRS',
                    $1::jsonb
                )
                ON CONFLICT (slug) DO UPDATE
                SET metadata = vehicles.metadata || EXCLUDED.metadata
                RETURNING id, slug
                """,
                jsonb_dumps({"smoke_test_vehicle_seen": True}),
            )

            session = await conn.fetchrow(
                """
                INSERT INTO can_sessions (
                    vehicle_id,
                    mission_id,
                    label,
                    bus_interface,
                    bus_mode,
                    metadata
                )
                VALUES ($1, NULL, $2, $3, $4, $5::jsonb)
                RETURNING id, started_at
                """,
                vehicle["id"],
                "DB smoke test session",
                "can2",
                "listen-only",
                jsonb_dumps({"smoke_test": True, "persist": persist}),
            )

            marker = await conn.fetchrow(
                """
                INSERT INTO can_session_markers (
                    session_id,
                    mission_id,
                    step_id,
                    marker_type,
                    label,
                    timestamp_ms,
                    metadata
                )
                VALUES ($1, NULL, NULL, $2, $3, $4, $5::jsonb)
                RETURNING id, created_at
                """,
                session["id"],
                "action_start",
                "DB smoke marker",
                1234,
                jsonb_dumps({"smoke_test": True}),
            )

            raw = await conn.fetchrow(
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
                RETURNING id, can_id_hex
                """,
                session["id"],
                1250,
                1.25,
                0x322,
                "0x322",
                8,
                bytes.fromhex("0200000000000000"),
                "can2",
                jsonb_dumps({
                    "smoke_test": True,
                    "signal_name": "unlock",
                    "decoded": "unlock via smoke test",
                }),
            )

            decoded = await conn.fetchrow(
                """
                INSERT INTO can_frames_decoded (
                    raw_frame_id,
                    session_id,
                    signal_id,
                    signal_name,
                    decoded_value,
                    numeric_value,
                    metadata
                )
                VALUES ($1, $2, NULL, $3, $4, $5, $6::jsonb)
                RETURNING id
                """,
                raw["id"],
                session["id"],
                "unlock",
                "unlock via smoke test",
                1.0,
                jsonb_dumps({"smoke_test": True}),
            )

            report = await conn.fetchrow(
                """
                INSERT INTO session_reports (
                    session_id,
                    report_type,
                    title,
                    content,
                    metadata
                )
                VALUES ($1, $2, $3, $4, $5::jsonb)
                RETURNING id
                """,
                session["id"],
                "smoke_test",
                "DB smoke test report",
                "session + marker + raw frame + decoded frame write path OK",
                jsonb_dumps({"smoke_test": True}),
            )

            result = {
                "ok": True,
                "persisted": persist,
                "vehicle_id": str(vehicle["id"]),
                "session_id": str(session["id"]),
                "marker_id": str(marker["id"]),
                "raw_frame_id": raw["id"],
                "decoded_frame_id": decoded["id"],
                "report_id": str(report["id"]),
            }

            if persist:
                await tx.commit()
            else:
                await tx.rollback()
                result["rolled_back"] = True

            return result
        except Exception:
            await tx.rollback()
            raise
