-- Community message attachments are never public objects.
--
-- Upload access is granted only through a short-lived signed upload URL issued
-- by the NestJS Communities service after `canPostInGroup` succeeds. Download
-- access is granted only through a five-minute signed URL issued after
-- `canReadGroup` succeeds. There is intentionally NO anon/authenticated policy
-- on storage.objects for this bucket; the service role is the only principal
-- that creates either signed URL.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'community-assets',
  'community-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove legacy policies if an earlier manual bucket setup used the names from
-- the original public upload helper. With no replacement policies, direct
-- client listing, reads, inserts, updates and deletes remain denied.
drop policy if exists "Public read community-assets" on storage.objects;
drop policy if exists "Anyone can upload community-assets" on storage.objects;
drop policy if exists "community_assets_public_read" on storage.objects;
drop policy if exists "community_assets_insert" on storage.objects;
drop policy if exists "community_assets_select" on storage.objects;
