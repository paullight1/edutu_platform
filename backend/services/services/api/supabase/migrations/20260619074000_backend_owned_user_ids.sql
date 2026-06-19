-- Clerk-authenticated backend requests use an internal UUID derived from the
-- Clerk subject. These backend-owned user tables cannot require matching rows
-- in Supabase auth.users.

alter table if exists public.profiles
  drop constraint if exists profiles_user_id_fkey;

alter table if exists public.goals
  drop constraint if exists goals_user_id_fkey;

alter table if exists public.goal_progress_entries
  drop constraint if exists goal_progress_entries_user_id_fkey;

alter table if exists public.goal_daily_metrics
  drop constraint if exists goal_daily_metrics_user_id_fkey;

alter table if exists public.chat_threads
  drop constraint if exists chat_threads_user_id_fkey;

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_user_id_fkey;

alter table if exists public.chat_usage
  drop constraint if exists chat_usage_user_id_fkey;

alter table if exists public.opportunity_bookmarks
  drop constraint if exists opportunity_bookmarks_user_id_fkey;

alter table if exists public.opportunity_applications
  drop constraint if exists opportunity_applications_user_id_fkey;

alter table if exists public.notifications
  drop constraint if exists notifications_user_id_fkey;

alter table if exists public.notification_preferences
  drop constraint if exists notification_preferences_user_id_fkey;

alter table if exists public.notification_push_tokens
  drop constraint if exists notification_push_tokens_user_id_fkey;
