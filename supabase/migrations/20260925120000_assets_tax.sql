-- Assets, net-worth history, tax summary, balance adjustments, loans ↔ payees.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Assets reuse "investment" accounts (balance = cost / put in, current_value
--    = worth now). New kinds for things you own.
alter table public.accounts drop constraint if exists accounts_investment_kind_check;
alter table public.accounts add constraint accounts_investment_kind_check
  check (investment_kind is null or investment_kind in (
    'startup', 'savings_certificate', 'dps', 'fdr', 'stocks', 'fund', 'crypto',
    'gold', 'property', 'land', 'vehicle', 'valuables', 'other'));

-- 2. Tax: mark holdings whose contributions count toward the investment rebate.
alter table public.accounts add column if not exists tax_rebate boolean not null default false;

-- 3. Tax paid / deducted at source, per Bangladesh tax year ('2025-26' = Jul 2025–Jun 2026).
create table if not exists public.tax_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tax_year    text not null check (tax_year ~ '^\d{4}-\d{2}$'),
  kind        text not null check (kind in ('tds', 'advance', 'with_return', 'other')),
  description text,
  amount      numeric(15, 2) not null check (amount > 0),
  paid_on     date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tax_payments_user_year on public.tax_payments(user_id, tax_year);
alter table public.tax_payments enable row level security;
drop policy if exists "own rows" on public.tax_payments;
create policy "own rows" on public.tax_payments
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Net worth history: one row per month, overwritten until the month ends.
create table if not exists public.net_worth_snapshots (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  month       date not null,               -- first day of the month
  net_worth   numeric(15, 2) not null,
  assets      numeric(15, 2) not null,
  liabilities numeric(15, 2) not null,
  currency    text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, month)
);
alter table public.net_worth_snapshots enable row level security;
drop policy if exists "own rows" on public.net_worth_snapshots;
create policy "own rows" on public.net_worth_snapshots
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. Balance adjustments ("match my bank"): real balance changes that are
--    NOT income or spending, so reports leave them out.
alter table public.transactions add column if not exists is_adjustment boolean not null default false;

-- 6. Loans linked to payees, so a person shows everything between you.
alter table public.loans add column if not exists payee_id uuid references public.payees(id) on delete set null;
create index if not exists idx_loans_payee_id on public.loans(payee_id);

-- Backfill: link existing loans to a payee with the same name, creating it if needed.
insert into public.payees (user_id, name)
select distinct l.user_id, trim(l.lender_borrower)
from public.loans l
where l.payee_id is null and trim(l.lender_borrower) <> ''
  and not exists (
    select 1 from public.payees p
    where p.user_id = l.user_id and lower(p.name) = lower(trim(l.lender_borrower)));

update public.loans l
set payee_id = p.id
from public.payees p
where l.payee_id is null and p.user_id = l.user_id
  and lower(p.name) = lower(trim(l.lender_borrower));
