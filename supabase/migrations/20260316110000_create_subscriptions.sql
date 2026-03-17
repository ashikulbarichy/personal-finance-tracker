-- Subscriptions: standalone subscription services (Netflix, Spotify, SaaS, etc.)
-- A recurring_transaction can optionally reference a subscription, but neither requires the other.
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  provider        text,                   -- company / brand name if different from name
  plan            text,                   -- e.g. 'Premium', 'Family', 'Pro'
  amount          numeric(15,2) not null,
  currency        text not null default 'USD',
  billing_cycle   text not null default 'monthly',   -- monthly | yearly | weekly | quarterly
  category_id     uuid references public.categories(id) on delete set null,
  account_id      uuid references public.accounts(id) on delete set null,
  start_date      date,
  renewal_date    date,
  website         text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users manage own subscriptions"
  on public.subscriptions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional link from recurring_transactions → subscriptions
alter table public.recurring_transactions
  add column if not exists subscription_id uuid
    references public.subscriptions(id) on delete set null;
