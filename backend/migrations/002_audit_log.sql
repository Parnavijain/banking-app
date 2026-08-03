-- Immutable audit trail. The audit logger service is the only writer.
-- No UPDATE, no DELETE — regulators want to know that once written, it stays.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  event_type    VARCHAR(64) NOT NULL,    -- e.g. 'transaction.completed'
  event_id      UUID UNIQUE NOT NULL,    -- idempotency for the logger itself
  actor_user_id INTEGER,                 -- who caused this event (nullable for system events)
  payload       JSONB NOT NULL,          -- the full event body
  occurred_at   TIMESTAMPTZ NOT NULL,    -- when the event happened (from producer)
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred   ON audit_log(occurred_at DESC);

-- Prevent updates and deletes at the DB level. Belt and suspenders.
-- (Superusers can still bypass this — that's fine for a demo.)
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
