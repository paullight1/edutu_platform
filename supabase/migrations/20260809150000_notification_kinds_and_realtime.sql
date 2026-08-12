-- Notification taxonomy for user interactions and application outcomes.
-- Keep the constraint explicit so producers cannot write unroutable kinds.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'goal-reminder', 'goal-weekly-digest', 'goal-progress',
    'opportunity-highlight', 'opportunity-alert', 'deadline-reminder',
    'admin-broadcast', 'system', 'interest', 'achievement',
    'community-call-reminder', 'community-call-started', 'community-call-missed',
    'community-message', 'community-request', 'application-status'
  ));

-- Realtime is a wake-up signal; the API remains the source of truth for rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
