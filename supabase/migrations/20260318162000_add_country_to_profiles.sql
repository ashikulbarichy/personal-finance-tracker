-- Store a default country on the profile (used when no residency period is defined).

alter table public.profiles
  add column if not exists country_code text null;

comment on column public.profiles.country_code is
  'ISO-3166 country code representing current default country (used for tax + currency defaults).';

