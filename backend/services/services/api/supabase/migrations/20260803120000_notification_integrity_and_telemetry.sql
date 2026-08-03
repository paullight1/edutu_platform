-- Notification integrity + delivery telemetry.
--
-- Three independent defects in public.notifications, all fixed here:
--
-- 1. MISSING 'achievement' KIND.
--    notifications_kind_check does not allow 'achievement', but
--    src/notifications/notifications.service.ts (TOPIC_PREFERENCE_BY_KIND)
--    routes that kind and `achievementCelebrations` is a live user-facing
--    toggle in both the mobile and web settings screens. Any achievement
--    notification therefore 500s on insert. The constraint is replaced with
--    the same list plus 'achievement' — every previously allowed value is
--    kept, existing rows are unaffected.
--
-- 2. UNENFORCED dedupe_key.
--    Every sender carefully builds a dedupe key ('interest:...',
--    'deadline:...', 'saved-search:...', 'docs:...', 'opp-deadline:...') but
--    nothing in the repo or the live DB enforces uniqueness, so retries and
--    overlapping cron runs can double-push the same notification. A partial
--    unique index on (user_id, dedupe_key) where dedupe_key is not null makes
--    the contract real while leaving ad-hoc/broadcast rows (null key)
--    unconstrained. Pre-existing duplicates are collapsed first — earliest
--    created_at wins — so index creation cannot fail on a live table.
--
-- 3. NO DELIVERY TELEMETRY.
--    The table only records read_at ("seen in the inbox list"), so open rate
--    per kind, notification fatigue and channel suppression are all
--    uncomputable. delivered_at / opened_at / dismissed_at plus a
--    (user_id, kind, created_at desc) index unblock that feedback loop. All
--    columns are nullable; nothing backfills them (historical rows honestly
--    have no telemetry).
--
-- Idempotent and safe to re-run.

-- 1. kind CHECK constraint -----------------------------------------------

alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notifications
  add constraint notifications_kind_check check (
    kind = any (array[
      'goal-reminder',
      'goal-weekly-digest',
      'goal-progress',
      'opportunity-highlight',
      'admin-broadcast',
      'system',
      'deadline-reminder',
      'opportunity-alert',
      'interest',
      'achievement'
    ])
  );

-- 2. dedupe_key uniqueness ------------------------------------------------

-- Collapse any pre-existing (user_id, dedupe_key) duplicates, keeping the
-- earliest created_at (id as a stable tiebreaker for identical timestamps).
delete from public.notifications n
using (
  select
    id,
    row_number() over (
      partition by user_id, dedupe_key
      order by created_at asc nulls last, id asc
    ) as rn
  from public.notifications
  where dedupe_key is not null
) dupes
where n.id = dupes.id
  and dupes.rn > 1;

create unique index if not exists notifications_dedupe_unique
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

-- 3. delivery telemetry ---------------------------------------------------

alter table public.notifications
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists dismissed_at timestamptz;

comment on column public.notifications.delivered_at is
  'When the push/email for this notification actually went out (null = never dispatched).';
comment on column public.notifications.opened_at is
  'When the user tapped the notification itself. Distinct from read_at, which only means it was seen in the inbox list.';
comment on column public.notifications.dismissed_at is
  'When the user explicitly dismissed/swiped away the notification.';

-- Supports per-user, per-kind engagement-rate queries (open rate, fatigue
-- windows, channel suppression) without scanning a user's whole history.
create index if not exists notifications_user_kind_created_idx
  on public.notifications (user_id, kind, created_at desc);
