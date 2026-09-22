# Edutu Care Plan — Web and Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when authorized by the user or applicable instructions.

**Goal:** Deliver the complete R01–R18 care journey on web and mobile, from recommendation to preparation, submission, follow-through and outcome.

**Architecture:** Extend the existing NestJS opportunity journey authority and reusable services. Web and mobile render the same server-owned state through platform-specific interfaces; capability gates keep older clients compatible.

**Tech Stack:** React/Vite/Capacitor web; Expo 56/React Native mobile; NestJS, Drizzle/Postgres, Clerk and existing Gemini/document/notification services.

**Spec:** [Edutu Care Plan v1](../specs/2026-09-09-edutu-care-plan-v1.md)

## Global Constraints

All constraints in the linked spec apply verbatim to every subplan. Read the spec and the selected subplan together. Preserve the existing dirty worktree; implementation starts with scoped baseline review and an isolated checkout when appropriate. Do not apply production migrations, deploy or contact third parties as part of this planning deliverable.

## Build sequence

| Order | Working milestone | Plan | Exit gate |
|---|---|---|---|
| 1 | One reliable plan across devices | [01 — Foundation and parity](2026-09-09-edutu-care-plan-01-foundation.md) | Authenticated journey API works; both clients save/reload the same pursuit; imports and retries cannot duplicate or rewind it |
| 2 | Recommendations that understand the user | [02 — Fit and trust](2026-09-09-edutu-care-plan-02-fit-and-trust.md) | Editable circumstances, explainable shortlist and source/deadline uncertainty work on both clients |
| 3 | A realistic day and help when stuck | [03 — Planning and blockers](2026-09-09-edutu-care-plan-03-planning.md) | Preview/accept schedules, pause/resume, linked goals/roadmaps and blocker recovery work across devices |
| 4 | Reuse work and prepare applications | [04 — Materials and assistance](2026-09-09-edutu-care-plan-04-materials.md) | Versioned materials, safe drafts, opportunity-specific requirements and reviewed export work end to end |
| 5 | Follow through to an outcome | [05 — Follow-through and reminders](2026-09-09-edutu-care-plan-05-follow-through.md) | Confirmation, follow-up, interview, outcome and respectful reminders are reliable |
| 6 | Complete the experience and release | [06 — Experience and release](2026-09-09-edutu-care-plan-06-release.md) | All R01–R18 evidence cells pass on web/iOS/Android and operational gates pass |

Order dependencies: 01 precedes all client work; 02 precedes reliable schedule generation; 03 supplies pause/activity rules consumed by reminder delivery; 04 materials support interview prep in 05. Accessibility and shared fixtures start in 01 and are checked at every milestone, not deferred until 06. Each milestone is usable behind its own gate; no partially implemented button is exposed.

## Priority and ownership

The first deliverable is a signed-in vertical slice: shortlist an opportunity on web, activate it on mobile, complete a task on web, open the provider link, explicitly confirm submission on mobile, and see the same timeline on both. Fix availability/identity/versioning before adding more AI behavior.

Assign one accountable owner per backend contract, one per client, and one release reviewer. These are responsibilities, not a requirement to create new agents. Estimate dates after milestone 01 confirms deployment health and the acceptance slice runs; dependency order is more reliable than an invented calendar estimate.

## Scope completion checklist

- [ ] R01–R18 have passing backend and applicable web/iOS/Android evidence in the release matrix.
- [ ] Today, Pursuits, Applications, Calendar, Resources and pursuit detail are wired to real data and complete actions.
- [ ] Existing Saved, Applications, Deadlines, Goals, Roadmaps and Community entry points remain usable.
- [ ] Loading, first-use, empty, unavailable, cached, conflict, permission-denied and success states are implemented.
- [ ] No user-facing action ends in a mock response, inert button, unexplained limit or unsupported factual claim.
- [ ] Production readiness is verified independently of code completion: migrations, auth, queue, notification permissions and rollback.
- [ ] Product review signs off that suggested actions are helpful and controllable; engineering review signs off on persistence and failure recovery.

## Execution and evidence rules

Use the existing Jest/Vitest setups. Each implementation task starts with its specified failing behavior test, implements the smallest cohesive change, reruns that test, then runs the affected contract/type checks. Commit only reviewed task files; never `git add .` in this workspace. New test helpers in the plans are implementation deliverables, not claims that those tests currently exist or pass.

The detailed plans use paths relative to the repository root. Run package commands from the stated package directory. Use backend `npm test -- --runInBand --testPathPatterns=<pattern>` (plural `Patterns`), web `npm test -- <path>`, and mobile `npm test -- --runInBand <path>`. Typecheck web and mobile with `npm run typecheck`; build backend with `npm run build`. Full release checks and real-device scenarios are in plan 06.

This planning change does not implement new features or verify production deployment. Previous mobile visual changes are an existing foundation, not completion of this roadmap.
