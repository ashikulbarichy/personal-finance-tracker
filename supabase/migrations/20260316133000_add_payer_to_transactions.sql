-- Link transactions to payers (optional, mainly for income transactions)
alter table public.transactions
  add column if not exists payer_id uuid
    references public.payees(id) on delete set null;

-- Index for filtering transactions by payer
create index if not exists transactions_payer_id_idx
  on public.transactions(payer_id);

