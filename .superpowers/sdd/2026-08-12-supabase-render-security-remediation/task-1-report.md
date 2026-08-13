# Task 1 Report: Establish the production Supabase and Render inventory

## Status

`DONE_WITH_CONCERNS`

The required repository-local inventory is complete and committed. Authoritative production state remains unverified because the execution contract prohibited network access, Supabase MCP/SQL access, Render API/dashboard access, and production mutations.

## Commit

- `fe6d52a docs: inventory production security surfaces`

The commit contains only:

- `docs/security/production-deployment-inventory.md`
- `docs/security/secret-rotation-register.md`

This report is intentionally not included in that commit because the task required committing only the two inventory/runbook files.

## Work completed

- Recorded the repository-local Supabase project candidate `sioxocmrjmdevsdlzjns` while marking the authoritative production ref `UNKNOWN`.
- Recorded the repository-local Render service candidate `edutu-api` and hostname reference `edutu-platform.onrender.com` while marking the live service identity `UNKNOWN`.
- Recorded `CLERK_ISSUER_URL` as the production issuer contract and marked its live value `UNKNOWN`.
- Marked the canonical production deployment branch `UNKNOWN` because the Render Blueprint declares no branch and has `autoDeploy: false`.
- Inventoried the canonical `supabase/` tree: 33 local migrations and one canonical function source, `scrape`.
- Identified the duplicate, noncanonical Supabase migration/function trees and documented that they must not be independently deployed.
- Recorded local high-risk credit/admin RPC names and the scraper/notification tables requiring live ACL/RLS verification.
- Created a names-only rotation register for Render backend secrets, backend contract drift, Edge Function secrets, and public configuration names. No secret values were inspected or recorded.
- Included the task brief's exact SQL baseline and operator-only production hold steps.
- Performed no application-code changes, network calls, production reads, secret reads, or production mutations.

## Verification

- `git diff --check`: passed before staging.
- `git diff --cached --check`: initially found four Markdown trailing-space errors; they were removed and the fresh rerun passed with exit code 0.
- Pre-commit `git status --short`: showed exactly the two required documentation files staged.
- Commit result: 2 files created, 227 insertions.

No application test suite was run because this was documentation-only work and the brief required `git diff --check` as the check.

## Exact missing live verification

An authorized operator must complete all of the following before this inventory can be considered authoritative:

1. Confirm the production Supabase project Reference ID and whether it is `sioxocmrjmdevsdlzjns`.
2. Confirm the live Render service name and hostname and whether they are `edutu-api` and `edutu-platform.onrender.com`.
3. Confirm the single production Clerk issuer and that Render plus protected Edge Functions use exactly that issuer.
4. Confirm the canonical production deployment branch from the Render-connected source settings and repository release controls.
5. Enumerate the Edge Functions actually deployed to the verified production Supabase project, including function name, version, auth mode, and last deployment time.
6. Confirm whether `scrape` and `weekly-digest` are deployed; if either permits public invocation, disable public invocation through the approved production controls and record operator/time/result.
7. Export or view production migration history and compare it with the 33 canonical local migration identifiers.
8. Run the brief's production SQL baseline and retain only the PostgreSQL version, public-table RLS counts/status, and `SECURITY DEFINER` ACL results.
9. Confirm production presence/signatures/ACLs for `spend_credits(text, integer, text, text, text)` and `add_credits(text, integer, text, text, text)`.
10. Confirm production presence/signatures/ACLs for `count_opportunities_by_source`, `opportunity_admin_stats`, `get_signup_trends`, `get_opportunity_performance`, `get_support_metrics`, and `generate_user_recommendations`.
11. Confirm RLS and client privileges for `scraping_sources`, `scrape_logs`, and `notification_queue`.
12. Reconcile every `UNKNOWN` secret-register entry against Render and Supabase secret metadata, recording only configured state, owner, timestamps, change reference, and verification outcome—not values.

## Concerns

- Repository candidates are evidence only and may be stale; they must not be treated as confirmed production identifiers.
- The deployment hold is `UNKNOWN` and was not executed because production mutation was expressly prohibited.
- `weekly-digest` exists only in the noncanonical mobile Supabase tree, so repository presence cannot establish production deployment.
- `CLERK_ISSUER_URL` is consumed by auth code but is absent from the current Render Blueprint and backend `.env.example`; production issuer isolation is unverified.
- Several backend-consumed credentials appear in `.env.example` or code but are absent from the Render Blueprint; live necessity/configuration remains unknown.

## Fix round 1

- Changed file: `docs/security/production-deployment-inventory.md`.
- Change: added explicit Supabase Security Advisor and Performance Advisor checks to the production hold/do-not-proceed gate, including required capture of results for the verified production project before any production migration.
- Check command: `git diff --check`.
- Check output: passed with exit code 0.
