begin;
create table private.auto_apply_live_activities (
  attempt_id uuid not null references private.auto_apply_attempts(id) on delete cascade,
  activity_id text not null,
  token text not null unique,
  delivered_version integer not null default 0,
  retry_after timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 hours',
  primary key (attempt_id, activity_id)
);
commit;
