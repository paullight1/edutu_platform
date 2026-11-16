-- =====================================================
-- PERF: consolidate multiple permissive policies (advisor: multiple_permissive_policies)
--
-- Postgres evaluates EVERY permissive policy for a (role, command) on each
-- row. Most tables here carry an "admin" policy AND an "owner" policy for the
-- same command, so both run per row. This migration replaces each overlapping
-- set with ONE policy per command whose condition is the OR of the originals.
--
-- SEMANTICS ARE PRESERVED: `permissive` policies combine with OR, so
-- (owner) OR (admin) as a single policy == two separate permissive policies.
-- Each table's original admin/owner expressions are reproduced verbatim.
--
-- REVIEW BEFORE DEPLOY. Recommended: apply on a branch and confirm that
-- (a) a normal user sees only their own rows, (b) an admin sees all,
-- (c) service-role webhooks still work (service_role bypasses RLS anyway).
--
-- Depends on migrations 015 (profiles column-guard trigger + set_creator_status)
-- and 016 (blog_posts handled there). Deploy 015 -> 016 -> 018.
-- =====================================================

-- ─── creator_applications ─────────────────────────────────────────────
-- SELECT: admin + two identical owner policies -> one.
DROP POLICY IF EXISTS "Admins can view all applications"        ON public.creator_applications;
DROP POLICY IF EXISTS "Users can view own applications"         ON public.creator_applications;
DROP POLICY IF EXISTS "Users can view their own applications"   ON public.creator_applications;
CREATE POLICY "creator_applications_select" ON public.creator_applications
  FOR SELECT USING (
    (SELECT auth.uid())::text = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = (SELECT auth.uid())::text AND p.role = 'admin')
  );

-- INSERT: two identical owner policies -> one (owner only, as before).
DROP POLICY IF EXISTS "Users can insert own applications"       ON public.creator_applications;
DROP POLICY IF EXISTS "Users can insert their own applications" ON public.creator_applications;
CREATE POLICY "creator_applications_insert" ON public.creator_applications
  FOR INSERT WITH CHECK ((SELECT auth.uid())::text = user_id);

-- UPDATE: admin + owner(pending) -> one.
DROP POLICY IF EXISTS "Admins can update all applications"      ON public.creator_applications;
DROP POLICY IF EXISTS "Users can update own pending applications" ON public.creator_applications;
CREATE POLICY "creator_applications_update" ON public.creator_applications
  FOR UPDATE USING (
    ((SELECT auth.uid())::text = user_id AND status = 'pending')
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = (SELECT auth.uid())::text AND p.role = 'admin')
  );
-- (DELETE "Admins can delete applications" is a single policy — left as-is.)

-- ─── profiles ─────────────────────────────────────────────────────────
-- SELECT: admin + owner -> one.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    (SELECT current_app_user_id()) = user_id
    OR (SELECT auth.role()) = 'service_role'
    OR (SELECT private.current_app_is_admin())
  );

-- UPDATE: "Users can submit creator application" is now superseded by the
-- set_creator_status() RPC (016) + the 015 column-guard trigger; its OR'd
-- WITH CHECK is a strict subset of "Users can update own profile". Drop it.
DROP POLICY IF EXISTS "Users can submit creator application" ON public.profiles;
-- ("Users can update own profile" and "Users can insert own profile" remain.)

-- ─── credit_transactions ──────────────────────────────────────────────
-- Replace admin(ALL) + admin(SELECT) + owner(SELECT) + system(INSERT) with
-- one policy per command. admin = role in (admin, super_admin).
DROP POLICY IF EXISTS "Admins can manage transactions"    ON public.credit_transactions;
DROP POLICY IF EXISTS "Admins can view all transactions"  ON public.credit_transactions;
DROP POLICY IF EXISTS "Users can view own transactions"   ON public.credit_transactions;
DROP POLICY IF EXISTS "System inserts transactions"       ON public.credit_transactions;
CREATE POLICY "credit_transactions_select" ON public.credit_transactions
  FOR SELECT USING (
    (SELECT auth.uid())::text = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = (SELECT auth.uid())::text
                 AND p.role = ANY (ARRAY['admin','super_admin']))
  );
CREATE POLICY "credit_transactions_insert" ON public.credit_transactions
  FOR INSERT WITH CHECK (
    (SELECT auth.role()) = 'service_role'
    OR (SELECT auth.uid())::text = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = (SELECT auth.uid())::text
                 AND p.role = ANY (ARRAY['admin','super_admin']))
  );
CREATE POLICY "credit_transactions_admin_write" ON public.credit_transactions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.uid())::text
              AND p.role = ANY (ARRAY['admin','super_admin']))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.uid())::text
              AND p.role = ANY (ARRAY['admin','super_admin']))
  );
CREATE POLICY "credit_transactions_admin_delete" ON public.credit_transactions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.uid())::text
              AND p.role = ANY (ARRAY['admin','super_admin']))
  );

-- ─── user_personalization ─────────────────────────────────────────────
-- owner(ALL) + admin(SELECT) -> per-command (admin read added to SELECT).
DROP POLICY IF EXISTS "Users manage own personalization"    ON public.user_personalization;
DROP POLICY IF EXISTS "Admins can view personalization data" ON public.user_personalization;
CREATE POLICY "user_personalization_select" ON public.user_personalization
  FOR SELECT USING (
    (SELECT current_app_user_id()) = user_id
    OR (SELECT auth.role()) = 'service_role'
    OR (SELECT private.current_app_is_admin())
  );
CREATE POLICY "user_personalization_insert" ON public.user_personalization
  FOR INSERT WITH CHECK ((SELECT current_app_user_id()) = user_id);
CREATE POLICY "user_personalization_update" ON public.user_personalization
  FOR UPDATE USING ((SELECT current_app_user_id()) = user_id)
             WITH CHECK ((SELECT current_app_user_id()) = user_id);
CREATE POLICY "user_personalization_delete" ON public.user_personalization
  FOR DELETE USING ((SELECT current_app_user_id()) = user_id);

-- ─── admin + owner "ALL" tables (identical shape) ─────────────────────
-- roadmap_enrollments / roadmap_feedback / user_opportunity_signals /
-- user_roadmap_intents: admin_all + owner_all (both authenticated) -> one.
-- The separate *_service_role_all (TO service_role) policies don't overlap
-- and are left in place.
DROP POLICY IF EXISTS roadmap_enrollments_admin_all ON public.roadmap_enrollments;
DROP POLICY IF EXISTS roadmap_enrollments_owner_all ON public.roadmap_enrollments;
CREATE POLICY roadmap_enrollments_rw ON public.roadmap_enrollments
  FOR ALL TO authenticated
  USING      ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()));

DROP POLICY IF EXISTS roadmap_feedback_admin_all ON public.roadmap_feedback;
DROP POLICY IF EXISTS roadmap_feedback_owner_all ON public.roadmap_feedback;
CREATE POLICY roadmap_feedback_rw ON public.roadmap_feedback
  FOR ALL TO authenticated
  USING      ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()));

DROP POLICY IF EXISTS user_opportunity_signals_admin_all ON public.user_opportunity_signals;
DROP POLICY IF EXISTS user_opportunity_signals_owner_all ON public.user_opportunity_signals;
CREATE POLICY user_opportunity_signals_rw ON public.user_opportunity_signals
  FOR ALL TO authenticated
  USING      ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()));

DROP POLICY IF EXISTS user_roadmap_intents_admin_all ON public.user_roadmap_intents;
DROP POLICY IF EXISTS user_roadmap_intents_owner_all ON public.user_roadmap_intents;
CREATE POLICY user_roadmap_intents_rw ON public.user_roadmap_intents
  FOR ALL TO authenticated
  USING      ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()));

-- user_opportunity_preferences: same, plus two redundant owner-scoped
-- "Enable authenticated ..." policies (INSERT/UPDATE) that duplicate owner_all.
DROP POLICY IF EXISTS "Enable authenticated write access on preferences"  ON public.user_opportunity_preferences;
DROP POLICY IF EXISTS "Enable authenticated update access on preferences" ON public.user_opportunity_preferences;
DROP POLICY IF EXISTS user_opportunity_preferences_admin_all ON public.user_opportunity_preferences;
DROP POLICY IF EXISTS user_opportunity_preferences_owner_all ON public.user_opportunity_preferences;
CREATE POLICY user_opportunity_preferences_rw ON public.user_opportunity_preferences
  FOR ALL TO authenticated
  USING      ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT current_app_user_id()) = user_id OR (SELECT private.current_app_is_admin()));

-- ─── community_posts ──────────────────────────────────────────────────
-- owner(ALL) + public-read(SELECT) -> per-command; SELECT gains owner + public.
DROP POLICY IF EXISTS "Users manage own community posts" ON public.community_posts;
DROP POLICY IF EXISTS "Public can read community posts"  ON public.community_posts;
CREATE POLICY "community_posts_select" ON public.community_posts
  FOR SELECT USING (
    visibility = 'public'
    OR (SELECT auth.jwt() ->> 'sub') = user_id
    OR (SELECT auth.role()) = 'service_role'
  );
CREATE POLICY "community_posts_insert" ON public.community_posts
  FOR INSERT WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "community_posts_update" ON public.community_posts
  FOR UPDATE USING ((SELECT auth.jwt() ->> 'sub') = user_id)
             WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "community_posts_delete" ON public.community_posts
  FOR DELETE USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- ─── community_comments ───────────────────────────────────────────────
-- owner(ALL) + view-on-visible-posts(SELECT) -> per-command.
DROP POLICY IF EXISTS "Users manage own comments"          ON public.community_comments;
DROP POLICY IF EXISTS "Users view comments on visible posts" ON public.community_comments;
CREATE POLICY "community_comments_select" ON public.community_comments
  FOR SELECT USING (
    (SELECT auth.jwt() ->> 'sub') = user_id
    OR EXISTS (SELECT 1 FROM public.community_posts p
               WHERE p.id = community_comments.post_id
                 AND (p.visibility = 'public'
                      OR p.user_id = (SELECT auth.jwt() ->> 'sub')
                      OR (SELECT auth.role()) = 'service_role'))
  );
CREATE POLICY "community_comments_insert" ON public.community_comments
  FOR INSERT WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "community_comments_update" ON public.community_comments
  FOR UPDATE USING ((SELECT auth.jwt() ->> 'sub') = user_id)
             WITH CHECK ((SELECT auth.jwt() ->> 'sub') = user_id);
CREATE POLICY "community_comments_delete" ON public.community_comments
  FOR DELETE USING ((SELECT auth.jwt() ->> 'sub') = user_id);

-- ─── community_stories ────────────────────────────────────────────────
-- admin(ALL) + public-view-approved(SELECT) -> per-command.
DROP POLICY IF EXISTS "Admins can do everything on stories" ON public.community_stories;
DROP POLICY IF EXISTS "Public can view approved stories"    ON public.community_stories;
CREATE POLICY "community_stories_select" ON public.community_stories
  FOR SELECT USING (
    status = 'approved' OR visibility = 'public'
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = (SELECT auth.jwt() ->> 'sub') AND p.role = 'admin')
  );
-- Admin writes split by command (NOT "FOR ALL") so they don't overlap
-- community_stories_select — which already grants admins read via its
-- admin arm. admin = EXISTS(profiles where user_id = jwt.sub and role='admin').
CREATE POLICY "community_stories_admin_insert" ON public.community_stories
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.jwt() ->> 'sub') AND p.role = 'admin'));
CREATE POLICY "community_stories_admin_update" ON public.community_stories
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.jwt() ->> 'sub') AND p.role = 'admin'))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.jwt() ->> 'sub') AND p.role = 'admin'));
CREATE POLICY "community_stories_admin_delete" ON public.community_stories
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = (SELECT auth.jwt() ->> 'sub') AND p.role = 'admin'));

-- ─── flashcard_decks ──────────────────────────────────────────────────
-- owner(ALL) + public_select(SELECT) -> per-command. (user_id is uuid here;
-- unchanged pre-Clerk semantics preserved.)
DROP POLICY IF EXISTS flashcard_decks_owner_all     ON public.flashcard_decks;
DROP POLICY IF EXISTS flashcard_decks_public_select ON public.flashcard_decks;
CREATE POLICY flashcard_decks_select ON public.flashcard_decks
  FOR SELECT USING (
    is_public = true
    OR (SELECT auth.uid()) = user_id
    OR (SELECT auth.role()) = 'service_role'
  );
CREATE POLICY flashcard_decks_insert ON public.flashcard_decks
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
CREATE POLICY flashcard_decks_update ON public.flashcard_decks
  FOR UPDATE USING ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role')
             WITH CHECK ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');
CREATE POLICY flashcard_decks_delete ON public.flashcard_decks
  FOR DELETE USING ((SELECT auth.uid()) = user_id OR (SELECT auth.role()) = 'service_role');

-- ─── roadmaps ─────────────────────────────────────────────────────────
-- admin_all(authenticated) + published-read(public) overlap on SELECT.
-- Split admin into non-SELECT; fold admin read into the public SELECT policy.
DROP POLICY IF EXISTS roadmaps_admin_all ON public.roadmaps;
DROP POLICY IF EXISTS "Anyone can view published roadmaps" ON public.roadmaps;
CREATE POLICY roadmaps_select ON public.roadmaps
  FOR SELECT USING (status = 'published' OR (SELECT private.current_app_is_admin()));
CREATE POLICY roadmaps_admin_insert ON public.roadmaps
  FOR INSERT TO authenticated WITH CHECK ((SELECT private.current_app_is_admin()));
CREATE POLICY roadmaps_admin_update ON public.roadmaps
  FOR UPDATE TO authenticated
  USING ((SELECT private.current_app_is_admin()))
  WITH CHECK ((SELECT private.current_app_is_admin()));
CREATE POLICY roadmaps_admin_delete ON public.roadmaps
  FOR DELETE TO authenticated USING ((SELECT private.current_app_is_admin()));
-- (roadmaps_service_role_all left in place.)
