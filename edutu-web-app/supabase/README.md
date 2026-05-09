# CV Storage Setup

This project now provisions a Supabase Storage bucket that keeps binary CV uploads alongside the existing `cv_records` metadata table. Apply the SQL in `supabase/schema.sql` through the Supabase SQL editor or CLI to create the bucket, RLS policies, and helper functions.

Key details:
- Bucket id: `cv-files`
- Maximum objects per user: 3 (enforced by `public.cv_files_under_limit()`)
- Maximum file size: 5 MB per upload
- Allowed MIME types: PDF, DOC, DOCX, ODT, TXT

After applying the schema:
1. Ensure your environment variables are configured (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the service role key wherever backend scripts run).
2. Any previously seeded CV records without `storage_path` are still readable, but only new uploads/generations create storage objects. Consider migrating legacy data if you need historical downloads.
3. The frontend `cvService.supabase.ts` module now uploads CV binaries to Storage, stores the `storage_path` in `cv_records`, and deletes the object when the row is removed.
4. Use `getCvDownloadUrl(cvId, expiresInSeconds)` to generate a short-lived signed URL when you need to serve a CV download link (default TTL is 60 seconds).

If you need to change limits, update:
- `MAX_CV_PER_USER` in `src/services/cvService.supabase.ts` to adjust the client-side guard.
- The `max_files` constant inside `public.cv_files_under_limit()` in `supabase/schema.sql`.
- `file_size_limit` and `allowed_mime_types` in the `storage.buckets` insert.

Run `npm run build` locally to confirm the TypeScript client compiles after any adjustment.
