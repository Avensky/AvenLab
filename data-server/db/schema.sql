\set ON_ERROR_STOP on

-- AvenLab unified bootstrap schema
-- Schema version: 3
-- Replaces the previous base schema, supervised-ML migration, readiness patch,
-- and 20260713 server-clock/finalization/hypothesis migration for a fresh DB.
--
-- Apply as PostgreSQL superuser and pass the application role when needed:
--   sudo -u postgres psql -d avenlab_data -v app_role=avenlab -f avenlab_schema_v3.sql

\if :{?app_role}
\else
  \set app_role avenlab
\endif

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

SET ROLE :"app_role";

BEGIN;

CREATE TABLE schema_migrations (
    version text PRIMARY KEY,
    description text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);

-- =========================
-- Vehicles
-- =========================

CREATE TABLE vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    year integer,
    make text NOT NULL,
    model text NOT NULL,
    trim text,
    alias text,
    vin text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicle_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    config_name text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, config_name)
);

-- =========================
-- Recon missions and steps
-- =========================

CREATE TABLE recon_missions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    mission_code text NOT NULL,
    title text NOT NULL,
    target text NOT NULL,
    status text NOT NULL DEFAULT 'READY',
    description text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, mission_code)
);

CREATE INDEX recon_missions_vehicle_code_idx
    ON recon_missions (vehicle_id, mission_code);

CREATE TABLE recon_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id uuid NOT NULL REFERENCES recon_missions(id) ON DELETE CASCADE,
    step_code text NOT NULL,
    label text NOT NULL,
    instruction text NOT NULL,
    action_text text NOT NULL,
    sort_order integer NOT NULL,
    baseline_ms integer NOT NULL DEFAULT 2000 CHECK (baseline_ms >= 0),
    countdown_ms integer NOT NULL DEFAULT 3000 CHECK (countdown_ms >= 0),
    action_ms integer NOT NULL DEFAULT 1800 CHECK (action_ms >= 0),
    capture_ms integer NOT NULL DEFAULT 1500 CHECK (capture_ms >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (mission_id, step_code)
);

CREATE INDEX recon_steps_mission_order_idx
    ON recon_steps (mission_id, sort_order);

-- =========================
-- CAN sessions and server-time markers
-- =========================

CREATE TABLE can_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    mission_id uuid REFERENCES recon_missions(id) ON DELETE SET NULL,
    label text,
    bus_interface text NOT NULL,
    bus_mode text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    capture_status text NOT NULL DEFAULT 'recording'
        CHECK (capture_status IN (
            'recording', 'finalizing', 'finalized', 'interrupted', 'failed'
        )),
    finalized_at timestamptz,
    final_frame_id bigint,
    final_frame_count bigint,
    final_marker_count integer,
    capture_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (final_frame_count IS NULL OR final_frame_count >= 0),
    CHECK (final_marker_count IS NULL OR final_marker_count >= 0)
);

CREATE INDEX can_sessions_vehicle_started_idx
    ON can_sessions (vehicle_id, started_at DESC);

CREATE INDEX can_sessions_mission_started_idx
    ON can_sessions (mission_id, started_at DESC);

CREATE INDEX can_sessions_capture_status_idx
    ON can_sessions (capture_status, started_at DESC);

CREATE INDEX can_sessions_capture_scope_idx
    ON can_sessions (
        vehicle_id, mission_id, bus_interface, bus_mode, capture_status, started_at DESC
    );

CREATE TABLE can_session_markers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    mission_id uuid REFERENCES recon_missions(id) ON DELETE SET NULL,
    step_id uuid REFERENCES recon_steps(id) ON DELETE SET NULL,
    marker_type text NOT NULL,
    label text,
    timestamp_ms bigint NOT NULL CHECK (timestamp_ms >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX can_session_markers_session_time_idx
    ON can_session_markers (session_id, timestamp_ms, created_at);

CREATE INDEX can_session_markers_session_type_idx
    ON can_session_markers (session_id, marker_type);

-- =========================
-- Raw CAN frames
-- =========================

CREATE TABLE can_frames_raw (
    id bigserial PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    timestamp_ms bigint NOT NULL CHECK (timestamp_ms >= 0),
    elapsed_ms double precision,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    can_id_hex text NOT NULL,
    dlc integer NOT NULL CHECK (dlc BETWEEN 0 AND 64),
    data bytea NOT NULL,
    source text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX can_frames_raw_session_time_idx
    ON can_frames_raw (session_id, timestamp_ms, id);

CREATE INDEX can_frames_raw_session_can_id_idx
    ON can_frames_raw (session_id, can_id, timestamp_ms);

CREATE INDEX can_frames_raw_can_id_idx
    ON can_frames_raw (can_id);

-- =========================
-- Decoded signal catalog
-- =========================

CREATE TABLE can_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    signal_name text NOT NULL,
    byte_start integer,
    byte_length integer,
    bit_start integer,
    bit_length integer,
    endian text NOT NULL DEFAULT 'big' CHECK (endian IN ('big', 'little')),
    signed boolean NOT NULL DEFAULT false,
    scale double precision NOT NULL DEFAULT 1,
    offset_value double precision NOT NULL DEFAULT 0,
    unit text,
    confidence double precision NOT NULL DEFAULT 0
        CHECK (confidence BETWEEN 0 AND 1),
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (vehicle_id, can_id, signal_name),
    CHECK (byte_start IS NULL OR byte_start >= 0),
    CHECK (byte_length IS NULL OR byte_length > 0),
    CHECK (bit_start IS NULL OR bit_start >= 0),
    CHECK (bit_length IS NULL OR bit_length > 0)
);

CREATE INDEX can_signals_vehicle_can_id_idx
    ON can_signals (vehicle_id, can_id);

CREATE TABLE can_frames_decoded (
    id bigserial PRIMARY KEY,
    raw_frame_id bigint NOT NULL REFERENCES can_frames_raw(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    signal_id uuid REFERENCES can_signals(id) ON DELETE SET NULL,
    signal_name text NOT NULL,
    decoded_value text,
    numeric_value double precision,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX can_frames_decoded_session_signal_idx
    ON can_frames_decoded (session_id, signal_name);

CREATE INDEX can_frames_decoded_raw_frame_idx
    ON can_frames_decoded (raw_frame_id);

-- =========================
-- Statistical analysis
-- =========================

CREATE TABLE can_frame_deltas (
    id bigserial PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    timestamp_ms bigint NOT NULL CHECK (timestamp_ms >= 0),
    byte_index integer NOT NULL CHECK (byte_index BETWEEN 0 AND 7),
    previous_value integer,
    current_value integer,
    delta integer,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX can_frame_deltas_session_can_id_idx
    ON can_frame_deltas (session_id, can_id, timestamp_ms);

CREATE TABLE can_id_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    frame_count integer NOT NULL DEFAULT 0 CHECK (frame_count >= 0),
    change_count integer NOT NULL DEFAULT 0 CHECK (change_count >= 0),
    byte_change_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    entropy double precision,
    frequency_hz double precision,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, can_id)
);

CREATE INDEX can_id_features_session_rank_idx
    ON can_id_features (session_id, change_count DESC, frame_count DESC);

CREATE TABLE can_id_correlations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    marker_type text,
    score double precision NOT NULL DEFAULT 0,
    confidence double precision NOT NULL DEFAULT 0,
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (score BETWEEN 0 AND 1),
    CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX can_id_correlations_session_rank_idx
    ON can_id_correlations (session_id, confidence DESC, score DESC);

-- =========================
-- Byte/bit signal hypotheses
-- =========================

CREATE TABLE can_signal_hypotheses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    mission_id uuid REFERENCES recon_missions(id) ON DELETE SET NULL,
    mission_code text,
    hypothesis_key text NOT NULL,
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    byte_index smallint NOT NULL CHECK (byte_index BETWEEN 0 AND 7),
    bit_mask integer CHECK (bit_mask IS NULL OR bit_mask BETWEEN 1 AND 255),
    hypothesis_kind text NOT NULL,
    action_group text,
    confidence double precision NOT NULL DEFAULT 0
        CHECK (confidence BETWEEN 0 AND 1),
    source text NOT NULL DEFAULT 'auto_analysis',
    validation_status text NOT NULL DEFAULT 'unreviewed'
        CHECK (validation_status IN (
            'unreviewed', 'positive', 'negative', 'uncertain'
        )),
    notes text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, hypothesis_key)
);

CREATE INDEX can_signal_hypotheses_session_idx
    ON can_signal_hypotheses (session_id, can_id, byte_index);

CREATE INDEX can_signal_hypotheses_scope_idx
    ON can_signal_hypotheses (
        vehicle_id, mission_code, hypothesis_kind, validation_status
    );

-- =========================
-- Reports and exports
-- =========================

CREATE TABLE session_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    report_type text NOT NULL,
    title text,
    content text,
    file_path text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_reports_session_created_idx
    ON session_reports (session_id, report_type, created_at DESC);

CREATE UNIQUE INDEX session_reports_one_ai_analysis_idx
    ON session_reports (session_id)
    WHERE report_type = 'ai_analysis';

CREATE TABLE can_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    export_type text NOT NULL,
    file_path text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX can_exports_session_created_idx
    ON can_exports (session_id, created_at DESC);

-- =========================
-- AI insights and vector memory
-- =========================

CREATE TABLE ai_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid REFERENCES can_sessions(id) ON DELETE SET NULL,
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
    prompt text NOT NULL,
    response text NOT NULL,
    model text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_insights_session_created_idx
    ON ai_insights (session_id, created_at DESC);

CREATE TABLE signal_embeddings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id uuid REFERENCES vehicles(id) ON DELETE CASCADE,
    session_id uuid REFERENCES can_sessions(id) ON DELETE CASCADE,
    signal_id uuid REFERENCES can_signals(id) ON DELETE SET NULL,
    text text NOT NULL,
    embedding vector(768),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signal_embeddings_session_created_idx
    ON signal_embeddings (session_id, created_at DESC);

CREATE UNIQUE INDEX signal_embeddings_session_model_mode_idx
    ON signal_embeddings (
        session_id,
        (metadata->>'model'),
        (metadata->>'analysis_mode')
    )
    WHERE session_id IS NOT NULL;

CREATE INDEX signal_embeddings_vector_idx
    ON signal_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- =========================
-- Human supervised candidate labels
-- =========================

CREATE TABLE can_ml_labels (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES can_sessions(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    mission_id uuid REFERENCES recon_missions(id) ON DELETE SET NULL,
    mission_code text,
    bus_interface text,
    bus_mode text,
    capture_kind text CHECK (
        capture_kind IS NULL OR capture_kind IN ('live', 'simulation')
    ),
    can_id integer NOT NULL CHECK (can_id BETWEEN 0 AND 536870911),
    label text NOT NULL CHECK (label IN ('positive', 'negative', 'uncertain')),
    signal_name text,
    notes text,
    feature_vector jsonb NOT NULL,
    source text NOT NULL DEFAULT 'human',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, can_id)
);

CREATE INDEX can_ml_labels_vehicle_mission_idx
    ON can_ml_labels (vehicle_id, mission_code, label);

CREATE INDEX can_ml_labels_session_idx
    ON can_ml_labels (session_id);

CREATE INDEX can_ml_labels_training_scope_idx
    ON can_ml_labels (
        vehicle_id,
        mission_code,
        capture_kind,
        bus_interface,
        bus_mode,
        label,
        session_id
    );

-- =========================
-- Candidate ML models
-- =========================

CREATE TABLE can_ml_models (
    id uuid PRIMARY KEY,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    vehicle_slug text NOT NULL,
    mission_code text,
    bus_interface text,
    bus_mode text,
    capture_kind text CHECK (
        capture_kind IS NULL OR capture_kind IN ('live', 'simulation')
    ),
    model_type text NOT NULL,
    feature_names jsonb NOT NULL,
    feature_means jsonb NOT NULL,
    feature_scales jsonb NOT NULL,
    weights jsonb NOT NULL,
    bias double precision NOT NULL,
    label_count integer NOT NULL CHECK (label_count >= 0),
    positive_count integer NOT NULL CHECK (positive_count >= 0),
    negative_count integer NOT NULL CHECK (negative_count >= 0),
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX can_ml_models_active_scope_idx
    ON can_ml_models (
        vehicle_id, mission_code, is_active, created_at DESC
    );

CREATE INDEX can_ml_models_runtime_scope_idx
    ON can_ml_models (
        vehicle_id,
        mission_code,
        capture_kind,
        bus_interface,
        bus_mode,
        is_active,
        created_at DESC
    );

CREATE UNIQUE INDEX can_ml_models_one_active_scope_idx
    ON can_ml_models (
        vehicle_id,
        COALESCE(mission_code, ''),
        COALESCE(capture_kind, ''),
        COALESCE(bus_interface, ''),
        COALESCE(bus_mode, '')
    )
    WHERE is_active;

INSERT INTO schema_migrations (version, description)
VALUES (
    '3',
    'Unified server-time, finalization, vector memory, byte hypotheses, and supervised ML schema'
);

COMMIT;

RESET ROLE;