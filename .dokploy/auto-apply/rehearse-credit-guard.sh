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
for migration_path in /edutu-migrations/*.sql; do
  migration=${migration_path##*/}
  version=${migration%%_*}
  if [ "$version" = 20260812090000 ] || [ "$version" -ge 20260813074140 ]; then
    cp "$migration_path" supabase/migrations/
  fi
done

test -r supabase/migrations/20260812090000_api_production_contract.sql
test -r supabase/migrations/20260813074140_api_credit_contract_upgrade_guard.sql
test -r supabase/migrations/20261127083000_auto_apply_manual_review.sql

status=0
supabase db push --remote="$target" --yes || status=$?

proof=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" <<'SQL'
select count(*)
from supabase_migrations.schema_migrations
where version in ('20260812090000', '20260813074140');
SQL
)
test "$proof" = 2
printf '%s\n' 'Staging credit contract and upgrade guard passed with native migration history.'

psql -X -At --set=ON_ERROR_STOP=1 "$target" <<'SQL'
select 'rehearsal-backend-files=' || (
  select count(distinct filename)
  from (
    select filename from private.staging_rehearsal_files
    union all
    select version || '_' || name || '.sql'
    from supabase_migrations.schema_migrations
    where version > '20260813074140'
  ) as files
);
select 'latest-native-migration=' || max(version)
from supabase_migrations.schema_migrations;
SQL

exit "$status"
