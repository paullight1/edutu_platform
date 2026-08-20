# Roadmaps, Learning & Personalization 5/5 Implementation Plan

**Goal:** make planning and personalization a durable, explainable learner system rather than disconnected feature pages.

**Primary files:** `edutu-web-app/src/components/RoadmapsPage.tsx`, `GoalsPage.tsx`, personalization/profile components and hooks; backend `roadmaps/`, `goals/`, `quiz/`, `flashcards/`, `profile/`, `settings/`, recommendation services.

## Feature 3 — Roadmaps & Structured Learning

### 5/5 acceptance criteria

- Roadmap adoption, progress, milestones and completion are canonical server state.
- One API response shape is used; frontend no longer carries snake_case/camelCase compatibility indefinitely.
- Quiz and flashcard functionality is surfaced as a coherent learner experience where it supports a roadmap.
- Progress is resumable across devices and resilient to duplicate adoption requests.
- Ratings/enrollment counts are trustworthy and protected from manipulation.

### Tasks

- [ ] **F3-T1 — Canonical roadmap contract.** Define DTOs/schema for roadmap, enrollment and progress; migrate consumers to camelCase JSON and remove compatibility helpers after a deprecation window.
- [ ] **F3-T2 — Idempotent adoption.** Enforce one active enrollment per user/roadmap where intended, make adoption retry-safe, and return created milestone-goal IDs.
- [ ] **F3-T3 — Progress engine.** Persist completed steps with timestamps and calculate percentage server-side; expose resume-next-step.
- [ ] **F3-T4 — Integrate learning primitives.** Surface quizzes/flashcards from roadmap steps with study state, attempt history and spaced-review scheduling instead of leaving them backend-only.
- [ ] **F3-T5 — Replace alerts.** Use shared accessible modal/toast error primitives for enrollment/calendar failures.
- [ ] **F3-T6 — Creator trust.** Show creator verification, outcomes, rating count, update date and enrollment count with server-derived values.
- [ ] **F3-T7 — Performance/observability.** Paginate roadmap catalogue, lazy-load detail assets, record adopt/start/step-complete/abandon/complete events.

### Required tests

Roadmap DTO contract, duplicate adoption, concurrent step completion, calendar export, paywall, quiz attempt, flashcard review scheduling, browser resume-after-reload.

## Feature 4 — Personalization & Profile

### 5/5 acceptance criteria

- One canonical product profile/preferences model is shared across web/mobile/backend.
- Users can see exactly which profile fields affect recommendations.
- Personalization changes produce predictable, testable ranking changes.
- Privacy choices alter data processing, not just UI toggles.
- Profile completion is actionable and validated.

### Tasks

- [ ] **F4-T1 — Source of truth.** Clerk owns authentication identity; backend profile/preferences own product data; remove duplicated authoritative fields from client metadata paths.
- [ ] **F4-T2 — Versioned preferences API.** Define interests, career goals, geography, education stage, opportunity types, funding needs and exclusions with schema validation.
- [ ] **F4-T3 — Explainability UX.** Add `Why this match`, `What is missing`, and `Improve my matches` panels tied to real scoring inputs.
- [ ] **F4-T4 — Quality controls.** Validate country/age/education data, support unknown/prefer-not-to-say states and prevent impossible values.
- [ ] **F4-T5 — Privacy enforcement.** Test data-sharing, analytics and visibility flags at backend/query layer; do not rely on visual hiding.
- [ ] **F4-T6 — Recommendation regression suite.** Golden profiles + opportunities with expected rank bands and reasons.
- [ ] **F4-T7 — Cross-device sync.** Browser and native clients must converge after offline edits/conflicts using server timestamps/versioning.

### Required tests

Profile authorization, preference validation, recommendation explanation snapshots, privacy enforcement integration, cross-session/cross-device persistence, accessibility of personalization wizard.

## Exit evidence

5/5 requires product-contract cleanup plus learner-visible integration of quiz/flashcards and verified preference-to-ranking behavior, not merely backend endpoint availability.
