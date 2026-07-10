-- User-submitted opportunities awaiting editorial review.
-- Kept out of the live `opportunities` catalog until an admin approves, at which
-- point a real opportunities row is created and linked via approved_opportunity_id.
-- Mirrors creator_applications, plus a "needs_info" (query) round-trip.

create table if not exists public.opportunity_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  -- proposed opportunity content
  title text not null,
  organization text,
  category text,
  type text,
  summary text,
  description text,
  location text,
  is_remote boolean default false,
  eligibility text,
  benefits text,
  deadline timestamptz,
  apply_url text,
  source_url text,
  image_url text,
  extra jsonb default '{}'::jsonb,

  -- review pipeline
  status text not null default 'pending', -- 'pending','needs_info','approved','rejected'
  admin_note text,                         -- admin's query question / rejection reason
  user_response text,                      -- user's latest reply to a needs_info query
  thread jsonb default '[]'::jsonb,        -- full audit trail of admin<->user messages
  reviewed_by uuid,
  reviewed_at timestamptz,
  approved_opportunity_id uuid,

  submitted_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_opportunity_submissions_user_id
  on public.opportunity_submissions (user_id);
create index if not exists idx_opportunity_submissions_status
  on public.opportunity_submissions (status);

-- RLS: users manage their own submissions; service role (backend) does everything.
alter table public.opportunity_submissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opportunity_submissions'
      and policyname = 'own_submissions_select'
  ) then
    create policy own_submissions_select on public.opportunity_submissions
      for select using (user_id = public.clerk_id_to_uuid(auth.jwt() ->> 'sub')::uuid);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'opportunity_submissions'
      and policyname = 'own_submissions_insert'
  ) then
    create policy own_submissions_insert on public.opportunity_submissions
      for insert with check (user_id = public.clerk_id_to_uuid(auth.jwt() ->> 'sub')::uuid);
  end if;
end $$;
