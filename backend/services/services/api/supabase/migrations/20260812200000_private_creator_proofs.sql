-- Mentor and creator verification proofs are private application documents.
-- New submissions store only the object path; reviewers receive access through
-- short-lived signed URLs from an authenticated admin session.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-proofs',
  'creator-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creator_proofs_public_read" on storage.objects;
drop policy if exists "creator_proofs_admin_read" on storage.objects;
drop policy if exists "creator_proofs_authenticated_upload" on storage.objects;

create policy "creator_proofs_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'creator-proofs');

create policy "creator_proofs_admin_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'creator-proofs'
  and private.current_app_is_admin()
);
