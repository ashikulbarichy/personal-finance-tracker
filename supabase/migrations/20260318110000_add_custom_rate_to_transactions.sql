-- Per-transaction manual exchange rate override.
-- When set, this rate (account_currency → default_currency) is used
-- instead of the live cached rate for any display conversions.
-- NULL means "use live rate from exchange_rates table".

alter table public.transactions
  add column if not exists custom_rate numeric(20, 8) null;

comment on column public.transactions.custom_rate is
  'Optional manual exchange rate override (account currency → default currency). '
  'NULL = use live cached rate.';
