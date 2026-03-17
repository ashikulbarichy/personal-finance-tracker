-- Track detailed loan/lending movements and keep loan balances in sync

CREATE TABLE IF NOT EXISTS loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  loan_id uuid REFERENCES loans(id) ON DELETE CASCADE NOT NULL,
  from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  to_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  amount decimal(15, 2) NOT NULL CHECK (amount > 0),
  payment_type text NOT NULL CHECK (payment_type IN ('disbursement', 'repayment')),
  payment_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_payments_user_id
  ON loan_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_loan_payments_loan_id
  ON loan_payments(loan_id);

-- Enable Row Level Security
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they already exist so the migration is idempotent
DROP POLICY IF EXISTS "Users can view own loan payments" ON loan_payments;
DROP POLICY IF EXISTS "Users can insert own loan payments" ON loan_payments;
DROP POLICY IF EXISTS "Users can update own loan payments" ON loan_payments;
DROP POLICY IF EXISTS "Users can delete own loan payments" ON loan_payments;

CREATE POLICY "Users can view own loan payments"
  ON loan_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own loan payments"
  ON loan_payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own loan payments"
  ON loan_payments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own loan payments"
  ON loan_payments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Keep loans.current_balance in sync with loan_payments

CREATE OR REPLACE FUNCTION apply_loan_payment_delta()
RETURNS trigger AS $$
DECLARE
  loan_row loans%ROWTYPE;
  old_delta numeric := 0;
  new_delta numeric := 0;
  net_delta numeric := 0;
  target_loan_id uuid;
  tx_account_id uuid;
  tx_type text;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT * INTO loan_row FROM loans WHERE id = COALESCE(NEW.loan_id, OLD.loan_id);
  ELSE
    SELECT * INTO loan_row FROM loans WHERE id = OLD.loan_id;
  END IF;

  -- Old delta (for UPDATE / DELETE)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.payment_type = 'disbursement' THEN
      old_delta := OLD.amount;
    ELSIF OLD.payment_type = 'repayment' THEN
      old_delta := -OLD.amount;
    END IF;
  END IF;

  -- New delta (for INSERT / UPDATE)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.payment_type = 'disbursement' THEN
      new_delta := NEW.amount;
    ELSIF NEW.payment_type = 'repayment' THEN
      new_delta := -NEW.amount;
    END IF;
  END IF;

  net_delta := new_delta - old_delta;

  -- Apply delta to loan balance and mark completed when fully paid
  IF TG_OP = 'DELETE' THEN
    target_loan_id := OLD.loan_id;
  ELSE
    target_loan_id := NEW.loan_id;
  END IF;

  IF net_delta <> 0 THEN
    UPDATE loans
    SET current_balance = GREATEST(current_balance + net_delta, 0),
        is_active = (current_balance + net_delta) > 0
    WHERE id = target_loan_id;
  END IF;

  -- Also create a matching transaction to adjust associated account balances
  -- Only on INSERT, not on UPDATE/DELETE, to avoid double-counting.
  IF TG_OP = 'INSERT' THEN
    -- Determine which account and transaction type to use, from the user's perspective.
    IF loan_row.type = 'borrowing' THEN
      IF NEW.payment_type = 'disbursement' THEN
        -- I borrowed money, it arrives into my account -> income
        tx_account_id := COALESCE(NEW.to_account_id, NEW.from_account_id);
        tx_type := 'income';
      ELSE
        -- I repay the borrowing from my account -> expense
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      END IF;
    ELSIF loan_row.type = 'lending' THEN
      IF NEW.payment_type = 'disbursement' THEN
        -- I lent money out from my account -> expense
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      ELSE
        -- I receive repayment into my account -> income
        tx_account_id := COALESCE(NEW.to_account_id, NEW.from_account_id);
        tx_type := 'income';
      END IF;
    END IF;

    IF tx_account_id IS NOT NULL THEN
      INSERT INTO transactions (
        user_id,
        account_id,
        category_id,
        amount,
        type,
        title,
        description,
        transaction_date,
        timezone,
        notes
      ) VALUES (
        loan_row.user_id,
        tx_account_id,
        NULL,
        NEW.amount,
        tx_type,
        loan_row.name,
        COALESCE(NEW.notes, NEW.payment_type || ' for loan ' || loan_row.name),
        NEW.payment_date,
        NULL,
        NEW.notes
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loan_payments_balance_insert ON loan_payments;
DROP TRIGGER IF EXISTS loan_payments_balance_update ON loan_payments;
DROP TRIGGER IF EXISTS loan_payments_balance_delete ON loan_payments;

CREATE TRIGGER loan_payments_balance_insert
AFTER INSERT ON loan_payments
FOR EACH ROW
EXECUTE FUNCTION apply_loan_payment_delta();

CREATE TRIGGER loan_payments_balance_update
AFTER UPDATE ON loan_payments
FOR EACH ROW
EXECUTE FUNCTION apply_loan_payment_delta();

CREATE TRIGGER loan_payments_balance_delete
AFTER DELETE ON loan_payments
FOR EACH ROW
EXECUTE FUNCTION apply_loan_payment_delta();

