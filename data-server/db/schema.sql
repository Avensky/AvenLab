-- AvenLab Data Server Schema V1
-- Owns: vehicles, recon missions, CAN sessions, raw frames, decoded signals, reports, embeddings

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- Vehicles
-- =========================

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  year INT,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  alias TEXT,
  vin TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vehicle_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  config_name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vehicle_id, config_name)
);

-- =========================
-- Recon Missions
-- =========================

CREATE TABLE recon_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  mission_code TEXT NOT NULL,
  title TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vehicle_id, mission_code)
);

CREATE TABLE recon_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES recon_missions(id) ON DELETE CASCADE,
  step_code TEXT NOT NULL,
  label TEXT NOT NULL,
  instruction TEXT NOT NULL,
  action_text TEXT NOT NULL,
  sort_order INT NOT NULL,

  baseline_ms INT NOT NULL DEFAULT 2000,
  countdown_ms INT NOT NULL DEFAULT 3000,
  action_ms INT NOT NULL DEFAULT 1800,
  capture_ms INT NOT NULL DEFAULT 1500,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mission_id, step_code)
);

-- =========================
-- CAN Sessions
-- =========================

CREATE TABLE can_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  mission_id UUID REFERENCES recon_missions(id),

  label TEXT,
  bus_interface TEXT NOT NULL, -- can0, vcan0, replay
  bus_mode TEXT NOT NULL,      -- live, simulation, replay, offline

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE can_session_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES recon_missions(id),
  step_id UUID REFERENCES recon_steps(id),

  marker_type TEXT NOT NULL,
  label TEXT,
  timestamp_ms BIGINT NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- Raw CAN Frames
-- =========================

CREATE TABLE can_frames_raw (
  id BIGSERIAL PRIMARY KEY,

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,

  timestamp_ms BIGINT NOT NULL,
  elapsed_ms DOUBLE PRECISION,

  can_id INT NOT NULL,
  can_id_hex TEXT NOT NULL,
  dlc INT NOT NULL,
  data BYTEA NOT NULL,

  source TEXT NOT NULL, -- can0, vcan0, replay
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_can_frames_raw_session_time
ON can_frames_raw(session_id, timestamp_ms);

CREATE INDEX idx_can_frames_raw_can_id
ON can_frames_raw(session_id, can_id);

-- =========================
-- Decoded Signals
-- =========================

CREATE TABLE can_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,

  can_id INT NOT NULL,
  signal_name TEXT NOT NULL,

  byte_start INT,
  byte_length INT,
  bit_start INT,
  bit_length INT,

  endian TEXT DEFAULT 'big',
  signed BOOLEAN DEFAULT FALSE,
  scale DOUBLE PRECISION DEFAULT 1,
  offset_value DOUBLE PRECISION DEFAULT 0,
  unit TEXT,

  confidence DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(vehicle_id, can_id, signal_name)
);

CREATE TABLE can_frames_decoded (
  id BIGSERIAL PRIMARY KEY,

  raw_frame_id BIGINT NOT NULL REFERENCES can_frames_raw(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES can_signals(id),

  signal_name TEXT NOT NULL,
  decoded_value TEXT,
  numeric_value DOUBLE PRECISION,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_can_decoded_session_signal
ON can_frames_decoded(session_id, signal_name);

-- =========================
-- Deltas / Analysis
-- =========================

CREATE TABLE can_frame_deltas (
  id BIGSERIAL PRIMARY KEY,

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  can_id INT NOT NULL,

  timestamp_ms BIGINT NOT NULL,
  byte_index INT NOT NULL,
  previous_value INT,
  current_value INT,

  delta INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_can_deltas_session_canid
ON can_frame_deltas(session_id, can_id);

CREATE TABLE can_id_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  can_id INT NOT NULL,

  frame_count INT NOT NULL DEFAULT 0,
  change_count INT NOT NULL DEFAULT 0,
  byte_change_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  entropy DOUBLE PRECISION,
  frequency_hz DOUBLE PRECISION,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(session_id, can_id)
);

CREATE TABLE can_id_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  can_id INT NOT NULL,

  marker_type TEXT,
  score DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0,

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- Reports / Exports
-- =========================

CREATE TABLE session_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL, -- summary, pdf, csv, ai_analysis
  title TEXT,
  content TEXT,
  file_path TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE can_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL, -- raw_csv, decoded_csv, report_pdf
  file_path TEXT NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================
-- AI / Embeddings
-- =========================

CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id UUID REFERENCES can_sessions(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,

  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  model TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE signal_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES can_sessions(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES can_signals(id) ON DELETE SET NULL,

  text TEXT NOT NULL,
  embedding vector(768),

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signal_embeddings_vector
ON signal_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- =========================
-- Seed Vehicle
-- =========================

INSERT INTO vehicles (slug, year, make, model, trim, alias, metadata)
VALUES (
  '2015-scion-frs',
  2015,
  'Scion',
  'FR-S',
  'Manual',
  'FRS',
  '{"platform":"ZN6","notes":"Primary live CAN target vehicle"}'
)
ON CONFLICT (slug) DO NOTHING;