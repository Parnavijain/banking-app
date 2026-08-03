-- Account can be frozen by admins (maker-checker flow below).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';

-- Constraint: only allow known values.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_status_check CHECK (status IN ('active','frozen'));

-- Maker-checker: admin actions must be proposed by one admin and approved
-- by a second, different admin before taking effect.
CREATE TABLE IF NOT EXISTS admin_proposals (
  id            SERIAL PRIMARY KEY,
  action        VARCHAR(32) NOT NULL,         -- 'freeze_account', 'unfreeze_account'
  target_type   VARCHAR(16) NOT NULL,         -- 'account'
  target_id     INTEGER NOT NULL,
  reason        TEXT,
  proposed_by   INTEGER NOT NULL REFERENCES users(id),
  approved_by   INTEGER REFERENCES users(id),
  rejected_by   INTEGER REFERENCES users(id),
  status        VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at    TIMESTAMPTZ,
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_proposals_status ON admin_proposals(status);
