/*
  # Add transaction title

  ## Changes
  1. Add a title column to transactions for a short heading.
*/

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';

