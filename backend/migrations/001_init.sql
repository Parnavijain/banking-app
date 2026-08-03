-- Users: identity + role for RBAC
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Accounts: money lives here. NUMERIC, never FLOAT, for currency.
CREATE TABLE IF NOT EXISTS accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number  VARCHAR(20) UNIQUE NOT NULL,
  balance         NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  currency        VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- Transactions: immutable ledger of transfers
CREATE TABLE IF NOT EXISTS transactions (
  id                    SERIAL PRIMARY KEY,
  sender_account_id     INTEGER NOT NULL REFERENCES accounts(id),
  receiver_account_id   INTEGER NOT NULL REFERENCES accounts(id),
  amount                NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  status                VARCHAR(20) NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending', 'completed', 'failed')),
  idempotency_key       UUID UNIQUE NOT NULL,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_sender   ON transactions(sender_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_receiver ON transactions(receiver_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_created  ON transactions(created_at DESC);
