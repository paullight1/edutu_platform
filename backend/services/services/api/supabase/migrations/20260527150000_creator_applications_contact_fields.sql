alter table if exists public.profiles
  add column if not exists creator_metadata jsonb default '{}'::jsonb,
  add column if not exists creator_rejection_reason text;

alter table if exists public.creator_applications
  add column if not exists email text,
  add column if not exists "phoneNumber" text,
  add column if not exists country text,
  add column if not exists "proofFileName" text,
  add column if not exists "proofFileType" text,
  add column if not exists "proofFileSize" integer,
  add column if not exists "proofUrl" text,
  add column if not exists "proofPath" text,
  add column if not exists "consentAccepted" boolean default false,
  add column if not exists proof_url text,
  add column if not exists proof_path text,
  add column if not exists proof_file_name text,
  add column if not exists proof_file_type text,
  add column if not exists proof_file_size integer,
  add column if not exists consent_accepted boolean default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-proofs',
  'creator-proofs',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creator_proofs_authenticated_upload" on storage.objects;
create policy "creator_proofs_authenticated_upload"
on storage.objects
for insert
with check (bucket_id = 'creator-proofs' and auth.role() = 'authenticated');

drop policy if exists "creator_proofs_public_read" on storage.objects;
create policy "creator_proofs_public_read"
on storage.objects
for select
using (bucket_id = 'creator-proofs');
