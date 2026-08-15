# Task 5 edge egress report

## Status

DONE_WITH_CONCERNS

## Implemented

- `safeFetchApprovedPage` now validates the configured HTTPS allowlist before
  signing and fails closed when `SCRAPE_EGRESS_URL` or
  `SCRAPE_EGRESS_SHARED_SECRET` is absent.
- It sends only a POST to the configured egress endpoint with the exact raw
  JSON body `{"url":"..."}` and `v1` HMAC-SHA256 over
  `<timestamp>.<principal>.<rawBody>`.
- It sends the timestamp, signature, and principal headers, defaulting the
  principal to `edge-job` and applying the backend-safe principal rules.
- It accepts only the exact backend `{text, finalUrl}` response shape and
  converts endpoint, malformed-response, and backend failures to the generic
  `SafeFetchError`.
- Added the three focused tests requested: missing configuration, exact signed
  request contract, and generic backend failure handling.

## Verification

- Focused Deno tests: 24 passed, 0 failed.
- Deno typecheck: passed for `supabase/functions/scrape/index.ts`.
- `git diff --check`: run before commit.

## Concerns

- No live Render egress smoke test was run; production requires matching
  `SCRAPE_EGRESS_URL` and shared-secret configuration on both sides.
- The existing injectable `createSafeFetchApprovedPage` factory remains the
  direct-fetch fixture used by the pre-existing SSRF/streaming tests. The
  production `safeFetchApprovedPage` path no longer calls it or fetches target
  hosts directly.

## Boole follow-up (2026-08-13)

- Added a production-path regression test through `createScrapeHandler` proving
  a disallowed URL returns the generic failure and makes zero signed egress
  calls/fetches.
- Updated `docs/security/scrape-function-runbook.md` with the required
  `SCRAPE_EGRESS_URL` and `SCRAPE_EGRESS_SHARED_SECRET` configuration, the
  matching Render `SCRAPE_EGRESS_ENABLED=true` rollout sequence and route/secret
  contract, and a project-identified, UTC-timestamped Supabase Security Advisor
  plus Performance Advisor release gate.

## Boole follow-up verification

- `npx --yes deno test --allow-env --allow-net supabase/functions/scrape/index_test.ts` — 25 passed, 0 failed.
- `npx --yes deno check --allow-import supabase/functions/scrape/index.ts` — passed.
- `git diff --check` — passed.
- No live Render or Supabase Advisor evidence was generated; the documented
  project-identified, UTC-timestamped advisor gate remains mandatory before
  production release.
