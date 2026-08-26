# AI Governance & Scraper/Ingestion 5/5 Implementation Plan

**Goal:** make AI usage governable and opportunity ingestion safe, reproducible, observable and resistant to hostile sources.

**Primary files:** backend `ai/`, provider routing/prompts/usage logs, `analytics/`; backend `scraper/`, Supabase scraper migrations/functions, admin Engine UI.

## Feature 17 — AI Governance

### 5/5 acceptance criteria

- Every production AI call identifies feature, route, provider, model, prompt version, latency, token/cost estimate and outcome class.
- Prompts/model routes are versioned, evaluated and rollbackable.
- PII/secret handling is explicit and tested.
- Provider failure/cost limits degrade safely.
- Product analytics are real; no-op telemetry cannot report synthetic success.

### Tasks

- [ ] **F17-T1 — Replace no-op telemetry.** Remove analytics methods that return `{success: true}` without persistence; route events through one durable analytics pipeline or return an explicit unavailable result.
- [ ] **F17-T2 — Prompt registry.** Immutable prompt versions with owner, feature, input schema, output schema, model route and release state.
- [ ] **F17-T3 — Evaluation gates.** Golden datasets per AI feature with quality/safety regression thresholds required before prompt/model promotion.
- [ ] **F17-T4 — Usage ledger.** Record provider/model/tokens/cost/latency/cache/fallback/error code and user/project attribution under privacy rules.
- [ ] **F17-T5 — PII controls.** Feature-level data classification, provider allowlist, redaction/minimization and no sensitive prompt bodies in logs.
- [ ] **F17-T6 — Routing/fallback.** Bounded timeout, retry and fallback policy; circuit breaker on provider incidents; budget caps per feature/account.
- [ ] **F17-T7 — Admin UX.** Preview/test route, compare candidate prompt/model against evaluation set, staged activation and one-click rollback.

### Required tests

Prompt schema, route authorization, key encryption, provider failure/circuit breaker, cost budget, redaction and golden evaluation regression tests.

## Feature 18 — Scraper / Ingestion

### 5/5 acceptance criteria

- All scraper operations are admin/server authorized.
- Outbound targets are validated against SSRF/private-network abuse.
- Long-running runs survive process restarts or have explicit durable job ownership/recovery.
- Source changes and publication decisions are audited.
- Low-confidence/duplicate/stale opportunities are quarantined before learner publication.

### Tasks

- [ ] **F18-T1 — Eliminate legacy exposure.** Verify live scraper table policies and remove unsafe duplicate policies/functions; disable/remove unauthenticated arbitrary-URL scrape Edge Function if deployed.
- [ ] **F18-T2 — SSRF defense.** HTTPS-only allowlist or approved-domain policy; DNS resolve and reject loopback/link-local/private/metadata/reserved addresses; redirect revalidation; timeout and byte limits.
- [ ] **F18-T3 — Durable jobs.** Move run ownership to a persistent job/lease model with heartbeat, retry, resume/recover and idempotent source/page checkpoints.
- [ ] **F18-T4 — Source governance.** Admin audit for source URL/category/tier/enabled changes; source health, robots/terms posture where relevant, last-success/failure and freshness SLA.
- [ ] **F18-T5 — Ingestion quality.** Canonical URL dedupe, similarity dedupe, deadline parsing confidence, required-field completeness and quarantine queue for uncertain results.
- [ ] **F18-T6 — Publication boundary.** Only reviewed/validated `active` opportunities reach learner/public API; add publication E2E and rollback/unpublish action.
- [ ] **F18-T7 — Observability.** Run duration, pages/items, enrichment failure, source failure, queue age, duplicate rate, publish rate, stale source and cost metrics.
- [ ] **F18-T8 — Admin UX.** Safe pause/resume/stop semantics, clear job state, failure reason, retry specific source, preview before publish and bulk action confirmation.

### Required tests

SSRF address matrix, redirect bypass, response-size timeout, admin guard, durable lease recovery, dedupe, malformed deadlines, publication E2E and source-change audit.

## Exit evidence

5/5 requires verification against the actual production Supabase policies/functions, not only code review of the canonical migration tree.
