# 02. Backend API Documentation

## Active Backend Path

The active NestJS API is:

```bash
cd edutu-platform/backend/services/services/api
```

The path is intentionally documented because `backend/` also contains an older Express scraper server.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

## Runtime Setup

`src/main.ts`:

- Creates Nest app with `rawBody: true` for webhook support.
- Enables CORS for localhost admin/web/mobile and `ADMIN_URL`, `MOBILE_APP_URL`.
- Allows `X-Edutu-API-Key` for partner API calls.
- Reads `PORT`, defaulting to `3000`.

`src/app.module.ts`:

- Loads config, scheduler, throttler, auth, product modules, profile, and partner API.
- Applies global `ThrottlerGuard` at 100 requests/minute.
- `AuthModule` also registers global `ClerkAuthGuard`.

## Environment Variables

| Variable | Used By | Purpose |
| --- | --- | --- |
| `PORT` | `main.ts` | API port. |
| `DATABASE_URL` | `src/db/index.ts`, Drizzle | PostgreSQL connection. |
| `DATABASE_POOL_MAX` | DB pool | Optional pool size. |
| `DATABASE_IDLE_TIMEOUT_MS` | DB pool | Optional idle timeout. |
| `DATABASE_CONNECTION_TIMEOUT_MS` | DB pool | Optional connection timeout. |
| `SUPABASE_URL` | auth, billing, scraper, mobile control, opportunities | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role clients | Backend privileged Supabase access. |
| `CLERK_SECRET_KEY` | auth guard | Clerk JWT verification. |
| `ADMIN_EMAILS` | admin guard | Admin email allowlist. |
| `GEMINI_API_KEY` | AI Gemini adapter | Gemini fallback key. |
| `OPENROUTER_API_KEY` | AI OpenRouter adapter | OpenRouter fallback key. |
| `OPENAI_API_KEY` | AI service fallback | OpenAI provider fallback if used. |
| `GROQ_API_KEY` | AI service fallback | Groq provider fallback if used. |
| `AI_KEY_ENCRYPTION_SECRET` | AI encryption | Preferred key encryption secret. |
| `OPENROUTER_REFERRER` | OpenRouter adapter | HTTP referer header. |
| `OPENROUTER_TITLE` | OpenRouter adapter | App title header. |
| `PAYSTACK_SECRET_KEY` | billing | Checkout/webhook calls. |
| `PAYSTACK_PLAN_MONTHLY` | billing | Paystack monthly plan code. |
| `PAYSTACK_PLAN_YEARLY` | billing | Paystack yearly plan code. |
| `BILLING_PUBLIC_URL` | billing | Checkout callback base URL. |
| `FRONTEND_URL` | billing | Fallback callback base URL. |
| `ADMIN_URL` | CORS/billing | Admin origin/fallback. |
| `MOBILE_APP_URL` | CORS | Mobile app origin/deep link allowlist. |
| `SERPER_API_KEY` | opportunities | Search/sync enrichment. |
| `APIFY_WEBHOOK_API_KEY` | opportunities controller | Webhook protection. |
| `EDUTU_API_KEYS` | partner API | Local/static partner API keys. |
| `NOTIFICATION_EMAIL_WEBHOOK_URL` | notifications | Optional email delivery webhook. |
| `OPENROUTER_MODEL` | edge chat proxy | Optional model override for Supabase chat function. |
| `CHAT_RATE_WINDOW_MINUTES` | edge chat proxy | Chat function rate window. |
| `CHAT_RATE_MAX_REQUESTS` | edge chat proxy | Chat function request cap. |
| `CHAT_SYSTEM_PROMPT` | edge chat proxy | Chat function system prompt. |

## Module and Endpoint Map

| Module | Controller Root | Endpoints |
| --- | --- | --- |
| App | `/` | `GET /` |
| Goals | `/goals` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| Profile | `/profile` | `GET /`, `PATCH /`, `GET /completeness`, `GET /preferences`, `PATCH /preferences/opportunities`, `PATCH /preferences/notifications` |
| Opportunities | `/opportunities` | `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`, recommendations, preferences, signals, admin list/stats, sync/import/approval routes |
| Roadmaps | `/roadmaps` | public/admin lists, creator creation, adoption/enrollment, calendar, progress, intent, recommended, feedback, AI assist, stats |
| Creator | `/` | wallet, creator application/status/dashboard, marketplace listings/enrollments, admin creator application review |
| Blog | `/blog` | list, categories, featured, detail, slug, create, update, delete, comments, moderation, like |
| Quiz | `/quiz` | generate, list, detail, submit, attempts, delete |
| Flashcards | `/flashcards` | deck/card CRUD, review queue, review submit, sessions, stats, AI generation |
| CV | `/cv` | `POST /ai/draft`, `POST /ai/tailor` |
| AI | `/ai` | config, provider keys, routes, test |
| Billing | `/billing` | status, checkout, Paystack webhook |
| Notifications | `/notifications` | inbox, read/delete, preferences, push token, admin broadcast, queue, process due |
| Mobile Control | `/mobile-control` | config, events, admin campaigns, admin flags, admin widget feeds |
| Mobile Control Admin Alias | `/admin` | mobile campaigns, mobile feature flags, widget feeds |
| Scraper | `/api/scraper` | run, sources, jobs, stats, settings |
| Partner API | `/v1` | health, list opportunities, get opportunity, recommendations |

## Auth and Authorization

### `ClerkAuthGuard`

Flow:

1. Skips routes marked with `@Public()`.
2. Requires `Authorization: Bearer <token>`.
3. Attempts Clerk token verification with `CLERK_SECRET_KEY`.
4. Converts Clerk subject to DB UUID using `toDatabaseUserId`.
5. Loads profile role from Drizzle `profiles`.
6. If Clerk verification fails, tries Supabase `auth.getUser(token)` with service-role client.
7. Attaches normalized `request.user`.

### `AdminGuard`

Allows a request if:

- User email is listed in `ADMIN_EMAILS`, or
- `request.user.role === "admin"`.

### `EdutuApiKeyGuard`

Used by `/v1` partner routes. Accepts API key via:

- `X-Edutu-API-Key`
- `Authorization: Bearer <api-key>`

Production keys should be stored hashed in `api_consumers.api_key_hash`; local development can use `EDUTU_API_KEYS`.
The guard also enforces scopes and monthly quota using `api_consumers` and `api_usage_events`.

## Data Access Patterns

| Pattern | Examples | Notes |
| --- | --- | --- |
| Drizzle direct queries | goals, profiles, opportunities, AI tables, notifications | Preferred backend-owned SQL path. |
| Supabase service role | scraper, admin opportunity list, billing, mobile control | Bypasses RLS; should be wrapped and audited. |
| AI adapters | CV, quiz, scraper extraction, recommendations, roadmaps | Routed through `AiService`. |
| Scheduled work | scraper schedule, notifications due processing | Uses `@nestjs/schedule`. |
| Webhooks | billing Paystack, Apify sync/webhook paths | Require raw body or API key validation. |

## Important Backend Findings

- `ProfileModule` and `EdutuApiModule` are active imports in `AppModule`; these were missing from the first short overview.
- Partner API docs already exist under `docs/edutu-api.md`; this documentation pack references but does not replace them.
- Product API contract already documents the next migration of bookmarks/applications/deadlines behind backend routes.
- The backend uses both Drizzle schema tables and Supabase tables that are created by migrations in sibling folders.
- Public opportunity list/detail prefer canonical Supabase opportunities, then fall back to Drizzle.
- Partner `/v1` routes use Drizzle opportunities, which can differ from canonical Supabase opportunities.
- Scraper startup can register a dynamic cron job from `scraper_config`.
- AI route fields include fallback provider/model, but current service behavior does not implement fallback generation after primary failure.
- Marketplace enrollment/credit updates should be wrapped in a database transaction before production financial use.
- `n8n-webhook` edge function needs review because inspection found it may proceed when `x-api-key` is absent.

## Backend Risks

1. Multiple global guards can interact in surprising order: `ClerkAuthGuard` from `AuthModule`, plus global `ThrottlerGuard` in `AppModule`.
2. Service-role Supabase calls should have consistent audit logging.
3. Controller endpoint coverage is broad, but automated e2e coverage appears limited.
4. API versioning exists only for partner API under `/v1`; internal product routes are unversioned.
5. Some admin aliases duplicate mobile-control endpoints and need deprecation or clear support policy.
6. Scheduled scraper runs need a lock to avoid overlapping executions.
7. Scraper retention should not delete non-scraper-owned opportunities.
8. Some Zod schemas exist but are not applied in controllers, especially roadmaps.
9. Notifications store quiet hours and dedupe keys, but delivery enforcement/uniqueness needs confirmation.
