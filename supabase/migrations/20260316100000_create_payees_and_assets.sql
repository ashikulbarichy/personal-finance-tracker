-- Payees: external people/companies who receive money from the user
create table if not exists public.payees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  category    text,          -- e.g. 'freelancer', 'vendor', 'individual'
  notes       text,
  total_paid  numeric(15,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.payees enable row level security;

create policy "Users manage own payees"
  on public.payees for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Assets: physical or financial assets with current value
create table if not exists public.assets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  asset_type      text not null,  -- e.g. 'real_estate', 'vehicle', 'electronics', 'jewelry', 'stock', 'crypto', 'other'
  purchase_price  numeric(15,2) not null default 0,
  current_value   numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  purchase_date   date,
  description     text,
  location        text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Users manage own assets"
  on public.assets for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
