#!/bin/sh
set -eu
umask 077

target='postgresql://postgres@db:5432/edutu_stage_rehearsal?sslmode=disable'
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"

# The rehearsal contract was already applied directly. Reapply it through the
# CLI only in the empty rehearsal database so the CLI records real execution.
check=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" <<'SQL'
select current_database() = 'edutu_stage_rehearsal'
   and not exists (select 1 from public.profiles)
   and exists (
     select 1 from public.api_credit_balance_reconciliation_state
     where migration_key = '20260812090000_api_production_contract'
       and initial_reconciliation_completed
   );
SQL
)
test "$check" = t

mkdir -p supabase/migrations
printf 'project_id = "edutu-stage-rehearsal"\n' >supabase/config.toml
for migration in \
    20260812090000_api_production_contract.sql \
    20260813074140_api_credit_contract_upgrade_guard.sql; do
  cp "/edutu-migrations/$migration" supabase/migrations/
done

supabase db push --remote="$target" --yes

proof=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" <<'SQL'
select count(*)
from supabase_migrations.schema_migrations
where version in ('20260812090000', '20260813074140');
SQL
)
test "$proof" = 2
printf '%s\n' 'Staging credit contract and upgrade guard passed with native migration history.'
