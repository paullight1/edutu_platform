-- Internal notification scheduler queue. Client roles must never read or
-- mutate candidate rows; the Nest scheduler owns all access.

begin;

alter table public.notification_candidates enable row level security;

revoke all on table public.notification_candidates from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_candidates
  to service_role;

commit;
