-- Repeating budgets, synced exchange rates, no loan interest,
-- pay-yourself-first target, and investment tracking.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Budgets repeat: a category's latest budget row applies to every later
--    period until a newer row replaces it. amount = 0 means "no budget from
--    this period on" (it stops the repeat without deleting history).
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'budgets' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%amount%'
  loop
    execute format('alter table public.budgets drop constraint %I', c);
  end loop;
end $$;
alter table public.budgets add constraint budgets_amount_check check (amount >= 0);

-- 2. Manual exchange rates live on the profile, so every device sees the same
--    ones. { "USD": 122.5, ... } = units of the default currency per 1 unit.
alter table public.profiles add column if not exists manual_rates jsonb not null default '{}'::jsonb;

-- 3. Loans are interest-free.
alter table public.loans drop column if exists interest_rate;

-- 4. Pay-yourself-first: how much to save / repay / invest each month
--    (in the default currency). Null = not set.
alter table public.profiles add column if not exists monthly_save_target numeric(15, 2)
  check (monthly_save_target is null or monthly_save_target >= 0);

-- 5. Investments are accounts of type 'investment'. Their balance is what you
--    PUT IN (money moves in/out by transfer); current_value is what it's WORTH
--    now, updated by hand. Gain = current_value - balance.
alter table public.accounts add column if not exists current_value numeric(15, 2);
alter table public.accounts add column if not exists value_updated_at timestamptz;
alter table public.accounts add column if not exists investment_kind text
  check (investment_kind is null or investment_kind in
    ('startup', 'savings_certificate', 'dps', 'fdr', 'stocks', 'fund', 'crypto', 'gold', 'other'));
alter table public.accounts add column if not exists maturity_date date;

-- 6. Value history for investments (one row per "update value").
create table if not exists public.account_valuations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  value      numeric(15, 2) not null check (value >= 0),
  as_of      date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_account_valuations_account on public.account_valuations(account_id, as_of);
alter table public.account_valuations enable row level security;
drop policy if exists "own rows" on public.account_valuations;
create policy "own rows" on public.account_valuations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
