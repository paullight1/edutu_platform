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
cp /edutu-shared-migrations/20260803120000_community_groups.sql supabase/migrations/

acl_applied=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" -c \
  "select exists (select 1 from supabase_migrations.schema_migrations where version = '20260820220940');")
if [ "$acl_applied" = f ]; then
  roadmap_source=/edutu-mobile-migrations/025_scope_get_recommended_roadmaps.sql
  test "$(grep -c 'i.user_id = public.current_app_user_id()' "$roadmap_source")" = 1
  sed 's/i.user_id = public.current_app_user_id()/i.user_id::text = public.current_app_user_uuid()/' \
    "$roadmap_source" > roadmap.sql
  psql -X --set=ON_ERROR_STOP=1 --single-transaction "$target" \
    -f /edutu-mobile-migrations/032_referral_system.sql \
    -f roadmap.sql -f /usr/local/share/staging-analytics-overloads.sql
fi

billing_acl_applied=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" -c \
  "select exists (select 1 from supabase_migrations.schema_migrations where version = '20260821002500');")
if [ "$billing_acl_applied" = f ]; then
  awk '/^CREATE OR REPLACE FUNCTION public\.admin_grant_credits\(/ { emit=1 }
       emit { print }
       emit && /^\$\$ LANGUAGE/ { exit }' \
    /edutu-mobile-migrations/023_reconcile_credit_ledger.sql > admin-grant.sql
  awk '/^CREATE OR REPLACE FUNCTION public\.admin_set_pro_status\(/ { emit=1 }
       emit { print }
       emit && /^\$\$ LANGUAGE/ { exit }' \
    /edutu-web-migrations/20260705000000_secure_credit_functions.sql > admin-pro.sql
  test -s admin-grant.sql
  test -s admin-pro.sql

  psql -X --set=ON_ERROR_STOP=1 --single-transaction "$target" \
    -f admin-grant.sql -f admin-pro.sql -f /dev/stdin <<'SQL'
REVOKE EXECUTE ON FUNCTION public.admin_grant_credits(text,integer,text,text,text),
  public.admin_set_pro_status(text,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_credits(text,integer,text,text,text),
  public.admin_set_pro_status(text,boolean,timestamptz) TO service_role;

-- Mobile migration 005 drops this legacy Supabase Auth foreign key for Clerk users.
-- The rehearsal keeps UUID analytics keys and uses the existing Clerk-to-UUID mapping.
ALTER TABLE public.analytics DROP CONSTRAINT IF EXISTS analytics_user_id_fkey;
SQL
fi

marketplace_applied=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" -c \
  "select exists (select 1 from supabase_migrations.schema_migrations where version = '20260821065924');")
if [ "$marketplace_applied" = f ]; then
  psql -X --set=ON_ERROR_STOP=1 --single-transaction "$target" <<'SQL'
-- The fresh legacy snapshot stores marketplace seller IDs as UUIDs. The
-- backend migration also supports text Clerk IDs through its existing helper.
CREATE OR REPLACE FUNCTION public.clerk_id_to_uuid(p_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT p_id::text
$$;
REVOKE EXECUTE ON FUNCTION public.clerk_id_to_uuid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clerk_id_to_uuid(uuid) TO service_role;
SQL
fi

legacy_tracker_owner=$(psql -X -At --set=ON_ERROR_STOP=1 "$target" -c \
  "select atttypid = 'uuid'::regtype from pg_attribute where attrelid = 'public.opportunity_applications'::regclass and attname = 'user_id' and not attisdropped;")
if [ "$legacy_tracker_owner" = t ]; then
  psql -X --set=ON_ERROR_STOP=1 --single-transaction "$target" <<'SQL'
-- The historical snapshot predates the text tracker identities and lifecycle.
DROP POLICY "Users manage own opportunity applications" ON public.opportunity_applications;
ALTER TABLE public.opportunity_applications
  ALTER COLUMN user_id TYPE text USING user_id::text,
  DROP CONSTRAINT opportunity_applications_status_check,
  ADD CONSTRAINT opportunity_applications_status_check
    CHECK (status IN ('draft','submitted','interview','offer','rejected','withdrawn','no_response'));
CREATE POLICY "Users manage own opportunity applications"
  ON public.opportunity_applications FOR ALL TO authenticated
  USING (user_id IN ((SELECT public.current_app_user_id()), (SELECT public.current_app_user_uuid())))
  WITH CHECK (user_id IN ((SELECT public.current_app_user_id()), (SELECT public.current_app_user_uuid())));
SQL
fi

status=0
supabase db push --remote="$target" --include-all --yes || status=$?

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
