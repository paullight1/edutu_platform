# Edutu Production Readiness and Security Review

Date: 2026-05-26

## Executive Summary

Edutu is not production-ready yet. The main production blockers are exposed local environment files, vulnerable dependencies in the auth and Next.js stacks, direct client-to-Supabase data access across admin/mobile/web, public write/AI endpoints that need stronger abuse controls, and missing server hardening in the NestJS bootstrap.

The backend build and admin production build completed. The admin build produced a large bundle warning. Mobile and web-app TypeScript checks did not complete cleanly in this environment and should be rerun in CI.

## Critical / High Findings

### S1. Local env files contain production secret names and must not be hosted or committed

Severity: Critical

Locations:
- `edutu-platform/backend/services/services/api/.env`
- `edutu-platform/backend/.env`
- `edutu-platform/admin/.env`
- `edutu-platform/edutu-web-app/.env`
- `edutumobile/.env`

Evidence:
- Backend env contains server-only keys including `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `PAYSTACK_SECRET_KEY`, `AI_KEY_ENCRYPTION_SECRET`, and AI provider keys.
- Mobile/admin/web env files exist in the workspace and expose public runtime config names.

Impact:
If these files are committed, uploaded, or included in builds, attackers can obtain database/admin/API credentials. Rotate any key that has ever been committed or shared.

Fix:
Keep only `.env.example` in source control. Store real values in Railway/Fly/Render/Vercel/EAS/Supabase secrets. Rotate leaked service role, Clerk, Paystack, AI, and webhook keys.

### S2. Vulnerable auth/framework dependencies block production release

Severity: Critical / High

Evidence from `npm audit --omit=dev`:
- `edutumobile`: 61 vulnerabilities, including 1 critical in Clerk SDK transitive packages.
- `edutu-platform/edutu-web`: critical Next.js advisories on `next@14.2.16`.
- `edutu-platform/backend/services/services/api`: 17 vulnerabilities, including high severity Clerk and axios advisories.
- `edutu-platform/edutu-web-app`: 4 vulnerabilities, including high severity Clerk/js-cookie advisories.
- `edutu-platform/admin`: 6 moderate vulnerabilities, including Quill XSS advisories.

Impact:
Auth bypass and framework-level vulnerabilities are release blockers for public production traffic.

Fix:
Upgrade Clerk packages, Next.js, axios, Supabase/realtime, Quill/react-quill or replace Quill. Rerun audits until no critical/high findings remain or document accepted risk.

### S3. Client apps bypass backend and directly access Supabase data

Severity: High

Locations:
- `edutu-platform/admin/src/lib/supabase.ts:1`
- `edutu-platform/admin/src/pages/Dashboard.tsx:45`
- `edutu-platform/edutu-web-app/src/lib/supabaseClient.ts:14`
- `edutumobile/packages/core/src/services/supabase.ts:15`

Evidence:
Admin, web app, and mobile instantiate Supabase clients in the browser/mobile runtime and many services call `.from(...)` directly.

Impact:
This conflicts with the project rule that clients should call the NestJS backend. Security now depends heavily on Supabase RLS and client-bundled table access. Admin functions are especially risky if RLS policies are incomplete.

Fix:
Move admin/user data operations behind authenticated NestJS endpoints. Keep Supabase direct access only for auth, realtime if necessary, and carefully scoped storage uploads with RLS.

### S4. Public AI/write endpoints need stronger abuse controls

Severity: High

Locations:
- `edutu-platform/backend/services/services/api/src/roadmaps/roadmaps.controller.ts:190`
- `edutu-platform/backend/services/services/api/src/blog/blog.controller.ts:95`
- `edutu-platform/backend/services/services/api/src/blog/blog.controller.ts:110`
- `edutu-platform/backend/services/services/api/src/opportunities/opportunities.controller.ts:246`

Evidence:
`POST /roadmaps/ai/assist`, blog comments, likes, and bulk import are public. Bulk import uses an API key, but the route is still publicly reachable.

Impact:
Unauthenticated callers can drive AI cost, spam public content, inflate likes, or attempt brute-force/abuse against ingestion endpoints.

Fix:
Add endpoint-specific throttles, CAPTCHA or auth where appropriate, moderation queues for comments, signed webhook headers, replay protection, and request body limits.

## Medium Findings

### S5. NestJS bootstrap lacks visible production hardening

Severity: Medium

Location:
- `edutu-platform/backend/services/services/api/src/main.ts:5`
- `edutu-platform/backend/services/services/api/src/main.ts:16`
- `edutu-platform/backend/services/services/api/src/app.module.ts:30`

Evidence:
No visible Helmet/security headers, global validation pipe, API version/prefix, body size limit, or explicit proxy/edge assumptions. Throttling is global at 100/minute but high-risk endpoints need tighter limits.

Fix:
Add Helmet, global validation for DTO-backed routes, body limits, structured logging, request IDs, and explicit deployment docs for proxy/TLS/rate limits.

### S6. Browser-exposed integration keys and webhooks

Severity: Medium

Locations:
- `edutu-platform/admin/src/pages/Settings.tsx:87`
- `edutu-platform/admin/src/pages/Settings.tsx:101`
- `edutu-platform/edutu-web-app/src/services/n8nIntegration.ts:3`

Evidence:
Admin settings read `VITE_OPENROUTER_API_KEY`, store API settings in `localStorage`, and web app exposes `VITE_N8N_WEBHOOK_URL` to the browser.

Impact:
Any `VITE_*` value and `localStorage` setting is public to the browser. Secret webhooks or AI keys cannot live here.

Fix:
Move integration secrets and webhook calls to the backend. Store admin integration settings server-side with encryption at rest.

### S7. Mobile build config needs release cleanup

Severity: Medium

Locations:
- `edutumobile/app.config.js:1`
- `edutumobile/app.config.js:72`
- `edutumobile/app.config.js:147`
- `edutumobile/eas.json:34`

Evidence:
App icon sizes are marked TODO, `google-services.json` is present locally, Expo updates are enabled, and production EAS config only specifies Android app bundle.

Fix:
Resize assets, manage Firebase files via EAS credentials/secrets, configure iOS production submit profile, confirm Android package/iOS bundle identifiers, and define an OTA update/channel policy with rollback.

## Hosting Guidance

Must be hosted:
- NestJS API at `edutu-platform/backend/services/services/api`
- Supabase Postgres, auth, storage, edge functions, migrations
- Admin dashboard if used operationally
- Public web app / PWA if it is part of the product
- Next.js waitlist site if it remains public
- Scraper workers/jobs if they run continuously or on schedule
- Observability: logs, error tracking, uptime checks, and backup monitoring

Must not be hosted or publicly served:
- `.env` files and secrets
- `node_modules`, native build caches, Expo `.expo`, iOS `Pods`, Android build outputs
- Local dev servers, `vite preview`, `next dev`, Expo Metro
- Internal scripts, seed scripts, migration credentials, local Firebase credential files
- Archived/experimental `other-files` unless explicitly productized

## Verification Run

Completed:
- Backend: `npm run build` passed.
- Admin: `npm run build` passed with a 919 kB chunk warning.
- Dependency audits completed for backend, admin, mobile, web app, and waitlist site.

Inconclusive:
- `edutumobile npm run typecheck` and `edutu-web-app npm run typecheck` did not complete cleanly in this environment and should be run in CI/local terminal.

