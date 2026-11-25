ALTER TABLE workout_sessions
  ADD COLUMN routine_week_start DATE,
  ADD COLUMN routine_weekday SMALLINT,
  ADD COLUMN routine_snapshot JSONB,
  ADD COLUMN cardio_completed_at TIMESTAMPTZ,
  ADD CONSTRAINT workout_sessions_routine_metadata_check
    CHECK (
      (
        routine_week_start IS NULL
        AND routine_weekday IS NULL
        AND routine_snapshot IS NULL
      )
      OR (
        routine_week_start IS NOT NULL
        AND routine_weekday BETWEEN 1 AND 7
        AND routine_snapshot IS NOT NULL
        AND jsonb_typeof(routine_snapshot) = 'object'
      )
    ),
  ADD CONSTRAINT workout_sessions_cardio_snapshot_check
    CHECK (cardio_completed_at IS NULL OR routine_snapshot IS NOT NULL);

ALTER TABLE session_set_results
  ADD COLUMN target_reps SMALLINT NOT NULL DEFAULT 1
    CHECK (target_reps BETWEEN 1 AND 100),
  ADD COLUMN target_weight_kg NUMERIC(7, 2) NOT NULL DEFAULT 0
    CHECK (target_weight_kg >= 0 AND target_weight_kg <= 1000);
