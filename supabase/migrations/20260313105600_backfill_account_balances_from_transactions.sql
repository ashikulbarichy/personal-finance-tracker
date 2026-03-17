-- One-time backfill to sync existing account balances with historical transactions

WITH tx_sums AS (
  SELECT
    account_id,
    SUM(
      CASE
        WHEN type = 'income' THEN amount
        WHEN type = 'expense' THEN -amount
        ELSE 0
      END
    ) AS net_amount
  FROM transactions
  GROUP BY account_id
)
UPDATE accounts a
SET balance = COALESCE(a.balance, 0) + COALESCE(t.net_amount, 0)
FROM tx_sums t
WHERE a.id = t.account_id;

