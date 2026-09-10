-- Identity Sentinel — Supabase Storage setup for identity-document images.
-- Run in Supabase Dashboard > SQL Editor (free tier is sufficient).
--
-- Prerequisite: Dashboard > Authentication > Sign In / Providers > Third-Party Auth
--   → add "Firebase" with your Firebase project ID. After that, requests carrying a
--   Firebase ID token run as the Postgres role `authenticated`, and auth.jwt() exposes the
--   Firebase claims: sub (Firebase uid), email, and any custom claims (app_role).
--
-- The bucket is PRIVATE. Nothing here grants anonymous access, and no object is ever public.
-- Object paths: screenings/{firebaseUid}/{screeningId}/{document|live}-{random}.jpg

-- ─────────────────────────────────────────────────────────────────────────────
-- BUCKET NAME: change it in this ONE function and set VITE_SUPABASE_STORAGE_BUCKET to
-- the same value (e.g. 'fake' if that is what you created in the dashboard).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.screening_bucket() returns text
language sql immutable as $$ select 'fake'::text $$;

-- 1. Private bucket "fake". Idempotent: creates it, or forces public = false if it already exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (public.screening_bucket(), public.screening_bucket(), false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Helper: the Firebase uid of the caller (auth.uid() is NOT used — Firebase uids are not UUIDs).
create or replace function public.firebase_uid() returns text
language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'sub', ''), '')
$$;

-- Helper: true when the Firebase custom claim app_role = 'admin' (set with scripts/set-user-claims.mjs).
create or replace function public.is_app_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', '') = 'admin'
$$;

-- 2. Policies on storage.objects (RLS is already enabled on this table by Supabase).
drop policy if exists "screening images: officer upload own folder" on storage.objects;
drop policy if exists "screening images: officer read own folder"   on storage.objects;
drop policy if exists "screening images: admin read all"            on storage.objects;
drop policy if exists "screening images: admin delete"              on storage.objects;

-- Officers may create objects only under screenings/{their own uid}/…
create policy "screening images: officer upload own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = public.screening_bucket()
  and (storage.foldername(name))[1] = 'screenings'
  and (storage.foldername(name))[2] = public.firebase_uid()
);

-- Officers may read (and therefore create signed URLs for) their own folder only.
create policy "screening images: officer read own folder"
on storage.objects for select to authenticated
using (
  bucket_id = public.screening_bucket()
  and (storage.foldername(name))[1] = 'screenings'
  and (storage.foldername(name))[2] = public.firebase_uid()
);

-- Admins (app_role claim) may read every screening image.
create policy "screening images: admin read all"
on storage.objects for select to authenticated
using (bucket_id = public.screening_bucket() and public.is_app_admin());

-- Only admins may delete (the app itself never deletes: the audit trail is append-only).
create policy "screening images: admin delete"
on storage.objects for delete to authenticated
using (bucket_id = public.screening_bucket() and public.is_app_admin());

-- No UPDATE policy: objects are immutable once written (the client uploads with upsert = false).
-- No policy for the `anon` role: unauthenticated requests are rejected.

-- Sanity check (optional): should return one row with public = false.
-- select id, public, file_size_limit from storage.buckets where id = public.screening_bucket();
