# Task 3 Report — Harden API-key ownership and lifecycle

## Implementation

- Developer project creation now requires a non-empty authenticated database user ID and persists it as `owner_user_id` and ownership metadata.
- Project listing and recent-request reads use `owner_user_id` canonically. The legacy email fallback is read-only, limited to rows whose owner is still null, normalizes email, and emits the `developer_api_key_legacy_email_fallback` migration metric.
- Rotate and revoke use owner-only predicates and no longer accept email as an ownership input. Missing authenticated ownership fails closed before database work.
- Create/rotate responses expose `rawKey` alongside a sanitized project summary; summaries never select, map, or return `apiKeyHash` or raw key material.
- Generated keys are format-bounded before prefix-indexed database lookup. New hashes use HMAC-SHA256 when `API_KEY_PEPPER` is configured. Legacy SHA-256 compatibility requires the explicit temporary `API_KEY_ALLOW_LEGACY_HASHES=true` migration flag.
- Rotation repairs null or malformed legacy `key_prefix` values, persists the generated prefix with the replacement hash, and uses a compare-and-set on the prior hash so concurrent stale rotations cannot return a dead key.
- `EDUTU_API_KEYS=sha256:<hash>` uses the legacy plain-SHA-256 matcher only when `API_KEY_ALLOW_LEGACY_HASHES=true`; peppered production configurations therefore preserve an explicit migration path without silently enabling legacy hashes.
- `/v1` guard failures use stable `missing_api_key`, `invalid_api_key`, and `scope_required` codes with request IDs. The API exception filter redacts raw keys and hashes from messages, structured details, quota payloads, and nested values.
- Clerk-owned `/developer/*` lifecycle methods receive only the canonical authenticated user ID for mutation ownership; `/v1/*` remains separately protected by `EdutuApiKeyGuard` under the existing public/API-key controller boundary.

## Migration

No new migration was required for this task. The existing production contract migration, `backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql`, already defines nullable `owner_user_id` plus the owner index. Keeping legacy rows nullable preserves the read-only migration fallback without granting mutation ownership from email.

## Tests and verification

- TDD red: legacy unpeppered hashes were accepted with only `API_KEY_PEPPER` configured; unauthenticated developer listing/creation did not fail closed; quota error payloads leaked raw/hash fields.
- TDD green: the focused Task 3 suite passes: **5 suites, 41 tests**.
- Regression coverage includes null and malformed legacy-prefix rotation with returned-key hash authentication, peppered `sha256:` environment-key gating, and concurrent compare-and-set rotation with no successful dead key.
- `npm run build` passes.
- `npm run lint` passes.
- Focused ESLint for all changed Task 3 files passes with `--max-warnings 0`.
- `git diff --check` passes.

## Scope

Task 3 files are limited to the developer service/controller and tests, API-key hash helper/tests, Edutu API guard/tests, exception filter/tests, and this report. Existing Task 4/5/7/8/9 and unrelated dirty/staged files were preserved and excluded from the Task 3 commit.

Commit message: `fix: harden API key ownership and lifecycle`
