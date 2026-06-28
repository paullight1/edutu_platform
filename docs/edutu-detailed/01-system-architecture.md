# 01. System Architecture

## Architecture Thesis

Edutu is an opportunity discovery, planning, and preparation platform. The core loop is:

1. Acquire opportunities through scraping, admin import, or partner API ingestion.
2. Normalize and enrich opportunity data with AI and admin review.
3. Match opportunities to user profiles, goals, preferences, and behavior signals.
4. Convert opportunities into roadmaps, deadlines, applications, CV preparation, marketplace packages, and notifications.
5. Feed user actions and admin decisions back into ranking and operations.

## Runtime Surfaces

| Surface | Path | Primary Users | Responsibilities |
| --- | --- | --- | --- |
| NestJS API | `edutu-platform/backend/services/services/api` | Web, mobile, admin, partners | Authenticated API, data writes, AI, billing, notifications, scraper control, mobile control, partner API. |
| Standalone Admin | `edutu-platform/admin` | Internal operators | Dashboard, opportunities, users, creators, roadmaps, blog, scraper, mobile control. |
| Main Web App | `edutu-platform/edutu-web-app` | Students/users/admins | Landing, authenticated app, opportunities, goals, roadmaps, marketplace, CV, billing, embedded admin. |
| Mobile App | `edutumobile` | Students/users/admins | Native user app, offline cache, push notifications, widgets, mobile campaigns, CV/chat/goals. |
| Waitlist Site | `edutu-platform/edutu-web` | Prospects | Waitlist capture and marketing landing page. |
| Python Scraper | `edutu-platform/crawl4ai-scraper` | Data/ops | Crawl sources, extract scholarships, clean data, save to Supabase. |
| Legacy Express Scraper APIs | `edutu-platform/backend`, `edutu-platform/admin/backend` | Transitional/admin tooling | Scrape URL/bulk/upload/discover endpoints; Apify/Gemini integration. |
| Supabase Edge Functions | Multiple `supabase/functions` folders | Apps/platform | Chat proxy, webhooks, scrape function, account deletion, Clerk/RevenueCat webhooks. |
| Launch Video | `edutu-launch-video` | Marketing/team | Remotion launch video and assets. |

## Intended Boundary

The product guideline says:

```text
Client apps -> NestJS backend API -> Supabase
```

The actual implementation is mixed:

- Backend-owned flows use NestJS modules and Drizzle/Supabase service role.
- Web and mobile still use Supabase clients directly for selected RLS data and edge function calls.
- Standalone admin uses Supabase auth directly for admin session and role checks.
- Mobile uses Clerk for auth and injects a Clerk token into Supabase client access.

This is acceptable as a transitional state, but it needs an explicit exception register.

## Auth Architecture

| Layer | Implementation | Notes |
| --- | --- | --- |
| User auth, web app | `@clerk/clerk-react` in `edutu-web-app` | `VITE_CLERK_PUBLISHABLE_KEY` required in `src/main.tsx`. |
| User auth, mobile | `@clerk/clerk-expo` in `edutumobile/app/_layout.tsx` | Uses secure token cache and Clerk loaded provider. |
| Backend guard | `ClerkAuthGuard` | Verifies Clerk bearer tokens and falls back to Supabase tokens if configured. |
| Backend admin guard | `AdminGuard` | Allows `ADMIN_EMAILS` or `profile.role === "admin"`. |
| Standalone admin auth | Supabase auth | Checks `profiles.role` directly in `admin/src/App.tsx`. |
| Partner API auth | `EdutuApiKeyGuard` | Uses `X-Edutu-API-Key` or bearer API key; supports `EDUTU_API_KEYS` fallback. |

## Data Architecture

| Layer | Tooling | Notes |
| --- | --- | --- |
| Core relational schema | Drizzle ORM in NestJS API | `src/db/schema.ts` defines core tables. |
| Database client | `pg` pool and Drizzle | `src/db/index.ts` reads `DATABASE_URL`. |
| Supabase client | service-role backend clients | Used by scraper, opportunities admin, auth fallback, billing, mobile control. |
| Client Supabase | anon clients with token bridge | Web/mobile direct table access remains for some features. |
| SQL migrations | Several homes | Backend API, web app, mobile, shared platform, admin, archived scraper. |

## External Services

| Service | Used For | Code Evidence |
| --- | --- | --- |
| Clerk | Auth identity | Backend auth guard, web app main, mobile root layout. |
| Supabase | Postgres, RLS, storage, edge functions | Drizzle DB URL, Supabase clients, migrations. |
| Google Gemini | AI generation/extraction | `GeminiAdapter`, scraper/roadmap/CV/quiz routes. |
| OpenRouter | AI chat/coaching | `OpenRouterAdapter`, web app settings, AI routes. |
| Paystack | Billing checkout/webhooks | `billing.service.ts`, `billing.controller.ts`. |
| RevenueCat | Mobile subscription webhook and client payments | `edutumobile/supabase/functions/revenuecat-webhook`, `payments.ts`. |
| Expo Notifications | Push tokens and local notifications | `edutumobile/lib/notifications.ts`, backend notifications. |
| n8n | Webhook integration | `n8nIntegration.ts`, Supabase function `n8n-webhook`. |
| Apify | Historical/secondary scraper actors | `admin/backend/apify-client.js`, `opencode.json`, archived scraper. |

## Key Architectural Risks

1. Multiple database schema homes can drift.
2. Client-direct Supabase writes can bypass backend validation.
3. Legacy Express scraper APIs can be confused with active NestJS API.
4. Auth identity types differ between Clerk IDs, UUID-shaped backend IDs, and mobile text IDs.
5. Service-role clients need auditing and strict wrappers.
6. AI route flexibility needs cost, privacy, and fallback governance.

