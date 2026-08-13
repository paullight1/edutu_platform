# Task 2 Report: Production identity and zero-credit defaults

## Status

Complete. Implementation commit: `33d225f` (`feat: enforce production auth and zero API credit defaults`).

## Files changed

- `backend/services/services/api/src/main.ts`
  - Production startup now hard-fails for missing `DATABASE_URL`, Supabase URL/service-role credentials, Clerk verification configuration, or an `API_KEY_PEPPER` shorter than 16 characters.
  - Rejects `EDUTU_LOCAL_ADMIN_BYPASS=true` in production.
  - Validates complete enabled Bachs configuration and requires `PAYSTACK_SECRET_KEY` when the legacy Paystack webhook is enabled.
- `backend/services/services/api/src/auth/clerk-auth.guard.ts`
  - Adds a `@ClerkOnly()` route contract so developer routes cannot accept Supabase tokens, Edutu API keys, or the local admin bypass.
  - Keeps normal application-route Supabase fallback behavior unchanged.
  - Explicitly writes new auth-created profiles with zero API credits.
- `backend/services/services/api/src/developer/developer.controller.ts`
  - Applies `@ClerkOnly()` to all developer routes.
- `backend/services/services/api/src/profile/profile.service.ts`
  - Explicitly defaults all profile insert/upsert creation paths to zero API credits.
- `backend/services/services/api/src/admin/admin.service.ts`
  - Explicitly defaults directory backfill profile rows to zero API credits.
- `backend/services/services/api/src/db/seed.ts`
  - Explicitly seeds zero API credits.
- `backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql`
  - Adds a service-role-only `api_credit_balance_integrity_audit` view for null/negative balances.
  - Adds and validates a nonnegative profile credit constraint.
- `backend/services/services/api/src/auth/clerk-auth.guard.spec.ts`
  - Covers missing auth, verified Clerk identity hydration, Edutu API key rejection, Supabase token rejection on Clerk-only routes, and production bypass rejection.
- `backend/services/services/api/src/main.spec.ts`
  - Covers production environment and enabled-provider validation.
- `backend/services/services/api/src/developer/developer.service.spec.ts`
  - Covers project creation without Pro status or API-credit gating.
- `backend/services/services/api/src/billing/billing.service.spec.ts`
  - Covers a new account returning zero credits and no transactions.

The API codebase has no backend use of the `signupCredits` setting, and AI daily usage counters remain separate from profile API-credit creation. No AI or signup path was added that grants API credits.

## Verification

- Focused tests plus migration contract: **5 suites passed, 62 tests passed**.
- `npm run build`: **passed**.
- `npm run lint`: **passed**.
- Jest reports an existing open-handle warning after completion; it does not affect the passing exit status.

## Concerns and verification gaps

- The migration was not applied to a staging/live Supabase database in this workspace.
- No live Clerk, Bachs, Paystack webhook, or non-admin production smoke test was run.
- Production startup validation was tested with environment fixtures only; deployment secret provisioning still needs staging verification.
- The focused Jest process emits an open-handle diagnostic that should be followed up separately if CI requires clean process teardown.

## Working-tree preservation

The pre-existing dirty files listed in the task request were left unstaged and were not modified by the Task 2 commit.
