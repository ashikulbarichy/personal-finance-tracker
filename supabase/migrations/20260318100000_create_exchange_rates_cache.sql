-- Cache table for real-time exchange rates fetched via Edge Function.
-- One row per base currency, refreshed hourly.

create table if not exists public.exchange_rates (
  base_currency text primary key,
  rates         jsonb       not null,
  provider      text        not null default 'freecurrencyapi',
  fetched_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '1 hour')
);

create index if not exists exchange_rates_expires_at_idx
  on public.exchange_rates (expires_at);

alter table public.exchange_rates enable row level security;

-- Authenticated users can read (rates are not user-specific)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'exchange_rates'
      and policyname = 'exchange_rates_read_authenticated'
  ) then
    create policy exchange_rates_read_authenticated
      on public.exchange_rates
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Writes are performed by the Edge Function using the service role key
-- (service role bypasses RLS, so no write policy is needed here).
