# Settings, Privacy, Security & Notifications 5/5 Implementation Plan

**Goal:** make account controls trustworthy, complete, auditable, and resilient across channels/devices.

**Primary files:** `edutu-web-app/src/components/SettingsPage.tsx`, `MemberSettingsPanel.tsx`, notification components/hooks/services; backend `settings/`, `profile/`, `notifications/`, `auth/`.

## Feature 5 — Settings / Privacy / Security

### 5/5 acceptance criteria

- Every visible privacy/security control changes real backend behavior.
- Password, active sessions, export and deletion flows are complete and recover from partial failure.
- Account deletion covers all feature-owned relational data, storage objects, analytics identifiers and queued notifications under a documented retention policy.
- Security-critical changes produce an audit event and user notification.
- MFA/passkeys are available for high-risk/admin accounts, with recovery paths.

### Tasks

- [ ] **F5-T1 — Privacy enforcement matrix.** Map each toggle (`profileVisibility`, `dataSharing`, `analyticsTracking`, `activityStatus`, `searchVisibility`) to backend queries/RLS/service behavior and add integration tests for each state.
- [ ] **F5-T2 — Data export completeness.** Build a versioned export manifest that includes profile, preferences, saved items, applications, goals, roadmaps, notifications, creator/mentor data, billing ledger references, developer projects and user-owned uploads where legally appropriate.
- [ ] **F5-T3 — Account deletion workflow.** Convert deletion into an auditable server workflow with re-authentication, cooling-off state if required, storage cleanup, queue cleanup and final confirmation.
- [ ] **F5-T4 — Security upgrades.** Add MFA/passkey setup UX, recent-security-events page and new-device/session notifications.
- [ ] **F5-T5 — Session management.** Ensure revoke-one and revoke-all-other actions have clear current-session identification, optimistic feedback and retry-safe backend/provider handling.
- [ ] **F5-T6 — Accessibility.** Focus trap, Escape handling, return-focus, announced save errors and fully keyboard-operable settings sheets/dialogs.

### Required tests

Privacy enforcement integration suite; export fixture completeness; deletion state-machine; session revoke; MFA/passkey E2E; accessibility checks for all dialogs.

## Feature 6 — Notifications

### 5/5 acceptance criteria

- Inbox, web push, local reminders and mobile push use one preference model and one event taxonomy.
- Delivery is idempotent, observable, retry-safe and suppresses duplicates.
- Timezone handling is explicit and tested.
- Users can see/manage notification categories and channels.
- Operators can see queue health, delivery outcomes and failures.

### Tasks

- [ ] **F6-T1 — Canonical notification event model.** Define stable event keys for opportunity deadlines, goal deadlines, application state, interviews, roadmap milestones, billing, mentor/creator actions, community calls and security events.
- [ ] **F6-T2 — Durable delivery ledger.** Record channel, provider message ID, attempt count, delivered/failed/suppressed state, timestamps and error class without storing secrets.
- [ ] **F6-T3 — Queue reliability.** Add leases/locks, retry backoff, dead-letter state, stale-job recovery and queue-age metrics.
- [ ] **F6-T4 — Preference enforcement.** Test category/channel opt-outs at dispatch time and make unsubscribe changes effective immediately.
- [ ] **F6-T5 — Timezone correctness.** Store user timezone, define DST behavior, and test due-today/tomorrow semantics across timezones.
- [ ] **F6-T6 — Operator observability.** Dashboard queue depth, oldest job, success rate, provider failure rate and suppressed duplicates; page only on actionable thresholds.
- [ ] **F6-T7 — UX.** Add notification category filters, clear action destinations, read-state sync and safe bulk actions.

### Required tests

Push-token ownership, duplicate suppression, retry/dead-letter, timezone fixtures, preference opt-out, browser notification deep-link flow, queue recovery after process restart.

## Exit evidence

5/5 requires proof that settings control backend behavior and that notification delivery can be operated safely under provider/network failure—not just a polished inbox.
