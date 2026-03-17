-- Create savings_goal_allocations table to track per-account allocations to goals
CREATE TABLE IF NOT EXISTS savings_goal_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id uuid REFERENCES savings_goals(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  amount decimal(15, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_savings_goal_allocations_user_id
  ON savings_goal_allocations(user_id);

CREATE INDEX IF NOT EXISTS idx_savings_goal_allocations_account_id
  ON savings_goal_allocations(account_id);

CREATE INDEX IF NOT EXISTS idx_savings_goal_allocations_goal_id
  ON savings_goal_allocations(goal_id);

-- Enable Row Level Security
ALTER TABLE savings_goal_allocations ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see and manage their own allocations
CREATE POLICY "Users can view own savings allocations"
  ON savings_goal_allocations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings allocations"
  ON savings_goal_allocations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings allocations"
  ON savings_goal_allocations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings allocations"
  ON savings_goal_allocations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

