# SQLite rollout (staged, not yet the live database)

The server currently runs with `avenlab-server/runtime/social.json` (or
`AVENLAB_SOCIAL_PATH`). This patch persists published vehicle tuning and
validated world-editor documents in that existing server-owned store, so they
survive restart and every player sees the new defaults/maps. Browser drafts
remain local until **Apply & Test Drive** completes.

The schema in `001_init.sql` is the planned normalized storage foundation:
profiles and hashed device credentials, worlds, published map revisions, and
server-wide vehicle tuning. To create a **separate, offline staging snapshot**:

1. Stop AvenLab and make a backup copy of the `social.json` file.
2. Run `python scripts/bootstrap-avenlab-db.py` from the repository root.
3. Inspect `avenlab-server/runtime/avenlab.sqlite3` with SQLite tooling.

The script deliberately refuses to overwrite an existing database. It does
not delete/alter `social.json` and **does not make SQLite authoritative yet**.
Database cutover must add transactional Rust read/write, concurrency handling,
crash recovery, migrations, and a verified rollback path before it is enabled.

Before public alpha, add administrator permissions for publishing global map
revisions and vehicle defaults; the current dedicated editor slot is a trusted
alpha-development tool, not a production role-based admin console.
