# Billing, Monetization & Developer Platform 5/5 Implementation Plan

**Goal:** make money/credits and API-product operations auditable, abuse-resistant and trustworthy enough for external customers.

**Primary files:** backend `billing/`, `monetization/`, `developer/`, `edutu-api/`; `UpgradePage.tsx`, `DeveloperDashboardPage.tsx`, billing/developer services, admin monetization pages.

## Feature 13 — Pro / Billing / Monetization

### 5/5 acceptance criteria

- Entitlements are granted only from authoritative provider confirmation.
- Every financial/credit mutation is idempotent, ledger-backed and reconciled.
- Refund, reversal, dispute, expiry and failed-payment states are represented explicitly.
- Production function/table ACLs are verified, including retirement of legacy arbitrary-user credit RPCs.
- Users can view plan/credit status, receipts/history and recovery actions.

### Tasks

- [ ] **F13-T1 — Production DB security proof.** Query live ACLs for credit functions/tables; revoke `PUBLIC`, `anon`, and unintended `authenticated` access; retire duplicate legacy credit implementations.
- [ ] **F13-T2 — Ledger authority.** Define one immutable billing/credit ledger contract; all balances and entitlements reconcile against it.
- [ ] **F13-T3 — Checkout state machine.** Model intent-created → provider-pending → confirmed → fulfilled → refunded/reversed/failed/expired; never infer payment success from browser return URL alone.
- [ ] **F13-T4 — Webhook security.** Verify signatures, replay/idempotency keys, raw-body requirements, attempt ownership and provider event uniqueness.
- [ ] **F13-T5 — Reconciliation.** Schedule provider-vs-ledger reconciliation with safe retry, alert on mismatch and provide admin repair workflow with audit trail.
- [ ] **F13-T6 — User UX.** Add clear plan/credits, transaction history, receipt/reference, pending/failed states, restore/retry and support escalation.
- [ ] **F13-T7 — Fraud/abuse.** Add velocity thresholds, suspicious repeated checkout detection and per-account/device/IP monitoring without blocking legitimate retry behavior.

### Required tests

Credit idempotency, webhook replay, concurrent fulfillment, refund/reversal, reconciliation mismatch, entitlement recovery, horizontal authorization and production E2E.

## Feature 14 — Developer Platform

### 5/5 acceptance criteria

- Developers can create, rotate, revoke and monitor test/live projects safely.
- Keys are shown once, strongly hashed/peppered server-side and scoped.
- Quotas/rate limits/credits are accurate and observable.
- Documentation matches the deployed API contract.
- Sandbox/live environments are unambiguous.

### Tasks

- [ ] **F14-T1 — Environment separation.** Explicit test/live keys, endpoints, quotas and billing behavior; prevent test keys from reaching live-billed operations.
- [ ] **F14-T2 — Key lifecycle.** Show secret once, store strong hash+pepper, record last-used timestamp/IP class, rotation lineage and revocation audit event.
- [ ] **F14-T3 — Usage dashboard.** Endpoint/scoped request counts, latency, errors, remaining quota/credits and daily trend; surface delayed telemetry honestly.
- [ ] **F14-T4 — Quota alerts.** Configurable 50/80/95/100% alerts and exhaustion behavior with stable error codes/headers.
- [ ] **F14-T5 — Docs contract.** Generate or validate OpenAPI examples against route DTOs; CI fails on docs/schema drift.
- [ ] **F14-T6 — DX.** Copy-ready curl/JS/Python examples, sandbox quickstart, common error guide, idempotency guidance and request-ID support.
- [ ] **F14-T7 — Operational controls.** Abuse detection, per-project disable/lock, emergency API kill switch and incident/status communication path.

### Required tests

Key one-time reveal, rotation/revocation, scope denial, quota boundary, rate limit, credit exhaustion, docs contract, developer browser production flow.

## Exit evidence

Billing cannot reach 5/5 until live database ACLs and provider reconciliation are proven. Developer Platform cannot reach 5/5 until docs and deployed behavior are contract-tested.
