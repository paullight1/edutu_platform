-- Canonical storage policy for Win-Coach / My Documents uploads.
-- Keep the bucket private and enforce the same 10 MB ceiling as UploadsService
-- at the storage boundary so oversized signed uploads are rejected before they
-- consume unbounded project storage or reach the API parser.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'cv-files',
  'cv-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
