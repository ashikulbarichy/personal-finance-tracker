/*
  # Add profile currency preferences and new account types

  ## Changes
  1. Extend profiles with:
     - enabled_currencies (text[]), defaulting to ['USD']
     - default_currency (text), defaulting to 'USD'
  2. Extend accounts.type enum constraint to include:
     - 'multi_currency' (multi-currency account)
     - 'mfs' (mobile financial service / mobile money account)
  3. Add currency column to transactions
*/

-- 1) Add currency preference columns to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS enabled_currencies text[] DEFAULT ARRAY['USD'];

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'USD';

-- 2) Update accounts.type CHECK constraint to allow new types
ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE accounts
ADD CONSTRAINT accounts_type_check
CHECK (
  type IN (
    'checking',
    'savings',
    'credit_card',
    'cash',
    'investment',
    'multi_currency',
    'mfs'
  )
);

-- 3) Add currency column to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

