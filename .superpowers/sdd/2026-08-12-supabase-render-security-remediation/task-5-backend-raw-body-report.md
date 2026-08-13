# Task 5 backend raw-body report

## Status

DONE_WITH_CONCERNS

## Implemented

- Added a route-specific `express.raw` parser for
  `/internal/scraper-egress` with a hard 16 KiB limit.
- Mounted it before Nest's global 1MB JSON and URL-encoded parsers, so both
  declared `Content-Length` and chunked requests are bounded before global
  parsing can buffer them.
- Preserved the exact bytes in `request.rawBody` through the parser verify
  hook, keeping the existing egress HMAC contract intact.
- Left billing webhook routes on the existing global `rawBody:true` parser and
  added a regression test proving their raw bytes and parsed body remain
  available.

## Verification

- Focused middleware, egress controller, and egress service tests: 3 suites,
  64 tests passed.
- `npm run build`: passed.
- `git diff --check`: run before commit.

## Concerns

- The middleware enforces the 16 KiB pre-parser ceiling; the egress service's
  configured `SCRAPE_EGRESS_MAX_REQUEST_BYTES` remains the authoritative
  lower-level limit and may be lower than that ceiling.
- No live HTTP deployment smoke test was run.
- Unrelated concurrent Supabase Edge changes were present in the shared
  worktree and were intentionally excluded from this backend commit.
