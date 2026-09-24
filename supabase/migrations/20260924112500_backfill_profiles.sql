-- One-time backfill after 20260924100951_rebuild_schema_v2.sql.
-- That migration dropped and recreated `profiles`, but the signup trigger
-- only creates a profile for NEW auth users. Every table's user_id references
-- profiles(id), so existing users need their profile row recreated before
-- they can save anything. Safe to re-run (on conflict do nothing).

insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data->>'full_name'
from auth.users
on conflict (id) do nothing;

-- Optional: seed the default starter categories for those users.
-- Only run this once, or you'll get duplicate categories.
-- select public.create_default_categories(id) from auth.users;
