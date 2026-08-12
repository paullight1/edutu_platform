# Production Supabase and Render Inventory

**Inventory date:** 2026-08-12

**Verification mode:** repository-local, read-only inspection

**Authoritative live verification:** not performed

This inventory records identifiers and security surfaces without secret values. Repository evidence is not proof of current production state. Any field that requires Supabase, Render, Clerk, or live SQL access is therefore `UNKNOWN` until an authorized operator completes the verification checklist below.

## Target identifiers

| Item | Authoritative production value | Repository-local evidence | Operator verification required |
|---|---|---|---|
| Supabase project ref | `UNKNOWN` | Candidate `sioxocmrjmdevsdlzjns` appears in `backend/services/services/api/supabase/.temp/project-ref` and `docs/RECS-ACTIVATION-RUNBOOK.md`. | In the Supabase dashboard, record the production project's Reference ID and confirm it matches the project addressed by Render's `SUPABASE_URL`. Record only the ref, not keys or connection strings. |
| Render service name | `UNKNOWN` | Candidate `edutu-api` is declared in `backend/services/services/api/render.yaml`. `docs/RECS-ACTIVATION-RUNBOOK.md` associates it with `edutu-platform.onrender.com`. | In Render, confirm the production web service name and public hostname. Record identifiers only. |
| Production Clerk issuer | `UNKNOWN` | The backend and shared mobile Edge Function helper read `CLERK_ISSUER_URL`; the variable is not declared in the current Render Blueprint or backend `.env.example`. | Confirm the single production issuer in Clerk, then confirm Render and each protected Edge Function use exactly that issuer. Record the issuer URL, never a Clerk secret. |
| Canonical deployment branch | `UNKNOWN` | `render.yaml` has `autoDeploy: false` and does not declare a branch. The inventory worktree branch is not evidence of the production branch. | In Render's source/build settings, confirm the connected repository and deployment branch; cross-check the repository's protected/default release branch. |
| Deployed Edge Functions | `UNKNOWN` | The canonical tree contains only `scrape`; `weekly-digest` exists only in a noncanonical mobile tree. | For the verified production Supabase ref, enumerate deployed function names, versions, auth mode, and last deployment time. Do not infer deployment from repository files. |
| Applied migration history | `UNKNOWN` | The canonical tree contains 33 local migration files listed below. | In the verified production Supabase project, export or view migration history and compare versions with the canonical list. Save migration identifiers/status only. |

## Deployment authority in this repository

The remediation plan defines `supabase/` as the only deployable database and Edge Function source of truth.

- Canonical Edge Function source: `supabase/functions/scrape/index.ts`.
- Canonical migration source: `supabase/migrations/`.
- Noncanonical trees that must not be independently deployed:
  - `edutu-web-app/supabase/` (`chat-proxy`, `n8n-webhook`, and legacy migrations/schema files).
  - `edutumobile/supabase/` (`chat-proxy`, `clerk-webhook`, `delete-account`, `report-ai-content`, `revenuecat-webhook`, `weekly-digest`, and legacy migrations).
  - `backend/services/services/api/supabase/` (`chat-proxy`, `n8n-webhook`, and backend-local migrations/schema files).

The presence of a function in any tree does not establish that it is deployed.

## Canonical local migration inventory

The following 33 files are present under `supabase/migrations/`. Their presence is not proof that production has applied them.

```text
20260519091914_mobile_control_plane.sql
20260519092033_mobile_control_privilege_hardening.sql
20260530062000_expand_opportunity_canonical_categories.sql
20260619140744_harden_profile_self_service_privileges.sql
20260619141136_adjust_profile_self_service_columns.sql
20260619143407_migrate_waitlist_to_profiles.sql
20260622090000_profile_personalization_fields.sql
20260710150000_audit_missing_fk_indexes.sql
20260710170000_opportunity_hybrid_search.sql
20260710180000_ai_usage_events.sql
20260710200000_opportunity_dedup_columns.sql
20260712135712_fix_profile_upsert_user_id_column_grant.sql
20260713131522_merge_fragmented_profiles_to_raw_clerk_id.sql
20260720120000_ai_usage_events_token_source.sql
20260720120000_signals_engagement_index.sql
20260720121000_application_no_response_status.sql
20260720122000_widen_notifications_kind_check.sql
20260803120000_community_groups.sql
20260806120000_community_group_voice_calls.sql
20260806150000_private_community_attachments.sql
20260806170000_private_community_group_images.sql
20260808120000_community_private_dms_and_blocks.sql
20260808130000_backfill_community_group_owner_memberships.sql
20260809120000_seed_opportunity_communities.sql
20260809133000_unify_opportunity_categories.sql
20260809150000_notification_kinds_and_realtime.sql
20260811120000_bachs_unified_billing_core.sql
20260811121000_billing_identity_aliases.sql
20260811122000_atomic_billing_fulfillment.sql
20260811123000_derived_entitlements.sql
20260811180000_opportunity_ai_completion_jobs.sql
20260812120000_bachs_checkout_contract_hardening.sql
20260812130000_voice_usage_quotas.sql
```

## Live database baseline

All baseline results are `UNKNOWN`; no production SQL was run during this task. An authorized operator must run the brief's queries against the verified production project and retain only the PostgreSQL version plus RLS counts/status and function ACL results—never row data or secret values.

```sql
select version();
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;
```

Record the results without data values:

| Check | Production result |
|---|---|
| PostgreSQL version | `UNKNOWN` |
| Public-table count | `UNKNOWN` |
| Public tables with RLS enabled | `UNKNOWN` |
| Public tables with RLS disabled | `UNKNOWN` |
| `SECURITY DEFINER` function count | `UNKNOWN` |
| Definer functions executable by `anon` | `UNKNOWN` |
| Definer functions executable by `authenticated` | `UNKNOWN` |

## High-risk production hold

**Hold status:** `UNKNOWN — NOT EXECUTED BY THIS LOCAL-ONLY TASK`

An authorized production operator must complete these steps before applying remediation migrations:

1. Verify the Supabase project ref, Render service, Clerk issuer, canonical branch, deployed Edge Functions, and migration history using the checklist above.
2. If `scrape` or `weekly-digest` is deployed with public invocation, disable public invocation through the approved Supabase deployment controls and record operator, timestamp, function, and resulting auth mode. Do not record tokens.
3. Run the baseline SQL above and preserve only the allowed version/count/ACL results.
4. Determine whether these repository-identified legacy credit RPCs exist in production: `spend_credits(text, integer, text, text, text)` and `add_credits(text, integer, text, text, text)`.
5. Determine whether these repository-identified admin functions exist in production: `count_opportunities_by_source`, `opportunity_admin_stats`, `get_signup_trends`, `get_opportunity_performance`, `get_support_metrics`, and `generate_user_recommendations`.
6. Confirm RLS and client privileges for `scraping_sources`, `scrape_logs`, and `notification_queue` before lifting the hold.

| Hold evidence | Result |
|---|---|
| `scrape` deployed/auth mode | `UNKNOWN` |
| `weekly-digest` deployed/auth mode | `UNKNOWN` |
| Public invocation disabled where required | `UNKNOWN` |
| Legacy credit RPC presence and ACLs | `UNKNOWN` |
| Legacy admin RPC presence and ACLs | `UNKNOWN` |
| Scraper/notification table RLS and ACLs | `UNKNOWN` |
| Operator and verification timestamp | `UNKNOWN` |

Do not proceed to production security migrations until the identifiers, baseline, and hold evidence are complete.
