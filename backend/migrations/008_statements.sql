-- Statement requests. User submits, worker picks up, generates PDF, stores.
CREATE TABLE IF NOT EXISTS statement_requests (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  file_path     TEXT,
  error         TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  CHECK (status IN ('pending','processing','ready','failed'))
);

CREATE INDEX IF NOT EXISTS idx_statement_status
  ON statement_requests(status) WHERE status IN ('pending','processing');
