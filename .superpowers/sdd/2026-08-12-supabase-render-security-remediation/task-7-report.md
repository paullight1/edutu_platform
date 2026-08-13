# Task 7 Clerk environment isolation report

## Status

COMPLETE_WITH_LIVE_VERIFICATION_HOLD

## Scope

- Hardened `edutumobile/supabase/functions/_shared/clerk-auth.ts`.
- Added `edutumobile/supabase/functions/_shared/clerk-auth_test.ts`.
- Audited canonical protected Edge Function entry points.
- Added `docs/security/clerk-environment-isolation.md`.
- Did not modify Task 5 files or weekly-digest files.

## Implementation

- Production requires configured `CLERK_ISSUER_URL` and rejects the known
  development issuer.
- JWKS discovery uses only the configured issuer; the prior multi-issuer and
  `CLERK_JWKS_URL` fallback paths are removed.
- Issuer URL configuration is validated as a single HTTPS origin.
- Issuer, expiry, not-before, subject, algorithm, `kid`, and signature checks
  fail closed.
- Explicit non-production mode preserves the development issuer fallback.
- `chat-proxy`, `delete-account`, and `report-ai-content` already use the
  shared verifier. Svix and RevenueCat webhook handlers use separate webhook
  authentication boundaries and were not changed. Weekly digest was excluded.

## Exact verification

- `npx --yes deno test --allow-env --allow-net edutumobile/supabase/functions/_shared/clerk-auth_test.ts` — **6 passed, 0 failed**.
- `npx --yes deno check edutumobile/supabase/functions/_shared/clerk-auth.ts edutumobile/supabase/functions/_shared/clerk-auth_test.ts edutumobile/supabase/functions/delete-account/index.ts edutumobile/supabase/functions/report-ai-content/index.ts` — **exit code 0**.
- `git diff --check` — **exit code 0**.

## Verification hold / concerns

Live Supabase deployment environment values and the production JWKS response
are not available in this worktree. Production rollout still requires
verification of `NODE_ENV` or `DEPLOYMENT_MODE=production`, the live
`CLERK_ISSUER_URL`, and issuer JWKS reachability. Focused tests use deterministic
in-memory RSA/JWKS dependencies and do not replace that live check.

The broader check including `edutumobile/supabase/functions/chat-proxy/index.ts`
was also run and failed on an unrelated pre-existing Deno 2 type error at
`chat-proxy/index.ts:452` (`Uint8Array<ArrayBufferLike>` passed to `Blob`). That
file was not modified in this task.
