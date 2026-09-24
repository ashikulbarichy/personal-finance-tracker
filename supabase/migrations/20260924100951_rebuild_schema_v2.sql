/*
  # Schema rebuild v2 — trimmed to exactly what the app uses
  ============================================================================
  This migration DROPS every table from the old schema and recreates a
  smaller, purpose-built one. Run this ONLY once you're ready to lose all
  existing data — there is no migration path from the old rows, by request.

  Kept, unchanged in shape: profiles (minus country_code), categories,
  accounts (currency + a fuller type list), loans + loan_payments (the
  balance-sync triggers are carried over as-is), savings_goals +
  savings_goal_allocations.

  Redesigned:
   - transactions: drops tags/group_id/budget_id/tax_*; adds split_group_id
     to properly link a split's line items (group_id used to do this job
     loosely and was never exposed in the UI).
   - budgets: was a single free-form envelope; now one row per category per
     period (monthly or yearly) so past budgets stay on record — see the
     "Budget model" decision (2026-09-24).
   - recurring_transactions: adds interval_count + an end condition (never /
     on a date / after N occurrences) and occurrences_count to track it.
   - payees: trimmed to name + notes; email/phone/category/total_paid were
     unused in the UI and totals are computed from transactions.

  Dropped entirely (unused by the app): tags, subscriptions, automation_rules,
  automation_logs, transaction_groups, user_tax_residency_periods,
  exchange_rates (a dead FX cache — the app uses manual rates), assets.
  Also dropped: the demo-data seed function and the auto-post recurring
  function (recurring is confirm-based now, not auto-posted).
  ============================================================================
*/

-- ── 1. Drop everything from the old schema ────────────────────────────────
drop function if exists public.create_demo_data(uuid);
drop function if exists public.process_due_recurring_transactions();
drop function if exists public.create_default_categories(uuid);

drop table if exists public.automation_logs cascade;
drop table if exists public.automation_rules cascade;
drop table if exists public.user_tax_residency_periods cascade;
drop table if exists public.transaction_groups cascade;
drop table if exists public.exchange_rates cascade;
drop table if exists public.assets cascade;
drop table if exists public.subscriptions cascade;
drop table if exists public.savings_goal_allocations cascade;
drop table if exists public.savings_goals cascade;
drop table if exists public.loan_payments cascade;
drop table if exists public.loans cascade;
drop table if exists public.recurring_transactions cascade;
drop table if exists public.budgets cascade;
drop table if exists public.transactions cascade;
drop table if exists public.tags cascade;
drop table if exists public.payees cascade;
drop table if exists public.categories cascade;
drop table if exists public.accounts cascade;
drop table if exists public.profiles cascade;

drop function if exists public.apply_transaction_delta() cascade;
drop function if exists public.apply_loan_payment_delta() cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.update_updated_at_column() cascade;
drop function if exists public.create_default_categories(uuid) cascade;

-- ── 2. profiles ─────────────────────────────────────────────────────────
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text unique not null,
  full_name          text,
  profession         text,
  default_currency   text not null default 'USD',
  enabled_currencies text[] not null default array['USD'],
  timezone           text not null default 'UTC',
  date_format        text not null default 'DD/MM/YYYY',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── 3. accounts ─────────────────────────────────────────────────────────
-- Covers every account shape the user listed: everyday spend/salary,
-- savings, mobile money, foreign-currency bank accounts (just `currency`),
-- multi-currency cards, virtual cards, investment/credit.
create table public.accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  type       text not null check (type in (
               'checking', 'savings', 'credit_card', 'virtual_card',
               'cash', 'investment', 'mfs', 'multi_currency'
             )),
  balance    numeric(15, 2) not null default 0,
  currency   text not null default 'USD',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_accounts_user_id on public.accounts(user_id);

-- ── 4. categories ───────────────────────────────────────────────────────
create table public.categories (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  name               text not null,
  type               text not null check (type in ('income', 'expense')),
  icon               text not null default 'circle',
  color              text not null default '#6B7280',
  parent_category_id uuid references public.categories(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index idx_categories_user_id on public.categories(user_id);

-- ── 5. payees ───────────────────────────────────────────────────────────
-- Optional — just enough to know who you pay/are paid by most.
create table public.payees (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payees_user_id on public.payees(user_id);

-- ── 6. transactions ─────────────────────────────────────────────────────
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  account_id       uuid not null references public.accounts(id) on delete cascade,
  category_id      uuid references public.categories(id) on delete set null,
  payee_id         uuid references public.payees(id) on delete set null,
  payer_id         uuid references public.payees(id) on delete set null,
  -- Internal wiring, not user-facing: links a transfer's two legs, a split's
  -- line items, and a transaction generated from a loan payment.
  transfer_pair_id uuid,
  split_group_id   uuid,
  loan_payment_id  uuid,
  amount           numeric(15, 2) not null check (amount > 0),
  type             text not null check (type in ('income', 'expense')),
  currency         text not null default 'USD',
  -- Manual exchange rate override for this one transaction (1 unit of the
  -- account's currency = this many units of the default currency).
  custom_rate      numeric,
  -- A fee taken on top of `amount` (e.g. a transfer/withdrawal charge).
  charge_amount    numeric(15, 2),
  title            text not null,
  description      text,
  transaction_date timestamptz not null default now(),
  timezone         text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_transactions_user_id ON public.transactions(user_id);
create index idx_transactions_account_id ON public.transactions(account_id);
create index idx_transactions_date ON public.transactions(transaction_date);
create index idx_transactions_category_id ON public.transactions(category_id);
create index idx_transactions_payee_id ON public.transactions(payee_id) where payee_id is not null;
create index idx_transactions_payer_id ON public.transactions(payer_id) where payer_id is not null;
create index idx_transactions_transfer_pair_id ON public.transactions(transfer_pair_id) where transfer_pair_id is not null;
create index idx_transactions_split_group_id ON public.transactions(split_group_id) where split_group_id is not null;
-- transactions.loan_payment_id has no FK yet — loan_payments doesn't exist until
-- section 10, which adds the constraint right after creating it.

-- ── 7. budgets — one row per category per period, so history stays ────────
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  period_type  text not null check (period_type in ('monthly', 'yearly')),
  period_start date not null,
  period_end   date not null,
  amount       numeric(15, 2) not null check (amount > 0),
  currency     text not null default 'USD',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, category_id, period_type, period_start)
);
create index idx_budgets_user_id on public.budgets(user_id);
create index idx_budgets_category_id on public.budgets(category_id);

-- ── 8. recurring_transactions — with an end condition ──────────────────────
create table public.recurring_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  category_id       uuid references public.categories(id) on delete set null,
  payee_id          uuid references public.payees(id) on delete set null,
  name              text not null,
  amount            numeric(15, 2) not null check (amount > 0),
  type              text not null check (type in ('income', 'expense')),
  frequency         text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count    int not null default 1 check (interval_count > 0),
  next_date         date not null,
  end_type          text not null default 'never' check (end_type in ('never', 'on_date', 'after_occurrences')),
  end_date          date,
  max_occurrences   int check (max_occurrences is null or max_occurrences > 0),
  occurrences_count int not null default 0,
  is_active         boolean not null default true,
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_recurring_transactions_user_id on public.recurring_transactions(user_id);

-- ── 9. savings_goals + allocations ─────────────────────────────────────────
create table public.savings_goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete set null,
  name           text not null,
  timeline       text not null default 'short_term' check (timeline in ('short_term', 'mid_term', 'long_term')),
  target_amount  numeric(15, 2) not null,
  current_amount numeric(15, 2) not null default 0,
  deadline       date,
  is_completed   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_savings_goals_user_id on public.savings_goals(user_id);

create table public.savings_goal_allocations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  goal_id    uuid not null references public.savings_goals(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount     numeric(15, 2) not null,
  created_at timestamptz not null default now()
);
create index idx_savings_goal_allocations_goal_id on public.savings_goal_allocations(goal_id);
create index idx_savings_goal_allocations_user_id on public.savings_goal_allocations(user_id);

-- ── 10. loans + loan_payments — both directions, multiple occasions ───────
create table public.loans (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  account_id       uuid references public.accounts(id) on delete set null,
  name             text not null,
  type             text not null check (type in ('lending', 'borrowing')),
  principal_amount numeric(15, 2) not null,
  current_balance  numeric(15, 2) not null,
  interest_rate    numeric(5, 2) not null default 0,
  lender_borrower  text not null,
  due_date         date,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_loans_user_id on public.loans(user_id);

create table public.loan_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  loan_id         uuid not null references public.loans(id) on delete cascade,
  from_account_id uuid references public.accounts(id) on delete set null,
  to_account_id   uuid references public.accounts(id) on delete set null,
  amount          numeric(15, 2) not null check (amount > 0),
  payment_type    text not null check (payment_type in ('disbursement', 'repayment')),
  payment_date    timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now()
);
create index idx_loan_payments_user_id on public.loan_payments(user_id);
create index idx_loan_payments_loan_id on public.loan_payments(loan_id);

-- Now that loan_payments exists, wire up the FK deferred from section 6.
alter table public.transactions
  add constraint transactions_loan_payment_id_fkey
  foreign key (loan_payment_id) references public.loan_payments(id) on delete cascade;
create index idx_transactions_loan_payment_id on public.transactions(loan_payment_id) where loan_payment_id is not null;

-- ── 11. Row Level Security — every table, own-rows-only ────────────────────
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.payees enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_goal_allocations enable row level security;
alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;

create policy "own profile select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "own accounts" on public.accounts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own categories" on public.categories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own payees" on public.payees for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on public.transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own budgets" on public.budgets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own recurring transactions" on public.recurring_transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own savings goals" on public.savings_goals for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own savings goal allocations" on public.savings_goal_allocations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own loans" on public.loans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own loan payments" on public.loan_payments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 12. New-user setup: profile row + a starter set of categories ─────────
create or replace function public.create_default_categories(target_user_id uuid)
returns void as $$
begin
  insert into public.categories (user_id, name, type, icon, color) values
    (target_user_id, 'Groceries', 'expense', 'shopping-cart', '#EF4444'),
    (target_user_id, 'Dining Out', 'expense', 'utensils', '#F59E0B'),
    (target_user_id, 'Transportation', 'expense', 'car', '#3B82F6'),
    (target_user_id, 'Utilities', 'expense', 'home', '#14B8A6'),
    (target_user_id, 'Entertainment', 'expense', 'music', '#8B5CF6'),
    (target_user_id, 'Healthcare', 'expense', 'heart', '#EC4899'),
    (target_user_id, 'Shopping', 'expense', 'gift', '#FBBF24'),
    (target_user_id, 'Other Expenses', 'expense', 'circle', '#6B7280'),
    (target_user_id, 'Salary', 'income', 'briefcase', '#10B981'),
    (target_user_id, 'Freelance', 'income', 'briefcase', '#3B82F6'),
    (target_user_id, 'Investment', 'income', 'trending-up', '#14B8A6'),
    (target_user_id, 'Other Income', 'income', 'circle', '#6B7280');
end;
$$ language plpgsql security definer;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  perform public.create_default_categories(new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 13. updated_at bookkeeping ──────────────────────────────────────────
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger update_accounts_updated_at before update on public.accounts for each row execute function public.update_updated_at_column();
create trigger update_payees_updated_at before update on public.payees for each row execute function public.update_updated_at_column();
create trigger update_transactions_updated_at before update on public.transactions for each row execute function public.update_updated_at_column();
create trigger update_budgets_updated_at before update on public.budgets for each row execute function public.update_updated_at_column();
create trigger update_recurring_transactions_updated_at before update on public.recurring_transactions for each row execute function public.update_updated_at_column();
create trigger update_savings_goals_updated_at before update on public.savings_goals for each row execute function public.update_updated_at_column();
create trigger update_loans_updated_at before update on public.loans for each row execute function public.update_updated_at_column();

-- ── 14. Account balances follow transactions automatically ────────────────
create or replace function public.apply_transaction_delta()
returns trigger as $$
declare
  old_delta numeric := 0;
  new_delta numeric := 0;
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    old_delta := case when old.type = 'income' then old.amount
                       when old.type = 'expense' then -old.amount
                       else 0 end
                 - coalesce(old.charge_amount, 0);
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    new_delta := case when new.type = 'income' then new.amount
                       when new.type = 'expense' then -new.amount
                       else 0 end
                 - coalesce(new.charge_amount, 0);
  end if;

  if tg_op = 'DELETE' then
    update public.accounts set balance = balance - old_delta where id = old.account_id;
    return old;
  end if;

  if tg_op = 'INSERT' then
    update public.accounts set balance = balance + new_delta where id = new.account_id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.account_id <> new.account_id then
      update public.accounts set balance = balance - old_delta where id = old.account_id;
      update public.accounts set balance = balance + new_delta where id = new.account_id;
    else
      update public.accounts set balance = balance - old_delta + new_delta where id = new.account_id;
    end if;
    return new;
  end if;

  return null;
end;
$$ language plpgsql;

create trigger transactions_balance_insert after insert on public.transactions for each row execute function public.apply_transaction_delta();
create trigger transactions_balance_update after update on public.transactions for each row execute function public.apply_transaction_delta();
create trigger transactions_balance_delete after delete on public.transactions for each row execute function public.apply_transaction_delta();

-- ── 15. Loan balances follow loan_payments; each payment also posts a
--        linked transaction so the account side stays in sync too ─────────
create or replace function public.apply_loan_payment_delta()
returns trigger as $$
declare
  loan_row loans%rowtype;
  repay_delta numeric := 0;
  tx_account_id uuid;
  tx_type text;
begin
  select * into loan_row from public.loans
  where id = coalesce(case when tg_op = 'DELETE' then old.loan_id else new.loan_id end, old.loan_id);

  -- Disbursements don't move loan.current_balance (it starts at principal on
  -- INSERT); only repayments reduce it toward zero.
  if tg_op = 'INSERT' and new.payment_type = 'repayment' then
    repay_delta := -new.amount;
  elsif tg_op = 'DELETE' and old.payment_type = 'repayment' then
    repay_delta := old.amount;
  elsif tg_op = 'UPDATE' then
    if old.payment_type = 'repayment' then repay_delta := repay_delta + old.amount; end if;
    if new.payment_type = 'repayment' then repay_delta := repay_delta - new.amount; end if;
  end if;

  if repay_delta <> 0 then
    update public.loans
    set current_balance = greatest(current_balance + repay_delta, 0),
        is_active = (current_balance + repay_delta) > 0
    where id = loan_row.id;
  end if;

  -- Only on INSERT — avoids double-counting the linked transaction on UPDATE.
  if tg_op = 'INSERT' then
    if loan_row.type = 'borrowing' then
      if new.payment_type = 'disbursement' then
        tx_account_id := coalesce(new.to_account_id, new.from_account_id);
        tx_type := 'income';
      else
        tx_account_id := coalesce(new.from_account_id, new.to_account_id);
        tx_type := 'expense';
      end if;
    elsif loan_row.type = 'lending' then
      if new.payment_type = 'disbursement' then
        tx_account_id := coalesce(new.from_account_id, new.to_account_id);
        tx_type := 'expense';
      else
        tx_account_id := coalesce(new.to_account_id, new.from_account_id);
        tx_type := 'income';
      end if;
    end if;

    if tx_account_id is not null then
      insert into public.transactions (
        user_id, account_id, category_id, amount, type, title,
        description, transaction_date, timezone, notes, loan_payment_id, currency
      ) values (
        loan_row.user_id, tx_account_id, null, new.amount, tx_type, loan_row.name,
        coalesce(new.notes, new.payment_type || ' for loan ' || loan_row.name),
        new.payment_date, null, new.notes, new.id,
        (select currency from public.accounts where id = tx_account_id)
      );
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_payments_delta
  after insert or update or delete on public.loan_payments
  for each row execute function public.apply_loan_payment_delta();
