/*
  # Add transaction groups

  ## Changes
  1. Create transaction_groups table for grouping related transactions
  2. Add group_id column to transactions
*/

-- 1) transaction_groups table
CREATE TABLE IF NOT EXISTS transaction_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_groups_user_id ON transaction_groups(user_id);

ALTER TABLE transaction_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transaction groups"
  ON transaction_groups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transaction groups"
  ON transaction_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transaction groups"
  ON transaction_groups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transaction groups"
  ON transaction_groups FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) Add group_id to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES transaction_groups(id) ON DELETE SET NULL;

