-- Phase 1: Feature Parity with Mobile App
-- Date: 2025-05-08
-- Description: Adds opportunity bookmarks, applications, calendar events tables
--              and extends profiles table with role, credits, and creator status fields.

-- ------------------------------------------------------------------
-- Extended Opportunity Bookmarks (denormalized for mobile feature parity)
-- ------------------------------------------------------------------
-- Note: opportunity_bookmarks already exists with a composite key (user_id, opportunity_id)
-- referencing uuid opportunities. This new table uses a text opportunity_id to support
-- external/opportunistic opportunities that may not exist in the opportunities table.

create table if not exists public.opportunity_bookmarks_extended (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  opportunity_id text not null,
  opportunity_title text,
  opportunity_category text,
  opportunity_deadline date,
  opportunity_location text,
  match_percentage numeric,
  created_at timestamptz not null default now()
);

comment on table public.opportunity_bookmarks_extended is
  'User-saved/bookmarked opportunities with denormalized data for mobile feature parity.';

create index if not exists opportunity_bookmarks_extended_user_idx
  on public.opportunity_bookmarks_extended (user_id, created_at desc);

create index if not exists opportunity_bookmarks_extended_opportunity_idx
  on public.opportunity_bookmarks_extended (opportunity_id);

alter table public.opportunity_bookmarks_extended enable row level security;

create policy "Users can view own bookmarks"
  on public.opportunity_bookmarks_extended
  for select
  using (auth.uid() = user_id);

create policy "Users can create own bookmarks"
  on public.opportunity_bookmarks_extended
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own bookmarks"
  on public.opportunity_bookmarks_extended
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own bookmarks"
  on public.opportunity_bookmarks_extended
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Extended Opportunity Applications (denormalized for mobile feature parity)
-- ------------------------------------------------------------------
-- Note: opportunity_applications already exists with a uuid foreign key to opportunities
-- and different status values. This table uses text opportunity_id to support external
-- opportunities and includes the mobile app status enum.

create table if not exists public.opportunity_applications_extended (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  opportunity_id text not null,
  opportunity_title text,
  opportunity_category text,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'under_review', 'accepted', 'rejected')),
  applied_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.opportunity_applications_extended is
  'Tracks user applications to opportunities with denormalized data for mobile feature parity.';

create index if not exists opportunity_applications_extended_user_idx
  on public.opportunity_applications_extended (user_id, applied_at desc);

create index if not exists opportunity_applications_extended_opportunity_idx
  on public.opportunity_applications_extended (opportunity_id);

create index if not exists opportunity_applications_extended_status_idx
  on public.opportunity_applications_extended (status);

create trigger set_timestamp_opportunity_applications_extended
  before update on public.opportunity_applications_extended
  for each row
  execute function public.set_updated_at();

alter table public.opportunity_applications_extended enable row level security;

create policy "Users can view own applications"
  on public.opportunity_applications_extended
  for select
  using (auth.uid() = user_id);

create policy "Users can create own applications"
  on public.opportunity_applications_extended
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own applications"
  on public.opportunity_applications_extended
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own applications"
  on public.opportunity_applications_extended
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Calendar Events (for goals dashboard calendar strip)
-- ------------------------------------------------------------------

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  event_type text not null check (event_type in ('goal_deadline', 'opportunity_deadline', 'reminder')),
  title text not null,
  description text,
  event_date date not null,
  related_id text,
  related_type text check (related_type in ('goal', 'opportunity')),
  is_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.calendar_events is
  'Calendar events for the goals dashboard calendar strip, tracking deadlines and reminders.';

create index if not exists calendar_events_user_idx
  on public.calendar_events (user_id, event_date desc);

create index if not exists calendar_events_date_idx
  on public.calendar_events (event_date);

create index if not exists calendar_events_type_idx
  on public.calendar_events (event_type);

create index if not exists calendar_events_related_idx
  on public.calendar_events (related_id, related_type);

create trigger set_timestamp_calendar_events
  before update on public.calendar_events
  for each row
  execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

create policy "Users can view own calendar events"
  on public.calendar_events
  for select
  using (auth.uid() = user_id);

create policy "Users can create own calendar events"
  on public.calendar_events
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own calendar events"
  on public.calendar_events
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own calendar events"
  on public.calendar_events
  for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Extend Profiles Table
-- ------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists credits integer not null default 0,
  add column if not exists is_pro boolean not null default false,
  add column if not exists pro_expires_at timestamptz,
  add column if not exists creator_status text not null default 'none' check (creator_status in ('none', 'pending', 'approved', 'rejected')),
  add column if not exists onboarding_completed boolean not null default false;

comment on column public.profiles.role is
  'User role for access control (user, admin, creator, etc.)';

comment on column public.profiles.credits is
  'User credits for premium features or actions';

comment on column public.profiles.is_pro is
  'Whether the user has an active Pro subscription';

comment on column public.profiles.pro_expires_at is
  'When the Pro subscription expires (null if lifetime or not subscribed)';

comment on column public.profiles.creator_status is
  'Creator application status: none, pending, approved, rejected';

comment on column public.profiles.onboarding_completed is
  'Whether the user has completed the onboarding flow';
