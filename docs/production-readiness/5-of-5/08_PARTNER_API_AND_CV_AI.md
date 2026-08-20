# Partner API & CV/AI Assistance 5/5 Implementation Plan

**Goal:** harden the external API as a reliable product and restore CV/AI as a coherent, evaluated learner experience instead of backend-only capability.

**Primary files:** backend `edutu-api/`, developer docs/OpenAPI; backend `cv/`, `ai/`, `copilot/`, `chat/`, web CV/AI services and routes.

## Feature 15 — Partner API

### 5/5 acceptance criteria

- API versioning and deprecation policy are explicit.
- Authentication, scopes, billing, rate limits and idempotency have stable machine-readable errors.
- Contract tests prove docs/examples match production behavior.
- Customer-level usage/error/SLA signals are observable.
- Breaking changes require a version transition, not silent response-shape drift.

### Tasks

- [ ] **F15-T1 — Version policy.** Freeze `/v1` contract, define additive vs breaking change rules, deprecation headers and sunset communication.
- [ ] **F15-T2 — Schema contracts.** Generate/test OpenAPI from actual DTOs/controllers or enforce bidirectional contract tests against the maintained spec.
- [ ] **F15-T3 — Error envelope.** Standardize code, message, requestId, retryable flag and optional details; keep auth/scope/quota/billing distinctions stable.
- [ ] **F15-T4 — Idempotency durability.** Persist idempotency records for write/event endpoints with request fingerprint, result and expiry; reject conflicting key reuse.
- [ ] **F15-T5 — Abuse/SLA.** Per-project rate/credit limits, anomaly detection, p95/p99 latency/error dashboards and alerting.
- [ ] **F15-T6 — Change safety.** Consumer contract tests and canary deployment for API changes; publish changelog and migration notes.
- [ ] **F15-T7 — Supportability.** Every response returns request ID; developer dashboard can search recent failed request IDs without exposing sensitive payloads.

### Required tests

API-key guard, scopes, billing policy, idempotency conflict/replay, version headers, OpenAPI examples, quota/rate-limit edge cases, load tests.

## Feature 16 — CV & AI Assistance

### 5/5 acceptance criteria

- `/cv` and contextual AI are real supported experiences or removed from all product claims until launch-ready.
- CV versions are durable, exportable and deletable.
- AI edits are user-controlled and never silently overwrite source content.
- Opportunity tailoring cites which opportunity requirements drove changes.
- Quality, cost, latency and safety are evaluated continuously.

### Tasks

- [ ] **F16-T1 — Restore product routes.** Build a protected CV workspace instead of redirecting `/cv`; expose AI context actions from opportunity/application screens rather than relying on a standalone generic chat destination.
- [ ] **F16-T2 — CV document model.** Versioned CVs with sections, revision timestamps, source/import provenance and explicit active version.
- [ ] **F16-T3 — Import/export.** Safe DOCX/PDF ingest with size/type limits and parsing isolation; deterministic PDF/DOCX export tests.
- [ ] **F16-T4 — AI diff UX.** Show proposed edits as accept/reject diffs; preserve original; explain why each change helps against a selected opportunity.
- [ ] **F16-T5 — Evaluation.** Golden CV/opportunity set scoring factuality, requirement coverage, hallucination, formatting preservation, bias and harmful fabrication.
- [ ] **F16-T6 — Privacy.** Redact logs, define provider data handling, deletion/export coverage, short-lived upload processing and no training claims unless contractually true.
- [ ] **F16-T7 — Resilience/cost.** Timeout, retry, provider fallback and per-user usage budgets; graceful unavailable state without mock success responses.
- [ ] **F16-T8 — Contextual AI.** `Check eligibility`, `Tailor CV`, `Improve bullet`, `Build application plan`, and `Plan my week` actions use shared server-side tools and audit events.

### Required tests

CV CRUD/versioning, import parser limits, export snapshots, AI golden evaluations, diff accept/reject, provider failure fallback, privacy/log redaction, browser opportunity→tailor→export journey.

## Exit evidence

CV/AI is not 5/5 while legacy routes redirect to dashboard. It must be fully productized and evaluated or explicitly excluded from the release scope.
