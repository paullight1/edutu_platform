# Task 2 Report: Production identity and zero-credit defaults

## Status

Complete. Fix-round implementation commit: `c2bef72` (`fix: close Task 2 production readiness gaps`). The original Task 2 implementation remains in `33d225f`; this report supersedes the earlier report commit `1f61bc6`.

## Findings addressed

- Added the forward migration `20260813110000_api_credit_task2_contract.sql`. It is safe for fresh and already-upgraded databases, ensures `profiles.credits` is canonical and non-null with a zero default, adds/validates `profiles_credits_nonnegative_check`, creates the service-role-only `api_credit_balance_integrity_audit` view, and revokes public/anon/authenticated access.
- Restored `20260812090000_api_production_contract.sql` to its original Task 1 content. The Task 2 audit view and constraint are no longer carried only by the already-versioned Task 1 migration.
- Extended `verify-api-production-schema.mjs` and its contract fixtures to verify the new constraint, view, and exact ACLs.
- Audited non-Drizzle profile creation paths. `ChatService.ensureProfile`, the mobile chat proxy, and both Supabase auth-trigger schemas explicitly use zero API credits. Conflict paths use no-op conflict behavior so existing balances are preserved.
- Changed environment validation to fail closed unless `NODE_ENV` is exactly `development`, `test`, or `production`. Production still requires database, Supabase, Clerk, security-pepper, and enabled-provider configuration.
- Restricted the local admin bypass to explicit `NODE_ENV=development`; unset, empty, staging-like, production-like, test, and production environments cannot use it.
- Added tests/static guards for all of the above, including no AI/signup credit grant path being introduced by these profile changes.

## Files changed

Fix-round files in `c2bef72`:

- `backend/services/services/api/supabase/migrations/20260813110000_api_credit_task2_contract.sql`
- `backend/services/services/api/scripts/verify-api-production-schema.mjs`
- `backend/services/services/api/src/billing/billing-schema.contract.spec.ts`
- `backend/services/services/api/src/profile/profile-creation.contract.spec.ts`
- `backend/services/services/api/src/chat/chat.service.ts`
- `backend/services/services/api/src/chat/chat.service.spec.ts`
- `backend/services/services/api/src/auth/clerk-auth.guard.ts`
- `backend/services/services/api/src/auth/clerk-auth.guard.spec.ts`
- `backend/services/services/api/src/main.ts`
- `backend/services/services/api/src/main.spec.ts`
- `backend/services/services/api/supabase/schema.sql`
- `edutu-web-app/supabase/schema.sql`
- `edutumobile/supabase/functions/chat-proxy/index.ts`
- Task 1 migration restoration: `backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql`

Earlier Task 2 files remain in `33d225f`, including the Clerk-only developer route contract and Drizzle/admin/seed zero-credit defaults.

## Verification

- Focused Jest suite: **5 suites passed, 80 tests passed**.
- `npm run build`: **passed**.
- `npm run lint`: **passed**.
- Targeted Prettier check: **passed**.
- `git diff --check`: **passed**.
- Task 1 migration comparison against its pre-Task-2 version: **no diff**.

## Concerns and verification gaps

- The new migration was not applied to a staging/live Supabase database in this workspace. Live migration execution and catalog verification remain required before rollout.
- No live Clerk, Bachs, Paystack webhook, or non-admin production smoke test was run.
- Deployment secret provisioning and exact `NODE_ENV` values still require staging verification.
- Jest completes successfully but emits the existing open-handle diagnostic; this is separate follow-up work if CI requires clean process teardown.

## Working-tree preservation

The task-listed pre-existing dirty files remain unstaged and were not included in `c2bef72`. Only Task 2 files were staged for the focused fix commit.
