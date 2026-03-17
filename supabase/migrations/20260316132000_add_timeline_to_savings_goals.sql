-- Add timeline type to savings goals (short/mid/long term)
ALTER TABLE public.savings_goals
  ADD COLUMN IF NOT EXISTS timeline text NOT NULL DEFAULT 'short_term';

ALTER TABLE public.savings_goals
  DROP CONSTRAINT IF EXISTS savings_goals_timeline_check;

ALTER TABLE public.savings_goals
  ADD CONSTRAINT savings_goals_timeline_check
  CHECK (timeline IN ('short_term', 'mid_term', 'long_term'));

