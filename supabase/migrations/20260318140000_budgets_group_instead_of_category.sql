-- Replace category-based budgets with group-based budgets.
-- Adds group_id (FK -> transaction_groups) and drops category_id.

alter table public.budgets
  add column if not exists group_id uuid null
    references public.transaction_groups(id) on delete set null;

-- Copy category_id data cannot be mapped automatically (different table),
-- so we migrate what we can: nulls for existing rows is acceptable since
-- users will re-assign groups on edit.
update public.budgets set group_id = null where group_id is null;

-- Make group_id required going forward (non-null after backfill window)
-- We keep it nullable for now so existing rows don't break; enforce in app layer.

alter table public.budgets
  drop constraint if exists budgets_category_id_fkey;

alter table public.budgets
  drop column if exists category_id;

create index if not exists budgets_group_id_idx on public.budgets(group_id);
