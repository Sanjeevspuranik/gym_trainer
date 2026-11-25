CREATE TABLE user_routine_plans (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  routine_json JSONB NOT NULL
    CHECK (jsonb_typeof(routine_json) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE routine_week_overrides (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL
    CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  routine_json JSONB NOT NULL
    CHECK (jsonb_typeof(routine_json) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE session_set_results (
  session_exercise_id INTEGER NOT NULL
    REFERENCES session_exercises(id) ON DELETE CASCADE,
  set_number SMALLINT NOT NULL CHECK (set_number BETWEEN 1 AND 20),
  actual_reps SMALLINT CHECK (actual_reps BETWEEN 1 AND 100),
  actual_weight_kg NUMERIC(7, 2)
    CHECK (actual_weight_kg >= 0 AND actual_weight_kg <= 1000),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_exercise_id, set_number)
);

CREATE INDEX idx_routine_week_overrides_start
  ON routine_week_overrides(week_start, user_id);
