# Critique of the initial web feature plan

Reviewed on 1 October 2026 against repository source. These are planning defects and implementation risks, not verified production incidents. No running/deployed API or payment transaction was exercised.

## Critical: shared CV storage was assumed rather than designed

Mobile `edutumobile/packages/core/src/services/cv.ts` reads/writes `user_cvs` with raw auth IDs, while backend `cv/cv.service.ts` lists/creates `cv_records`. Existing web `cvApi.ts` lacks structured content and several mobile sections. The plan promised shared CVs while leaving the hardest compatibility work inside a generic verification checkbox. Repeated create calls also do not establish a durable editor update API.

Fix: owner-scoped backend structured editor bridge, origin-qualified library records, lossless types, explicit updates and revision conflicts. Prove a full mobile CV round trip. Local mobile cache remains local until synced; never claim web can retrieve it directly.

## Critical: reusing the default HTTP helper conflicts with duplicate-charge safety

Web `src/services/productApi.ts` has a 15-second timeout and three-attempt network/5xx retry irrespective of HTTP method. The initial plan prescribed this helper while promising safe interrupted AI retries. A request may complete after a client loses its response; replay can repeat work and charging unless the backend guarantees idempotency.

Fix: distinguish read, mutation, stream and multipart policies; disable automatic ambiguous mutation retry; add server-bound request identities/result recovery where repeatability is required. Client disabling a button is insufficient.

## High: voice was under-specified and bundled too early

Backend `voice/realtime-voice.service.ts` expects SDP, returns a 55-second reservation and configures `ask_edutu`. Mobile `lib/realtimeVoiceSession.ts` forwards that tool through canonical chat. A generic WebRTC/microphone task misses turn dedupe, thread continuity, audio activation, reconnect and two metering paths. Active-tier requirements in monetization mean a credit wallet is not a voice-access policy.

Fix: feasibility first, stable text coach first, then a separate browser-adapted voice milestone with fake-clock/real-device tests and clear cleanup.

## High: streaming is a protocol, not just animated replies

Backend `chat.controller.ts` specifies clearing provisional tokens on tool.start, pairing tools by ID, and treating turn.final as authoritative. The initial plan did not pin these rules. JSON retry, EventSource without the POST/auth contract, or fallback after partial delivery can corrupt content or repeat a turn.

Fix: authenticated fetch stream with abort, UTF-8/chunk tests, final reconciliation and persisted-result recovery.

## High: payment products and allowances were conflated

Catalog product names are API-oriented, while billing exposes canonical balance and metering applies tier/action limits. The original plan mandated distinct credit products/balances before tracing their consumers and treated access flags as sufficient policy.

Fix: inspect ledger fulfillment first; preserve actual provider/tier semantics; display eligibility separately from remaining allowance. Payment remains last to ship but is designed before chargeable features.

## High: document upload architecture contradicted its own constraints

`uploads/uploads.service.ts` reserves signed storage URLs for direct binary transfer, although the plan says all client access goes through the backend. It also omitted actual byte-size enforcement, orphan cleanup and the distinction between upload and parse failure. Download URLs last 300 seconds.

Fix: explicitly choose backend-mediated new web transfer under the project rule, or document a signed-transfer exception; keep mobile compatible. Separate states and use fresh authorized downloads. Rename/delete require new APIs and are not implied by a library screen.

## High: saved-search promises were too broad

The service has a 30-minute cron and six-hour per-user notification throttle, limited criteria DTO and existing quiet-hour rules. It emits /saved-searches and /opportunities/:id links that need web routing. Saving arbitrary current filters or promising immediate delivery is not supported by the visible contract.

Fix: save supported filters explicitly, surface exclusions, verify enabled digest configuration, preserve cadence and test both notification routes with controlled time.

## High: multi-device editing and workflow ownership were absent

CVs and essays need conflict-aware updates; the initial plan offered generic persistence checks. Goals/My Plan/Applications/Copilot also risk competing completion/submission state.

Fix: explicit revision/conflict model and draft recovery. Keep each workflow's state owner separate; reuse application mutations and do not translate checklist completion into submission.

## Medium: goal compatibility and reminder behavior were understated

Mobile useGoals queries raw/derived keys and can write raw IDs, while backend uses derived-ID predicates and already replaces/cancels reminders. The strict goal DTO has no opportunity/copilot relationships.

Fix: schema-compatible fixtures and authorized legacy mapping; date/time semantics; reuse reminder lifecycle; no unsupported foreign-key fields or duplicate local reminder scheduler.

## Medium: task size, UX and rollout were not actionable enough

The initial coach and CV tasks each contain multiple independently releasable systems. Eight additional destinations need navigation decisions, not just routes. Acceptance did not include draft states, typography/export correctness, i18n/RTL or feature-level rollback. A repository file inventory is not a credible delivery estimate.

Fix: split core/parity milestones while retaining all requested scope, group secondary navigation, add concrete exit scenarios and independent flags. Estimate after contract discovery. Keep unrelated local edits intact.

## Assessment

The original plan is a useful feature inventory but was not execution-ready. v2 fixes known structural assumptions and adds acceptance gates. The remaining uncertainty is deployed contract behavior, real schema compatibility and provider/browser verification; those must be measured during Task 0 rather than asserted from source alone.
