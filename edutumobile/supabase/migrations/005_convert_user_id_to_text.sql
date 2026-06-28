-- Migration: Convert user_id columns from UUID to TEXT to support Clerk IDs
-- Created: 2026-04-28

-- Step 1: Drop foreign keys referring to auth.users
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_user_id_fkey;
ALTER TABLE public.goal_progress_entries DROP CONSTRAINT IF EXISTS goal_progress_entries_user_id_fkey;
ALTER TABLE public.goal_daily_metrics DROP CONSTRAINT IF EXISTS goal_daily_metrics_user_id_fkey;
ALTER TABLE public.analytics DROP CONSTRAINT IF EXISTS analytics_user_id_fkey;
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_user_id_fkey;
ALTER TABLE public.analytics_snapshots DROP CONSTRAINT IF EXISTS analytics_snapshots_created_by_fkey;
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_user_id_fkey;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE public.chat_usage DROP CONSTRAINT IF EXISTS chat_usage_user_id_fkey;
ALTER TABLE public.cv_records DROP CONSTRAINT IF EXISTS cv_records_user_id_fkey;
ALTER TABLE public.opportunity_bookmarks DROP CONSTRAINT IF EXISTS opportunity_bookmarks_user_id_fkey;
ALTER TABLE public.opportunity_applications DROP CONSTRAINT IF EXISTS opportunity_applications_user_id_fkey;
ALTER TABLE public.community_posts DROP CONSTRAINT IF EXISTS community_posts_user_id_fkey;
ALTER TABLE public.community_comments DROP CONSTRAINT IF EXISTS community_comments_user_id_fkey;
ALTER TABLE public.community_post_reactions DROP CONSTRAINT IF EXISTS community_post_reactions_user_id_fkey;
ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_user_id_fkey;
ALTER TABLE public.marketplace_applications DROP CONSTRAINT IF EXISTS marketplace_applications_applicant_id_fkey;
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey;
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_author_id_fkey;
ALTER TABLE public.user_notifications DROP CONSTRAINT IF EXISTS user_notifications_user_id_fkey;
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE public.creator_applications DROP CONSTRAINT IF EXISTS creator_applications_user_id_fkey;

-- Step 2: Drop internal foreign keys involving user_id
ALTER TABLE public.goal_tasks DROP CONSTRAINT IF EXISTS goal_tasks_user_id_fkey;

-- Step 3: Drop PKs that involve user_id
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE public.opportunity_bookmarks DROP CONSTRAINT IF EXISTS opportunity_bookmarks_pkey;
ALTER TABLE public.community_post_reactions DROP CONSTRAINT IF EXISTS community_post_reactions_pkey;

-- Step 4: Alter column types to TEXT
ALTER TABLE public.profiles ALTER COLUMN user_id TYPE text;
ALTER TABLE public.goals ALTER COLUMN user_id TYPE text;
ALTER TABLE public.goal_progress_entries ALTER COLUMN user_id TYPE text;
ALTER TABLE public.goal_daily_metrics ALTER COLUMN user_id TYPE text;
ALTER TABLE public.analytics ALTER COLUMN user_id TYPE text;
ALTER TABLE public.analytics_events ALTER COLUMN user_id TYPE text;
ALTER TABLE public.analytics_snapshots ALTER COLUMN created_by TYPE text;
ALTER TABLE public.chat_threads ALTER COLUMN user_id TYPE text;
ALTER TABLE public.chat_messages ALTER COLUMN user_id TYPE text;
ALTER TABLE public.chat_usage ALTER COLUMN user_id TYPE text;
ALTER TABLE public.cv_records ALTER COLUMN user_id TYPE text;
ALTER TABLE public.opportunity_bookmarks ALTER COLUMN user_id TYPE text;
ALTER TABLE public.opportunity_applications ALTER COLUMN user_id TYPE text;
ALTER TABLE public.community_posts ALTER COLUMN user_id TYPE text;
ALTER TABLE public.community_comments ALTER COLUMN user_id TYPE text;
ALTER TABLE public.community_post_reactions ALTER COLUMN user_id TYPE text;
ALTER TABLE public.marketplace_listings ALTER COLUMN user_id TYPE text;
ALTER TABLE public.marketplace_applications ALTER COLUMN applicant_id TYPE text;
ALTER TABLE public.support_tickets ALTER COLUMN user_id TYPE text;
ALTER TABLE public.support_messages ALTER COLUMN author_id TYPE text;
ALTER TABLE public.user_notifications ALTER COLUMN user_id TYPE text;
ALTER TABLE public.audit_log ALTER COLUMN actor_id TYPE text;
ALTER TABLE public.goal_tasks ALTER COLUMN user_id TYPE text;
ALTER TABLE public.creator_applications ALTER COLUMN user_id TYPE text;

-- Step 5: Restore PKs
ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
ALTER TABLE public.opportunity_bookmarks ADD PRIMARY KEY (user_id, opportunity_id);
ALTER TABLE public.community_post_reactions ADD PRIMARY KEY (user_id, post_id, reaction);

-- Step 6: Restore internal foreign keys
ALTER TABLE public.goal_tasks ADD CONSTRAINT goal_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id);
