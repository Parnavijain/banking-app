-- Category for spend analysis. Nullable so existing rows stay valid;
-- new rows get auto-categorized by the transfer service based on the note.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category VARCHAR(32);

-- Backfill any existing rows to 'other' so the analytics don't have holes.
UPDATE transactions SET category = 'other' WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
