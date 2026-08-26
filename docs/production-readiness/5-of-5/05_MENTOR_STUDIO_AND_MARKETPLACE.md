# Mentor Studio & Creator Marketplace 5/5 Implementation Plan

**Goal:** turn creator/mentor backend foundations into complete, trustworthy two-sided product experiences.

**Primary files:** `MentorDashboardPage.tsx`, creator/mentor services, backend `creator/`, `roadmaps/`, marketplace tables/services, billing/credits, admin creator pages.

## Feature 9 — Mentor Studio

### 5/5 acceptance criteria

- Approved mentors can create, edit, preview, submit, publish/unpublish and archive resources/roadmaps from the Studio.
- Drafts are auto-saved and recoverable.
- Review/moderation state is visible and auditable.
- Stats are real, explainable and drillable.
- Credits/earnings activity is reconciled with the canonical ledger.

### Tasks

- [ ] **F9-T1 — Authoring workspace.** Add listing/resource/roadmap draft creation with structured fields, validation, preview and autosave.
- [ ] **F9-T2 — Publishing workflow.** Define draft → submitted → approved/rejected → published → archived state machine with reviewer/mentor actions and immutable history.
- [ ] **F9-T3 — Media library.** Secure uploads, ownership, deduplication, deletion and private preview assets before publication.
- [ ] **F9-T4 — Analytics.** Replace summary-only cards with enrollment trend, completion, rating distribution, content conversion and learner engagement sourced from real events.
- [ ] **F9-T5 — Credits/earnings.** Show ledger-derived earnings, adjustments and payout/credit status; do not derive balances from mutable aggregate fields.
- [ ] **F9-T6 — Quality.** Add preview-as-learner, accessibility checks and publication validation that blocks incomplete/unsafe resources.

### Required tests

Mentor authorization; draft autosave/recovery; publication state machine; asset ownership; analytics query tests; concurrent edit/version conflict test.

## Feature 10 — Creator Marketplace / Wallet

### 5/5 acceptance criteria

- Marketplace is a real routed product, not a backend-only capability or redirect.
- Learners can browse, evaluate, purchase/enroll, access and review listings.
- Creators have storefronts, clear proof/trust signals, earnings ledger and payout lifecycle.
- Refund/dispute/chargeback states are represented explicitly.
- Financial authorization and database ACLs are verified in production.

### Tasks

- [ ] **F10-T1 — Productize routes.** Replace `/wallet` and marketplace redirects/legacy screens with dedicated learner marketplace, listing detail, purchases/library and wallet/ledger routes.
- [ ] **F10-T2 — Marketplace catalogue.** Server-side pagination/search/filter by type, outcome, creator, price, rating and eligibility; verified-creator badge from server-owned status.
- [ ] **F10-T3 — Listing trust page.** Show creator proof, outcomes, update date, curriculum/deliverables, sample, rating count, refund policy and clear paid/free status.
- [ ] **F10-T4 — Enrollment/purchase transaction.** Use idempotent checkout, authoritative payment confirmation and atomic entitlement creation; never grant access on client redirect alone.
- [ ] **F10-T5 — Wallet ledger.** Use immutable transactions for earning/spend/adjustment/refund/payout; balance = derived ledger state or safely maintained materialization with reconciliation.
- [ ] **F10-T6 — Payouts/disputes.** Add payout request/approval/paid/failed states, creator identity requirements, refund/dispute/chargeback handling and operator tooling.
- [ ] **F10-T7 — Reviews.** Only entitled/enrolled learners may review; prevent duplicate reviews; add moderation/reporting and rating recalculation tests.
- [ ] **F10-T8 — Security closure.** Verify live credit RPC ACLs and retire legacy arbitrary-user credit functions before release.

### Required tests

Purchase idempotency, webhook replay, entitlement creation, cross-user wallet denial, refund/chargeback, payout state machine, review authorization, browser purchase→access journey.

## Exit evidence

5/5 requires real marketplace routes and an audited financial ledger. Backend tables alone do not satisfy this plan.
