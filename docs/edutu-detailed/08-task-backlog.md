# 08. Detailed Task Backlog

## Architecture and Repository Hygiene

1. Mark `edutu-platform/backend/services/services/api` as active backend in all READMEs.
2. Add status labels to Express scraper APIs: active, legacy, or archived.
3. Decide whether `edutumobile` remains top-level or moves under `edutu-platform`.
4. Create a package ownership map.
5. Create a generated-folder ignore policy for documentation and search.
6. Add architecture diagrams in Mermaid for runtime, data, auth, scraper, and mobile control.
7. Add a glossary of Edutu product terms.

## Backend

1. Generate OpenAPI docs for all NestJS endpoints.
2. Add controller-level route ownership comments.
3. Review `@Public()` usage.
4. Add DTO validation to every write endpoint.
5. Add e2e tests for profile, opportunities, recommendations, notifications, billing, and mobile control.
6. Add idempotency handling to billing webhooks.
7. Add service-role wrapper utilities.
8. Add audit logging for admin writes.
9. Add structured logging for request IDs and user IDs.
10. Version product APIs or document why they remain unversioned.

## Auth and Identity

1. Define canonical user ID type across backend, mobile, and Supabase.
2. Document Clerk-to-Supabase token template requirements.
3. Align standalone admin auth with backend admin auth.
4. Add tests for `toDatabaseUserId`.
5. Add migration plan for text user IDs vs UUID user IDs.
6. Document admin role bootstrap procedure.

## Data and Supabase

1. Choose canonical migration home.
2. Create schema drift CI check.
3. Create data dictionary for all tables.
4. Create table ownership matrix.
5. Consolidate bookmark/application table names.
6. Consolidate chat proxy function copies.
7. Consolidate billing entitlement tables.
8. Review all RLS policies.
9. Document service-role-only tables.
10. Add backup and restore runbook.

## Web and Admin

1. Consolidate `VITE_API_URL` and `VITE_BACKEND_URL` naming.
2. Decide on one admin surface or define responsibilities for both.
3. Add smoke tests for admin routes.
4. Add smoke tests for web app authenticated routes.
5. Document premium gates and feature entitlement checks.
6. Document Capacitor release process.
7. Add route-level loading/error state QA checklist.

## Mobile

1. Align `EXPO_PUBLIC_API_URL` default with active backend port.
2. Add end-to-end mobile smoke test plan.
3. Document push notification project ID ownership.
4. Document widget snapshot lifecycle.
5. Document mobile campaign targeting and rollback.
6. Reconcile RevenueCat and backend billing entitlement source.
7. Add tests for API offline cache fallback.
8. Add tests for deep link routing.

## Scraper and AI

1. Pick canonical scraper implementation.
2. Archive or deprecate old Express scraper endpoints if unused.
3. Add scraper source registry documentation.
4. Add scraper quality score report.
5. Add dedupe decision log.
6. Add AI route owner and budget limits.
7. Add prompt redaction policy.
8. Add malformed JSON tests for AI extraction.
9. Add fallback provider runbook.
10. Add source failure alerting.

## Operations

1. Add `.env.example` files for each runtime.
2. Add local startup script or documented launch order.
3. Add production readiness checklist.
4. Add incident runbooks to a permanent `docs/runbooks` folder.
5. Add dependency update policy.
6. Add secret rotation calendar.
7. Add dashboard for API errors, AI usage, scraper jobs, billing webhooks, and notification queue.
8. Add documentation review gate to PR template.

