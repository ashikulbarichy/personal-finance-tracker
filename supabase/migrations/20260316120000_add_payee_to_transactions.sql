-- Link transactions to payees (optional, mainly for expense transactions)
alter table public.transactions
  add column if not exists payee_id uuid
    references public.payees(id) on delete set null;

-- Index for filtering transactions by payee
create index if not exists transactions_payee_id_idx
  on public.transactions(payee_id);
