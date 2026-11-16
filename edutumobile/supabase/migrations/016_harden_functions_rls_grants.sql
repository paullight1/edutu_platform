-- =====================================================
-- SECURITY HARDENING — functions, grants, RLS, storage
--
-- Companion to 015_secure_credit_system.sql. Review carefully
-- and deploy 015 first, then this. Nothing here is destructive
-- to data, but it CHANGES ACCESS, so verify app flows after.
--
-- Fixes (from Supabase advisors + manual audit):
--  1. Privileged SECURITY DEFINER funcs are EXECUTE-granted to anon.
--  2. blog_posts has always-true (RLS-bypassing) write policies.
--  3. flashcards + blog_comments have RLS disabled while anon holds
--     full INSERT/UPDATE/DELETE -> world-writable tables.
--  4. 34 SECURITY DEFINER functions have a mutable search_path.
--  5. Public storage buckets expose a broad object-listing policy.
-- =====================================================

-- ─── 1. Revoke public execute on privileged / admin functions ─────────
-- These should only ever run from the service role (webhooks/back-office)
-- or with an internal auth check. They are currently callable by anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_grant_credits','admin_set_pro_status','review_creator_application',
        'sync_creator_status','sync_subscription_status','generate_user_recommendations',
        'update_creator_follower_counts','update_creator_roadmap_count',
        'update_roadmap_satisfaction','admin_add_credits'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END$$;
-- NOTE: admin_grant_credits / admin_set_pro_status gate on auth.uid(); if you
-- run admin actions from an authenticated Clerk session (not service role),
-- rewrite their guard to private.current_app_is_admin() and re-grant to
-- authenticated instead of the blanket revoke above.

-- ─── 2. Fix always-true policies on blog_posts ────────────────────────
-- Replace "authenticated can do ALL" with public read + admin-only writes.
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON public.blog_posts;
DROP POLICY IF EXISTS "Allow full access for authenticated users - blogs" ON public.blog_posts;

-- Also drop the two redundant published-read SELECT policies so blog_posts
-- ends with exactly one SELECT policy (clears multiple_permissive_policies).
DROP POLICY IF EXISTS "Allow public read for published posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Allow public read for published posts - blogs" ON public.blog_posts;

DROP POLICY IF EXISTS "Public can read published blog posts" ON public.blog_posts;
CREATE POLICY "Public can read published blog posts"
  ON public.blog_posts FOR SELECT
  USING (COALESCE(status, 'published') = 'published' OR private.current_app_is_admin());

-- Admin writes split by command (NOT "FOR ALL") so they don't overlap the
-- public SELECT policy above — which already grants admins read via its
-- `OR private.current_app_is_admin()` arm.
DROP POLICY IF EXISTS "Admins manage blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admins insert blog posts" ON public.blog_posts;
CREATE POLICY "Admins insert blog posts"
  ON public.blog_posts FOR INSERT WITH CHECK (private.current_app_is_admin());
DROP POLICY IF EXISTS "Admins update blog posts" ON public.blog_posts;
CREATE POLICY "Admins update blog posts"
  ON public.blog_posts FOR UPDATE
  USING (private.current_app_is_admin()) WITH CHECK (private.current_app_is_admin());
DROP POLICY IF EXISTS "Admins delete blog posts" ON public.blog_posts;
CREATE POLICY "Admins delete blog posts"
  ON public.blog_posts FOR DELETE USING (private.current_app_is_admin());

-- ─── 3. Close the world-writable tables ───────────────────────────────
-- Both still key ownership on a UUID user_id (pre-Clerk). Until they are
-- converted to TEXT Clerk ids, lock writes to the service role and expose
-- only safe public reads. (Enabling RLS with a single SELECT policy makes
-- INSERT/UPDATE/DELETE deny-by-default for anon/authenticated.)

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read cards in public decks" ON public.flashcards;
CREATE POLICY "Public can read cards in public decks"
  ON public.flashcards FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.flashcard_decks d
    WHERE d.id = flashcards.deck_id AND d.is_public
  ));

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read approved comments" ON public.blog_comments;
CREATE POLICY "Public can read approved comments"
  ON public.blog_comments FOR SELECT
  USING (COALESCE(status, 'approved') = 'approved');
-- TODO(clerk-migration): ALTER blog_comments.user_id / flashcard_decks.user_id
-- to TEXT, then add owner-scoped INSERT/UPDATE/DELETE policies keyed on
-- current_app_user_id() so users can post/manage their own rows again.

-- ─── 4. Pin search_path on every SECURITY DEFINER function ────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END$$;

-- ─── 5. Remove broad object-listing on public storage buckets ─────────
-- Public URL access does NOT require a listing SELECT policy. Dropping
-- these stops clients from enumerating every file in the bucket
-- (creator-proofs may contain other users' verification documents).
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "creator_proofs_public_read" ON storage.objects;
-- If you serve avatars via getPublicUrl(), no replacement policy is needed.
-- If you rely on list() for the avatars UI, re-add a NARROW policy scoped to
-- the requesting user's own folder instead of the whole bucket.

-- ─── 6. Creator-status transitions (trigger-safe) ─────────────────────
-- profiles.creator_status is protected by the 015 column-guard trigger, so
-- direct client UPDATEs (creator-apply.tsx, admin/creator-applications.tsx)
-- will start failing. This is the only sanctioned write path:
--   * the owner may move THEMSELVES into a self-service state
--     (none / pending / rejected) — e.g. submitting an application;
--   * an admin may set ANY valid status for any user (approve / reject).
CREATE OR REPLACE FUNCTION public.set_creator_status(
    p_status  TEXT,
    p_user_id TEXT DEFAULT NULL   -- admin only; ignored for self-service
)
RETURNS VOID AS $$
DECLARE
    v_caller   TEXT    := current_app_user_id();
    v_is_admin BOOLEAN := private.current_app_is_admin();
    v_target   TEXT;
BEGIN
    IF v_caller IS NULL AND NOT v_is_admin THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_status NOT IN ('none','pending','rejected','approved','active','suspended') THEN
        RAISE EXCEPTION 'Invalid creator status: %', p_status;
    END IF;

    IF v_is_admin THEN
        v_target := COALESCE(p_user_id, v_caller);
    ELSE
        v_target := v_caller;               -- own row only
        IF p_status NOT IN ('none','pending','rejected') THEN
            RAISE EXCEPTION 'Not authorized to set status %', p_status
                USING ERRCODE = '42501';    -- approved/active require admin
        END IF;
    END IF;

    PERFORM set_config('app.credit_op', 'on', true);  -- pass the 015 column guard
    UPDATE public.profiles
    SET creator_status = p_status,
        updated_at = NOW()
    WHERE user_id = v_target;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.set_creator_status(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_creator_status(TEXT, TEXT) TO authenticated;

-- ─── 7. Manual follow-ups (left as comments, not auto-applied) ─────────
-- * Move pg_trgm out of the public schema:
--     ALTER EXTENSION pg_trgm SET SCHEMA extensions;
--   Do this in a window where you can re-test trigram indexes/search, and
--   ensure "extensions" is in the database search_path.
-- * Enable leaked-password protection in Auth settings (HaveIBeenPwned).
