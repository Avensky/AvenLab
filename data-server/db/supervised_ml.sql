-- AvenLab supervised-ML readiness patch.
-- Safe to run repeatedly after the original supervised_ml.sql migration.

BEGIN;

ALTER TABLE can_ml_labels
    ADD COLUMN IF NOT EXISTS bus_interface text,
    ADD COLUMN IF NOT EXISTS bus_mode text,
    ADD COLUMN IF NOT EXISTS capture_kind text;

ALTER TABLE can_ml_models
    ADD COLUMN IF NOT EXISTS bus_interface text,
    ADD COLUMN IF NOT EXISTS bus_mode text,
    ADD COLUMN IF NOT EXISTS capture_kind text;

CREATE INDEX IF NOT EXISTS can_ml_labels_training_scope_idx
    ON can_ml_labels (
        vehicle_id,
        mission_code,
        capture_kind,
        bus_interface,
        bus_mode,
        label,
        session_id
    );

CREATE INDEX IF NOT EXISTS can_ml_models_runtime_scope_idx
    ON can_ml_models (
        vehicle_id,
        mission_code,
        capture_kind,
        bus_interface,
        bus_mode,
        is_active,
        created_at DESC
    );

COMMIT;