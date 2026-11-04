CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  password_salt VARCHAR(32) NOT NULL,
  password_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_username_format
    CHECK (username ~ '^[a-z0-9_-]{3,32}$')
);

CREATE TABLE auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_sessions_expiry
  ON auth_sessions(expires_at);

CREATE TABLE workout_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(80) NOT NULL,
  session_date DATE NOT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workout_sessions_user_date
  ON workout_sessions(user_id, session_date DESC, id DESC);

CREATE TABLE session_exercises (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL
    REFERENCES workout_sessions(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  sets INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 20),
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 100),
  weight_kg NUMERIC(7, 2) NOT NULL
    CHECK (weight_kg >= 0 AND weight_kg <= 1000),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_session_exercises_session
  ON session_exercises(session_id, sort_order, id);

CREATE TABLE auth_rate_limits (
  key_hash CHAR(64) PRIMARY KEY,
  window_start BIGINT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_rate_limits_window
  ON auth_rate_limits(window_start);
