-- One-time budgets have no recurrence and no date range.
-- Make budgets.start_date and budgets.end_date nullable and clear them for one_time budgets.

alter table public.budgets
  alter column start_date drop not null,
  alter column end_date drop not null;

update public.budgets
  set start_date = null,
      end_date = null
where period = 'one_time';

