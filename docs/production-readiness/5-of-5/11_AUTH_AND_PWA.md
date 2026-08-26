# Authentication, Account & PWA/Native-Web 5/5 Implementation Plan

**Goal:** make identity, sessions, authorization boundaries, offline behavior and installable delivery dependable across browsers/devices/environments.

**Primary files:** web `App.tsx`, auth hooks/components, Clerk token helpers, backend `auth/`, profile/account settings; `vite.config.ts`, service worker/custom SW, Capacitor helpers/config and PWA tests.

## Feature 21 — Authentication & Account Access

### 5/5 acceptance criteria

- Authentication identity and product authorization have one documented trust model.
- Production trusts one Clerk issuer/environment only.
- Users cannot access another user's resources by changing IDs/paths/body fields.
- Admin authorization is server-owned and independent of client routing.
- Sessions, recovery, logout, account deletion and post-auth redirects are tested end to end.
- High-risk accounts support MFA/passkeys and security-event visibility.

### Tasks

- [ ] **F21-T1 — Identity architecture.** Document Clerk as authentication authority and backend profile/authorization tables as product state; define stable mapping keys and sync/recovery rules.
- [ ] **F21-T2 — Production issuer lock.** Fail production startup/deployment when the expected Clerk issuer/audience/config is absent; reject development-tenant tokens.
- [ ] **F21-T3 — Object authorization sweep.** Add tests for bookmarks, applications, goals, roadmaps, notifications, creator/mentor, CV, developer projects, uploads and billing resources using foreign IDs.
- [ ] **F21-T4 — Session lifecycle.** Test sign-in, sign-up, callback, one-tap, absolute timeout, token refresh/expiry, logout, revoke other sessions and recovery links.
- [ ] **F21-T5 — MFA/passkeys.** Add enrollment/recovery UX and require step-up for high-risk/admin operations as defined in the admin plan.
- [ ] **F21-T6 — Security events.** Record new device/session, password/MFA change, session revoke, role/permission change and sensitive account export/deletion actions.
- [ ] **F21-T7 — Redirect safety.** Whitelist/normalize post-auth destinations; reject open redirects and unsafe external schemes.

### Required tests

JWT issuer/audience, expired/revoked token, horizontal access matrix, recovery token use, redirect validation, session timeout and browser auth journey.

## Feature 22 — PWA / Native-Web

### 5/5 acceptance criteria

- Install, upgrade, offline, background cache and account-switch behavior are deterministic.
- User-scoped data is never served from a public/shared cache.
- Service-worker updates cannot strand users on incompatible assets/schema.
- Core routes remain usable on mid-range Android and constrained networks.
- Capacitor/deep-link behavior is tested where native shell functionality is shipped.

### Tasks

- [ ] **F22-T1 — Environment-driven cache origins.** Remove hard-coded production API origin from Workbox matchers; inject/derive approved API origins at build time and test production/preview behavior.
- [ ] **F22-T2 — Cache classification registry.** Explicitly classify every cached route as public-static/public-catalog/user-scoped/never-cache; CI fails when a user-scoped endpoint matches a public strategy.
- [ ] **F22-T3 — Account-switch cleanup.** On sign-out/account change, clear user-scoped app caches/state and prove previous-account data cannot paint before network validation.
- [ ] **F22-T4 — SW migration strategy.** Version cache names, remove obsolete caches safely, handle `skipWaiting/clientsClaim` with compatible asset deployment, and test interrupted update/reload.
- [ ] **F22-T5 — Offline UX.** Clearly distinguish cached data from live data, last-updated time, unavailable mutations, queued/retryable actions and reconnect behavior.
- [ ] **F22-T6 — Performance budgets.** Lighthouse/Web Vitals on landing, dashboard, opportunities and detail under throttled mobile profile; bundle/chunk budgets enforced in CI.
- [ ] **F22-T7 — Native/deep links.** Test community call links, opportunity links, auth callbacks and app-open routing across web/PWA/Capacitor; reject malformed/unsafe links.
- [ ] **F22-T8 — Production build gate.** Required PWA build test validates manifest, icons, service worker generation and cache patterns before merge.

### Required tests

Offline reload, account switch, service-worker update, cache expiry, malformed deep links, installability, mobile Lighthouse/Web Vitals and production PWA build.

## Exit evidence

5/5 requires browser/device evidence for session and service-worker behavior. Unit tests alone cannot prove cache isolation, installability or deep-link correctness.
