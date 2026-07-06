-- Admin audit trail (Cross M7).
--
-- AuditService.log(...) was a console.log-only stub (the DB insert was a TODO),
-- so admin actions (user invites, role changes, opportunity CRUD, setting
-- changes) left no queryable trail. This creates the backing table; the service
-- now writes to it best-effort (a write failure never blocks the admin action).
--
-- actor_user_id is text, not uuid: actors include local-dev admins whose id is
-- "local-admin:<email>", not a uuid.

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_user_id text,
  resource text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);
