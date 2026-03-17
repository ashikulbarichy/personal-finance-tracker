-- Change transactions.transaction_date to store full datetime with timezone
ALTER TABLE transactions
  ALTER COLUMN transaction_date TYPE timestamptz
  USING transaction_date::timestamptz;

-- Add optional timezone column to record the user's selected timezone identifier
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS timezone text;

