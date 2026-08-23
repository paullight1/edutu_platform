# Edutu Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed P0/P1 production-readiness defects from the 2026-08-20 audit while preserving existing product behavior.

**Architecture:** Keep NestJS as the privileged application boundary, keep RLS for approved direct-Supabase flows, and fail closed at every privileged integration boundary. Use the existing GitHub Actions workflow as the executable release contract and add only targeted guards rather than broad monorepo restructuring.

**Tech Stack:** TypeScript, React/Vite/Vitest, NestJS/Jest, Expo/Jest, Deno Supabase Edge Functions, GitHub Actions, PostgreSQL/Supabase.

**Spec:** `docs/superpowers/specs/2026-08-20-production-hardening-design.md`

## Global Constraints

- Do not write directly to `main`; use `fix/production-hardening-p0-p1`.
- Every behavior change is test-first and must show red then green in the draft PR checks.
- Do not broaden this pass into UI redesign, billing rewrite, monorepo conversion, or giant-file refactors.
- Preserve current public API shapes unless the existing behavior is insecure.
- Provider-side secret rotation is an operational blocker and cannot be claimed complete from code changes alone.

---

### Task 1: Fail-closed n8n webhook authentication

**Files:**
- Create: `backend/services/services/api/supabase/functions/n8n-webhook/auth.ts`
- Create: `backend/services/services/api/supabase/functions/n8n-webhook/auth.test.ts`
- Modify: `backend/services/services/api/supabase/functions/n8n-webhook/index.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `requireWebhookApiKey(value: string | null): string | null`
- `index.ts` returns HTTP 401 before payload parsing when this returns null.

- [ ] Add a failing Deno test covering missing, blank, and trimmed key behavior plus a dedicated CI job.
- [ ] Verify the draft PR goes red for the missing helper.
- [ ] Implement the helper and fail closed before payload processing/mutation.
- [ ] Verify the Deno test and existing CI return green.

### Task 2: Make browser profile provisioning honor DB privileges

**Files:**
- Modify: `edutu-web-app/src/lib/auth.ts`
- Modify: `edutu-web-app/src/test/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `buildSelfServiceProfileInsert(profile: Profile): Partial<Profile>`
- The initial browser upsert must never contain protected account-state fields.

- [ ] Add failing unit coverage proving protected fields are stripped and `user_id` is retained.
- [ ] Verify RED in web tests.
- [ ] Build the initial upsert from the self-service allowlist and rely on DB default `credits = 0`.
- [ ] Verify web tests/typecheck/lint/build.

### Task 3: Turn CI into a release gate

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/check-migration-timestamps.mjs`
- Create/modify: `docs/MIGRATIONS.md`

**Interfaces:**
- Canonical migrations: `backend/services/services/api/supabase/migrations/`
- Timestamp guard fails for new duplicate 14-digit prefixes while grandfathering the five already-applied collisions.

- [ ] Add migration discipline guard and documentation.
- [ ] Add web/admin production builds to CI.
- [ ] Remove `|| true` from high-severity dependency audits and include the web app.
- [ ] Run the migration guard in CI.
- [ ] If audits expose a high-severity advisory, remediate the affected dependency/lockfile rather than masking the result.

### Task 4: Prevent mobile tests from reaching production

**Files:**
- Modify: `edutumobile/jest.setup.ts`
- Add a focused Jest regression test only if needed to prove the harness behavior.

- [ ] Default `EXPO_PUBLIC_API_URL` to a localhost sentinel before app modules load.
- [ ] Reject unexpected non-local absolute HTTP(S) fetches unless a test intentionally replaces `global.fetch`.
- [ ] Run the complete mobile test suite; fix missed mocks instead of weakening the guard.

### Task 5: Reduce authorization drift without widening privilege

**Files:**
- Inspect/modify only the smallest backend/admin role-policy files proven necessary by tests.

- [ ] Add regression coverage around destructive admin/role operations.
- [ ] Distinguish staff/read access from destructive `admin`/`super_admin` privileges.
- [ ] Do not grant moderator/support new destructive DB rights merely to make role lists match.
- [ ] Verify backend/admin tests/typecheck/lint/build.

### Task 6: Final verification and PR handoff

- [ ] Compare the full branch against `main` and remove unrelated changes.
- [ ] Inspect every PR check at the final head SHA.
- [ ] Keep the provider-side credential rotation blocker explicit until externally confirmed.
