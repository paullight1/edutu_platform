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

## Verification

- PASS: `cd backend/services/services/api && npm test -- --runInBand src/auth/admin.guard.spec.ts src/profile/dto/profile.dto.spec.ts`
  (`2` suites, `9` tests).
- PASS: `npx prettier --check src/profile/dto/profile.dto.spec.ts`.
- PASS: focused canonical role-read scan found no client-controlled
  `preferences.role` or user-metadata authorization read; the two remaining
  matches are assertions in the new SQL test.
- PASS: `git diff --cached --check`.
- BLOCKED LOCALLY: `npx supabase test db --local
  supabase/tests/security_profile_authorization.sql` could not connect to
  `127.0.0.1:54322`; Docker/Supabase local services are not running.

## Cutover constraints and concerns

1. Production identity, deployed SQL baseline, staging callers, and Supabase
   Advisor evidence remain unknown. No production action was taken.
2. The canonical source tree has no CV/resume relation. The pgTAP test checks
   that no canonical public relation named like CV/resume is readable by
   `authenticated`; staging must identify and test the actual deployed relation
   before production cutover.
3. Local pgTAP execution requires Docker plus `supabase start` (or an explicit
   disposable database URL). The SQL test remains unexecuted locally for that
   environmental reason.
