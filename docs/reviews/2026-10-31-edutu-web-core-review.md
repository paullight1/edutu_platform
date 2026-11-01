# Edutu web core functionality review — 31 October 2026

Scope: `edutu-web-app`, with supporting inspection and unit tests of the canonical NestJS AI, chat, copilot, CV and upload modules. The user chose to improve the existing UI and fix AI/core flows. Existing workspace, upgrade and admin changes were preserved.

## Changes implemented

| Severity | Finding and impact | Resolution | Regression coverage |
| --- | --- | --- | --- |
| P2 | Starting a new coach conversation during history loading could leave the loading view stuck. The sheet's new-conversation event could also abort a reply whose rejection then inserted a stopped message into the new conversation. | Invalidate pending history; clear loading and busy state; guard streaming callbacks, success, failure and cleanup by operation identity and conversation version. Block submission while history loads. | Deferred history and deferred cancelled-turn tests in `CoachPage.lifecycle.test.tsx`. |
| P2 | A lost streaming connection discarded the answer already shown to the learner. | Preserve partial text with an interruption notice; keep the original question alongside it. No automatic replay of metered requests. | Partial-token response followed by a rejected request. |
| P2 | Receiving `turn.final` did not finish the client operation until the socket closed. Proxies keeping a connection open could leave the UI busy despite a complete answer. | Treat the final event as authoritative, cancel the reader and release its lock immediately. | A final frame on an intentionally open stream. |
| P2 | A final event missing its saved messages was accepted as a valid turn, which could place undefined messages in the transcript and crash rendering. | Validate the final thread and message fields before returning a turn to the UI; show a recoverable error for malformed responses. | An invalid final contract returned through the actual streaming request. |
| P2 | Usage-limit failures delivered as SSE events became generic errors. | Preserve typed upgrade/allowance errors for the same status/code pairs as the normal product API. | A streamed HTTP-429-equivalent `limit` event. |
| P2 | Coach history metadata was rendered as document links and shareable image URLs without protocol checks. | Permit HTTPS resource URLs without embedded credentials; fall back to Documents for invalid document links and omit invalid images. React text rendering remains in place. | Unsafe document/image metadata loaded through real history rendering. |
| P2 | A slow application-kit response for a previous opportunity could replace the kit currently being viewed. | Scope workspace state to account and opportunity; abort old reads and ignore results after cancellation. | Switch opportunities before resolving the first request. |
| P2 | Outline/feedback responses reported `source: fallback`, but the client discarded it and presented the result without qualification. | Show a status notice explaining that the result is general starter guidance because AI is unavailable. Also pass allowance errors into the established upgrade flow. | A fallback outline response and its visible status notice. |
| P2 | Upload ingestion can return HTTP 200 with `parseStatus: failed`; the UI previously treated that as success. Retry failures were also silently accepted. | Check parse status, distinguish ready from processing, show actionable failure messages, close the already-uploaded file dialog to avoid accidental duplicate uploads, and refresh the file list. Clear stale list errors after successful reload. | Failed extraction returned as a successful HTTP response; successful list retry after a service error. |
| P3 | Learners had no direct way to reuse a coach answer. | Add an accessible Copy response button and success/failure feedback. Copy only visible content, excluding the internal context sentinel. | Clipboard-content and visible confirmation assertions. |

## Core-flow review

| Flow | Inspection and verification focus | Boundary |
| --- | --- | --- |
| Opportunity discovery and preparation | Existing public API integration, error/retry UI, opportunity links, opportunity-assist and application-kit tests. | Local public page renders, but its configured API at `localhost:3010` was not running during the browser check. Live discovery data is unverified. |
| AI Coach | SSE reconciliation, Unicode chunks, partial replies, cancellation, history, ownership transition, generated resource links, copying, history focus and new-conversation controls. | Browser coach checks use the actual components/styles with explicit session/history fixtures, not a live signed-in account or provider. |
| CV studio | Existing editor revision/conflict behavior, preserved sections, export/PDF tests; server schemas, ownership checks and provider fallback tests. | Remaining fallback provenance issue below. |
| Documents | Upload, ingestion, retry, file readiness, partial failures and list recovery. Server upload tests cover extraction and ownership paths. | No learner documents were uploaded to a live service. |
| Application copilot | Account/opportunity isolation, cancellation, saved drafts, revision token, generated kits, fallback disclosure and allowance handling. | Live generation and persistence are unverified. |
| Voice | Existing voice lifecycle/session tests included in the focused coach run. | Microphone, real-time provider, reservation expiry and actual network reconnection require a signed-in device test. |
| Goals, saved searches, wallet, community and navigation | Included in the broad web regression command. | Not a production payment, moderation, messaging or native-capacitor acceptance test. |

## Remaining actionable findings

### P2 — CV fallback output has no source label

Evidence: `backend/services/services/api/src/cv/cv.service.ts`, `generateDraft`, `tailor` and `generateCoverLetter`, catch provider/schema failures and return deterministic drafts/templates without a consistent `source` field. `edutu-web-app/src/features/cv/CvPage.tsx`, `ai`, renders these responses as AI proposals. Learners cannot distinguish a provider-generated revision from a template produced during an outage.

Fix: add an additive `source: "ai" | "fallback"` contract to all three server responses and display that provenance in the proposal/letter UI. Coordinate the additive contract with mobile and decide the fallback charging policy explicitly. Verification gap: provider failure → response provenance → visible CV proposal, including malformed structured output.

### P2 — CV fallback charging needs an explicit policy and test

Evidence: `cv.controller.ts` marks the three AI generation routes with `@AiMetered("cvAi")`. `monetization/ai-metering.interceptor.ts` refunds on thrown errors, while `cv.service.ts` catches provider failures and returns successful heuristic output. This path therefore does not enter the interceptor's error refund branch. Copilot handles fallback refunds inside its service instead.

Fix: agree whether a template consumes AI allowance; then enforce that policy server-side with exactly-once metering/refund tests for provider failure, invalid structured output and cached results. Verification gap: an integrated CV fallback/allowance assertion. No billing policy or ledger changes were made in this pass.

### P3 — Opportunity code splitting is ineffective

The production build warns that `src/services/opportunities.ts` is both dynamically and statically imported, so the dynamic import in `App.tsx` does not create a separate chunk. Consolidate the import strategy after measuring landing/discovery startup; verify resulting chunks and first-load behavior. This does not prevent the current production build.

## Release boundary

No deployment, schema migration, provider credential change, paid live generation or production user-data mutation was performed. The correct release target remains Docploy. A production acceptance check should cover signed-in coach history/generation, usage limits, CV proposals, a real supported upload and opportunity-kit persistence before release.

## Verification results

Commands below ran from `edutu-web-app` unless stated otherwise.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed on the final source. |
| `npm run lint` | Passed, including the zero-warning requirement. |
| `npm run build` | Passed, including SEO validation and prerendering. The configured SEO API was unavailable, so the build retained the checked-in sitemap snapshot. The opportunity dynamic-import warning remains as described above. |
| `npx vitest run src/features/ai-coach src/features/copilot/CopilotPage.test.tsx src/features/documents/DocumentsPage.test.tsx --maxWorkers=1` | Final changed-feature run: 8 files, 22 tests passed. |
| Expanded core run covering CV editor/export/PDF, opportunity assist and product API safety | 35 passed, 1 CV editor test hit the 10-second timeout during machine load. That file subsequently passed in isolation as described next. |
| `npx vitest run src/features/cv/CvPage.test.tsx src/components/dashboard/__tests__/NextStepCard.test.tsx src/components/MyPlanPage.test.tsx --maxWorkers=1 --testTimeout=30000` | 2 matching files, 15 tests passed. There is no `src/components/MyPlanPage.test.tsx`; it did not add coverage. |
| `npx vitest run src/components/dashboard/DashboardDesktopLayout.test.tsx --maxWorkers=1 --testTimeout=30000` | 1 file, 7 tests passed. |
| `npm run test -- --maxWorkers=2` | Broad run started while regression tests and fixes were being developed: 158 files passed, 5 failed; 720 tests passed, 6 failed. All five failed files passed in later focused runs. This is **not** a final all-suite green run. |
| API: `npm run test -- --runInBand --testPathPatterns='(chat/\|ai/\|copilot/\|cv/\|uploads/).*spec.ts$'` | 26 suites, 231 tests passed. Provider failures in these tests are deliberate mocked scenarios. |
| Chromium | Actual CoachSheet, CoachPage and production styles rendered with explicit auth/access/history fixtures at 1440×1000 and 390×844. No horizontal overflow; history received focus, Escape dismissed history, and New conversation cleared the transcript. |
| `git diff --check` | Passed. |

The six broad-run failures were:

- `CoachPage.lifecycle.test.tsx`: “copies a coach reply without exposing hidden context” — the new test ran before its implementation; final changed-feature run passed.
- `stream.test.ts`: “rejects an invalid final turn before it can corrupt the conversation UI” — the new test ran before contract validation was implemented; final changed-feature run passed.
- `CopilotPage.test.tsx`: “keeps the current opportunity when a previous kit finishes loading late” — reproduced the stale-response bug; final changed-feature run passed.
- `CopilotPage.test.tsx`: “labels outline fallback guidance when the AI provider is unavailable” — reproduced missing disclosure, with a test-hook cleanup issue also corrected; final changed-feature run passed.
- `DashboardDesktopLayout.test.tsx`: “does not repeat the My Plan announcement above the next-step card” — 10-second timeout; isolated rerun passed with a 30-second command-line limit.
- `NextStepCard.test.tsx`: “sends an active user to the plan for the featured primary pursuit” — 10-second timeout; isolated rerun passed with a 30-second command-line limit.

An earlier unconstrained web run also encountered `ENOSPC`; it was stopped and is not counted as successful verification. No test timeout configuration was changed in source.

Browser artifacts are under `output/playwright/`: `edutu-coach-desktop.png`, `edutu-coach-mobile.png`, and `edutu-coach-review-fixture.js`. The displayed fellowship and coaching answer are test fixtures, not evidence of live matching or provider quality.

**Verdict:** approve with follow-up for the local reliability patch. Production acceptance and the CV fallback findings remain open.
