-- Fix apply_loan_payment_delta:
-- • Disbursements do NOT change loan.current_balance (balance starts at principal on INSERT)
-- • Only repayments reduce loan.current_balance toward 0
-- • Account balance adjustments still happen for both types

CREATE OR REPLACE FUNCTION apply_loan_payment_delta()
RETURNS trigger AS $$
DECLARE
  loan_row loans%ROWTYPE;
  repay_delta numeric := 0;
  tx_account_id uuid;
  tx_type text;
BEGIN
  -- Fetch the parent loan
  SELECT * INTO loan_row
  FROM loans
  WHERE id = COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.loan_id ELSE NEW.loan_id END,
    OLD.loan_id
  );

  -- ----------------------------------------------------------------
  -- 1. Update loan.current_balance only for REPAYMENTS
  --    Disbursements: loan starts at principal, balance is already set.
  -- ----------------------------------------------------------------
  IF TG_OP = 'INSERT' AND NEW.payment_type = 'repayment' THEN
    repay_delta := -NEW.amount;
  ELSIF TG_OP = 'DELETE' AND OLD.payment_type = 'repayment' THEN
    -- Undo a repayment deletion → add back to balance
    repay_delta := OLD.amount;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle changed amount / type
    IF OLD.payment_type = 'repayment' THEN
      repay_delta := repay_delta + OLD.amount; -- undo old
    END IF;
    IF NEW.payment_type = 'repayment' THEN
      repay_delta := repay_delta - NEW.amount; -- apply new
    END IF;
  END IF;

  IF repay_delta <> 0 THEN
    UPDATE loans
    SET current_balance = GREATEST(current_balance + repay_delta, 0),
        is_active       = (current_balance + repay_delta) > 0
    WHERE id = loan_row.id;
  END IF;

  -- ----------------------------------------------------------------
  -- 2. Create a linked transaction to adjust the account balance.
  --    Only on INSERT to avoid double-counting on UPDATE.
  -- ----------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    IF loan_row.type = 'borrowing' THEN
      IF NEW.payment_type = 'disbursement' THEN
        -- Money arrives in our account
        tx_account_id := COALESCE(NEW.to_account_id, NEW.from_account_id);
        tx_type := 'income';
      ELSE
        -- We pay back → money leaves our account
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      END IF;
    ELSIF loan_row.type = 'lending' THEN
      IF NEW.payment_type = 'disbursement' THEN
        -- Money leaves our account (we lend it out)
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      ELSE
        -- Borrower repays us → money arrives in our account
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
        notes,
        loan_payment_id
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
        NEW.notes,
        NEW.id
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-attach triggers (drop first for idempotency)
DROP TRIGGER IF EXISTS loan_payments_delta ON loan_payments;

CREATE TRIGGER loan_payments_delta
AFTER INSERT OR UPDATE OR DELETE ON loan_payments
FOR EACH ROW
EXECUTE FUNCTION apply_loan_payment_delta();
