-- Keep account balances in sync with transactions

CREATE OR REPLACE FUNCTION apply_transaction_delta()
RETURNS trigger AS $$
DECLARE
  old_delta numeric := 0;
  new_delta numeric := 0;
BEGIN
  -- Compute old delta (for UPDATE / DELETE)
  IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
    IF OLD.type = 'income' THEN
      old_delta := OLD.amount;
    ELSIF OLD.type = 'expense' THEN
      old_delta := -OLD.amount;
    END IF;
  END IF;

  -- Compute new delta (for INSERT / UPDATE)
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.type = 'income' THEN
      new_delta := NEW.amount;
    ELSIF NEW.type = 'expense' THEN
      new_delta := -NEW.amount;
    END IF;
  END IF;

  -- Handle DELETE: reverse old delta from OLD.account_id
  IF TG_OP = 'DELETE' THEN
    UPDATE accounts
    SET balance = balance - old_delta
    WHERE id = OLD.account_id;
    RETURN OLD;
  END IF;

  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    UPDATE accounts
    SET balance = balance + new_delta
    WHERE id = NEW.account_id;
    RETURN NEW;
  END IF;

  -- Handle UPDATE (account and/or amount/type may have changed)
  IF TG_OP = 'UPDATE' THEN
    -- If account changed, remove from old and add to new
    IF OLD.account_id <> NEW.account_id THEN
      UPDATE accounts
      SET balance = balance - old_delta
      WHERE id = OLD.account_id;

      UPDATE accounts
      SET balance = balance + new_delta
      WHERE id = NEW.account_id;
    ELSE
      -- Same account: just apply net delta difference
      UPDATE accounts
      SET balance = balance - old_delta + new_delta
      WHERE id = NEW.account_id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for insert, update, delete on transactions

DROP TRIGGER IF EXISTS transactions_balance_insert ON transactions;
DROP TRIGGER IF EXISTS transactions_balance_update ON transactions;
DROP TRIGGER IF EXISTS transactions_balance_delete ON transactions;

CREATE TRIGGER transactions_balance_insert
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION apply_transaction_delta();

CREATE TRIGGER transactions_balance_update
AFTER UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION apply_transaction_delta();

CREATE TRIGGER transactions_balance_delete
AFTER DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION apply_transaction_delta();

