# Supabase and Render Security Review

Date: 2026-08-12  
Scope: Edutu repository, Supabase SQL/Edge Functions, NestJS Render deployment configuration, and the current working-tree diff.

## Executive summary

The canonical root Supabase migrations contain several good controls: RLS on newer tables, private community storage, pinned `SECURITY DEFINER` functions, restricted service-role grants, and `security_invoker` views. The Render Docker image also uses a pinned Node base image, a multi-stage build, production dependency pruning, and a non-root runtime user.

The highest-risk items are in duplicate or legacy Supabase trees. If those migrations or schemas are deployed to a live project, they can permit arbitrary credit manipulation, self-assigned admin authorization, access to admin analytics, or unauthenticated SSRF/AI-cost abuse. The active deployment target could not be verified: the repository references project `sioxocmrjmdevsdlzjns`, but that project was not available in the connected Supabase project list, and the advisor request for it was rejected for lack of permission.

No application files were changed by this review. This report is a static review unless otherwise noted.

## Findings

### SBR-SUP-001 — P0 / Critical: Client-callable `SECURITY DEFINER` credit RPCs accept an arbitrary user ID

Location: `edutu-web-app/supabase/migrations/20260509000001_atomic_credit_operations.sql:3-66`

Evidence: `spend_credits(p_user_id, ...)` and `add_credits(p_user_id, ...)` are `SECURITY DEFINER` functions. They use the caller-supplied `p_user_id`, do not authenticate that it belongs to the caller, and the migration does not revoke default `PUBLIC` execution or restrict execution to `service_role`.

Impact: If this legacy schema is deployed and the functions are callable, a caller may spend or add credits to another account. `add_credits` is especially severe because it directly creates balance.

Fix: Revoke execution from `PUBLIC`, `anon`, and `authenticated`; grant only to `service_role`, or derive the user identity from the JWT and remove the caller-controlled user ID. Pin the function `search_path`, validate positive amounts, and add SQL tests that anonymous and authenticated callers receive `permission denied`.

Verification gap: Confirm the live function signatures and `proacl` in the target database. This finding is conditional on this legacy migration having been applied.

### SBR-SUP-002 — P1 / High: Scraper tables have effectively public all-operation policies

Location: `backend/services/services/api/supabase/migrations/20250120000000_scraper_tables.sql:80-97`

Evidence: RLS is enabled, but the policies named `Enable all for service role` omit `TO service_role` and use `USING (true)` plus `WITH CHECK (true)`. In PostgreSQL, an omitted role target applies to `PUBLIC`.

Impact: Any role that can reach these tables and has table privileges may insert, update, or delete `scraping_sources` and `scrape_logs`. A modified source can influence the backend scheduler and scraper targets; logs can be forged or erased.

Fix: Drop these policies and recreate them with `TO service_role`. Revoke table privileges from `anon` and `authenticated`; expose administrative operations only through the authenticated backend admin API. Verify the deployed policies via `pg_policies` and table ACLs.

### SBR-SUP-003 — P1 / High: Legacy profile self-service can change the role used for authorization

Location: `edutu-web-app/supabase/schema.sql:31,71-75,277-288,864-875`

Evidence: Users can update their own full `profiles` row, including `preferences`, while admin checks derive authorization from `preferences->>'role' = 'admin'`.

Impact: On a project using this schema, a user may set their own preference role to `admin` and then satisfy policies intended for administrators, including access to analytics snapshots or CV records belonging to other users.

Fix: Store authorization roles in a server-owned column or private authorization table. Do not allow client updates to that column; use backend/service-role administration or verified Clerk metadata. The current root migration `20260619140744_harden_profile_self_service_privileges.sql` is the safer pattern, but the duplicate legacy schema must be retired or blocked from deployment.

### SBR-SUP-004 — P1 / High: Admin analytics and recommendation functions are executable by any authenticated user

Location: `edutu-web-app/supabase/admin_schema.sql:298-451`; duplicated in `backend/services/services/api/supabase/admin_schema.sql`

Evidence: Several `SECURITY DEFINER` functions, including signup trends, opportunity performance, support metrics, and user recommendations, have no internal admin check, do not pin `search_path`, and are granted to `authenticated`.

Impact: Any signed-in user may read administrative aggregate data. The recommendation function accepts an arbitrary user ID and can write recommendations for another user under definer privileges.

Fix: Revoke client execution and grant only to `service_role`, or enforce a server-side admin check inside each function. Pin `search_path` to a safe value and fully qualify objects. Add tests for anonymous, regular authenticated, and admin callers.

### SBR-SUP-005 — P1 / High: Unauthenticated scrape Edge Function is an SSRF and AI-cost abuse surface

Location: `supabase/functions/scrape/index.ts:3-18,28-34,66-100`

Evidence: The function permits wildcard CORS, has no authentication check, accepts an arbitrary `url`, and calls `fetch(url)` without protocol/host allowlisting, private-network blocking, timeout, redirect, or response-size controls. It forwards fetched content to an AI provider.

Impact: If deployed, an attacker can use the function to probe internal services, fetch sensitive URLs, consume AI/API budget, and tie the service to attacker-controlled content. The response is read fully before truncation, so large responses can also cause memory or latency pressure.

Fix: Require authenticated/admin or server-to-server authorization; allow only HTTPS and explicitly approved hosts; block loopback, link-local, private, metadata, and unusual IP forms after DNS resolution; cap redirects, bytes, and duration; rate-limit; restrict CORS; and return generic errors without upstream messages.

Verification gap: Confirm whether this root function is deployed in the production Supabase project. If it is legacy and unused, remove it from deployment paths.

### SBR-SUP-006 — P1 / High: Weekly digest uses service-role data access without visible scheduler authentication

Location: `edutumobile/supabase/functions/weekly-digest/index.ts:13-20,97-152`

Evidence: The handler creates a service-role client, queries users and their goals/bookmarks/applications, sends email, and returns per-user IDs/emails/results. No application-level scheduler secret or signature check is visible; `day` is accepted from the request query.

Impact: If the function is reachable without a separately enforced trusted scheduler boundary, a caller can trigger mass email, cause repeated processing and cost, and receive sensitive user/email status data.

Fix: Require a dedicated scheduler secret or signed job request, validate `day`, remove user identifiers and email addresses from responses/logs, add idempotency and a job lock, and rate-limit/reject arbitrary invocation. Confirm Supabase function JWT settings and the actual scheduler configuration.

### SBR-SUP-007 — P1 / High: Production edge functions trust both production and development Clerk issuers by default

Location: `edutumobile/supabase/functions/_shared/clerk-auth.ts:34-51,114-117`

Evidence: The verifier includes both the production and development Clerk issuers in its JWKS list. Issuer restriction is applied only when `CLERK_ISSUER_URL` is configured; otherwise a valid token from either issuer can be accepted.

Impact: A token from the development tenant may authenticate against production functions. This creates a cross-environment trust boundary and increases the impact of a development-tenant compromise or accidental test account access.

Fix: Require exactly one issuer in production and fail startup/deployment if `CLERK_ISSUER_URL` is absent. Use separate Supabase projects/functions and secrets for development and production. Add tests proving a development issuer is rejected by production configuration.

### SBR-SUP-008 — P2 / Medium: `SECURITY DEFINER` source-count function is broadly executable

Location: `backend/services/services/api/supabase/migrations/20260505000000_performance_indexes.sql:50-65`

Evidence: `count_opportunities_by_source()` is `SECURITY DEFINER`, does not set a safe `search_path`, and is granted to both `authenticated` and `anon`.

Impact: This exposes catalog information to unauthenticated callers and leaves a privileged function with weaker hardening than the canonical migrations. The fully qualified table reference reduces, but does not eliminate, the risk from the unpinned search path.

Fix: Pin `search_path` (prefer `''` with fully qualified objects), revoke `PUBLIC`/`anon`/`authenticated` unless public statistics are intentional, and grant only the required role. If public counts are needed, expose a deliberately safe view with no sensitive dimensions.

### SBR-SUP-009 — P2 / Medium: Backend queue migration does not enable RLS, and admin stats remain client-executable

Location: `backend/services/services/api/supabase/migrations/20260522020000_backend_scale_safety.sql:5-15,66-91`

Evidence: The migration creates `notification_queue` without enabling RLS or defining policies. The same migration grants `opportunity_admin_stats()` to `authenticated`; later duplicate migrations retain that grant. A separate `admin_schema.sql` happens to enable RLS, so protection depends on which schema path was applied.

Impact: Schema drift can leave queue data exposed or writable according to default table privileges. Any authenticated caller can invoke an administrative aggregate function intended for backend use.

Fix: Make every migration self-contained: enable RLS immediately, revoke client privileges, add explicit service-role grants, and remove authenticated execution from admin functions. Verify `relrowsecurity`, `pg_policies`, and table/function ACLs in the deployed project.

### SBR-SUP-010 — P2 / Medium: Render blueprint and runtime environment have security-relevant configuration drift

Location: `backend/services/services/api/render.yaml:9-43`; runtime validation in `backend/services/services/api/src/main.ts:56-75`

Evidence: The blueprint declares `DATABASE_URL`, Supabase, Clerk, AI, and some application variables, but omits variables present in the local Render environment template, including `API_KEY_PEPPER`, Paystack secrets, and several webhook/API configuration values. Production hard-fails only when `API_KEY_PEPPER` is absent; missing billing configuration is logged and the API continues with checkout unavailable.

Impact: Render deployments are not reproducible from the blueprint and can run in a partially configured state. Missing or stale variables can cause security controls, webhooks, billing, or API-key verification to differ between environments.

Fix: Maintain one reviewed secret inventory, declare every required secret in the Render blueprint as `sync: false`, remove unused variables, and fail closed for production billing/webhook configuration where the endpoint would otherwise be exposed. Verify the actual Render service environment and access policy; do not put secret values in YAML.

### SBR-SUP-011 — P2 / Medium: Historical Render environment file contained secrets

Location: Git history for `render.backend.env`; removal commits include `c0710ae` and `63cf889`

Evidence: The file is currently ignored and untracked, but repository history records that it was previously tracked and the removal commit explicitly identifies embedded secrets.

Impact: Removing the current file does not revoke credentials present in old commits, clones, CI caches, or mirrors. Any historical Supabase service-role, Clerk, payment, AI, or API credentials should be treated as compromised if the repository history was accessible to anyone outside the trusted operator set.

Fix: Rotate every credential that appeared in the historical file, invalidate old webhook/API keys, scan all refs and CI artifacts, and rewrite repository history if policy requires removal. Confirm that the replacement secrets are stored only in Render/Supabase secret managers.

### SBR-SUP-012 — P2 / Medium: RevenueCat webhook event claiming is not atomic or ownership-bound

Location: `edutumobile/supabase/functions/revenuecat-webhook/index.ts:41-99,101-133`

Evidence: On a duplicate event, the function reads `status` and `attempt_count`, then unconditionally updates the row to `processing`. Completion/failure updates filter only by provider, environment, and event ID; they do not use a lease, attempt token, or conditional status transition.

Impact: Concurrent duplicate deliveries can both reclaim and process the same event, or one invocation can overwrite another invocation's status. Downstream billing functions appear designed for idempotency, which reduces double-credit risk, but the receipt state machine is still race-prone.

Fix: Implement an atomic database claim (`UPDATE ... WHERE status IN (...) AND lease expired ... RETURNING`), record a unique claim token/attempt, and require that token when marking processed/failed. Add concurrent webhook tests and verify the unique provider-resource constraints in the billing ledger.

## Dependency signal

The `edutu-web-app` production dependency audit reported moderate advisories affecting `react-router`/`react-router-dom` versions below `7.18.0`, with an available fix. Backend and admin `npm audit` did not complete in the review window, so this is not evidence that those trees are clean. Run each package's audit in CI and fail on high/critical production vulnerabilities.

## Recommended order of operations

1. Verify the actual production Supabase project and run security/performance advisors with an authorized operator.
2. Immediately revoke or disable the legacy credit RPCs and admin functions if their schemas exist in production.
3. Lock down the scraper and weekly-digest functions before exposing them publicly.
4. Enforce a single production Clerk issuer and verify the Render environment against a minimal secret inventory.
5. Rotate all credentials ever present in `render.backend.env` history.
6. Replace duplicate schema trees with one canonical migration path, then add CI checks for RLS, function ACLs, unsafe `SECURITY DEFINER`, and secret/config drift.

