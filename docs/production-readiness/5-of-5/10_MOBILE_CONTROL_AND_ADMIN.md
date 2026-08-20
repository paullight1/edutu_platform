# Mobile Control Plane & Admin Platform 5/5 Implementation Plan

**Goal:** make operational control safe enough that an admin mistake, stale role or bad configuration cannot silently damage production.

**Primary files:** backend `mobile-control/`, admin `MobileControl.tsx`, `App.tsx`, admin auth/access libraries, admin pages/services, backend `admin/` and all privileged controllers.

## Feature 19 — Mobile Control Plane

### 5/5 acceptance criteria

- Config/flags/campaigns/widgets are versioned, previewable and rollbackable.
- Production and non-production environments are isolated.
- High-risk changes support staged rollout and emergency disable.
- Every admin change has actor, before/after value, reason and timestamp.
- Mobile/web clients tolerate unknown/old config versions safely.

### Tasks

- [ ] **F19-T1 — Versioned config schema.** Add config version, minimum client version and safe defaults; reject invalid payloads server-side.
- [ ] **F19-T2 — Environment separation.** Dev/staging/prod namespaces or projects; prevent accidental production edits from non-prod admin sessions.
- [ ] **F19-T3 — Draft/preview/publish.** Admin edits create drafts; preview target-client rendering/JSON; publish requires validated diff.
- [ ] **F19-T4 — Rollout controls.** Percentage/cohort/country/app-version targeting with deterministic assignment and kill switch.
- [ ] **F19-T5 — Rollback.** Keep immutable revisions and one-click revert; clients cache last-known-good config with bounded TTL.
- [ ] **F19-T6 — Audit/observability.** Change log, campaign impression/action events, flag exposure events, invalid-config metrics and config-fetch latency/errors.
- [ ] **F19-T7 — Client contract tests.** Fixture old/new client versions against current control-plane responses.

### Required tests

Schema validation, environment authorization, deterministic rollout, rollback, old-client fallback, audit log and emergency kill switch E2E.

## Feature 20 — Admin Platform

### 5/5 acceptance criteria

- Client routing is never the security boundary; every privileged API action re-authorizes server-side.
- Admin roles are server-owned, least-privilege and auditable.
- High-risk actions require stronger confirmation and optional step-up authentication.
- Major admin workflows have browser E2E coverage.
- Large pages/services are decomposed enough for safe review and ownership.

### Tasks

- [ ] **F20-T1 — Canonical RBAC.** Define roles such as support, content, opportunity-reviewer, creator-reviewer, finance, operations, super-admin with explicit permissions; remove reliance on mutable user preference fields.
- [ ] **F20-T2 — Step-up security.** Require MFA/passkey and recent authentication for finance, role management, API keys, destructive bulk deletes and production control-plane changes.
- [ ] **F20-T3 — Server authorization sweep.** Enumerate every admin endpoint and add permission guard tests for allowed/denied roles.
- [ ] **F20-T4 — Audit trail.** Immutable privileged-action events with actor, permission, target, before/after summary, request ID and reason for sensitive actions.
- [ ] **F20-T5 — Safer destructive UX.** Typed confirmation for irreversible bulk operations, preview count/impact, idempotent execution and downloadable result report.
- [ ] **F20-T6 — Modularization.** Split oversized domain pages by feature responsibility while preserving routes; centralize API/auth/error/state primitives.
- [ ] **F20-T7 — Admin test suite.** Expand beyond harness smoke to Playwright journeys for opportunity review, creator approval, content publish, scraper run, mobile flag rollback, notification broadcast and monetization inspection.
- [ ] **F20-T8 — Production access controls.** Session timeout, device/session revocation, restricted admin origins, CSP and alerting on repeated denied/privilege-escalation attempts.

### Required tests

RBAC matrix integration, role-escalation denial, step-up auth, audit event integrity, destructive-action idempotency and all listed browser journeys.

## Exit evidence

5/5 requires backend-enforced RBAC and real admin workflow tests; a guarded React route alone is never sufficient authorization.
