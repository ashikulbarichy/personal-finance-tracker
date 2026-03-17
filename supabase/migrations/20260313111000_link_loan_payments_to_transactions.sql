-- Link generated transactions to loan payments so deleting a loan removes its money movements

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS loan_payment_id uuid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_loan_payment_id_fkey
  FOREIGN KEY (loan_payment_id)
  REFERENCES loan_payments(id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_transactions_loan_payment_id
  ON transactions(loan_payment_id);

