-- Migration: Ensure `icon` column exists on categories and backfill defaults
-- Run with your Supabase migrations tool (e.g. `supabase db push` or via SQL editor)

BEGIN;

-- Add the column if it doesn't exist and set a sensible default
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon text DEFAULT 'circle';

-- Backfill existing rows where icon is null or empty
UPDATE public.categories
  SET icon = 'circle'
  WHERE icon IS NULL OR trim(icon) = '';

-- Ensure default is set for the column
ALTER TABLE public.categories
  ALTER COLUMN icon SET DEFAULT 'circle';

COMMIT;
