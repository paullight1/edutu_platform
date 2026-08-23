# Admin Shell and Engine Refactor — Normative Design Decisions

This file is a normative companion to `2026-08-23-admin-shell-engine-production-design.md`. Where wording in the main design leaves more than one implementation option, the decisions below control.

## Decision 1 — Production backend origin fails closed

A production admin build must fail when neither `VITE_BACKEND_URL` nor the temporary compatibility alias `VITE_API_URL` is defined.

Resolution order is fixed:

1. `VITE_BACKEND_URL`;
2. temporary `VITE_API_URL` alias with a visible non-secret deprecation warning;
3. Vite `/api` proxy only in development and test.

There is no hardcoded production hostname fallback.

When a configured production URL exists but is malformed, non-HTTPS, unreachable, or points to an API that is live but not ready, the deployed admin renders a blocking configuration or service-unavailable state. It must not attempt another hostname.

## Decision 2 — Compatibility route ownership

`admin/src/pages/Scraper.tsx` remains during the migration as a compatibility export. It is reduced to a thin re-export after `/engine`, `/engine/runs`, and `/engine/status` are owned by focused Engine pages.

The compatibility file may be deleted only after repository search proves there are no remaining imports and route-preservation tests remain green. Its deletion does not permit any public route or redirect to change.

## Decision 3 — Root cause language

The conflicting backend defaults and deployment state form the leading hypothesis, not yet a completed production diagnosis.

Phase 0 must collect live evidence from the exact deployed admin and API boundary before claiming the root cause is confirmed. The implementation must distinguish:

- wrong API origin;
- stale API revision;
- missing API secrets;
- CORS failure;
- admin authorization failure;
- API readiness failure.

Only evidence-backed causes may be reported as resolved.

## Decision 4 — One implementation plan

The approved work is one architectural program with reversible phases:

1. production diagnosis;
2. characterization tests;
3. canonical API configuration;
4. admin shell replacement;
5. Engine decomposition;
6. operational UX and diagnostics;
7. specialist review, CI, and deployment verification.

Deferred RBAC, audit-history, quality-queue, source-health, command-palette, AI-cost, and personalized-dashboard ideas are not part of this implementation plan.

## Spec self-review result

- No `TBD` or `TODO` placeholders remain in the approved design set.
- Route and redirect preservation is explicit.
- Existing workflows are listed as compatibility requirements.
- Production configuration behavior is now deterministic.
- Root-cause certainty is correctly bounded until live evidence exists.
- Scope is focused enough for one phased implementation plan.
