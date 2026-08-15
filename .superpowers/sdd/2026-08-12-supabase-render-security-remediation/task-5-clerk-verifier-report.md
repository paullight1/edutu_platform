# Task 5 Clerk verifier report

## Status

COMPLETE

## Implemented

- Added a narrow `createClerkAdminVerifier` seam in
  `supabase/functions/scrape/index.ts` for deterministic environment, clock,
  JWKS, and Clerk user-fetch dependencies. Default production behavior remains
  environment-backed and uses the existing network fetches.
- Added real RS256 JWT tests in `clerk-verifier_test.ts`, including issuer,
  `exp`, `nbf`, `azp`, `kid`, RSA signature, Clerk server-role, and primary
  email authorization decisions.
- Covered rejection of wrong issuer, wrong authorized party, expired and
  not-yet-valid tokens, unknown `kid`, invalid signature, non-admin role, and
  non-admin email.
- Did not modify `safe-fetch.ts`, `index_test.ts`, or the runbook.

## Exact verification results

- `npx --yes deno test --allow-env --allow-net supabase/functions/scrape/clerk-verifier_test.ts supabase/functions/scrape/index_test.ts` — **30 passed, 0 failed** (5 verifier tests and 25 existing scrape tests).
- `npx --yes deno check supabase/functions/scrape/index.ts supabase/functions/scrape/clerk-verifier_test.ts` — **exit code 0**.
- `git diff --check` — **exit code 0**.

## Concerns

- The verifier continues to require `CLERK_ISSUER_URL`, `CLERK_SECRET_KEY`,
  and `CLERK_AUTHORIZED_PARTIES`; missing configuration fails closed.
- Unrelated concurrent worktree changes in `backend/services/services/api/src/main.ts`
  and the raw-body middleware files were preserved and excluded from this
  commit.

## Review follow-up

- Replaced the invalid-signature mutation with a guaranteed-different first
  base64url character (`A` ↔ `B`), avoiding an unconditional final-character
  replacement that could theoretically preserve the decoded signature.
- `npx --yes deno test --allow-env --allow-net supabase/functions/scrape/clerk-verifier_test.ts` — **5 passed, 0 failed**.
- `npx --yes deno check supabase/functions/scrape/index.ts supabase/functions/scrape/clerk-verifier_test.ts` — **exit code 0**.
- `git diff --check` — **exit code 0**.
