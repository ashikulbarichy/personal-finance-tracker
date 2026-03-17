-- Allow transactions to be explicitly linked to a budget
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS budget_id uuid REFERENCES budgets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_budget_id
  ON transactions(budget_id);
