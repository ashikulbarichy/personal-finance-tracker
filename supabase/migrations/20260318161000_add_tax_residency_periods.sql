-- Country-aware income-tax estimation: user moves between countries over time.
-- This table records the user's tax residency periods.

create table if not exists public.user_tax_residency_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null,
  start_date date not null,
  end_date date null,
  tax_status text null,
  created_at timestamptz not null default now()
);

create index if not exists user_tax_residency_periods_user_id_idx
  on public.user_tax_residency_periods(user_id);

create index if not exists user_tax_residency_periods_date_idx
  on public.user_tax_residency_periods(user_id, start_date, end_date);

comment on table public.user_tax_residency_periods is
  'User tax residency periods used to choose country rules for income-tax estimation.';

