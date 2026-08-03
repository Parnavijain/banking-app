-- FX rates table. Refreshed by a background job or admin action.
-- We store rate as "how many `to_currency` per 1 `from_currency`".
CREATE TABLE IF NOT EXISTS fx_rates (
  from_currency CHAR(3) NOT NULL,
  to_currency   CHAR(3) NOT NULL,
  rate          NUMERIC(18, 8) NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_currency, to_currency)
);

-- Seed some plausible rates so the demo works without an FX API.
-- Replace with a real feed in production (ECB, exchangeratesapi.io, etc.)
INSERT INTO fx_rates (from_currency, to_currency, rate) VALUES
  ('USD','USD',1.00000000),('EUR','EUR',1.00000000),('GBP','GBP',1.00000000),
  ('USD','EUR',0.92000000),('EUR','USD',1.08695652),
  ('USD','GBP',0.79000000),('GBP','USD',1.26582278),
  ('EUR','GBP',0.85869565),('GBP','EUR',1.16455696)
ON CONFLICT DO NOTHING;

-- Extend transactions to store FX metadata when currencies differ.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fx_rate         NUMERIC(18, 8),
  ADD COLUMN IF NOT EXISTS received_amount NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS received_currency CHAR(3);
