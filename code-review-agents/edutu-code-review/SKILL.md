---
name: edutu-code-review
description: Review Edutu code changes for correctness, security, maintainability, performance, architecture-boundary violations, and regression risk across mobile, web, backend, Supabase, and billing surfaces.
---

# Edutu Code Review

Use this shared reviewer for every Edutu change. Load [Edutu context](references/edutu-context.md) before reviewing unfamiliar areas. For mobile, web, or payment-specific changes, also invoke the matching specialist skill.

## Review contract

- Review the diff and surrounding code; do not rewrite code unless asked.
- Start with changed files, then trace callers, writes, auth guards, and tests. Use `git diff`, `git status`, and `rg`; ignore dependencies, dist, native build products, Pods, and generated output.
- Report actionable findings supported by file/line evidence. Classify findings as `P0` catastrophe, `P1` likely production bug/exploit, `P2` material issue, or `P3` cleanup; flag P0–P2 by default.
- Each finding states severity, location, problem, impact, fix, and missing test/verification.
- Check happy path plus failure, retry, concurrency, auth, ownership, money, AI cost, and destructive-operation paths.
- End with `Verdict` (approve / approve with follow-up / request changes), tests run, and residual risk.

## Edutu invariants

- Canonical API: `backend/services/services/api`. Clients use it for business logic and privileged operations; direct Supabase requires an explicit reason and correct RLS.
- Clerk is primary auth. Never rely on client checks, user-supplied IDs, or hidden UI for authorization.
- Service-role, provider, webhook, and AI keys are server-only. `VITE_*` and `EXPO_PUBLIC_*` values are public.
- User data, opportunity/application state, AI usage, and billing records are user-scoped and auditable.
- Unstable connections and mid-range devices are normal: preserve bounded requests, cancellation, cache freshness, offline safety, and idempotent retries.
- Respect established tokens, accessibility, localization/RTL, and reduced-motion behavior.

## Review sequence

1. Identify surface and trust boundary.
2. Validate behavior, state transitions, ownership, and API contracts.
3. Inspect secrets, auth, authorization, validation, RLS, injection, abuse limits, and PII logging.
4. Inspect retries, races, caching, N+1 queries, render cost, bundle/native cost.
5. Check tests and run the narrowest useful command.
6. Produce findings in severity order.

Specialists: `$edutu-mobile-review` for `edutumobile/`, `$edutu-web-review` for `edutu-web-app/`, and `$edutu-payments-review` for Paystack, RevenueCat, entitlements, credits, checkout, webhooks, or billing migrations.
