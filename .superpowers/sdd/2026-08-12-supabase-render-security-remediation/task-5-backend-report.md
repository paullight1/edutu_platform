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
