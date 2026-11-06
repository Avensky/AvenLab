#!/usr/bin/env python3
"""Non-destructive, one-time social.json -> SQLite staging migration.

The Rust process is NOT switched to this DB by this script. Stop the server,
take a backup and run once. It refuses to overwrite an existing database and
preserves only already-hashed player credentials (no guest token plaintext).
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]


def pack(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(os.getenv("AVENLAB_SOCIAL_PATH", str(ROOT / "avenlab-server/runtime/social.json"))))
    parser.add_argument("--database", type=Path, default=ROOT / "avenlab-server/runtime/avenlab.sqlite3")
    args = parser.parse_args()
    source = args.source.resolve()
    database = args.database.resolve()
    if not source.is_file():
        parser.error(f"No social state found at {source}")
    if source.stat().st_size > 32 * 1024 * 1024:
        parser.error("Source exceeds AvenLab's social-state limit")
    if database.exists():
        parser.error(f"Database already exists at {database}; no overwrite attempted")
    data = json.loads(source.read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("profiles"), dict):
        parser.error("Unsupported social-state version")
    database.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(database)
    try:
        db.executescript((ROOT / "docs/database/001_init.sql").read_text(encoding="utf-8"))
        with db:
            for identity, profile in data["profiles"].items():
                token_hash = profile.get("token_hash")
                if not isinstance(token_hash, str) or not token_hash:
                    raise ValueError(f"Missing hashed credential for profile {identity}")
                db.execute("INSERT INTO profiles VALUES (?,?,?,?,?)", (
                    identity, profile["name"], token_hash,
                    pack(profile.get("progression", {})), pack(profile.get("friends", []))))
            for world_id, world in data.get("worlds", {}).items():
                db.execute("INSERT INTO worlds VALUES (?,?,?)", (
                    int(world_id), world.get("owner_id"), pack(world)))
            for map_id, document in data.get("saved_maps", {}).items():
                db.execute("INSERT INTO editor_maps(map_id,document_json) VALUES (?,?)", (map_id, pack(document)))
            for vehicle_id, tuning in data.get("vehicle_defaults", {}).items():
                db.execute("INSERT INTO vehicle_defaults(vehicle_id,tuning_json) VALUES (?,?)", (vehicle_id, pack(tuning)))
            db.execute("INSERT INTO social_snapshot VALUES (1,?,?,?,?,?,?)", (
                data.get("server_id", ""), data.get("next_world", 1),
                pack(data.get("groups", {})), pack(data.get("friend_requests", [])),
                pack(data.get("world_invites", [])), pack(data.get("completed_results", []))))
        db.execute("PRAGMA quick_check")
    except Exception:
        db.close()
        # An incomplete first import has no value; preserve it under a clearly
        # identified filename for inspection instead of overwriting anything.
        print(f"Import did not finish. Inspect or remove the new staging DB at {database}", file=sys.stderr)
        raise
    else:
        db.close()
    if os.name == "posix":
        os.chmod(database, 0o600)
    print(f"Created staging database: {database}")
    print(f"Profiles: {len(data['profiles'])}; worlds: {len(data.get('worlds', {}))}; saved maps: {len(data.get('saved_maps', {}))}")
    print("Existing social.json is unchanged. The Rust server continues to use it until a later database cutover.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
