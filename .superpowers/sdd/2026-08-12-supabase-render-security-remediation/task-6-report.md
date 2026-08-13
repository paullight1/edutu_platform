# Task 6 report — authenticate and make weekly digest idempotent

## Status

DONE_WITH_CONCERNS

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

- `npx --yes deno test --allow-env --allow-net edutumobile/supabase/functions/weekly-digest/index_test.ts` — 7 passed, 0 failed.
- `npx --yes deno check --allow-import edutumobile/supabase/functions/weekly-digest/index.ts` — passed.
- `git diff --check` — passed.

## Verification hold

Production Supabase project identity, deployed function revision/gateway auth
mode, scheduler identity/cron, live migration state, and live Advisor evidence
were unavailable. The runbook records these as an explicit release hold; no
production schema or scheduler change was run.
