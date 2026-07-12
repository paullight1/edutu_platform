-- Opportunity alert ledger: one row per push alert actually surfaced to a
-- user (interest-match alerts and deadline reminders). The alert engine uses
-- it to never re-send the same opportunity and to enforce per-day caps.

create table if not exists public.opportunity_alert_ledger (
  user_id uuid not null,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  kind text not null, -- 'interest' | 'deadline_7d' | 'deadline_3d' | 'deadline_1d'
  sent_at timestamp not null default now(),
  primary key (user_id, opportunity_id, kind)
);

create index if not exists idx_alert_ledger_user_sent
  on public.opportunity_alert_ledger (user_id, sent_at);

-- Backend-only table (written via the service-role pool); no anon/user access.
alter table public.opportunity_alert_ledger enable row level security;
