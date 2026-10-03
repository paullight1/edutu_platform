# Web paid tools implementation plan

> **For agentic workers:** Use Superpowers execution. User authorized implementation on 2026-10-02. A later instruction in this thread explicitly added CV access parity and supersedes the initial CV exclusion.

**Goal:** Complete mobile-derived web preparation features and payment access, including the later-authorized CV access parity work.
**Architecture:** Extend the existing React workspace and NestJS services. Browser paid-tool gates present canonical account access; backend remains authoritative for metering and ownership. Complete the existing hosted payment protocol rather than remove its release hold prematurely.
**Tech Stack:** React, TypeScript, Vite, NestJS, Clerk, PostgreSQL, existing Bachs shell.
**Spec:** docs/superpowers/specs/2026-10-02-web-premium-mobile-parity-design.md, as amended by the user's implementation instructions.

## Global constraints

- The initial CV exclusion was superseded by the user's later instruction to proceed with CV implementation.
- Preserve all pre-existing uncommitted work. No bulk commits, clean, reset, migrations, deployment, live payment, or new prices.
- Continue current branch and checkout; its unfinished features are required dependencies.
- Paid tools unlock through canonical paid entitlements. Wallet and ordinary opportunity discovery stay accessible.
- Existing mobile credit-funded routes and tier quotas remain compatible; no unlimited claims.
- All business operations use the backend with ownership checks. No automatic retries of chargeable AI mutations.

## Review focus

- Account switches cannot retain another account's access, drafts, or AI response.
- Unknown/failed billing must not unlock paid content or label an outage as a free user.
- Daily quota exhaustion cannot be resolved by a top-up claim.
- Checkout handoff cannot be replayed or expose another owner's intent.
- Opportunity navigation cancels obsolete actions; opening a page does not start AI work.

### Task 1: Shared web paid-tool gates and preparation UX

Files: new features/feature-access/PaidToolGate.tsx and tests/CSS; App.tsx; non-CV coach/Copilot/goals/saved-searches/documents surfaces; upgrade copy.
Interfaces: `PaidToolGate({feature: string, children: ReactNode})`; reads existing usePaywall. Gates mounted pages before their requests. Core CV editing is not subscription-gated; the later CV extension applies admin module locks and action-level paid checks.
- [ ] Write and run tests for blocked child mounting, pending/unknown access, paid access, and upgrade CTA.
- [ ] Implement accessible plan preview, feature-specific explanation, loading/retry and wallet links.
- [ ] Integrate paid gates for advanced tools and accurate web benefits. Preserve route and navigation semantics.
- [ ] Run focused tests, typecheck; self-review changed files.

### Task 2: Opportunity AI actions and roadmap preparation

Files: new features/opportunity-assist/OpportunityAssist.tsx, model/API helpers, styles, tests; OpportunityDetail.tsx; AI coach stream input if necessary.
Interfaces: `OpportunityAssist({opportunity: {id:string,title:string}})`; existing Coach stream with `context:{surface:'opportunity_detail',opportunityId}` and intent; existing roadmap endpoint/contracts; existing shared gate.
- [ ] Write and run tests: unpaid actions don't call AI, paid fit sends opportunity context, cancellation and failed requests preserve explicit retry, roadmap is returned through canonical service.
- [ ] Add fit check, next move, and roadmap with readable result panel and direct Copilot/Coach navigation. Owned documents may be attached through existing upload list only. No CV-editor changes.
- [ ] Integrate in public and embedded detail after canonical detail content, retaining official apply controls.
- [ ] Run focused tests/typecheck and inspect phone/desktop UI if a preview is available.

### Task 3: Hosted payment protocol and consumer completion

Files: backend billing services/controllers/module/repository, additive migration if storage required; pay-edutu-org auth/result/account adapters and tests; wallet as required.
Interfaces: existing pay-shell exchange/account/intent-status requests, Bachs server catalog and idempotent checkout; canonical fulfillment.
- [ ] Write and run failing tests for single-use expiring handoff, opaque session, wrong owner, unknown product, idempotent retry, and pending versus fulfilled status.
- [ ] Implement persistent hashed code/session storage and owned authenticated shell contracts. Wire consumer checkout and enablement to actual provider/protocol configuration.
- [ ] Preserve hosted origin checks, return destinations, authenticated identity, and mobile/provider semantics. Never claim redirect equals fulfillment.
- [ ] Run backend billing suites/build and payment-shell tests. Do not execute live transactions or migrations.

### Task 4: Integration, verification, and review

- [ ] Verify paid gates, opportunity actions, billing return, current backend contracts, and the user-authorized CV access policy.
- [ ] Run focused suites, web typecheck/production build and backend build; report unrelated failures from broader tests.
- [ ] Fresh review of this task's actual changed files, fix material issues, and record test evidence.
- [ ] Document deployment/migration/provider prerequisites and actual implemented behavior.

## Execution update

User initially authorized implementation and excluded CV; a later explicit instruction superseded that exclusion. Higher-priority developer instructions prohibit creating/running tests without an explicit request, so test checklist items above are superseded by source review and compiler/build diagnostics. No additional testing is claimed. Backend implementer initially ran 12 protocol tests from the original assignment before this restriction was applied; later implementation changes are not covered by that run.

Implemented: shared web paid-tool gates, backend guarded web preparation routes retaining mobile metering, free archived opportunity search, catalogue-driven upgrade UI, per-opportunity fit/next-move/gap/document-review actions, cancellable streaming and roadmap generation, owned uploads, Coach continuation, preparation-plan persistence and list in Goals, wallet payment recovery without persistent handoff secrets. Hosted payment completion work and independent review documented in the SDD ledger/reports.

## CV access parity extension (user instruction, 2026-10-02)

- [x] Keep the core CV builder, existing CV editing, export, LinkedIn import and metered generic draft action available without a blanket subscription gate.
- [x] Show all six template designs with previews; mark the two mobile Pro designs and open contextual upgrade while preserving the current CV and draft.
- [x] Require an active paid plan for web CV tailoring and opportunity cover letters. Do not create a web-only trial grant.
- [x] Add the configured `cv` admin module lock to the web route and backend guard. Enforce premium template selection in the CV editor service while allowing edits that keep the user's current design.
- [x] Verification: web TypeScript check, production Vite build, backend Nest build, and authenticated-route presence by local HTTP response. No tests were added or run under the developer instruction.
