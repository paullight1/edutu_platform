begin;

create table private.auto_apply_android_activities (
  attempt_id uuid not null references private.auto_apply_attempts(id) on delete cascade,
  token text not null,
  delivered_version integer not null default 0,
  retry_after timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '8 hours',
  primary key (attempt_id, token)
);
create index on private.auto_apply_android_activities (retry_after);
create index on private.auto_apply_android_activities (expires_at);

insert into private.auto_apply_android_activities (attempt_id, token, delivered_version, retry_after, expires_at)
select attempt_id, token, delivered_version, retry_after, expires_at
from private.auto_apply_live_activities
where platform = 'android' and expires_at > now()
on conflict do nothing;

commit;
