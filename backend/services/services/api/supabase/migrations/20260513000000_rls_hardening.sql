-- RLS hardening for the public schema.
-- Review against the deployed schema before applying. This project uses Clerk
-- JWTs in several clients, so ownership checks compare user_id::text with the
-- JWT subject instead of assuming auth.uid() UUIDs.

create schema if not exists private;

create or replace function private.current_user_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where user_id::text = private.current_user_id()
      and role in ('admin', 'moderator')
  )
$$;

-- Personal data tables: owners can manage their rows; admins can manage all.
alter table if exists public.profiles enable row level security;
drop policy if exists "profiles_owner_select" on public.profiles;
drop policy if exists "profiles_owner_update" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_owner_select" on public.profiles for select using (user_id::text = private.current_user_id());
create policy "profiles_owner_update" on public.profiles for update using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "profiles_admin_all" on public.profiles for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.goals enable row level security;
drop policy if exists "goals_owner_all" on public.goals;
drop policy if exists "goals_admin_all" on public.goals;
create policy "goals_owner_all" on public.goals for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "goals_admin_all" on public.goals for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.user_opportunity_preferences enable row level security;
drop policy if exists "user_opportunity_preferences_owner_all" on public.user_opportunity_preferences;
drop policy if exists "user_opportunity_preferences_admin_all" on public.user_opportunity_preferences;
create policy "user_opportunity_preferences_owner_all" on public.user_opportunity_preferences for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "user_opportunity_preferences_admin_all" on public.user_opportunity_preferences for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.user_opportunity_signals enable row level security;
drop policy if exists "user_opportunity_signals_owner_all" on public.user_opportunity_signals;
drop policy if exists "user_opportunity_signals_admin_all" on public.user_opportunity_signals;
create policy "user_opportunity_signals_owner_all" on public.user_opportunity_signals for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "user_opportunity_signals_admin_all" on public.user_opportunity_signals for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.creator_applications enable row level security;
drop policy if exists "creator_applications_owner_insert_select" on public.creator_applications;
drop policy if exists "creator_applications_admin_all" on public.creator_applications;
create policy "creator_applications_owner_insert_select" on public.creator_applications for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "creator_applications_admin_all" on public.creator_applications for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.marketplace_enrollments enable row level security;
drop policy if exists "marketplace_enrollments_owner_all" on public.marketplace_enrollments;
drop policy if exists "marketplace_enrollments_admin_all" on public.marketplace_enrollments;
create policy "marketplace_enrollments_owner_all" on public.marketplace_enrollments for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "marketplace_enrollments_admin_all" on public.marketplace_enrollments for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.tickets enable row level security;
drop policy if exists "tickets_owner_all" on public.tickets;
drop policy if exists "tickets_admin_all" on public.tickets;
create policy "tickets_owner_all" on public.tickets for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "tickets_admin_all" on public.tickets for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.transactions enable row level security;
drop policy if exists "transactions_owner_select" on public.transactions;
drop policy if exists "transactions_admin_all" on public.transactions;
create policy "transactions_owner_select" on public.transactions for select using (user_id::text = private.current_user_id());
create policy "transactions_admin_all" on public.transactions for all using (private.is_admin()) with check (private.is_admin());

-- Learning/content ownership.
alter table if exists public.quizzes enable row level security;
drop policy if exists "quizzes_owner_all" on public.quizzes;
create policy "quizzes_owner_all" on public.quizzes for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());

alter table if exists public.quiz_attempts enable row level security;
drop policy if exists "quiz_attempts_owner_all" on public.quiz_attempts;
create policy "quiz_attempts_owner_all" on public.quiz_attempts for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());

alter table if exists public.flashcard_decks enable row level security;
drop policy if exists "flashcard_decks_owner_all" on public.flashcard_decks;
drop policy if exists "flashcard_decks_public_select" on public.flashcard_decks;
create policy "flashcard_decks_owner_all" on public.flashcard_decks for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "flashcard_decks_public_select" on public.flashcard_decks for select using (is_public = true);

alter table if exists public.flashcard_study_sessions enable row level security;
drop policy if exists "flashcard_study_sessions_owner_all" on public.flashcard_study_sessions;
create policy "flashcard_study_sessions_owner_all" on public.flashcard_study_sessions for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());

alter table if exists public.flashcard_reviews enable row level security;
drop policy if exists "flashcard_reviews_owner_all" on public.flashcard_reviews;
create policy "flashcard_reviews_owner_all" on public.flashcard_reviews for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());

-- Public catalog content is readable when published/active. Writes are admin-only.
alter table if exists public.opportunities enable row level security;
drop policy if exists "opportunities_public_active_select" on public.opportunities;
drop policy if exists "opportunities_admin_all" on public.opportunities;
create policy "opportunities_public_active_select" on public.opportunities for select using (status = 'active');
create policy "opportunities_admin_all" on public.opportunities for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.roadmaps enable row level security;
drop policy if exists "roadmaps_public_published_select" on public.roadmaps;
drop policy if exists "roadmaps_admin_all" on public.roadmaps;
create policy "roadmaps_public_published_select" on public.roadmaps for select using (status = 'published');
create policy "roadmaps_admin_all" on public.roadmaps for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.roadmap_enrollments enable row level security;
drop policy if exists "roadmap_enrollments_owner_all" on public.roadmap_enrollments;
drop policy if exists "roadmap_enrollments_admin_all" on public.roadmap_enrollments;
create policy "roadmap_enrollments_owner_all" on public.roadmap_enrollments for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "roadmap_enrollments_admin_all" on public.roadmap_enrollments for all using (private.is_admin()) with check (private.is_admin());

alter table if exists public.roadmap_feedback enable row level security;
drop policy if exists "roadmap_feedback_owner_all" on public.roadmap_feedback;
drop policy if exists "roadmap_feedback_admin_all" on public.roadmap_feedback;
create policy "roadmap_feedback_owner_all" on public.roadmap_feedback for all using (user_id::text = private.current_user_id()) with check (user_id::text = private.current_user_id());
create policy "roadmap_feedback_admin_all" on public.roadmap_feedback for all using (private.is_admin()) with check (private.is_admin());
