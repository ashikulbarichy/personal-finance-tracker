-- Pictures: profile photo + receipt photos on transactions.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Columns that point at objects in the bucket (paths, not URLs).
alter table public.profiles     add column if not exists avatar_path  text;
alter table public.transactions add column if not exists receipt_path text;

-- 2. Private bucket. 5 MB per file, images only (the app shrinks them to ~200 KB first).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Each user can only see and change files inside their own "<user id>/" folder.
drop policy if exists "media: own folder read"   on storage.objects;
drop policy if exists "media: own folder insert" on storage.objects;
drop policy if exists "media: own folder update" on storage.objects;
drop policy if exists "media: own folder delete" on storage.objects;

create policy "media: own folder read" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: own folder insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: own folder update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "media: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
