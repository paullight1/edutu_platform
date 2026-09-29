# Home Recommendation Feedback Implementation Plan

> **For agentic workers:** Use the existing `superpowers:executing-plans` and `superpowers:test-driven-development` workflow task by task.

**Goal:** Let a learner remove an irrelevant home recommendation and optionally tell Edutu why, so feedback improves the current feed and the existing cross-device ranking signals.

**Architecture:** Reuse `DismissReasonDialog`, the persisted per-user dismiss list, and the queued `POST /opportunities/signals/batch` integration. Add a small dismiss control only to personalized home carousel cards. Filter dismissed IDs from home recommendations immediately and on later visits. Do not add database tables or a new API contract.

**Tech Stack:** React, TypeScript, Vite, Jest, Testing Library, existing NestJS signal endpoint.

## Constraints

- Dismissal is reversible only through existing account preference/support flows; do not hide all opportunities in a category unless the learner chooses `wrong_field`.
- Keep the home card itself as the primary navigation target.
- The dismiss control must remain keyboard and touch accessible and must not trigger card navigation.
- Feedback must use the existing queued signal transport and remain usable if network delivery is delayed.
- Do not change the ranking algorithm or add schema/migrations.

## Tasks

1. [x] Add focused tests for a dismiss control on carousel cards and no dismiss control on other card variants.
2. [x] Wire a per-user dismissed set into the dashboard's home opportunity projection, loaded from existing local storage.
3. [x] Add an accessible dismiss affordance to carousel cards and open the existing reason picker.
4. [x] On reason selection, persist the dismissal, queue the existing backend signal, update the home feed immediately, and show a brief confirmation.
5. [x] Verify focused UI tests, web typecheck, lint, production build, and `git diff --check`; commit and push as `feat(web): collect feedback on home recommendations`.
