#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

pilot_db_port=${AUTO_APPLY_TEST_POSTGRES_PORT:-55495}
pilot_dir=$(mktemp -d "${TMPDIR:-/tmp}/edutu-auto-apply.XXXXXX")
cleanup() {
  if [[ -f "$pilot_dir/db/postmaster.pid" ]]; then
    pg_ctl -D "$pilot_dir/db" -m fast stop >/dev/null || return
  fi
  rm -rf -- "$pilot_dir"
}
trap cleanup EXIT
# A fresh fixture database only needs small WAL segments.
initdb -D "$pilot_dir/db" -A trust --wal-segsize=1 >"$pilot_dir/initdb.log" || {
  tail -20 "$pilot_dir/initdb.log" >&2
  exit 1
}
pg_ctl -D "$pilot_dir/db" -o "-h 127.0.0.1 -p $pilot_db_port -k $pilot_dir" \
  -l "$pilot_dir/postgres.log" -w start >/dev/null || {
  tail -20 "$pilot_dir/postgres.log" >&2
  exit 1
}
openssl req -x509 -nodes -days 1 -newkey rsa:2048 -keyout "$pilot_dir/server.key" \
  -out "$pilot_dir/server.crt" -subj /CN=127.0.0.1 -addext 'subjectAltName=IP:127.0.0.1' >/dev/null 2>&1
export PGHOST=127.0.0.1 PGPORT="$pilot_db_port" PGDATABASE=postgres
psql -v ON_ERROR_STOP=1 <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create schema private;
create table profiles(user_id text primary key, full_name text, email text, school text, major text, degree text, grad_year int, skills text[], interests text[],
  timezone text, updated_at timestamptz default now(), credits integer not null default 0);
create table billing_provider_subscriptions(user_id text, environment text, provider text, status text,
  entitlement_key text, cadence text, provider_store text, current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end boolean, grace_period_expires_at timestamptz, scheduled_product_key text, scheduled_cadence text,
  scheduled_change_at timestamptz, last_event_id text, provider_updated_at timestamptz, updated_at timestamptz);
create table billing_entitlement_grants(user_id text not null, environment text not null, feature_key text not null,
  status text not null default 'active', revoked_at timestamptz, valid_from timestamptz not null default now(),
  valid_until timestamptz);
create table opportunities(id uuid primary key, title text not null, organization text, summary text, description text, apply_url text, application_url text,
  status text default 'active', close_date date, deadline timestamptz);
create table opportunity_applications(
  id uuid primary key default gen_random_uuid(), user_id text not null, status text not null,
  opportunity_id uuid not null references opportunities(id), version int not null default 1,
  submitted_at timestamptz, metadata jsonb default '{}', created_at timestamptz default now(),
  updated_at timestamptz default now(), unique(user_id,opportunity_id)
);
create table notification_queue(id uuid primary key default gen_random_uuid(), payload jsonb not null,
  scheduled_for timestamp not null, status text not null default 'pending', processed_at timestamp,
  result jsonb, created_by text, created_at timestamp default now());
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null,
  kind text not null, title text not null, body text not null, severity text not null, metadata jsonb,
  dedupe_key text, channel_status jsonb, created_at timestamp default now(), read_at timestamp,
  delivered_at timestamptz, opened_at timestamptz, dismissed_at timestamptz);
create unique index on notifications(user_id, dedupe_key) where dedupe_key is not null;
create table notification_preferences(user_id uuid primary key, push_notifications boolean,
  email_notifications boolean, opportunity_alerts boolean, deadline_reminders boolean, goal_reminders boolean,
  achievement_celebrations boolean, quiet_hours jsonb);
create table notification_push_tokens(user_id uuid not null, token text not null, provider text not null,
  device jsonb, primary key (user_id, token));
SQL
sed -n '/^create or replace function public.clerk_id_to_uuid/,/^end \$\$;/p' \
  supabase/migrations/20260707150000_clerk_uuid_rls_alignment.sql | psql -v ON_ERROR_STOP=1
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260821002000_notification_queue_resilience.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20261103145625_applications_tracking_reliability.sql
for migration in supabase/migrations/2026112[67]*auto_apply*.sql; do
  psql -v ON_ERROR_STOP=1 -f "$migration"
done
if [[ -n "${AUTO_APPLY_TEST_AI_PROVIDER:-}" ]]; then
  psql -v ON_ERROR_STOP=1 <<'SQL'
create schema auth;
create table auth.users(id uuid primary key);
create function auth.role() returns text language sql stable as $$ select current_user::text $$;
SQL
  psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260515000000_ai_control_plane.sql
  psql -v ON_ERROR_STOP=1 -f ../../../../supabase/migrations/20260710180000_ai_usage_events.sql
  psql -v ON_ERROR_STOP=1 -f ../../../../supabase/migrations/20260720120000_ai_usage_events_token_source.sql
  psql -v ON_ERROR_STOP=1 <<'SQL'
alter table public.ai_usage_logs add column user_id text;
alter table public.ai_usage_events add column user_id text;
SQL
fi
export DATABASE_URL="postgresql://$(whoami)@127.0.0.1:$pilot_db_port/postgres"
export NODE_EXTRA_CA_CERTS="$pilot_dir/server.crt" AUTO_APPLY_TEST_DIR="$pilot_dir"
node scripts/auto-apply/simulator-pilot.cjs
