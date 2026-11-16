-- =====================================================
-- PRIVATE KYC STORAGE
--
-- creator-applications holds identity/KYC documents. It was public: any
-- guessable path was world-readable. This makes the bucket private and
-- restricts access:
--   • authenticated users may upload (INSERT) into the bucket
--   • only admins may read (SELECT) — the admin review screen resolves a
--     short-lived signed URL, which requires SELECT permission.
-- Applicants no longer read the object back (the client keeps a local
-- preview), so no owner-read policy is needed.
-- =====================================================

-- Ensure the bucket exists and is private.
INSERT INTO storage.buckets (id, name, public)
VALUES ('creator-applications', 'creator-applications', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Replace any broad/legacy policies on this bucket.
DROP POLICY IF EXISTS "creator_applications_insert" ON storage.objects;
DROP POLICY IF EXISTS "creator_applications_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "Public read creator-applications" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload creator-applications" ON storage.objects;

CREATE POLICY "creator_applications_insert"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'creator-applications');

CREATE POLICY "creator_applications_admin_read"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'creator-applications'
        AND private.current_app_is_admin()
    );
