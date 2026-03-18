-- Add optional per-transaction charge (fee) and income-tax fields.
-- charge_amount: deducts from balance but isn't treated as the transaction's "cost".
-- For income tax estimation we store tax-residency inputs on transactions (country + status).

alter table public.transactions
  add column if not exists charge_amount numeric(20, 8) null;

comment on column public.transactions.charge_amount is
  'Optional per-transaction charge/fee in the transaction currency. Deducts from account balance but shown separately from product cost.';

alter table public.transactions
  add column if not exists tax_country_code text null,
  add column if not exists tax_status text null;

comment on column public.transactions.tax_country_code is
  'ISO-3166 country code used for income-tax estimation for this transaction date.';

comment on column public.transactions.tax_status is
  'Optional tax filing status label used for estimation (e.g., single, married).';

