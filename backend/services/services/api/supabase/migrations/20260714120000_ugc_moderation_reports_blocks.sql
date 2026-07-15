-- UGC moderation for roadmap comments (Apple App Store Guideline 1.2).
-- Adds: comment abuse reports (admin-reviewable) + user-to-user blocks.
-- Writes go through the backend (service role); RLS enabled with no
-- anon/authenticated policies so the tables are invisible to client keys.

-- ── Abuse reports on comments ──────────────────────────────────────────────
create table if not exists public.roadmap_comment_reports (
    id uuid primary key default gen_random_uuid(),
    comment_id uuid not null references public.roadmap_comments(id) on delete cascade,
    roadmap_id uuid not null,
    reporter_user_id uuid not null,
    reason text not null default 'other'
        check (reason in ('offensive', 'spam', 'harassment', 'other')),
    status text not null default 'open'
        check (status in ('open', 'reviewed', 'actioned')),
    created_at timestamptz not null default now()
);

create index if not exists idx_roadmap_comment_reports_status
    on public.roadmap_comment_reports (status, created_at desc);
create index if not exists idx_roadmap_comment_reports_comment
    on public.roadmap_comment_reports (comment_id);

alter table public.roadmap_comment_reports enable row level security;

drop policy if exists "Service role full access to comment reports"
    on public.roadmap_comment_reports;
create policy "Service role full access to comment reports"
    on public.roadmap_comment_reports for all
    to service_role
    using (true) with check (true);

-- ── User-to-user blocks ────────────────────────────────────────────────────
create table if not exists public.user_blocks (
    id uuid primary key default gen_random_uuid(),
    blocker_user_id uuid not null,
    blocked_user_id uuid not null,
    created_at timestamptz not null default now()
);

create unique index if not exists uq_user_blocks_pair
    on public.user_blocks (blocker_user_id, blocked_user_id);
create index if not exists idx_user_blocks_blocker
    on public.user_blocks (blocker_user_id);

alter table public.user_blocks enable row level security;

drop policy if exists "Service role full access to user blocks"
    on public.user_blocks;
create policy "Service role full access to user blocks"
    on public.user_blocks for all
    to service_role
    using (true) with check (true);
