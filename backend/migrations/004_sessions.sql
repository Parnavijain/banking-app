-- Every issued JWT gets a session row with its jti. Logout / revoke sets
-- revoked_at. The auth middleware checks this table on every request.
--
-- Trade-off: this makes JWTs stateful (one DB read per request). Fine for
-- a demo. In production you'd cache the revocation list in Redis with a TTL
-- matching the token expiry, so the DB hit only happens on cache miss.
CREATE TABLE IF NOT EXISTS sessions (
  jti          UUID PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent   TEXT,
  ip           INET,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions(user_id) WHERE revoked_at IS NULL;
