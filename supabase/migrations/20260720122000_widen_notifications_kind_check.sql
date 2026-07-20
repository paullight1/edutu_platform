-- The backend writes kinds 'deadline-reminder' (opportunity-deadline-reminders),
-- 'opportunity-alert' and 'interest' (opportunity-alerts), but the live CHECK
-- only allowed the original six — every such in-app notification insert was
-- failing the constraint. Widen to the full set the code emits. The ghost-closure
-- cron's at-most-once dedupe also depends on 'deadline-reminder' rows persisting.
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'goal-reminder','goal-weekly-digest','goal-progress','opportunity-highlight',
    'admin-broadcast','system','deadline-reminder','opportunity-alert','interest'
  ));
