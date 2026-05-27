# Backend API Documentation

Backend path:

```bash
edutu-platform/backend/services/services/api
```

Run commands from that directory.

## API Runtime

- Framework: NestJS
- Auth: global `ClerkAuthGuard`
- Admin authorization: `AdminGuard`
- Validation: DTOs and Zod validation pipes
- Data access: Drizzle ORM plus selected server-side Supabase clients
- Rate limit: global Nest throttler, currently `100` requests per `60000ms`

## Auth Categories

| Category | Meaning |
| --- | --- |
| Public | Decorated with `@Public()` or class-level public handling |
| Authenticated | Requires a valid Clerk token or Supabase token fallback |
| Admin | Uses `AdminGuard` in addition to authentication |
| Partner API key | Public to the global auth guard, then protected by `EdutuApiKeyGuard` |
| Webhook | Public route intended for provider callbacks; must verify provider signature in service logic |

## Module Matrix

| Module | Base route | Auth category | Purpose |
| --- | --- | --- | --- |
| App | `/` | Authenticated unless decorated public | Root/health-style response |
| Profile | `/profile` | Authenticated | Profile, completeness, opportunity preferences, notification preferences |
| Me | `/me` | Authenticated | User bookmarks, applications, and deadlines |
| Goals | `/goals` | Authenticated | User goal CRUD |
| Opportunities | `/opportunities` | Mixed public/auth/admin | Public catalog, user recommendations/preferences/signals, admin moderation/import/sync |
| Roadmaps | `/roadmaps` | Mixed public/auth/admin | Roadmap catalog, enrollment, progress, recommendations, feedback, AI assist |
| Creator | `/creator`, `/marketplace`, `/wallet`, `/admin/creator-applications` | Mixed authenticated/admin | Creator applications, creator status, marketplace listings, enrollments, wallet |
| Billing | `/billing` | Authenticated plus public webhook | Billing status, checkout, Paystack webhook |
| AI | `/ai` | Admin | AI provider keys, routes, tests, configuration |
| CV | `/cv` | Authenticated | AI CV draft and tailoring |
| Quiz | `/quiz` | Authenticated plus selected admin | Quiz generation, attempts, admin delete |
| Flashcards | `/flashcards` | Mixed public/auth/admin | Decks, cards, reviews, sessions, stats, generation |
| Blog | `/blog` | Mixed public/admin | Public content, admin CRUD, comments, moderation, likes |
| Scraper | `/api/scraper` | Admin | Scraper run, source CRUD, job history, stats, settings |
| Mobile Control | `/mobile-control` | Mixed public/auth/admin | Mobile config, campaign events, admin campaign/flag/feed CRUD |
| Mobile Control Admin | `/admin` | Admin | Legacy/admin aliases for mobile campaigns, flags, widget feeds |
| Notifications | `/notifications` | Authenticated plus admin operations | User notifications, preferences, push tokens, broadcasts, queue |
| Partner API | `/v1` | Partner API key | Public partner API for opportunities, recommendations, and event ingestion |

## Endpoint Groups

### Public and Catalog Routes

- `GET /opportunities`
- `GET /opportunities/:id`
- `GET /opportunities/apify-sync`
- `GET /blog`
- `GET /blog/categories`
- `GET /blog/featured`
- `GET /blog/:id`
- `GET /blog/slug/:slug`
- `GET /blog/:id/comments`
- `POST /blog/comments`
- `POST /blog/:id/like`
- `GET /roadmaps`
- `GET /roadmaps/slug/:slug`
- `GET /roadmaps/recommended`
- `GET /roadmaps/stats`
- `GET /roadmaps/:id`
- `GET /flashcards/decks/public`
- `GET /mobile-control/config`

### Authenticated User Routes

- `GET /profile`
- `PATCH /profile`
- `GET /profile/completeness`
- `GET /profile/preferences`
- `PATCH /profile/preferences/opportunities`
- `PATCH /profile/preferences/notifications`
- `GET /me/opportunities/bookmarks`
- `GET /me/opportunities/:id/bookmark`
- `POST /me/opportunities/:id/bookmark`
- `DELETE /me/opportunities/:id/bookmark`
- `GET /me/applications`
- `POST /me/applications`
- `PATCH /me/applications/:id`
- `DELETE /me/applications/:id`
- `GET /me/deadlines`
- `POST /goals`
- `GET /goals`
- `GET /goals/:id`
- `PATCH /goals/:id`
- `DELETE /goals/:id`
- `POST /opportunities/recommendations/query`
- `POST /opportunities/recommendations`
- `GET /opportunities/preferences`
- `PATCH /opportunities/preferences`
- `POST /opportunities/signals`
- `GET /opportunities/sync`
- `POST /roadmaps/adopt/:roadmapId`
- `POST /roadmaps/enroll/:roadmapId`
- `GET /roadmaps/my-enrollments`
- `GET /roadmaps/enrollments/:enrollmentId/calendar`
- `POST /roadmaps/progress/:roadmapId`
- `POST /roadmaps/intent`
- `GET /roadmaps/intent`
- `POST /roadmaps/feedback`
- `GET /roadmaps/feedback/:roadmapId`
- `POST /roadmaps/ai/assist`
- `POST /cv/ai/draft`
- `POST /cv/ai/tailor`
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`
- `DELETE /notifications/:id`
- `GET /notifications/preferences`
- `PATCH /notifications/preferences`
- `POST /notifications/push-token`
- `POST /mobile-control/events`

### Admin Routes

- `GET /opportunities/admin/list`
- `GET /opportunities/admin/stats`
- `POST /opportunities`
- `PATCH /opportunities/:id`
- `PATCH /opportunities/:id/status`
- `POST /opportunities/:id/approve`
- `POST /opportunities/:id/reject`
- `POST /opportunities/bulk-import`
- `DELETE /opportunities/:id`
- `GET /roadmaps/admin/list`
- `POST /roadmaps`
- `POST /roadmaps/creator`
- `PUT /roadmaps/:id`
- `DELETE /roadmaps/:id`
- `GET /ai/config`
- `POST /ai/provider-keys`
- `POST /ai/routes`
- `POST /ai/test`
- `POST /api/scraper/run`
- `GET /api/scraper/sources`
- `POST /api/scraper/sources`
- `PATCH /api/scraper/sources/:id`
- `DELETE /api/scraper/sources/:id`
- `GET /api/scraper/jobs`
- `DELETE /api/scraper/jobs/:id`
- `GET /api/scraper/stats`
- `GET /api/scraper/settings`
- `POST /api/scraper/settings`
- `POST /notifications/admin/broadcast`
- `GET /notifications/admin/queue`
- `POST /notifications/admin/process-due`
- `GET /mobile-control/admin/campaigns`
- `POST /mobile-control/admin/campaigns`
- `PATCH /mobile-control/admin/campaigns/:id`
- `DELETE /mobile-control/admin/campaigns/:id`
- `GET /mobile-control/admin/feature-flags`
- `POST /mobile-control/admin/feature-flags`
- `PATCH /mobile-control/admin/feature-flags/:id`
- `DELETE /mobile-control/admin/feature-flags/:id`
- `GET /mobile-control/admin/widget-feeds`
- `POST /mobile-control/admin/widget-feeds`
- `PATCH /mobile-control/admin/widget-feeds/:id`
- `DELETE /mobile-control/admin/widget-feeds/:id`
- `GET /admin/mobile-campaigns`
- `POST /admin/mobile-campaigns`
- `PUT /admin/mobile-campaigns/:id`
- `DELETE /admin/mobile-campaigns/:id`
- `GET /admin/mobile-feature-flags`
- `POST /admin/mobile-feature-flags`
- `PUT /admin/mobile-feature-flags/:id`
- `DELETE /admin/mobile-feature-flags/:id`
- `GET /admin/widget-feeds`
- `POST /admin/widget-feeds`
- `PUT /admin/widget-feeds/:id`
- `DELETE /admin/widget-feeds/:id`

### Webhook and Partner Routes

- `POST /billing/webhooks/paystack` - public webhook route; provider verification must be handled in billing service logic.
- `GET /v1/health` - protected by partner API key guard.
- `GET /v1/opportunities` - requires `opportunities:read` scope.
- `GET /v1/opportunities/stats` - requires `opportunities:read` scope.
- `GET /v1/opportunities/:id` - requires `opportunities:read` scope.
- `POST /v1/recommendations` - requires `recommendations:read` scope.
- `POST /v1/events` - requires `events:write` scope.

## Documentation Gaps To Close

1. Generate or maintain an OpenAPI document from controllers.
2. Confirm all public endpoints are intentionally public.
3. Confirm all webhook endpoints verify signatures and reject replayed callbacks.
4. Collapse duplicate mobile-control admin aliases or document why both exist.
5. Add request/response examples for each endpoint group.
