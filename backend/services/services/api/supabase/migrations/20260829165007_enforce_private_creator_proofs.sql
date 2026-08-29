-- Creator proofs contain identity and eligibility evidence. Uploads and signed
-- downloads are brokered by the NestJS API with the service role; browser
-- clients must never receive a permanent public object URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-proofs',
  'creator-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove legacy direct-client access. The backend service role bypasses these
-- policies and is responsible for Clerk authorization and short-lived links.
drop policy if exists "creator_proofs_public_read" on storage.objects;
drop policy if exists "creator_proofs_admin_read" on storage.objects;
drop policy if exists "creator_proofs_authenticated_upload" on storage.objects;
