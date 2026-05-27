revoke all on table public.mobile_app_campaigns from anon, authenticated;
revoke all on table public.mobile_feature_flags from anon, authenticated;
revoke all on table public.widget_feeds from anon, authenticated;
revoke all on table public.mobile_campaign_events from anon, authenticated;

grant select on table public.mobile_app_campaigns to anon, authenticated;
grant select on table public.mobile_feature_flags to anon, authenticated;
grant select on table public.widget_feeds to anon, authenticated;
grant insert on table public.mobile_campaign_events to authenticated;

grant select, insert, update, delete on table public.mobile_app_campaigns to service_role;
grant select, insert, update, delete on table public.mobile_feature_flags to service_role;
grant select, insert, update, delete on table public.widget_feeds to service_role;
grant select, insert, update, delete on table public.mobile_campaign_events to service_role;
