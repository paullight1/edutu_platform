# Task 4 report — Remove client-controlled authorization roles

## Status

DONE_WITH_CONCERNS

## Scope completed

- Generated canonical migration
  `supabase/migrations/20260812181300_harden_profile_authorization.sql`.
- Kept `public.profiles.role` as the canonical server-owned role field.
- Explicitly revoked client insert/update access to `profiles.role` and retained
  service-role access.
- Removed pre-existing authorization-shaped keys from the canonical
  `preferences` JSON and added an invoker trigger to reject future client
  writes containing `role`, `admin`, `is_admin`, or `isAdmin`.
- Added fail-closed removal of any legacy `public.profiles` RLS policy that
  derives role/admin authorization from `preferences`.
- Confirmed scoped backend role resolution already uses the profile role before
  verified Clerk public metadata or Supabase `app_metadata`; no client metadata
  role read was found in canonical backend source. `AdminGuard` is unchanged.
- Added a strict DTO regression test for client-supplied `role` and `admin`.
- Added pgTAP coverage for role-column ACLs, preference escalation denial,
  ordinary preference updates, policy trust source, service-role access,
  analytics denial, and catalog-based CV/resume select denial.
- Added the staging/production cutover document.

## Fix round 1

- Extended the migration catalog scan from `public.profiles` to every
  non-system relation. Any extant RLS policy that derives role/admin state from
  `preferences` is removed fail-closed, retaining the backend/service-role
  authorization path rather than silently broadening client access.
- Removed the matching legacy direct-admin analytics and cross-user CV policies
  from both local schema sources. Their existing service-role/backend paths and
  user-owned CV policy remain; the duplicate schemas no longer introduce a
  client-controlled role dependency.
- Replaced `edutu-web-app` admin-service role reads with the existing guarded
  `/auth/admin-access` backend call using the signed user session token.
  `getAdminPermissions` now ignores its legacy caller-supplied ID and derives
  permissions only from the backend-approved role. No browser service-role key
  or direct Supabase role query was added.
- Reworked pgTAP coverage to use real `public.profiles` fixtures for a regular
  user and administrator, covering rejected preference escalation, permitted
  profile preferences, role persistence, and a cross-user update attempt.
- Added a catalog assertion across all non-system policy schemas. The CV test
  now requires an explicit `app.task4_cv_relation` live-inventory input and
  fails closed when it is absent; the runbook specifies the required evidence.

## Verification

- PASS: `cd backend/services/services/api && npm test -- --runInBand src/auth/admin.guard.spec.ts src/profile/dto/profile.dto.spec.ts`
  (`2` suites, `9` tests).
- PASS: `npx prettier --check src/profile/dto/profile.dto.spec.ts`.
- PASS: focused canonical role-read scan found no client-controlled
  `preferences.role` or user-metadata authorization read; the two remaining
  matches are assertions in the new SQL test.
- PASS: `git diff --cached --check`.
- PASS: `cd edutu-web-app && npm test -- --run
  src/test/__tests__/admin-service-authorization.test.ts` (`1` suite, `2`
  tests) and `npm run typecheck`.
- PASS: fix-round focused backend command
  `cd backend/services/services/api && npm test -- --runInBand
  src/auth/admin.guard.spec.ts src/profile/dto/profile.dto.spec.ts` (`2`
  suites, `9` tests).
- BLOCKED LOCALLY: `npx supabase test db --local
  supabase/tests/security_profile_authorization.sql` could not connect to
  `127.0.0.1:54322`; Docker/Supabase local services are not running.

## Cutover constraints and concerns

1. Production identity, deployed SQL baseline, staging callers, and Supabase
   Advisor evidence remain unknown. No production action was taken.
2. The canonical source tree has no CV/resume relation. pgTAP now requires the
   exact deployed relation through `app.task4_cv_relation`; it fails closed
   until staging supplies that inventory input and records RLS/policy and
   regular-user cross-row evidence.
3. Local pgTAP execution requires Docker plus `supabase start` (or an explicit
   disposable database URL). The SQL test remains unexecuted locally for that
   environmental reason.
