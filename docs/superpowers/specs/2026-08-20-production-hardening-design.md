# Edutu Production Hardening Design

**Date:** 2026-08-20

## Goal

Remove the confirmed P0/P1 production-readiness defects found in the 2026-08-20 deep review without broad product refactors or feature work.

## Scope

This hardening pass covers six independent controls:

1. **n8n webhook authentication must fail closed.** The Supabase Edge Function must reject missing, invalid, inactive, or expired `x-api-key` values before processing a payload with service-role authority.
2. **Profile provisioning must respect database least privilege.** Browser code must never attempt to insert protected profile columns such as `credits`; protected defaults remain database/backend-owned.
3. **Release CI must prove deployability.** Main web/admin production builds must run in CI, high-severity dependency audit findings must fail instead of being masked with `|| true`, and the canonical migration timestamp guard must run.
4. **Migration ownership must be explicit.** `backend/services/services/api/supabase/migrations/` is the only tree for new backend schema changes; existing legacy migrations remain in place, and CI rejects new timestamp collisions.
5. **Mobile tests must never default to production networking.** Jest uses a localhost sentinel API base URL and a network guard so missed mocks cannot contact the live Render API.
6. **Authorization vocabulary must stop drifting.** Staff access and destructive administrative privileges are distinguished explicitly; role-list consistency must never be achieved by widening DB privileges.

## Architecture

The backend remains the primary privileged trust boundary. Direct Supabase client access is permitted only for flows explicitly protected by RLS/column privileges. The Edge Function remains a service-role integration point, but caller authentication is mandatory before any mutation work.

No monorepo conversion, giant-file refactor, billing rewrite, or product redesign belongs in this pass. Those are follow-up architecture projects rather than prerequisites for removing the confirmed launch blockers.

## Failure behavior

- Missing or invalid n8n webhook key: HTTP 401, no payload mutation.
- Browser profile creation: inserts only self-service columns; protected defaults are supplied by DB/backend.
- CI: high-severity audits, migration timestamp collisions, type/test/build failures are blocking.
- Mobile Jest: accidental production API traffic is redirected to a local sentinel and/or rejected by the harness.

## Verification

Each behavioral change is test-first. A draft PR is used so GitHub Actions supplies red/green evidence unavailable in the local sandbox. Final completion requires the PR checks to be inspected after the last implementation commit, plus a diff review against `main`.

## Operational blocker outside code

Historical infrastructure credentials were committed to this public repository. Code cannot prove or perform provider-side rotation through the GitHub connector. The old Supabase service-role key, Postgres password, DeepSeek key, and related secret material must be confirmed rotated in their provider dashboards before production security sign-off.