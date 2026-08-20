begin;

-- Internal analytics helpers are invoked by triggers/server-owned functions,
-- never directly by browser clients.
revoke execute on function public.ensure_analytics_profile(text) from public, anon, authenticated;
grant execute on function public.ensure_analytics_profile(text) to service_role;

revoke execute on function public.touch_analytics_activity(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.touch_analytics_activity(text, text, jsonb) to service_role;

revoke execute on function public.increment_goal_daily_metric(text, date, integer, integer, integer, integer, integer, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.increment_goal_daily_metric(text, date, integer, integer, integer, integer, integer, numeric, jsonb) to service_role;

-- Trigger entry points do not need Data API execution privileges.
revoke execute on function public.handle_goal_insert() from public, anon, authenticated;
revoke execute on function public.handle_goal_update() from public, anon, authenticated;
revoke execute on function public.handle_goal_delete() from public, anon, authenticated;
grant execute on function public.handle_goal_insert() to service_role;
grant execute on function public.handle_goal_update() to service_role;
grant execute on function public.handle_goal_delete() to service_role;

-- Administrative opportunity statistics have no in-function admin check.
revoke execute on function public.opportunity_admin_stats() from public, anon, authenticated;
grant execute on function public.opportunity_admin_stats() to service_role;

-- Personalized recommendations and referral self-service require a signed-in
-- identity. Remove anonymous/PUBLIC RPC exposure while keeping authenticated
-- callers and the backend service role.
revoke execute on function public.get_recommended_roadmaps(text, integer) from public, anon;
grant execute on function public.get_recommended_roadmaps(text, integer) to authenticated, service_role;

revoke execute on function public.get_my_referral_stats() from public, anon;
grant execute on function public.get_my_referral_stats() to authenticated, service_role;

revoke execute on function public.get_or_create_my_referral_code() from public, anon;
grant execute on function public.get_or_create_my_referral_code() to authenticated, service_role;

revoke execute on function public.redeem_referral(text) from public, anon;
grant execute on function public.redeem_referral(text) to authenticated, service_role;

commit;
