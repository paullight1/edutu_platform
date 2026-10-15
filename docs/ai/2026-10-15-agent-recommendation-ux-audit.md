# Edutu AI Coach and Recommendations — Web UX and Grounding Review

Date: 2026-10-15  
Scope: learner-facing web app (`edutu-web-app/`) and the canonical NestJS API's agent and recommendation boundaries. This is a **source-code review**, not a live-production audit.

## What exists in the reviewed code

- The learner AI Coach supports streamed agent turns, history, opportunity cards, action buttons, documents, calendar handoff, reporting, and voice-related UI.
- The server agent executes bounded tool-call rounds with user-scoped context and frames untrusted tool results. Its persona can be overridden from admin settings.
- Opportunity recommendations blend deterministic profile/eligibility signals with AI-assisted semantic reranking; published opportunity verification and deadline-confidence signals have separate backend/UI components.
- `.agents/skills/` contains **development/Codex role skills**, not a learner-facing marketplace of deployable AI agents. Do not describe these as an already-shipped end-user "Skill Creator" feature.

## Problems found and changes in this PR

| Priority | Evidence in source | Change |
| --- | --- | --- |
| High | AI reranking accepted arbitrary model-supplied IDs/scores/reasons, even though model reasoning can assert unverified eligibility or funding. | Reject unknown IDs, non-finite/out-of-range scores, malformed matches, and AI-generated explanation text; preserve deterministic, evidence-based match reasons. |
| High | Admin-editable coach persona could replace essential factuality guidance. | Append server-owned grounding rules after the editable persona: no invented opportunities, deadlines, requirements or actions, and explicit uncertainty. |
| High | Coach opportunity cards displayed `92% match`, even though other Edutu surfaces deliberately use fit tiers to avoid confusion with acceptance chances. | Reuse the existing fit-tier wording; add a source/eligibility caveat. |
| Medium | A recommendation fallback assigned each unprofiled user an arbitrary 50-point match. | Leave discovery available with unscored (0) results and honor result limits; prevent empty preferences from awarding points. |
| Medium | Remote listing could be described as open "anywhere". | Explain that location eligibility still needs checking. |
| Medium | During multi-round tool use, streamed preambles disappeared without an explanation, making the AI feel stuck. | Surface honest `thinking`, `checking`, and `writing` progress in Coach and opportunity preparation UI. |
| Medium | Generated application plans could look like official requirements. | Label AI-created plan steps as suggestions; keep official verification prominent. |

## Risks / work not completed here

1. **Source citations and provenance:** Today, opportunity cards and trust signals help, but not every natural-language assertion from a coach response is backed by a machine-checkable source span. Next: return structured `sourceIds`, `verifiedAt`, and `unknownFields` alongside factual claims and render citations on the coach message.
2. **Deterministic action confirmation:** Continue auditing credit-consuming document/roadmap tools for idempotency, explicit confirmation, cross-user object access and truthful success states. A prompt rule is not a substitute for server-side checks.
3. **Evaluation gates:** Add a fixed test set containing stale deadlines, missing eligibility, poisoned listing descriptions, contradictory documents, empty catalogs, localization, and prompt-injection attempts. Block changes to prompts/routes that regress answer support, tool safety, cost, or latency.
4. **Recommendation calibration:** Track confirmed eligibility, list freshness, saves, dismissals, application outcomes and correction reports; score precision or a tier label is not a guarantee of acceptance.
5. **Learner skills:** Define a separate product specification for skill discovery/creation, tool permissions, review/versioning and visible execution history before exposing any of the repo's coding skills as user-facing agents.

## Release checks

Focused automated regression tests were added or updated for reranker validation, coach policy, progress events, fit labels, and unprofiled recommendations. **These were not executed in the connected GitHub-only environment.**

Before merging run:

```sh
cd backend/services/services/api && npm test -- --runInBand opportunity-ranking-runtime-policy.spec.ts chat.hardening.spec.ts
cd edutu-web-app && npm run typecheck && npm run test -- src/features/ai-coach/stream.test.ts src/features/ai-coach/CoachPage.test.tsx src/services/personalizedRecommendations.test.ts
```

Then exercise authenticated AI Coach and Opportunity Assist in a staging browser, including French UI, poor network conditions, real recommendation cards, provider timeouts, and low/zero AI allowance. Review backend logs and metered usage. Do **not** release without these checks.
