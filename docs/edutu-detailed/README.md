# Edutu Detailed Documentation Pack

Generated from local repository inspection on 2026-05-22.

This pack expands the first architecture HTML snapshot into subsystem-level documentation for the whole codebase. It covers the active platform, the mobile app, the waitlist site, scraping systems, Supabase assets, the launch video package, and archived/experimental folders.

## Document Index

| File | Purpose |
| --- | --- |
| `00-codebase-inventory.md` | Repository map, package inventory, generated/file ownership notes |
| `01-system-architecture.md` | Runtime architecture, boundaries, auth/data flow, external services |
| `02-backend-api.md` | NestJS API modules, endpoint map, guards, data access, risks |
| `03-web-admin-waitlist.md` | Admin dashboard, main web app, embedded admin, waitlist landing page |
| `04-mobile-app.md` | Expo Router app, shared core package, native features, mobile Supabase functions |
| `05-data-supabase.md` | Drizzle schema, Supabase SQL homes, RLS, edge functions, migration risks |
| `06-scraping-ai-automation.md` | Crawl4AI scraper, legacy scraper APIs, AI provider routing, automation flows |
| `07-operations-runbooks.md` | Local commands, environment variables, release/runbook checklists |
| `08-task-backlog.md` | Long actionable task backlog by workstream |
| `09-review-findings.md` | Concrete risks and defects found during multi-agent/code review |
| `edutu-detailed-documentation.html` | Human-readable HTML display document for the documentation pack |

## Critical Repository Facts

- The active NestJS API is at `edutu-platform/backend/services/services/api`.
- There are older Express scraper API files at `edutu-platform/backend` and `edutu-platform/admin/backend`; treat them as secondary/legacy unless explicitly deployed.
- The mobile app lives at top-level `edutumobile`, not inside `edutu-platform`.
- There are multiple Supabase migration homes. This is one of the largest architectural risks in the repo.
- The intended architecture is client to backend API to Supabase, but several client surfaces still use Supabase directly for auth, RLS data, and edge functions.
- The canonical opportunity schema used by scraper/admin has fields not always present in the base web-app schema. Deployment order matters.
