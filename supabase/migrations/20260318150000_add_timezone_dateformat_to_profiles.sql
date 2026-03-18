-- Add timezone and date_format preferences to user profiles.

alter table public.profiles
  add column if not exists timezone text not null default 'UTC',
  add column if not exists date_format text not null default 'DD/MM/YYYY';

comment on column public.profiles.timezone is
  'IANA timezone string (e.g. Asia/Dhaka, America/New_York). Used to display and store transaction dates correctly.';

comment on column public.profiles.date_format is
  'Date display format: DD/MM/YYYY | MM/DD/YYYY | YYYY-MM-DD';
