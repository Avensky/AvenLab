-- AvenLab SQLite v1 staging schema. The live Rust server still reads the
-- existing social.json until the database cutover is built and tested.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS profiles (
  profile_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  progression_json TEXT NOT NULL,
  friends_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worlds (
  world_id INTEGER PRIMARY KEY,
  owner_id TEXT REFERENCES profiles(profile_id),
  settings_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS editor_maps (
  map_id TEXT PRIMARY KEY,
  document_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS vehicle_defaults (
  vehicle_id TEXT PRIMARY KEY,
  tuning_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS social_snapshot (
  snapshot_id INTEGER PRIMARY KEY CHECK(snapshot_id=1),
  server_id TEXT NOT NULL,
  next_world INTEGER NOT NULL,
  groups_json TEXT NOT NULL,
  requests_json TEXT NOT NULL,
  world_invites_json TEXT NOT NULL,
  completed_results_json TEXT NOT NULL
);
PRAGMA user_version = 1;
