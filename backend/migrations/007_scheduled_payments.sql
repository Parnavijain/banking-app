-- Scheduled payments. A cron worker polls this table and executes any
-- rows where next_run_at <= NOW() AND status='active'.
--
-- Recurring: after execution, next_run_at advances by frequency.
-- One-off (frequency='once'): status becomes 'completed'.
CREATE TABLE IF NOT EXISTS scheduled_payments (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_account_id     INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_number   VARCHAR(32) NOT NULL,
  amount              NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  note                VARCHAR(200),
  frequency           VARCHAR(16) NOT NULL,   -- 'once','daily','weekly','monthly'
  next_run_at         TIMESTAMPTZ NOT NULL,
  last_run_at         TIMESTAMPTZ,
  last_error          TEXT,
  status              VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (frequency IN ('once','daily','weekly','monthly')),
  CHECK (status IN ('active','paused','completed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_next_run
  ON scheduled_payments(next_run_at) WHERE status = 'active';
