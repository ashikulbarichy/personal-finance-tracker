-- Add 'one_time' as a valid budget period alongside weekly/monthly/quarterly/annual.
-- One-time budgets have a fixed start/end date set by the user with no auto-calculated end.

alter table public.budgets
  drop constraint if exists budgets_period_check;

alter table public.budgets
  add constraint budgets_period_check
  check (period in ('weekly', 'monthly', 'quarterly', 'annual', 'one_time'));
