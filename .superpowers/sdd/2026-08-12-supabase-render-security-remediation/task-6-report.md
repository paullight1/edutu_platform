# Task 6 report — authenticate and make weekly digest idempotent

## Status

DONE_WITH_CONCERNS

## Plato review follow-up

- Bounded the active-goals query with exact count mode and an explicit ten-row
  limit; added a unit test proving both count queries are bounded.
- Changed claims to lease/status/token semantics. Successful and unexpired
  in-flight jobs remain duplicate-suppressed; failed or expired claims receive
  a new lease and token. Completion and failure are service-role-only RPCs and
  require the current token.
- Missing recipient email, provider configuration, provider failures, and
  thrown digest work mark the job retryable. Added a failure-then-retry test.
- Added forward migration
  `edutumobile/supabase/migrations/034_weekly_digest_retryable_job_claims.sql`;
  the original 033 migration is left intact for migration-history safety.

## Implemented

- Replaced the canonical mobile weekly-digest handler with scheduler-only,
  timestamped HMAC authentication over the exact raw request body.
- Validated weekday input to 1–7 and returned generic 401/400/500 responses.
- Added an injectable bounded runner that claims the digest before recipient or
  email work, suppresses duplicate claims, limits page size/total recipients,
  bounds provider requests, and returns counts only.
- Added the service-role-only atomic claim migration at
  `edutumobile/supabase/migrations/033_weekly_digest_job_lock.sql`.
- Added focused Deno tests and the operator runbook at
  `docs/security/weekly-digest-runbook.md`.

## Verification

- `npx --yes deno test --allow-env --allow-net edutumobile/supabase/functions/weekly-digest/index_test.ts` — 9 passed, 0 failed.
- `npx --yes deno check --allow-import edutumobile/supabase/functions/weekly-digest/index.ts` — passed.
- `git diff --check` — passed.

The focused review-fix test/check run passed with the same commands before
commit. Deno's generated root `deno.lock` is not tracked or included.

## Verification hold

Production Supabase project identity, deployed function revision/gateway auth
mode, scheduler identity/cron, live migration state, and live Advisor evidence
were unavailable. The runbook records these as an explicit release hold; no
production schema or scheduler change was run.
