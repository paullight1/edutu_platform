-- Deployed to live prod via MCP as `lockdown_admin_and_helper_functions`.
--
-- Advisor 0028/0029: SECURITY DEFINER functions needlessly executable by
-- anon/authenticated. Verified call paths before locking:
--   * opportunity_admin_stats / count_opportunities_by_source are called ONLY
--     by the NestJS backend via the service-role client (opportunities.service
--     / scraper.service), each with a local fallback. The admin panel reads
--     analytics through that backend, not via direct RPC.
--   * handle_new_user / generate_roadmap_slug / cv_files_under_limit are
--     trigger/constraint helpers — invoked by the DML/constraint mechanism, so
--     removing client EXECUTE does not affect them.
--   * check_pro_status is redundant (clients read profiles.is_pro directly) and
--     leaked any user's pro status by id.
--   * toggle_follow_creator WRITES follows → must require auth.

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.opportunity_admin_stats()',
    'public.get_roadmap_stats()',
    'public.count_opportunities_by_source()',
    'public.get_signup_trends(integer)',
    'public.get_support_metrics(integer)',
    'public.get_opportunity_performance(integer)',
    'public.check_pro_status(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn);
  END LOOP;
END $$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.generate_roadmap_slug()',
    'public.cv_files_under_limit()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.toggle_follow_creator(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_follow_creator(text) TO authenticated;
