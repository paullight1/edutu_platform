-- Notification candidate queue (scheduler v2).
--
-- Today every sender decides *by itself* whether to interrupt a user and then
-- calls NotificationsService.broadcast() immediately. Because no sender can see
-- any other sender's intent, the system cannot rank, collapse or time anything:
-- two jobs that both care about the same opportunity produce two pushes, and a
-- low-value nudge fired at 03:00 competes on equal footing with a deadline that
-- expires tomorrow.
--
-- This table introduces the missing intermediate step. Senders *propose*
-- (enqueue a candidate with an urgency/relevance pair) and a single scheduler
-- *decides* (scores, collapses per entity, applies fatigue suppression, picks a
-- local send time) before anything reaches the transport chokepoint.
--
-- NOTE: nothing writes to this table yet. The scheduler ships inert behind
-- NOTIFICATION_SCHEDULER_V2_ENABLED (default OFF) until real delivery telemetry
-- exists to calibrate the scoring against — see
-- src/notifications/scheduler/notification-scheduler.service.ts.
--
-- Idempotent and safe to re-run.

create table if not exists public.notification_candidates (
  id          uuid primary key default gen_random_uuid(),
  -- Canonical (uuid) user id, matching public.notifications.user_id. Note that
  -- profiles.user_id is TEXT and dual-keyed (raw Clerk id OR derived uuid), so
  -- any join to profiles must go through public.clerk_id_to_uuid().
  user_id     uuid not null,
  kind        text not null,
  entity_type text,
  entity_id   text,
  payload     jsonb not null default '{}'::jsonb,
  -- Scoring inputs supplied by the proposing sender, both nominally 0..1.
  urgency     numeric not null default 0.5,
  relevance   numeric not null default 1.0,
  -- After this instant the candidate is stale and is never delivered.
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  -- Set the moment the scheduler picks (or discards) the candidate. A row with
  -- consumed_at set is history and is invisible to both the drain query and the
  -- uniqueness guard below.
  consumed_at timestamptz
);

-- Drain query: pending candidates for a user.
create index if not exists notification_candidates_user_consumed_idx
  on public.notification_candidates (user_id, consumed_at);

-- The same pending candidate cannot be enqueued twice. This is the structural
-- fix for the duplicate-notification class of bug: a retried or overlapping
-- cron run collides on the index instead of producing a second push. Partial on
-- `consumed_at is null` so the *same* (user, kind, entity) may legitimately be
-- proposed again later, once the earlier one has been consumed.
create unique index if not exists notification_candidates_pending_unique
  on public.notification_candidates (user_id, kind, entity_type, entity_id)
  where consumed_at is null;

comment on table public.notification_candidates is
  'Proposed notifications awaiting scheduling. Senders enqueue; NotificationSchedulerService scores, collapses, times and consumes them.';
comment on column public.notification_candidates.urgency is
  'How time-critical this is (0..1). Multiplied into the score.';
comment on column public.notification_candidates.relevance is
  'How well-matched to this user (0..1). Multiplied into the score.';
comment on column public.notification_candidates.consumed_at is
  'When the scheduler took this candidate. Null = still pending.';
