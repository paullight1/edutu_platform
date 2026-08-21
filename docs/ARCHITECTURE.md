# Edutu Platform Architecture

Generated from the local platform workspace on 2026-05-23 and updated during the 2026-08 architecture simplification.

## Repository Model

Edutu is an intentional multi-repo system in transition. This checkout contains the platform surfaces plus a working copy of the mobile application while package/repository ownership is being normalized.

- `edutu-platform` owns the backend API, web app, admin, Scholarship Engine docs site, platform scraper, shared Supabase assets, and platform docs.
- Mobile product code currently exists under `edutumobile/`; its long-term package/repository boundary is handled explicitly by the architecture-simplification plan rather than assumed from directory placement.

## System Context

```text
Users and admins
  -> web, admin, mobile, docs clients
  -> NestJS API and selected Supabase edge functions
  -> Supabase Postgres
  -> external services: Clerk, Gemini, OpenRouter, Paystack, RevenueCat, Apify, n8n
```

## Runtime Components

| Component | Path | Runtime | Responsibility |
| --- | --- | --- | --- |
| Backend API | `backend/services/services/api` | NestJS, Drizzle, Postgres | Business logic, auth verification, AI routing, scraper controls, data access, admin endpoints |
| Voice Gateway | `backend/services/services/voice` | Node.js | Realtime voice transport and related gateway behavior |
| Standalone Admin | `admin` | React, Vite, Supabase JS | Operational dashboard for users, opportunities, creators, roadmaps, scraper, mobile control |
| Main Web App | `edutu-web-app` | React, Vite, Capacitor, PWA | User app, public pages, premium gates, creator flows, admin portal handoff |
| Scholarship Engine Docs Site | `edutu-web` | Next.js | Public Scholarship Engine docs and onboarding site |
| Python Scraper | `crawl4ai-scraper` | Python, Crawl4AI | Opportunity crawling, extraction, cleaning, optional Supabase persistence |
| Shared Supabase Assets | `supabase` | SQL, Deno edge functions | Shared migrations and edge functions |

## Backend Runtime Decision

There is one canonical Node backend API: the NestJS service at `backend/services/services/api`.

The former root-level Express scraper API was retired after verifying that:

- GitHub CI builds/tests the NestJS service, not a root `backend` npm package;
- the production Render manifest is owned by `backend/services/services/api/render.yaml`;
- the admin scraper uses the authenticated Nest route family at `/api/scraper`;
- current scraper orchestration, source management, run control, review, settings, and enrichment live in the Nest scraper module;
- the Python `crawl4ai-scraper` remains a separate extraction service where applicable.

Architecture governance now rejects reintroducing the retired root `backend/server.js`, `scraper.js`, `database.js`, or standalone root backend npm package.

The `backend/services/services/...` physical nesting is still debt; it will be flattened only after logical ownership is stable and all CI/deployment paths can move atomically.

## Backend Boundary

The backend API is the main trust boundary. It should own:

- privileged Supabase service-role operations
- AI provider keys and model routing
- billing/webhook logic
- scraper run controls
- admin-only mutation paths
- user-owned business logic that must not be enforced only in the client

## Client Boundary

Clients may call:

- the backend API for business logic and privileged workflows
- Supabase table APIs where RLS and token bridging are explicitly designed
- Supabase edge functions for selected serverless features such as chat proxy or webhooks

Every direct Supabase access path should have a documented reason.

## Core Processes

### Authenticated API Request

1. Client obtains a Clerk token or Supabase-compatible token.
2. Client sends `Authorization: Bearer <token>` to a protected backend endpoint.
3. `ClerkAuthGuard` skips routes marked with `@Public()`.
4. The guard verifies Clerk tokens with `CLERK_SECRET_KEY`.
5. If Clerk verification fails, it tries `supabase.auth.getUser(token)`.
6. The guard attaches `request.user` with database user ID, auth ID, email, role, and auth provider.
7. Feature services execute with Drizzle or server-side Supabase clients.

### Opportunity Ingestion

1. Admin or scheduler triggers scraper execution.
2. Scraper service loads enabled sources and scraper settings from Supabase.
3. List/detail pages are fetched with rate limits and browser-like headers.
4. Cheerio extracts page content.
5. AI routes enrich structured opportunity fields when needed.
6. Normalized opportunities are saved for review and publication.

### AI Routing

1. Feature service calls `AiService.generateText()` or `generateJson()`.
2. `AiService` resolves feature config from `ai_routes` or defaults.
3. Provider adapter executes through Gemini or OpenRouter.
4. Structured JSON responses are normalized and parsed.
5. Usage and errors are logged to `ai_usage_logs`.

### Mobile Control Plane

1. Mobile app calls `/mobile-control/config`.
2. Backend returns active campaigns, feature flags, widget feeds, and server time.
3. `MobileCampaignHost` renders eligible campaigns.
4. Campaign events are recorded through `/mobile-control/events`.
5. Admin manages campaigns, flags, and widget feeds through admin routes.

## Current Architecture Risks

- Multiple historical Supabase migration folders still require explicit canonical ownership.
- The direct-Supabase versus backend-API rule is not consistently documented per feature.
- Standalone admin and historical embedded-admin concepts overlap in documentation/code paths.
- Large UI/service files still combine too many responsibilities.
- Root and mobile package ownership is not yet normalized.
- The repeated `backend/services/services` physical path remains confusing until the final path-migration phase.

## Architecture Decisions

1. `backend/services/services/api` is the only canonical platform backend API until the physical-layout phase.
2. Backend API is the default place for privileged business logic.
3. Direct Supabase access requires explicit feature-level ownership and RLS design.
4. Shared migrations and packages will have one canonical owner before physical path moves.
5. Giant files are decomposed by cohesive responsibility with behavior frozen by tests.
6. Physical path flattening happens last, after logical boundaries are stable.
