# Supabase and Render Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Supabase privilege-escalation, SSRF, data-exposure, webhook-race, secret-management, and deployment-drift risks identified in the 2026-08-12 review, then prevent the same classes of issues from returning.

**Architecture:** Establish `supabase/` as the only deployable database/function source of truth. Privileged database operations will be service-role-only unless an explicit authenticated authorization check is required; production Edge Functions will use narrow authentication, input, network, and response controls. Render will use a reviewed environment contract, while CI will statically reject unsafe SQL policies, unpinned privileged functions, and secret/config drift.

**Tech Stack:** Supabase PostgreSQL migrations and Edge Functions, Deno/TypeScript, NestJS, Render Blueprint/Docker, Clerk JWT verification, Jest/Vitest, Node scripts, and Supabase CLI/MCP.

## Global Constraints

- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, Render secrets, payment secrets, Clerk secrets, or AI provider keys to browser/mobile bundles.
- Enable RLS on every table in an exposed schema and use explicit `TO anon`, `TO authenticated`, or `TO service_role` clauses.
- Every retained `SECURITY DEFINER` function must use a pinned `search_path`, fully qualified objects, a narrow execute ACL, and an authorization test.
- Production must accept exactly one Clerk issuer; development and production must use separate issuer configuration and secret sets.
- `supabase/` is the canonical deployable tree. The duplicate `edutu-web-app/supabase`, `edutumobile/supabase`, and `backend/services/services/api/supabase` trees must not be independently deployed.
- Do not rewrite Git history or rotate credentials automatically; those actions require an operator-approved maintenance window.
- Preserve unrelated working-tree changes. Each task is independently reviewable and should be committed separately.
- No production migration is considered complete until the live database is checked with SQL and Supabase security/performance advisors.

## File and responsibility map

| Area | Files to create or modify | Responsibility |
|---|---|---|
| Canonical database security | Timestamped files created under `supabase/migrations/` | Revoke unsafe RPCs, harden roles, RLS, queue access, and admin functions |
| Canonical Edge Functions | `supabase/functions/scrape/index.ts`, `supabase/functions/weekly-digest/index.ts`, `supabase/functions/_shared/clerk-auth.ts` | Authenticated scrape, trusted digest jobs, production issuer isolation |
| Mobile Edge Function migration | `edutumobile/supabase/functions/revenuecat-webhook/index.ts`, `edutumobile/supabase/functions/delete-account/index.ts`, `edutumobile/supabase/functions/report-ai-content/index.ts` | Webhook claim ownership, safe deletion, generic error responses; migrate to canonical tree before deployment |
| Backend runtime contract | `backend/services/services/api/render.yaml`, `backend/services/services/api/src/main.ts` | Required production variables and fail-closed startup behavior |
| Security automation | `scripts/security/check-supabase-security.mjs`, `scripts/security/check-render-env-contract.mjs`, root `package.json` | Prevent unsafe SQL/config regressions in CI |
| Tests and runbooks | `supabase/functions/**/index_test.ts`, backend `*.spec.ts`, `docs/security/*` | Regression coverage, rollout, rollback, and operator verification |

---

## Phase 0: Confirm deployment authority and freeze the target

### Task 1: Establish the production Supabase and Render inventory

**Files:**
- Create: `docs/security/production-deployment-inventory.md`
- Create: `docs/security/secret-rotation-register.md`
- Read-only verification: repository project references, Render service settings, Supabase project settings

**Interfaces:**
- Produces: the authoritative production Supabase project ref, Render service name, deployed function list, migration history, and secret names without secret values.
- Consumes: the target project ref and operator access needed by all later database verification tasks.

- [ ] **Step 1: Record the target project and service identifiers**

  Record the production Supabase ref, Render service, production Clerk issuer, deployed Edge Functions, and the canonical deployment branch. Do not record secret values.

- [ ] **Step 2: Verify the deployed database before changing code**

  Run these queries through authorized Supabase MCP/SQL access and save only counts/ACL results:

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

- [ ] **Step 3: Put the high-risk findings on a deployment hold**

  Before applying fixes, disable public invocation of the scrape and weekly-digest functions if they are deployed, and document whether the legacy credit RPCs/admin RPCs exist in production.

- [ ] **Step 4: Commit the inventory and stop**

  Run `git diff --check` and commit only the inventory/runbook files:

  ```bash
  git add docs/security/production-deployment-inventory.md docs/security/secret-rotation-register.md
  git commit -m "docs: inventory production security surfaces"
  ```

## Phase 1: Eliminate critical database privilege paths

### Task 2: Revoke legacy credit mutation RPCs immediately

**Files:**
- Create: one migration generated with `supabase migration new revoke_legacy_credit_mutation_rpcs`
- Test: `supabase/tests/security_credit_rpc.sql`
- Document: `docs/security/credit-rpc-cutover.md`

**Interfaces:**
- Produces: `spend_credits` and `add_credits` unavailable to `PUBLIC`, `anon`, and `authenticated`; backend-only callers continue through the canonical billing service/RPCs.
- Consumes: the actual function signatures discovered in Task 1.

- [ ] **Step 1: Write failing SQL permission tests**

  Add tests that enumerate the exact function identities and assert `has_function_privilege('anon', ..., 'EXECUTE') = false` and the same for `authenticated`. Add a test that service-role execution remains available only if the function is still required.

- [ ] **Step 2: Create the revocation migration with the Supabase CLI**

  Run:

  ```bash
  cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
  supabase migration new revoke_legacy_credit_mutation_rpcs
  ```

  In the generated migration, use the signatures present in the reviewed legacy migration:

  ```sql
  revoke execute on function public.spend_credits(text, integer, text, text, text) from public, anon, authenticated;
  revoke execute on function public.add_credits(text, integer, text, text, text) from public, anon, authenticated;
  grant execute on function public.spend_credits(text, integer, text, text, text) to service_role;
  grant execute on function public.add_credits(text, integer, text, text, text) to service_role;
  ```

  If either function is not required by the current billing code, revoke all role execution and drop it only after confirming no deployed caller depends on it.

- [ ] **Step 3: Run the permission tests against a disposable database**

  Expected: anonymous and authenticated execution is denied; service-role execution is allowed only for retained backend calls.

- [ ] **Step 4: Apply to staging, verify, then apply to production**

  Run the migration through the approved Supabase deployment path, re-run the ACL query from Task 1, and capture advisor output before production rollout.

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations supabase/tests/security_credit_rpc.sql docs/security/credit-rpc-cutover.md
  git commit -m "fix: revoke client credit mutation RPCs"
  ```

### Task 3: Lock down scraper tables, admin functions, and the notification queue

**Files:**
- Create: one migration generated with `supabase migration new harden_legacy_admin_privileges`
- Test: `supabase/tests/security_admin_acl.sql`
- Reference: `backend/services/services/api/supabase/migrations/20250120000000_scraper_tables.sql`, `20260505000000_performance_indexes.sql`, `20260522020000_backend_scale_safety.sql`, and both `admin_schema.sql` copies

**Interfaces:**
- Produces: scraper writes and admin analytics/recommendation operations are service-role-only; `notification_queue` has RLS and explicit service-role access.
- Consumes: function signatures and deployed table names from Task 1.

- [ ] **Step 1: Add failing ACL/RLS tests**

  Assert that `anon` and `authenticated` cannot insert/update/delete `scraping_sources`, `scrape_logs`, or `notification_queue`; cannot execute admin statistics/recommendation functions; and that `notification_queue.relrowsecurity = true`.

- [ ] **Step 2: Recreate unsafe scraper policies with explicit roles**

  In the generated migration:

  ```sql
  drop policy if exists "Enable all for service role" on public.scraping_sources;
  drop policy if exists "Enable all for service role" on public.scrape_logs;

  create policy "service role manages scraper sources"
    on public.scraping_sources for all to service_role
    using (true) with check (true);

  create policy "service role manages scrape logs"
    on public.scrape_logs for all to service_role
    using (true) with check (true);

  revoke all on public.scraping_sources, public.scrape_logs from anon, authenticated;
  ```

- [ ] **Step 3: Harden `SECURITY DEFINER` functions**

  For `count_opportunities_by_source`, `opportunity_admin_stats`, signup trends, opportunity performance, support metrics, and user recommendations: pin `search_path` to `''`, fully qualify references, revoke client execution, and grant only to `service_role`. If a function is intentionally public, replace it with a safe invoker view exposing only the approved aggregate.

- [ ] **Step 4: Make queue protection self-contained**

  Add `alter table public.notification_queue enable row level security;`, revoke client table privileges, and create only the service-role policies/grants required by the backend worker.

- [ ] **Step 5: Run tests and advisors**

  Expected: all client ACL tests pass, service-role backend operations still work, and Supabase security advisors report no exposed definer function or RLS issue for these objects.

- [ ] **Step 6: Commit**

  ```bash
  git add supabase/migrations supabase/tests/security_admin_acl.sql
  git commit -m "fix: restrict scraper and admin database privileges"
  ```

### Task 4: Remove client-controlled authorization roles

**Files:**
- Create: one migration generated with `supabase migration new harden_profile_authorization`
- Modify: canonical profile migration path and backend profile update DTO/service as needed
- Test: `supabase/tests/security_profile_authorization.sql`, backend profile authorization tests
- Document: `docs/security/profile-authorization-cutover.md`

**Interfaces:**
- Produces: users can edit permitted profile fields but cannot edit role/admin metadata; admin checks use server-owned data.
- Consumes: existing canonical profile hardening migration and Clerk/admin guard behavior.

- [ ] **Step 1: Write a failing ownership test**

  Attempt to update a regular user profile with `preferences.role = 'admin'` and assert the role remains unchanged or the update is denied. Assert that a regular user cannot read admin analytics/CV rows.

- [ ] **Step 2: Move authorization state out of user-editable JSON**

  Use the existing server-owned role column/private authorization pattern. Revoke update on role/admin columns from client roles and grant only the backend/service-role path. Remove any policy that checks `preferences->>'role'`.

- [ ] **Step 3: Update application authorization checks**

  Search for `preferences->>'role'`, `raw_user_meta_data`, and equivalent client-controlled role reads. Replace them with the canonical profile role or verified Clerk app metadata, retaining the existing backend `AdminGuard` behavior.

- [ ] **Step 4: Test regular and admin paths**

  Run the SQL security tests and relevant backend tests:

  ```bash
  cd backend/services/services/api
  npm test -- --runInBand src/auth/admin.guard.spec.ts src/profile/dto/profile.dto.spec.ts
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add supabase/migrations backend/services/services/api/src supabase/tests/security_profile_authorization.sql
  git commit -m "fix: make profile authorization server-owned"
  ```

## Phase 2: Secure Edge Functions and billing state transitions

### Task 5: Replace the unauthenticated scrape function with an allowlisted fetch service

**Files:**
- Modify: `supabase/functions/scrape/index.ts`
- Create: `supabase/functions/scrape/index_test.ts`
- Create: `supabase/functions/_shared/safe-fetch.ts`
- Document: `docs/security/scrape-function-runbook.md`

**Interfaces:**
- Produces: `safeFetchApprovedPage(url: string): Promise<{ text: string; finalUrl: string }>` with HTTPS/host/private-network/size/timeout/redirect enforcement.
- Consumes: an authenticated/admin or internal-job credential and the existing AI extraction contract.

- [ ] **Step 1: Write failing tests**

  Cover missing auth, wildcard-origin rejection, `http://`, loopback, RFC1918, link-local, metadata IPs, disallowed hosts, excessive redirects, oversized responses, timeout, and a valid approved HTTPS URL.

- [ ] **Step 2: Add authentication and CORS allowlisting**

  Require a signed internal job secret or verified admin Clerk request. Allow only configured origins; return `401/403` without revealing whether a target URL was reachable.

- [ ] **Step 3: Implement safe fetching**

  Parse and normalize the URL, allow only `https:`, compare the hostname against an explicit source allowlist, resolve and reject private/link-local/metadata addresses, use an abort timeout, cap redirects, stream-read no more than the configured byte limit, and reject non-HTML content when appropriate.

- [ ] **Step 4: Add abuse controls and generic errors**

  Rate-limit by authenticated principal/job key, avoid logging full attacker-controlled URLs, cap AI prompt size before reading provider input, and return `{ error: "Request could not be processed" }` for upstream failures.

- [ ] **Step 5: Run function tests and deployment smoke tests**

  Expected: all malicious URL tests fail closed and one approved source succeeds without exposing service credentials.

- [ ] **Step 6: Commit**

  ```bash
  git add supabase/functions/scrape supabase/functions/_shared/safe-fetch.ts docs/security/scrape-function-runbook.md
  git commit -m "fix: secure scrape edge function against SSRF"
  ```

### Task 6: Authenticate and make weekly digest idempotent

**Files:**
- Modify: `supabase/functions/weekly-digest/index.ts`
- Create: `supabase/functions/weekly-digest/index_test.ts`
- Create: migration generated with `supabase migration new weekly_digest_job_lock`
- Document: `docs/security/weekly-digest-runbook.md`

**Interfaces:**
- Produces: `runWeeklyDigest(day: Weekday, jobToken: string): Promise<{ sent: number; skipped: number }>` with no user email/ID in its HTTP response.
- Consumes: a scheduler-only secret/signature, a unique job key, and the existing service-role query/email dependencies.

- [ ] **Step 1: Write failing tests**

  Assert missing/invalid scheduler credentials return `401`, invalid day returns `400`, duplicate job keys do not resend, and successful responses contain counts only.

- [ ] **Step 2: Add scheduler authentication**

  Validate a dedicated `WEEKLY_DIGEST_JOB_SECRET` using constant-time comparison or a signed timestamped request. Do not accept ordinary user JWTs as the scheduler boundary.

- [ ] **Step 3: Add a job lock/idempotency table**

  Create a table keyed by digest day and execution date with RLS enabled and service-role-only access. Claim the job atomically before querying users or sending mail.

- [ ] **Step 4: Remove data disclosure and bound execution**

  Return counts only, avoid email/ID logs, validate page size/batch size, and ensure one failed recipient does not expose the full user set or abort state incorrectly.

- [ ] **Step 5: Verify scheduler configuration**

  Confirm the actual Supabase Cron/Render/ external scheduler sends the secret and that function JWT settings do not create an alternate invocation path.

- [ ] **Step 6: Commit**

  ```bash
  git add supabase/functions/weekly-digest supabase/migrations docs/security/weekly-digest-runbook.md
  git commit -m "fix: authenticate and deduplicate weekly digest jobs"
  ```

### Task 7: Enforce production Clerk issuer isolation

**Files:**
- Modify: `supabase/functions/_shared/clerk-auth.ts`
- Modify: every canonical function entry point that calls the shared verifier
- Create: `supabase/functions/_shared/clerk-auth_test.ts`
- Document: `docs/security/clerk-environment-isolation.md`

**Interfaces:**
- Produces: `verifyClerkRequest(request, { issuer: productionIssuer })` that rejects every token whose issuer is not the configured environment issuer.
- Consumes: required `CLERK_ISSUER_URL` deployment variable.

- [ ] **Step 1: Write failing issuer tests**

  Test production configuration with a production token, a development token, an unknown issuer, an expired token, and a missing issuer configuration.

- [ ] **Step 2: Remove the production fallback to both issuers**

  Require `CLERK_ISSUER_URL` in production, construct JWKS discovery from that issuer only, and fail closed when it is missing or malformed. Keep development issuer configuration explicit in development only.

- [ ] **Step 3: Verify every function uses the shared verifier**

  Search all Edge Functions for direct JWT decoding or issuer lists. Route protected handlers through the hardened helper and add a production deployment variable to the environment contract.

- [ ] **Step 4: Run tests and commit**

  ```bash
  cd edutumobile
  npm test -- --runInBand supabase/functions/_shared/clerk-auth_test.ts
  git add supabase/functions edutumobile/supabase/functions docs/security/clerk-environment-isolation.md
  git commit -m "fix: isolate production Clerk issuer"
  ```

### Task 8: Make RevenueCat receipt claiming atomic and safe

**Files:**
- Modify: `edutumobile/supabase/functions/revenuecat-webhook/index.ts`
- Modify: canonical billing migration/function used by the webhook
- Modify: `edutumobile/supabase/functions/revenuecat-webhook/index_test.ts`
- Create: migration generated with `supabase migration new atomic_provider_event_claim`

**Interfaces:**
- Produces: `claimProviderEvent(...) -> { claimed: boolean; claimToken?: string }` and `markProviderEvent(..., claimToken)`; only the current claim owner can transition the event.
- Consumes: unique `(provider, environment, event_id)` and provider-resource ledger constraints.

- [ ] **Step 1: Write the concurrency regression test**

  Invoke two claims for the same event concurrently. Assert exactly one returns `claimed: true`; invoke a stale completion and assert it cannot mark the event processed.

- [ ] **Step 2: Add an atomic claim/lease operation**

  Implement a service-role-only SQL function that atomically inserts a new receipt or updates a retryable/expired row using `UPDATE ... WHERE ... RETURNING`. Store a random claim token, lease expiry, and incremented attempt.

- [ ] **Step 3: Require claim ownership on completion**

  Change processed/failed updates to filter by event ID and claim token. Do not allow an invocation with a stale token to overwrite current processing state.

- [ ] **Step 4: Preserve downstream idempotency**

  Verify canonical fulfillment uses unique provider transaction/resource IDs and that retries after timeout do not add credits or entitlements twice.

- [ ] **Step 5: Run webhook tests and commit**

  ```bash
  cd edutumobile
  npm test -- --runInBand supabase/functions/revenuecat-webhook/index_test.ts
  git add supabase/functions/revenuecat-webhook supabase/migrations
  git commit -m "fix: make RevenueCat event claims atomic"
  ```

### Task 9: Harden account deletion and error responses

**Files:**
- Modify: `edutumobile/supabase/functions/delete-account/index.ts`
- Modify: `edutumobile/supabase/functions/report-ai-content/index.ts`
- Create: tests beside both functions
- Document: `docs/security/account-deletion-runbook.md`

**Interfaces:**
- Produces: authenticated deletion that removes all documented user-owned records/storage objects, invalidates sessions through the supported auth path, and returns generic errors.
- Consumes: the actual deployed table/storage inventory and retention requirements.

- [ ] **Step 1: Inventory deletion coverage**

  Map every table keyed by Clerk subject/user ID, community DM/block record, storage bucket/object prefix, provider identity, and audit record. Mark records that must be retained for legal/accounting reasons.

- [ ] **Step 2: Write deletion tests**

  Assert a user can delete only their own account, a mismatched body user ID is rejected, all deletable rows are removed, protected audit rows remain only where documented, and a second deletion is idempotent.

- [ ] **Step 3: Implement server-side deletion orchestration**

  Use a service-role-only transaction/RPC or ordered cleanup with explicit table names; remove storage objects; revoke/invalidate auth sessions using the supported provider API; do not accept a client-selected table or column.

- [ ] **Step 4: Normalize error responses**

  Return stable error codes/messages to clients and log detailed errors only on the server with request correlation IDs. Apply the same rule to `report-ai-content`.

- [ ] **Step 5: Run tests and commit**

  ```bash
  cd edutumobile
  npm test -- --runInBand supabase/functions/delete-account supabase/functions/report-ai-content
  git add supabase/functions/delete-account supabase/functions/report-ai-content docs/security/account-deletion-runbook.md
  git commit -m "fix: harden account deletion and edge errors"
  ```

## Phase 3: Make Render production configuration reproducible

### Task 10: Define and enforce the Render environment contract

**Files:**
- Modify: `backend/services/services/api/render.yaml`
- Modify: `backend/services/services/api/src/main.ts`
- Create: `backend/services/services/api/src/config/required-environment.ts`
- Create: `scripts/security/check-render-env-contract.mjs`
- Test: `backend/services/services/api/src/config/required-environment.spec.ts`
- Document: `docs/security/render-production-runbook.md`

**Interfaces:**
- Produces: a typed required-variable contract separating secret and non-secret values; production startup fails before serving traffic when required security/payment/webhook variables are missing.
- Consumes: the approved variable inventory from Task 1 and the current `render.backend.env` names, never its values.

- [ ] **Step 1: Write failing configuration tests**

  Test that production rejects missing `API_KEY_PEPPER`, `CLERK_ISSUER_URL`, Supabase credentials, database URL, webhook secrets, and payment secrets required by enabled billing routes. Test that development may use development-only defaults without weakening production.

- [ ] **Step 2: Centralize validation**

  Replace scattered checks in `main.ts` with `required-environment.ts`. Return field names only; never log secret values. Make billing/webhook modules fail closed when their required configuration is absent rather than starting partially enabled public endpoints.

- [ ] **Step 3: Update Render Blueprint declarations**

  Add every required secret name to `render.yaml` with `sync: false`, retain public URLs as explicit values, remove stale/unused variables, and add `CLERK_ISSUER_URL` plus Edge Function scheduler/webhook secret names to the documented contract.

- [ ] **Step 4: Add CI drift validation**

  Make `check-render-env-contract.mjs` compare the source contract, `render.yaml`, and approved example env names. Fail if a required production name is omitted or if a secret-like value is committed.

- [ ] **Step 5: Run backend tests/build and commit**

  ```bash
  cd backend/services/services/api
  npm test -- --runInBand src/config/required-environment.spec.ts
  npm run build
  git add render.yaml src/main.ts src/config scripts/security/check-render-env-contract.mjs docs/security/render-production-runbook.md
  git commit -m "fix: enforce Render production environment contract"
  ```

### Task 11: Rotate historical credentials and clean deployment access

**Files:**
- Modify: `docs/security/secret-rotation-register.md`
- Modify: `.gitignore` and secret example files only if the inventory finds gaps
- CI configuration: repository secret scanning workflow

**Interfaces:**
- Produces: all historical credentials from `render.backend.env` rotated/revoked, Render/Supabase access minimized, and a documented proof of rotation.
- Consumes: operator-approved credential owners and a maintenance window.

- [ ] **Step 1: Produce a history-only secret inventory**

  Search all Git refs and CI artifacts for secret names and known token formats without printing values. Record secret type, owner, rotation status, and invalidation timestamp.

- [ ] **Step 2: Rotate in dependency order**

  Rotate Supabase service-role/database credentials, Clerk secrets, payment/webhook secrets, AI/API credentials, and API key peppers. Update Render and Supabase secrets before restarting services.

- [ ] **Step 3: Verify old credentials are invalid**

  Run safe negative checks for each provider; do not test by printing credentials. Confirm production health, billing webhooks, and authenticated API requests after rotation.

- [ ] **Step 4: Add repository secret scanning**

  Add a CI job using the repository-approved scanner and block new secret-like values in tracked files, generated artifacts, and Render configuration.

- [ ] **Step 5: Decide on history rewriting**

  If the repository was exposed outside the trusted team, obtain approval to rewrite history and force-update protected refs. Otherwise retain history but document that all values were rotated.

## Phase 4: Consolidate Supabase sources and add regression gates

### Task 12: Make the root Supabase tree the only deployable source

**Files:**
- Create: `docs/security/supabase-source-of-truth.md`
- Create: `scripts/security/check-supabase-source-of-truth.mjs`
- Modify: deployment scripts and package scripts that currently point at duplicate trees
- Modify: `supabase/config.toml` if function verification settings need explicit declaration
- Retire from deployment: `edutu-web-app/supabase`, `edutumobile/supabase`, `backend/services/services/api/supabase` duplicate migrations/functions after migration parity is verified

**Interfaces:**
- Produces: one documented migration/function deployment path with an explicit mapping from legacy objects to canonical objects.
- Consumes: migration history and production inventory from Task 1.

- [ ] **Step 1: Write a source-of-truth check**

  Fail when deployment scripts, CI, or package scripts invoke Supabase CLI from a duplicate tree. Permit duplicate files only as archived references with a documented reason.

- [ ] **Step 2: Map duplicate objects**

  For every duplicate migration/function, record whether it is canonical, superseded, already applied, or needs a new canonical migration. Do not delete a duplicate until the live migration history is reconciled.

- [ ] **Step 3: Move required function code into the canonical tree**

  Preserve function names/routes and environment contracts, update mobile/backend deploy scripts to target `supabase/functions`, and keep the mobile/web callers unchanged unless the endpoint contract changes.

- [ ] **Step 4: Add deploy documentation and guardrails**

  Document the exact commands for staging and production deployment, including function JWT verification settings, migration order, rollback limits, and required advisor checks.

- [ ] **Step 5: Run the source check and commit**

  ```bash
  node scripts/security/check-supabase-source-of-truth.mjs
  git add docs/security/supabase-source-of-truth.md scripts/security/check-supabase-source-of-truth.mjs supabase package.json
  git commit -m "chore: establish canonical Supabase deployment tree"
  ```

### Task 13: Add permanent Supabase security linting and CI verification

**Files:**
- Create: `scripts/security/check-supabase-security.mjs`
- Create: `supabase/tests/security_regression.sql`
- Modify: root `package.json`
- Modify: CI workflow under `.github/workflows/`
- Document: `docs/security/security-ci.md`

**Interfaces:**
- Produces: CI commands `npm run security:check-supabase` and `npm run security:test-supabase`.
- Consumes: canonical SQL/function files and a staging Supabase database for integration checks.

- [ ] **Step 1: Write static lint tests**

  Make fixtures fail for: `SECURITY DEFINER` without `SET search_path`, `GRANT EXECUTE ... TO anon/authenticated` on admin functions, policies with `USING (true)` lacking an explicit service-role target, `auth.role()` authorization checks, wildcard CORS on protected functions, and `fetch(userControlledUrl)` without the safe-fetch helper.

- [ ] **Step 2: Implement the scanner**

  Scan only canonical deployable paths, report file/line/rule/severity, and exit nonzero for P0/P1 rules. Avoid parsing or printing secret values.

- [ ] **Step 3: Add integration regression SQL**

  Test RLS enabled status, function ACLs, view security-invoker status, private storage buckets, protected scheduler/webhook functions, and representative cross-user access denials.

- [ ] **Step 4: Add CI jobs**

  Run static checks on every pull request. Run SQL integration tests and Supabase advisors against an isolated staging project after migrations. Block production deployment when a P0/P1 advisor or regression test fails.

- [ ] **Step 5: Run the complete check and commit**

  ```bash
  npm run security:check-supabase
  npm run security:test-supabase
  git diff --check
  git add scripts/security supabase/tests package.json .github/workflows docs/security/security-ci.md
  git commit -m "ci: enforce Supabase security invariants"
  ```

### Task 14: Upgrade vulnerable dependencies and verify all packages

**Files:**
- Modify: `edutu-web-app/package.json`, `edutu-web-app/package-lock.json`
- Modify: backend/admin/mobile lockfiles only when audit identifies a required update
- Create or modify: CI dependency audit workflow

**Interfaces:**
- Produces: no high/critical production dependency vulnerabilities; `react-router` and `react-router-dom` are upgraded to the fixed release line at or above `7.18.0` where compatible.
- Consumes: current lockfiles and package test suites.

- [ ] **Step 1: Run reproducible audits**

  ```bash
  cd edutu-web-app && npm audit --omit=dev --audit-level=high
  cd ../admin && npm audit --omit=dev --audit-level=high
  cd ../edutumobile && npm audit --omit=dev --audit-level=high
  cd ../backend/services/services/api && npm audit --omit=dev --audit-level=high
  ```

- [ ] **Step 2: Upgrade the affected dependency**

  Update the lockfile using the package manager, run web typecheck/tests/build, and verify route/deep-link behavior. Do not use broad forced upgrades that change unrelated major versions.

- [ ] **Step 3: Add CI audit enforcement**

  Run audits from each app directory and fail on high/critical production findings. Store the audit output as CI artifacts without including environment values.

- [ ] **Step 4: Commit**

  ```bash
  git add edutu-web-app/package.json edutu-web-app/package-lock.json admin/package-lock.json edutumobile/package-lock.json backend/services/services/api/package-lock.json .github/workflows
  git commit -m "chore: remediate production dependency advisories"
  ```

## Phase 5: Staged rollout and completion criteria

### Task 15: Execute staging verification, production rollout, and rollback checks

**Files:**
- Modify: `docs/security/production-deployment-inventory.md`
- Modify: `docs/security/*-runbook.md`
- Create: `docs/security/2026-08-12-remediation-evidence.md`

**Interfaces:**
- Produces: evidence that the deployed project satisfies every finding’s verification requirement and that rollback/recovery steps are known.
- Consumes: all completed migrations, functions, Render configuration, CI checks, and operator approvals.

- [ ] **Step 1: Deploy to staging**

  Apply migrations in order, deploy canonical functions with explicit JWT settings, update staging secrets, deploy the Render image, and run the complete test/audit suite.

- [ ] **Step 2: Run adversarial verification**

  Verify anonymous/authenticated denial for credit/admin RPCs, cross-user profile denial, SSRF target rejection, invalid digest scheduler token rejection, development Clerk issuer rejection, duplicate webhook single-claim behavior, and safe error bodies.

- [ ] **Step 3: Run advisors and inspect live ACLs**

  Run Supabase security/performance advisors and the SQL regression suite against staging. Resolve every P0/P1 result before production.

- [ ] **Step 4: Roll out production in dependency order**

  Rotate/update secrets, apply database revocations first, deploy compatible function code, deploy Render, then enable scheduled jobs. Monitor authentication, billing, scraper, digest, and deletion metrics.

- [ ] **Step 5: Record rollback limits**

  Document that privilege revocations are safe to retain during application rollback; database migrations that remove columns/functions require a forward-fix or restore plan. Keep old function versions disabled rather than re-exposing unsafe endpoints.

- [ ] **Step 6: Close the review**

  Attach advisor output, ACL query results, CI runs, dependency audit results, secret rotation evidence, and production smoke-test results to `docs/security/2026-08-12-remediation-evidence.md`.

## Completion criteria

- No P0/P1 findings remain exploitable in the verified production Supabase project.
- All exposed tables have intentional RLS and explicit grants.
- No client role can execute credit mutation or admin analytics/recommendation functions.
- Scrape and digest functions have authenticated, bounded, auditable invocation paths.
- Production Clerk tokens are issuer-isolated.
- RevenueCat duplicate delivery tests prove one active claim and owner-bound completion.
- Render configuration is reproducible from the reviewed secret-name contract and fails closed when required security variables are absent.
- Historical secrets are rotated and the result is recorded.
- CI blocks unsafe Supabase SQL/function patterns, duplicate deployment paths, committed secrets, and high/critical dependency vulnerabilities.
- Supabase advisors and SQL regression checks pass against the actual production project.
