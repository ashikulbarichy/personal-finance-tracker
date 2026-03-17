-- Process due recurring transactions and create real transactions that adjust account balances

CREATE OR REPLACE FUNCTION public.process_due_recurring_transactions()
RETURNS void AS $$
DECLARE
  rec RECORD;
  tx_date timestamptz := now();
  next_interval interval;
BEGIN
  FOR rec IN
    SELECT *
    FROM recurring_transactions
    WHERE is_active = true
      AND next_date <= CURRENT_DATE
  LOOP
    -- Create the actual transaction; account balances will be updated
    -- automatically by the transactions balance trigger.
    INSERT INTO transactions (
      user_id,
      account_id,
      category_id,
      amount,
      type,
      description,
      transaction_date
    ) VALUES (
      rec.user_id,
      rec.account_id,
      rec.category_id,
      rec.amount,
      rec.type,
      COALESCE(rec.description, rec.name),
      tx_date
    );

    -- Determine how far to move next_date based on frequency
    IF rec.frequency = 'daily' THEN
      next_interval := INTERVAL '1 day';
    ELSIF rec.frequency = 'weekly' THEN
      next_interval := INTERVAL '1 week';
    ELSIF rec.frequency = 'monthly' THEN
      next_interval := INTERVAL '1 month';
    ELSIF rec.frequency = 'yearly' THEN
      next_interval := INTERVAL '1 year';
    ELSE
      -- Fallback: treat as monthly
      next_interval := INTERVAL '1 month';
    END IF;

    UPDATE recurring_transactions
    SET next_date = rec.next_date + next_interval
    WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

