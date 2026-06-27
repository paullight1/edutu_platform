# Edutu Platform Architecture

Generated from the local platform workspace on 2026-05-23.

## Repository Model

Edutu is an intentional multi-repo system.

- `edutu-platform` owns the backend API, web app, admin, Scholarship Engine docs site, platform scraper, shared Supabase assets, and platform docs.
- `edutumobile` owns the Expo mobile app, mobile core package, mobile-specific Supabase functions/migrations, and native widgets.
- The parent folder is a local workspace container, not a monorepo boundary.

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
| Standalone Admin | `admin` | React, Vite, Supabase JS | Operational dashboard for users, opportunities, creators, roadmaps, scraper, mobile control |
| Main Web App | `edutu-web-app` | React, Vite, Capacitor, PWA | User app, public pages, premium gates, creator flows, embedded admin routes |
| Scholarship Engine Docs Site | `edutu-web` | Next.js | Public Scholarship Engine docs and onboarding site |
| Python Scraper | `crawl4ai-scraper` | Python, Crawl4AI | Opportunity crawling, extraction, cleaning, optional Supabase persistence |
| Shared Supabase Assets | `supabase` | SQL, Deno edge functions | Shared migrations and edge functions |

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

- Multiple Supabase migration folders can drift without explicit ownership.
- The direct-Supabase versus backend-API rule is not consistently documented per feature.
- Standalone admin and embedded web admin overlap.
- Some docs referenced `/scraper`, while the standalone admin route currently uses `/edutu-engine`.
- Local workspace copies include `node_modules`, which adds scan noise and should not drive architecture conclusions.

## Architecture Decisions To Capture

1. Edutu is an intentional multi-repo system.
2. `backend/services/services/api` is the canonical platform backend path.
3. Backend API is the default place for privileged business logic.
4. Direct Supabase access requires explicit feature-level ownership and RLS design.
5. A single admin surface strategy should be chosen or the split should be formally documented.
