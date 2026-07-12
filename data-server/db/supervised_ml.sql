
-- Human-supervised CAN candidate classification for AvenLab.
-- Apply once to the PostgreSQL database used by avenlab-data.

BEGIN;

CREATE TABLE IF NOT EXISTS can_ml_labels (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL
        REFERENCES can_sessions(id) ON DELETE CASCADE,
    vehicle_id uuid NOT NULL
        REFERENCES vehicles(id) ON DELETE CASCADE,
    mission_id uuid NULL
        REFERENCES recon_missions(id) ON DELETE SET NULL,
    mission_code text NULL,
    can_id integer NOT NULL,
    label text NOT NULL
        CHECK (label IN ('positive', 'negative', 'uncertain')),
    signal_name text NULL,
    notes text NULL,
    feature_vector jsonb NOT NULL,
    source text NOT NULL DEFAULT 'human',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, can_id)
);

CREATE INDEX IF NOT EXISTS can_ml_labels_vehicle_mission_idx
    ON can_ml_labels (vehicle_id, mission_code, label);

CREATE INDEX IF NOT EXISTS can_ml_labels_session_idx
    ON can_ml_labels (session_id);

-- candidate machine learning models for CAN signal classification.
CREATE TABLE IF NOT EXISTS can_ml_models (
    id uuid PRIMARY KEY,
    vehicle_id uuid NOT NULL
        REFERENCES vehicles(id) ON DELETE CASCADE,
    vehicle_slug text NOT NULL,
    mission_code text NULL,
    model_type text NOT NULL,
    feature_names jsonb NOT NULL,
    feature_means jsonb NOT NULL,
    feature_scales jsonb NOT NULL,
    weights jsonb NOT NULL,
    bias double precision NOT NULL,
    label_count integer NOT NULL,
    positive_count integer NOT NULL,
    negative_count integer NOT NULL,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for active models by vehicle and mission, ordered by creation time descending
CREATE INDEX IF NOT EXISTS can_ml_models_active_scope_idx
    ON can_ml_models (
        vehicle_id,
        mission_code,
        is_active,
        created_at DESC
    );

COMMIT;