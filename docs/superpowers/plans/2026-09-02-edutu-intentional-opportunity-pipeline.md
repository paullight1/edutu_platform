# Edutu Intentional Opportunity Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> and implement the programme PR by PR with test-first changes.

**Goal:** Move Edutu from opportunity listing toward a simple intentional
journey: current focus → bounded shortlist → pursue → one next action → explicit
application confirmation → outcome.

**Product contract:** `docs/product/opportunity-pipeline-contract.md`

**Test matrix:** `docs/product/opportunity-pipeline-test-matrix.md`

## Global constraints

- Preserve the existing Edutu visual identity and component systems.
- Keep all rollout flags off by default.
- Put privileged lifecycle rules in the NestJS API.
- Keep existing routes and legacy records during rollout.
- Treat application opening and application confirmation as distinct facts.
- Use deterministic preparation templates before optional AI assistance.
- Make every retryable write idempotent and every state write versioned.
- Roll back through feature flags, not destructive migrations.

## Delivery sequence

1. **PR 1 — Contract and rollout controls**
   - Product contract, source ownership, test matrix
   - Default-off web/mobile flags
   - Public web-config projection and fail-closed web hook
   - Existing-style admin controls and rollback runbook
2. **PR 2 — State machine and additive schema**
   - Intent, journey, task, and immutable event tables
   - Pure state/public-stage mapping
3. **PR 3 — Intent, eligibility, and preparation**
   - Non-blocking intent inference
   - Decision support and deterministic task templates
4. **PR 4 — Journey API and focused home response**
   - Active-pursuit limits, idempotency, version checks
   - Bounded shortlist and one aggregate home endpoint
5. **PR 5 — Compatibility and migration**
   - Legacy bookmark/application reconciliation
   - Dry-run backfill and parity audit
6. **PR 6–7 — Web integration**
   - Conservative card extension, focused home, My Path, truthful detail CTA
7. **PR 8–9 — Mobile integration**
   - API-only core, cached reads, queued writes, focused home, My Path, detail CTA
8. **PR 10 — Notifications and analytics**
   - One-next-action reminders and intentional funnel reporting
9. **PR 11 — Canary and navigation consolidation**
   - Internal → 5% → 25% → 50% → 100% rollout
10. **PR 12 — Retire direct lifecycle fallbacks**
    - Only after a documented 30-day stability gate

## PR 1 acceptance

- Four identical flag keys exist for web and mobile.
- Every flag is false when omitted, malformed, or unavailable.
- Web and mobile values can be changed independently.
- Public web config exposes no unsupported settings.
- The web hook begins disabled and only enables on explicit true.
- Admin controls reuse the current Settings visual patterns.
- No learner-facing home, My Path, navigation, or opportunity UI changes.
- Contract, test matrix, ownership, activation, and rollback are documented.
