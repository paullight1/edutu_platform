# Task 5 backend egress report

## Status

DONE_WITH_CONCERNS

## Implemented

- Added a default-disabled `ScraperEgressService` and configuration loader. The
  endpoint only enables when `SCRAPE_EGRESS_ENABLED=true`, a 32-byte secret,
  and an exact non-wildcard host allowlist are configured.
- Added `POST /internal/scraper-egress`. It is marked public only to bypass the
  global Clerk guard; every request still requires the internal timestamped
  HMAC over `<timestamp>.<exact raw body>`. Signature comparison is
  constant-time, timestamps have a bounded age, request parsing is bounded, and
  controller failures use the generic error response.
- Added exact HTTPS host/authority validation, including userinfo and explicit
  port rejection, DNS fail-closed validation for every answer, global-unicast
  address checks covering private/link-local/metadata/reserved/transition,
  NAT64, and embedded IPv4 forms.
- Added address-pinned `https.request` transport with the validated address as
  the lookup result while retaining the hostname for SNI and certificate
  verification. No proxy or service-role key is used.
- Added redirect, timeout, response-byte, and HTML-content bounds, plus the
  default-disabled Render Blueprint and `.env.example` contract.

## Verification

- Focused Jest contracts: 3 suites, 52 tests passed.
- Backend Nest build: passed.
- `git diff --check`: passed.

## Concern / follow-up

The existing Edge function in the base commit uses its own `x-edutu-job-*`
signature format and does not call this Render endpoint. This subtask did not
modify Edge code as instructed. The Edge caller must be wired to the backend
contract (`x-edutu-egress-timestamp` and `x-edutu-egress-signature`) before the
endpoint is enabled in production.

## Classifier and limiter follow-up (2026-08-13)

### Implemented

- Added bounded in-process principal buckets with optional socket-IP defense in
  depth, expired-bucket cleanup, fail-closed capacity handling, and no logging
  or storage of the shared secret or signatures.
- Added `SCRAPE_EGRESS_RATE_LIMIT_PER_MINUTE` with a default of 60 and a maximum
  of 10,000, plus Nest provider wiring for the limiter.
- Added exact principal-bearing HMAC semantics over
  `<timestamp>.<principal>.<exact raw body>` while preserving the legacy
  no-principal form. The controller passes only the socket remote address and
  does not trust forwarded headers.
- Completed the IPv4/IPv6 special-purpose and transition-prefix coverage used
  by the regression cases. No Edge files, request-body parser changes, or Edge
  wiring were made.

### Exact verification results

- `npm test -- --runInBand src/scraper/scraper-egress.service.spec.ts src/scraper/scraper-egress.limiter.spec.ts src/scraper/scraper-egress.config.spec.ts src/scraper/scraper-egress.controller.spec.ts` — **4 suites passed, 70 tests passed, 0 failed**.
- `npm run build` — **exit code 0**.
- `git diff --check` — **exit code 0**.

### Concerns

- The limiter is process-local and therefore does not share quota across
  multiple API instances. A shared store would be required for a deployment
  that needs cluster-wide enforcement.
- The existing Edge function still uses its separate `x-edutu-job-*`
  signature contract; Edge wiring remains intentionally out of scope and must
  be completed before enabling this endpoint in production.
