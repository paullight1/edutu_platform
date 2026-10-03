# Web Mobile Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver AI coach with live voice, CV builder and AI tools, application copilot, documents, saved-search alerts, personal goals, and user payments on web.

**Architecture:** Browser-native React interfaces call Clerk-authenticated NestJS services. Establish compatibility bridges and safe operation contracts before feature UI. Reuse mobile behavior and pure logic, preserving existing records without destructive migration. Establish charging rules first; ship payment checkout last.

**Tech Stack:** Existing React/Vite/TypeScript, React Router, Clerk, NestJS, backend-managed Supabase persistence, browser fetch streams, WebRTC, and existing billing infrastructure.

**Spec:** `docs/superpowers/plans/2026-10-01-web-mobile-feature-spec.md`

**Revision:** v2, 1 October 2026. Supersedes the original plan. Evidence and criticism are in `2026-10-01-web-mobile-features-critique.md`. This revision changes planning documents only.

## Global Constraints

- Backend path: `backend/services/services/api/`.
- All new application data access goes through the backend. Resolve binary-upload transport explicitly; existing signed-storage behavior is not silently treated as an exception to the project rule.
- Use Clerk and strict backend TypeScript. Resolve raw auth subjects versus derived database UUIDs on the server.
- Prices, provider credentials, tier rules, charging, refunds, and permissions stay server-side.
- Do not retry metered/mutating requests automatically without a verified idempotency contract.
- Never import React Native, Expo, AsyncStorage, or a native barrel module into web; extract pure types/rules selectively.
- Preserve unrelated working-tree changes, particularly the currently modified shell/navigation files.
- Roadmap catalogs, Creator Studio, referrals, native widgets, and developer-portal redesign are outside scope.
- Each requested category remains required; incremental delivery does not redefine overall completion.

## Review Focus

- Account switching must clear private cache, streaming work, microphone capture and drafts belonging to the previous account.
- Ambiguous AI timeouts must not trigger another charge blindly; recover persisted results or expose an explicit uncertain state.
- CV and essay edits from competing tabs/devices must not silently overwrite each other.
- Synced mobile data must survive web read/edit/write; local-only mobile records cannot appear on web before mobile uploads them.
- Payment fulfillment must tolerate duplicate/delayed events without duplicate credits or revived expired access.

## Criticism resolved in v2

| Evidence in code | Consequence for implementation |
|---|---|
| Mobile CVs use `user_cvs` keyed by raw auth ID; backend CV CRUD uses `cv_records`. Web types omit structured content and several mobile sections. | Build an owner-scoped structured CV bridge before claiming shared CVs or a unified document library. Preserve origin/ID and all sections. |
| Mobile goals query raw and derived IDs; backend goals query a derived ID. | Test real schema-compatible legacy fixtures and define read/write identity rules before promising synchronization. |
| `productApiRequest` retries network/5xx errors up to three times and defaults to a 15-second timeout regardless of method. | Reads, writes, streams and multipart uploads need distinct policies. Do not feed charged AI calls into blind retry. |
| Voice exchanges SDP, calls `ask_edutu` through chat, and returns a 55-second reservation window. | Build a coach tool bridge, thread continuity, reservation handling and cleanup, not just microphone UI. |
| Saved-search digest cron runs every 30 minutes with a six-hour per-user push throttle. | Promise matching digests, not instant alerts; include quiet hours, enablement configuration and deduplication. |
| Digest links use `/saved-searches` and `/opportunities/:id`. | Add web aliases/adapters and test post-login deep links. |
| Uploads return signed storage URLs and download links expire after 300 seconds. | Resolve binary transport, enforce actual sizes, and treat transfer/parse/download as separate states. |
| Paid access is tier-specific; voice requires an active paid tier. | Credit purchases do not automatically unlock voice; `isPro` is not remaining usage. |
| Billing products have API-oriented names, but names alone do not prove separate balances. | Trace catalog fulfillment to ledger/spending consumers before creating products or wallets. |

## Delivery sequence

`Contract gate → safe access/transports → text coach + document/CV foundation → core CV → copilot → alerts → goals → live voice → payment → remaining parity and whole-flow checks`.

Voice feasibility is checked at the contract gate; implementation follows stable text/chat and metering contracts. Documents does not block text coaching. Alerts and goals are independent once identities and request handling are settled. Payments remain the final requested feature to ship. Each phase ends with meaningful tests, typecheck where applicable, and a focused commit during implementation.

## File and navigation map

Modify `edutu-web-app/src/App.tsx`, `src/components/workspaceNavigation.ts`, and `src/components/AppWorkspaceShell.tsx` with care for existing local changes. Reuse `src/services/productApi.ts`, `src/services/cvApi.ts`, `src/services/billing.ts`, notification services and existing state/i18n patterns.

Create focused feature directories under `src/features/`: `feature-access`, `ai-coach`, `documents`, `cv`, `copilot`, `saved-searches`, `goals`, `wallet`. Each owns its components, typed adapter and tests; adapters depend on common transport rather than duplicate retry/auth logic.

Canonical routes: `/app/coach`, `/app/cv`, `/app/copilot/:opportunityId`, `/app/documents`, `/app/saved-searches`, `/app/goals`, `/app/goals/:id`, `/app/wallet`. Restore `/coach`, `/chat`, `/app/chat`, `/cv`, `/app/cv` appropriately, and add aliases for actual notification links. Preserve My Plan and Applications. Change retirement assertions only for requested restored surfaces; retain roadmap/marketplace retirement tests.

Keep primary navigation Home, Opportunities and My Plan. Coach gets a clear persistent action; voice begins only after an explicit user gesture. CVs, Documents, Goals and Saved Searches belong in personal workspace/More. Wallet belongs under account/settings with contextual purchase links. Copilot opens from an opportunity/My Plan, not a competing top-level tab.

State ownership: Copilot owns kits/checklists/essays; My Plan owns journey tasks/state; Applications owns submission/outcomes; Goals owns personal targets; Documents aggregates uploads/CV links. No implicit completion synchronization between these entities. Use existing application mutations instead of adding a second submission status.

## Task 0: Resolve data, transport and financial contracts

**Files:** Create `docs/superpowers/plans/2026-10-01-web-feature-contracts.md` during implementation. Inspect backend `common/user-id.ts`, `cv`, `goals`, `uploads`, `chat`, `voice`, `copilot`, `saved-searches`, `billing`, `monetization`; compare the corresponding mobile services.

- [ ] Record each operation's auth principal, owner key, persistence, DTO, mutation semantics, metering action, retry policy and failure behavior.
- [ ] Build seeded compatibility fixtures: synced mobile CV with every section, legacy web CV, raw/derived owner representations, existing goals, full copilot kit and local-only mobile CV. No private production content is needed.
- [ ] Choose a non-destructive CV bridge: expose structured `user_cvs` through the backend for editing; aggregate legacy `cv_records` with origin-qualified IDs. Import legacy text explicitly when editable, retain unknown fields, and never deduplicate by title or silently dual-write.
- [ ] Define structured CV update and essay concurrency contracts using expected revision/updatedAt and atomic comparison. If a version field is required, specify its additive migration and rollback. Existing `/cv` creation is not an editor update API.
- [ ] Default new web binary uploads to backend-mediated transfer under the project convention; design an additive bounded upload endpoint while leaving mobile's current signed flow intact. A signed-transfer exception requires an explicit architecture decision, not an inferred waiver.
- [ ] Trace API-branded credit fulfillment and AI spend to decide shared versus separate balances. Record existing Lite/Pro/Scholar, renewal, expiry and provider rules without inventing prices.
- [ ] Validate voice availability, SDP flow, coach bridge and reservation policy with an internal test account before scheduling voice UI.

**Exit:** contract document contains concrete decisions and corresponding fixture tests. Any storage, charge or transport gaps become explicit backend tasks; they cannot remain vague frontend follow-ups.

## Task 1: Safe request policies, access and routes

**Files:** Modify `src/services/productApi.ts` and route/navigation files. Create `src/features/feature-access/useFeatureAccess.ts`, a shared stream transport and a multipart transport. Extend backend policy/operation contracts only where existing responses are insufficient.

**Interfaces:** `/billing/status` provides plan/credit state. Verify or add a read-only action-policy contract for action eligibility, cost, remaining allowance and reset time. JSON reads use bounded retry; metered writes use one attempt unless server idempotency is verified; streams use authenticated fetch with AbortSignal, not EventSource or JSON retry.

- [ ] Add policy tests proving read retry, preserved structured status/code, terminal abort and no automatic replay of ambiguous writes.
- [ ] Implement loading/unavailable/eligible/exhausted/expired access states; do not map billing outages to free-user status or assume a paid tier has unused allowance.
- [ ] For retriable charged operations, implement owner+action+request-ID idempotency: atomic charge/work claim, persisted result replay, payload-mismatch rejection and failed/uncertain recovery. Otherwise prohibit automatic retry and recover through persisted history.
- [ ] Add per-feature release configuration, authenticated routes and return-after-login behavior. Hidden UI does not substitute for backend permission enforcement.

**Exit tests:** `productApiPolicy.test.ts`, `featureAccess.test.tsx`, route/deep-link tests, plus affected backend metering/idempotency tests. Account switch clears cached access and active work. Ambiguous charged POST never silently generates twice.

## Task 2: Text AI coach

**Files:** Create `src/features/ai-coach/{CoachPage,ThreadList,MessageList}.tsx`, `api.ts`, `stream.ts`. Reference mobile `services/chatStream.ts` and backend `chat.controller.ts`.

**Interfaces:** `/chat/threads`, `/chat/threads/:id/messages`, thread deletion and `/chat/messages/stream`. Preserve thread ID, channel, locale and contextual opportunity data.

- [ ] Test SSE across split UTF-8/chunk boundaries and unknown events. Implement `turn.start`, tool events, token deltas, authoritative `turn.final` and `turn.error`.
- [ ] Clear provisional token text on `tool.start`, pair tool events by ID, reconcile final content, and never fall back by issuing a second metered POST after partial delivery.
- [ ] Implement new/delete/history, streaming cancellation, retry/recovery states, readable structured messages and contextual links.
- [ ] Abort on navigation/logout; restore completed history after an uncertain disconnect. Report fallback/truncated answers honestly.

**Exit:** history survives reload; a tool-assisted streamed turn matches its persisted final reply; unknown/partial results preserve user input without duplicate submission. Text coach ships independently of live voice.

## Task 3: Documents and structured CV persistence

**Files:** Create `src/features/documents/{DocumentsPage,DocumentList,DocumentPicker}.tsx`, `api.ts`; implement the CV bridge/update contracts in backend `cv` and bounded binary transfer in `uploads` per Task 0.

**Interfaces:** owner-scoped CV bridge plus `/uploads`, ingest and download APIs. Canonical document references identify kind, source and source ID. Editor records are CV links, not fabricated stored PDFs.

- [ ] Implement owner-scoped listing and the upload state sequence: selected → transferring → uploaded → parsing → ready/parse-failed. Preserve an uploaded original when parsing fails.
- [ ] Enforce actual bytes and supported MIME types server-side, with limits derived from the current 10 MB upload contract. Define orphan cleanup after interrupted transfer.
- [ ] Obtain fresh short-lived download URLs only when needed. Do not log contents or signed URLs. No delete/rename UI until its backend operation exists.
- [ ] Verify mobile-origin records and failed/cloud-pending states are represented honestly; local-only mobile files cannot be pulled from that device by web.

**Exit:** owner/non-owner tests, interrupted transfer/parse tests, fresh URL/download test and full mobile CV fixture read/update. General document MIME support remains distinct from LinkedIn PDF/ZIP import.

## Task 4: Core CV builder and AI tools

**Files:** Create `src/features/cv/{CvPage,CvEditor,CvPreview,CvTemplatePicker,CvHealthPanel}.tsx`, `export.ts`; extend `src/services/cvApi.ts` to the verified structured bridge. Extract only pure template/health rules if useful.

**Interfaces:** full mobile CV sections and metadata, owner/source-qualified records, expected revision; existing AI draft/tailor/cover-letter contracts. Do not narrow research/publications/references out of the model.

- [ ] Implement guided editing, templates, save/reload and visible Saving/Saved/Unsaved/Conflict/Failed states. Failed saves preserve user edits; cross-device conflicts preserve both versions or require deliberate resolution.
- [ ] Keep account-scoped local recovery separate from cloud success; clear/expire private recovery state on logout. Warn before leaving unsaved changes.
- [ ] Implement draft/polish, opportunity tailoring and cover letters as reviewable proposals; accept/reject never silently replaces the saved original.
- [ ] Decide export mechanism before promising instant downloads. Preview/export share template design; distinguish browser print-to-PDF from automated PDF download. Verify selectable text, long entries, Unicode/RTL and pagination.
- [ ] Add health checks as heuristics rather than guaranteed acceptance/ATS scores. Finish full template parity and multipart LinkedIn PDF/ZIP import after the core editor milestone, before declaring full requested parity.

**Exit:** full-section mobile/web round-trip fixture, two-device conflict test, reject-AI-change test, save/reload test and exported text/page inspection. A read-only mobile record bridge alone does not count as editable cross-platform parity.

## Task 5: Application copilot

**Files:** Create `src/features/copilot/{CopilotPage,KitChecklist,EssayWorkspace,RefereeRequest}.tsx`, `api.ts`; modify OpportunityDetail and MyPlanDetail entry points. Extend backend copilot persistence for revision-safe essay updates if needed.

**Interfaces:** existing kit list/get/generate, outline, feedback, draft/checklist and answer-bank APIs; reuse document references and application tracking. Handle `generatedBy` and `profileGrounded`.

- [ ] Implement persistent kits, grouped preparation checklist, document/CV links and progress. Keep kit checklists separate from My Plan tasks unless an explicit server mapping exists.
- [ ] Save essay drafts before requesting feedback; support outline, feedback and reusable answers. Surface concurrent edits and preserve the unsaved version.
- [ ] Identify predicted prompts and fallback/non-personalized kits accurately. AI preparation suggestions are not official requirements.
- [ ] Add copy-only referee email drafts and contextual coach/CV tailoring actions. Opening the external form does not confirm submission.

**Exit:** restore mobile kit/draft; concurrent-draft test; kit-generation recovery without blind replay; fallback/grounding UI test; opportunity → kit → essay → CV → documents flow. No email is sent automatically.

## Task 6: Saved searches and digest alerts

**Files:** Create `src/features/saved-searches/{SavedSearchesPage,SearchAlertEditor,MatchPreview}.tsx`, `api.ts`; modify OpportunitiesPage and known notification URL routing.

**Interfaces:** CRUD and preview APIs support `query`, `category`, `fundingType`, `targetRegion`, `remoteOnly`, name and notifyEnabled. Use the existing scheduler/deduplication and notification preferences.

- [ ] Save supported filters; visibly identify unsupported active filters instead of silently broadening the search. Verify whether parity requires DTO expansion before implementing it.
- [ ] Implement edit/pause/delete and previews. Preserve server limits; test create duplication and invalid empty criteria.
- [ ] Verify digest enablement and new-opportunity ingestion hooks. Document existing cadence: half-hour cron, six-hour user throttle, quiet hours and enabled channels. No unsupported email promise.
- [ ] Test single-match and multi-match deep links, including a signed-out click followed by login. Verify pending-match behavior when paused/resumed instead of inventing it.

**Exit:** controlled-clock tests prove delivery, preference suppression and dedupe; a matching fixture reaches the web inbox/push and correct destination. Push denial still leaves usable alert management and supported inbox behavior.

## Task 7: Personal goals

**Files:** Create `src/features/goals/{GoalsPage,GoalDetailPage,GoalEditor,GoalCalendar}.tsx`, `api.ts`; update only relevant retired-goal tests. Modify backend identity/reminder handling only where fixture tests demonstrate a gap.

**Interfaces:** actual strict goal DTO supports title, description, category, priority, progress, status and targetDate/deadline. Current DTO does not define opportunity/copilot foreign keys.

- [ ] Implement CRUD, completion/archive/reopen, progress, filters and list/calendar views; verify existing raw/derived owner fixtures.
- [ ] Define date-only input conversion, timezone/time and persisted ISO behavior. Test local-midnight boundaries; do not infer a date from browser timezone alone.
- [ ] Reuse backend reminder queue replacement/cancellation on changes/completion/delete; verify actual delivery. Do not schedule a duplicate browser reminder.
- [ ] Keep personal-goal progress independent of kit/journey progress. Linked goals require an explicit schema/DTO task and are optional after core personal goals, not silently posted unsupported fields.

**Exit:** cross-platform CRUD fixtures, completion/reopen state tests, timezone/calendar checks, reminder replacement/cancel test, existing journey flow regression checks.

## Task 8: Live voice coach

**Files:** Add `src/features/ai-coach/{VoiceModePanel,VoiceTranscript}.tsx`, `voiceSession.ts` and `browserRtcAdapter.ts`; reference mobile `lib/realtimeVoiceSession.ts` and backend `voice/realtime-voice.service.ts`.

**Interfaces:** authenticated SDP offer to `/voice/realtime/session`; consume answer SDP, callId and expiresAt. Data-channel `ask_edutu` calls invoke the same coach stream with channel voice and thread continuity. Account for both voice reservations and chat-turn metering.

- [ ] Implement explicit microphone/audio activation, mute/end, transcripts, connection/listening/thinking/speaking/error states and text fallback.
- [ ] Deduplicate tool call IDs, reject unrecognized tools, send canonical coach reply as tool output and preserve completed thread state. Do not let a parallel voice assistant bypass the coach.
- [ ] Handle the current 55-second reservation/reconnect policy with a fake-clock test. Reconnect only while the user still intends a live session and backend policy permits it; never replay ambiguous utterances automatically.
- [ ] Stop tracks, data channels, tools and peer connections on denial, limit exhaustion, logout, navigation, background policy and error. Provide explicit audio enablement when autoplay is blocked.

**Exit:** one canonical chat turn per tool call ID; reservation expiry and exhausted-plan tests; transcript/thread continuity; real browser checks for Safari audio activation, headset changes, interruption and teardown. Credit top-ups alone do not bypass active-tier voice checks.

## Task 9: Payment and wallet, shipped last

**Files:** Create `src/features/wallet/{WalletPage,TransactionList,CreditPurchasePanel}.tsx`; extend existing `src/services/billing.ts`; update UpgradePage copy. Reuse backend catalog/checkout/fulfillment/reconciliation and its tests.

**Interfaces:** backend-owned products, price/currency, renewal/access duration, authenticated checkout idempotency key, verified status and intended credit ledger. Preserve provider routing and native RevenueCat management ownership.

- [ ] Implement balance, transactions, eligible credit products and tier purchase/manage controls using Task 0's ledger decision. Do not create a second balance just from API-oriented product names.
- [ ] Treat redirect success as pending until backend fulfillment confirms it. Use bounded polling/backoff and reconciliation; distinguish cancel, failed and pending states.
- [ ] Validate internal return destinations, restore saved work after purchase and require explicit user retry of AI work. Refresh plan access and remaining allowance separately.
- [ ] Test replayed/delayed/out-of-order events, expiry/revocation, duplicate clicks and timeout retry with the same intent key. Browser-supplied amounts/quantity do not determine fulfillment.

**Exit:** provider test-mode purchase credits the intended ledger once; mobile purchase appears on web; web purchase is recognized by mobile; pending/provider-outage states remain recoverable. Existing ledger/reconciliation suites pass. Actual prices/durations/limits replace all mobile-only marketing claims for shipped features.

## Task 10: Release, rollback and full completion

- [ ] Each feature passes keyboard, screen-reader status, reduced-motion, RTL/i18n and responsive checks as part of its own acceptance, not only at the end.
- [ ] Browser matrix: current stable Chrome/Edge/Firefox/Safari desktop, Android Chrome, iOS Safari and installed PWA where supported. Record exact versions/capabilities at implementation time.
- [ ] Run targeted suites per task; release runs web typecheck/build and affected backend integration suites. Do not run tests merely to verify this Markdown revision.
- [ ] Validate a complete flow: saved search → digest → opportunity → copilot → tailored/exported CV → documents → personal goal → exhausted AI action → purchase → verified access → explicit retry.
- [ ] Separate flags for text coach, voice, CV, copilot, documents, alerts, goals and checkout. Disable new work/purchases independently without destroying saved data or unnecessarily blocking export/read access.
- [ ] Add non-content telemetry for operation IDs/status, ambiguous writes, reconnects, failed exports, digest delivery and fulfillment age. Never log private essays, CV text, audio, tokens or signed URLs.
- [ ] Use additive bridges/migrations and seeded rollback validation. No destructive merge of legacy CV tables or global owner-key rewrite in initial rollout.
- [ ] Stage internal accounts then a small enabled cohort. Widen only after scenario checks and monitoring agree. Production deployment/payment activation are explicit later actions.

**Completion means:** all requested feature categories including live voice and payment work, full agreed CV/mobile parity is verified, saved work survives failures, cross-platform fixtures pass and roadmap/marketplace retirement remains intact.

## Estimates and execution

Estimate contract/API, UI and end-to-end verification separately after Task 0. Main uncertainty drivers are CV compatibility/concurrency, voice reservation/turn metering, alert routing and credit-product fulfillment. Do not promise a calendar date before resolving them. Every task is split into independently testable increments; no subagent dispatch is required. This document does not itself authorize application implementation, deployment or provider changes.
