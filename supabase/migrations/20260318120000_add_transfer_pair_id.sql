-- Link the two legs (expense + income) of a transfer together so the UI
-- can display them as one combined row instead of two separate transactions.
-- NULL means the transaction is not part of a transfer pair.

alter table public.transactions
  add column if not exists transfer_pair_id uuid null;

create index if not exists transactions_transfer_pair_id_idx
  on public.transactions (transfer_pair_id)
  where transfer_pair_id is not null;

comment on column public.transactions.transfer_pair_id is
  'UUID shared by both legs of a transfer (expense leg + income leg). '
  'NULL = regular income/expense, not a transfer.';
