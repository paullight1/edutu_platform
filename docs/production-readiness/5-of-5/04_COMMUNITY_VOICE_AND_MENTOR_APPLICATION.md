# Community, Voice & Mentor Application 5/5 Implementation Plan

**Goal:** replace marketing-only community signals with trustworthy community functionality and harden voice/mentor onboarding for real-world production conditions.

**Primary files:** `CommunityPage.tsx`, `CommunityShowcase.tsx`, `features/community-calls/*`, backend `communities/`, `community-dms/`, `community-calls/`, voice gateway, `MentorPage.tsx`, creator/mentor backend and storage policies.

## Feature 7 — Community + Voice

### 5/5 acceptance criteria

- Community metrics/testimonials displayed publicly are derived from verified data or clearly labeled editorial examples.
- Users can actually discover/join relevant groups/cohorts, understand membership state and interact safely.
- Voice calls work across realistic carrier/NAT conditions with explicit capacity and degradation behavior.
- Moderation, abuse reporting, blocking and membership revocation are enforceable server-side.
- Voice service has production alerting, load limits, deployment drain and failure runbooks.

### Tasks

- [ ] **F7-T1 — Remove unverifiable claims.** Replace hard-coded member/country/mentor/wins counters and synthetic testimonials with API-backed verified metrics/stories or remove the claims.
- [ ] **F7-T2 — Community product surface.** Add group catalogue, membership states, join/leave/request flows, member roles, group detail, conversation surfaces and empty/error/moderation states.
- [ ] **F7-T3 — Safety controls.** Implement report, mute/block, moderator action history, membership revocation and rate limits for posts/DMs/call actions.
- [ ] **F7-T4 — Voice network validation.** Test WebRTC/mediasoup on Wi-Fi, 3G/4G/5G, CGNAT and packet-loss profiles; deploy TURN where required by measured failure rates.
- [ ] **F7-T5 — Voice scale.** Load-test concurrent rooms/participants, worker death, gateway restart and API callback saturation; enforce a participant cap based on evidence.
- [ ] **F7-T6 — Deployment drain/failover.** Add operational drain control, readiness removal before deploy and tested recovery when a worker/node dies. Document the no-router-migration limitation until multi-node migration exists.
- [ ] **F7-T7 — Voice observability.** Wire Prometheus metrics to alerts for worker deaths, callback exhaustion, join-confirm failures, queue saturation, packet loss and reconnect storms.

### Required tests

Community authorization/membership tests; moderation abuse tests; deep-link call join E2E; real mediasoup smoke; network-condition matrix; load/failure tests; accessibility of preflight/live/ended states.

## Feature 8 — Mentor Application

### 5/5 acceptance criteria

- Mentor proof uploads are private, validated, scanned/quarantined and lifecycle-managed.
- Application validation is server authoritative.
- Duplicate/retry submissions are safe.
- Applicants can resume, see status and receive decisions/reasons where policy allows.
- Admin reviewers have evidence, audit history and conflict-free moderation tools.

### Tasks

- [ ] **F8-T1 — Secure upload pipeline.** Replace unrestricted direct proof upload with signed/scoped upload or backend upload intent; enforce max size, allowed MIME, magic-byte validation, private bucket and path ownership.
- [ ] **F8-T2 — Malware/content safety.** Scan or quarantine PDFs/images before reviewer access; strip unsafe metadata where appropriate; never render untrusted SVG/HTML directly.
- [ ] **F8-T3 — Server validation.** Validate identity/contact fields, URLs, proof metadata, consent and content type in backend DTOs; never trust client step validation.
- [ ] **F8-T4 — Resume/idempotency.** Persist draft application state or make submission retry-safe with an idempotency key and duplicate detection.
- [ ] **F8-T5 — Review workflow.** Add reviewer assignment/status, decision reason, audit events, proof-view logs and applicant notification.
- [ ] **F8-T6 — Retention/privacy.** Define proof retention, deletion after rejection/withdrawal, export/deletion behavior and reviewer access boundaries.
- [ ] **F8-T7 — UX/accessibility.** File progress/error states, validation summaries, keyboard navigation, save-and-return behavior and clear consent language.

### Required tests

Storage policy tests, cross-user proof access denial, oversized/fake-MIME upload rejection, duplicate submission, reviewer authorization, applicant status E2E.

## Exit evidence

Do not mark 5/5 until real community data replaces static trust claims and voice has carrier/load/failure evidence beyond local smoke tests.
