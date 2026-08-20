# Edutu 5/5 Execution Order

## Principle

Do not optimize feature polish on top of an unverifiable release platform. Work in dependency order, and keep each task independently reviewable and testable.

## Wave 0 — Production Foundation (must complete first)

1. Fix Vercel `experimentalServices` → supported `services` configuration and verify preview deployments.
2. Establish the canonical Supabase migration stream and block legacy/duplicate migration deployment.
3. Verify live production RLS/table/function ACLs; revoke dangerous legacy credit/admin/scraper capabilities.
4. Remove non-blocking dependency-audit bypasses and make High/Critical findings release-blocking unless explicitly time-bounded and accepted.
5. Add required web/admin production build gates and backend production-E2E gate.
6. Replace no-op analytics success responses with real telemetry or explicit unavailable responses.
7. Establish request IDs, production dashboards, alert ownership and rollback runbooks.

**Wave 0 exit:** all global gates G0–G3 and minimum G6 observability are green.

## Wave 1 — Core Learner Loop

Execute in this order:

1. Opportunity Discovery & Matching.
2. Application Management.
3. Personalization & Profile.
4. Settings / Privacy / Security.
5. Notifications.
6. Roadmaps & Structured Learning.
7. Authentication cross-feature authorization sweep.
8. PWA cache/account-switch hardening.

**Wave 1 success journey:** sign up → personalize → discover verified opportunity → understand fit → save → create application → receive deadline reminder → update application → resume across device/session.

## Wave 2 — Trust, Community & Human Guidance

1. Replace unverifiable community metrics/testimonials.
2. Productize communities/groups and moderation.
3. Run real-world voice network/load/failure validation.
4. Secure Mentor Application uploads and review flow.
5. Build Mentor Studio authoring/publishing/analytics.
6. Complete Events lifecycle and public content anti-abuse/trust work.

**Wave 2 success journey:** learner joins a relevant community → receives safe mentor/community interaction → mentor applies, is reviewed, publishes a validated roadmap/resource → learner adopts it and progresses.

## Wave 3 — Monetization & Platform Product

1. Canonical billing/credit ledger and production ACL proof.
2. Billing reconciliation, refunds/reversals and user transaction UX.
3. Productize Creator Marketplace and Wallet.
4. Finish Developer Platform usage/key/quota UX.
5. Freeze Partner API v1 contracts and docs verification.

**Wave 3 success journey:** developer or learner pays → authoritative provider confirmation → entitlement/credits created exactly once → usage consumes correctly → refund/reconciliation behaves safely.

## Wave 4 — AI & Operations

1. AI prompt/model/version governance and evaluation gates.
2. Restore/productize CV and contextual AI assistance.
3. Harden scraper outbound security and durable jobs.
4. Version/stage/rollback Mobile Control configuration.
5. Replace admin authorization assumptions with canonical server-owned RBAC.
6. Expand admin browser E2E across all operational workflows.

## Wave 5 — Production Certification

For every feature:

1. Fill `13_VERIFICATION_EVIDENCE_TEMPLATE.md`.
2. Run unit/integration/E2E/security/performance/accessibility tests fresh.
3. Validate production-like deployment and migration state.
4. Execute rollback test for high-risk features.
5. Run a limited/canary rollout when applicable.
6. Review production telemetry after rollout.
7. Mark 5/5 only when no P0/P1 finding remains and every required evidence field is present.

## Recommended Review Loop

For each feature task:

1. Write failing test or explicit verification probe.
2. Implement the minimum production-safe change.
3. Run focused tests.
4. Run relevant package lint/typecheck/build gates.
5. Security/UX review the diff.
6. Fix P0/P1 findings before moving on.
7. Commit one coherent task.
8. Update the feature evidence section.

## Scope Discipline

Do not add unrelated features during the 5/5 program. Improvements are accepted when they close a documented completeness, security, reliability, maintainability, efficiency, accessibility, observability or deployment gap in these plans.
