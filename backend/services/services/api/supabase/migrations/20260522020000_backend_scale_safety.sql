-- Backend scale and fan-out safety. This migration is intentionally additive:
-- it creates missing queue infrastructure, indexes current hot paths, and
-- exposes one aggregate RPC used by the admin dashboard.

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  processed_at timestamptz,
  result jsonb,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notification_queue_pending_due_idx
  on public.notification_queue (scheduled_for, id)
  where status = 'pending';

create index if not exists notifications_unread_user_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notification_push_tokens_provider_user_idx
  on public.notification_push_tokens (provider, user_id);

create unique index if not exists notification_push_tokens_user_token_idx
  on public.notification_push_tokens (user_id, token);

alter table public.profiles
  add column if not exists creator_status text default 'none'
  check (creator_status in ('none', 'pending', 'approved', 'rejected'));

create index if not exists profiles_creator_status_idx
  on public.profiles (creator_status)
  where creator_status is not null and creator_status <> 'none';

create index if not exists opportunities_status_deadline_updated_idx
  on public.opportunities (status, close_date, updated_at desc, id desc);

create index if not exists user_opportunity_signals_user_type_opportunity_idx
  on public.user_opportunity_signals (user_id, signal_type, opportunity_id);

create index if not exists roadmaps_public_listing_idx
  on public.roadmaps (
    status,
    category,
    difficulty,
    is_featured desc,
    rating_avg desc,
    enrollment_count desc,
    created_at desc,
    id desc
  );

create index if not exists flashcard_decks_user_updated_idx
  on public.flashcard_decks (user_id, updated_at desc);

create index if not exists flashcard_decks_public_updated_idx
  on public.flashcard_decks (is_public, updated_at desc);

create index if not exists flashcards_deck_order_idx
  on public.flashcards (deck_id, "order");

create or replace function public.opportunity_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*)::int,
    'active', count(*) filter (where status = 'active')::int,
    'featured', count(*) filter (where is_featured = true)::int,
    'needsReview', count(*) filter (
      where status = 'pending_review'
         or coalesce(metadata->>'needs_review', 'false') = 'true'
    )::int,
    'expiringSoon', count(*) filter (
      where close_date is not null
        and close_date >= current_date
        and close_date <= current_date + interval '7 days'
    )::int
  )
  from public.opportunities;
$$;

grant execute on function public.opportunity_admin_stats() to authenticated;
grant execute on function public.opportunity_admin_stats() to service_role;
