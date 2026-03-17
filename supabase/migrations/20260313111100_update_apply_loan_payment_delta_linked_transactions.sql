-- Update apply_loan_payment_delta to create linked transactions (loan_payment_id)

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

  -- Create matching linked transaction to adjust associated account balances.
  -- Only on INSERT, not on UPDATE/DELETE, to avoid double-counting.
  IF TG_OP = 'INSERT' THEN
    IF loan_row.type = 'borrowing' THEN
      IF NEW.payment_type = 'disbursement' THEN
        tx_account_id := COALESCE(NEW.to_account_id, NEW.from_account_id);
        tx_type := 'income';
      ELSE
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      END IF;
    ELSIF loan_row.type = 'lending' THEN
      IF NEW.payment_type = 'disbursement' THEN
        tx_account_id := COALESCE(NEW.from_account_id, NEW.to_account_id);
        tx_type := 'expense';
      ELSE
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
  ELSIF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

