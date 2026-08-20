# Global 5/5 Release Gates

## Goal

Define the mandatory platform-level conditions every feature must inherit before it can be called production-complete.

## Gate G0 — Deployment Configuration

- [ ] Replace removed Vercel `experimentalServices` configuration with the supported `services` configuration.
- [ ] Add a CI validation step that rejects deprecated/unknown Vercel config properties.
- [ ] Verify web and admin preview deployments from a clean commit.
- [ ] Verify production domains, rewrites, OG endpoints, API origin, and admin origin.
- [ ] Document rollback to the previous Ready deployment.

**Evidence:** successful web/admin production builds; Vercel preview Ready; route smoke matrix passes.

## Gate G1 — Canonical Database & Migration State

- [ ] Select one canonical shared Supabase migration stream.
- [ ] Mark legacy/duplicate migration trees non-deployable in CI.
- [ ] Verify live `pg_policies`, table ACLs, function ACLs, `SECURITY DEFINER` functions, RLS flags, triggers, and indexes.
- [ ] Revoke client execution of arbitrary-user credit RPCs and admin-only functions.
- [ ] Confirm scraper/admin/notification tables are not writable by unintended roles.
- [ ] Store a migration manifest/hash with every production release.

**Evidence:** exported production security inventory, SQL security tests, migration drift check = zero unexplained drift.

## Gate G2 — Blocking Dependency Security

- [ ] Remove every `npm audit ... || true` release bypass.
- [ ] Fail required CI on unapproved High/Critical production vulnerabilities.
- [ ] Add an explicit, time-bounded risk-acceptance file for any exception with owner and expiry date.
- [ ] Run secret scanning across all refs and CI artifacts.
- [ ] Confirm rotation of credentials historically committed to environment files.

**Evidence:** security jobs return exit 0 with no unapproved High/Critical findings.

## Gate G3 — Required Build/Test Matrix

Every merge to `main` must require:

- [ ] Backend lint, build, unit tests, generic E2E, production E2E.
- [ ] Web typecheck, lint, unit/component tests, production build.
- [ ] Admin typecheck, lint, tests, production build.
- [ ] Voice typecheck, tests, build, real mediasoup smoke test.
- [ ] PWA service-worker build/manifest test.
- [ ] Database/RLS security test suite.
- [ ] Browser smoke tests for auth, discover, save, apply, deadline, settings, billing, developer key creation, and admin login.

## Gate G4 — Authorization

- [ ] Every privileged operation authorizes on the server, not only in client routing.
- [ ] Admin roles are server-owned and cannot be self-mutated by user profile updates.
- [ ] Clerk/Supabase identity mapping has one documented source of truth.
- [ ] Production trusts exactly one Clerk issuer/environment.
- [ ] API-key scopes and user tokens are tested for horizontal/vertical privilege escalation.

## Gate G5 — Data Protection

- [ ] Sensitive user data is not cached in shared/public service-worker caches.
- [ ] Uploads use content/type/size validation and private-by-default storage where appropriate.
- [ ] Account export/deletion covers all feature-owned tables and storage.
- [ ] Logs redact tokens, cookies, secrets, CVs, proof documents, payment payload secrets, RTP/ICE details, and private messages.
- [ ] Retention periods are documented for application notes, voice metadata, creator proofs, analytics, support, and billing.

## Gate G6 — Observability

- [ ] Replace no-op analytics paths that return synthetic success.
- [ ] Standardize request IDs across web/admin/API/voice/scraper.
- [ ] Emit structured events for major learner lifecycle transitions.
- [ ] Add dashboards for API latency/error rate, DB pool, notification queue, scraper jobs, billing webhooks, voice rooms, AI provider usage, and developer API traffic.
- [ ] Add alerts with owner, severity, threshold, and runbook link.

## Gate G7 — Performance

- [ ] Define Web Vitals budgets for public pages and authenticated app pages.
- [ ] Define API p50/p95/p99 latency budgets for critical endpoints.
- [ ] Test on mid-range Android profile and throttled 3G/4G.
- [ ] Move unbounded client-side datasets to server pagination/search before growth makes them unsafe.
- [ ] Add load tests for voice, opportunity feed, notifications, developer API, and admin scraper operations.

## Gate G8 — Accessibility & UX States

- [ ] WCAG 2.1 AA automated checks on primary flows.
- [ ] Keyboard-only completion of core web flows.
- [ ] Screen-reader labels for controls, state changes, validation, and dialogs.
- [ ] Reduced-motion behavior verified.
- [ ] Every screen has loading, empty, filtered-empty, auth-expired, network-failure, server-failure, retry, and success states where applicable.

## Gate G9 — Release & Rollback

- [ ] Feature flags exist for high-risk releases.
- [ ] Schema changes are backward-compatible across the deployment window.
- [ ] Every launch plan includes canary/percentage or limited-audience rollout where applicable.
- [ ] Rollback steps are executable without data corruption.
- [ ] A feature is not 5/5 until post-deploy smoke checks pass against production-like infrastructure.

## Global Definition of Done

A feature may be marked 5/5 only when all applicable gates above are green and its feature-specific plan has complete evidence in `13_VERIFICATION_EVIDENCE_TEMPLATE.md` format.
