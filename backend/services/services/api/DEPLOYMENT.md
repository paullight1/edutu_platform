# Edutu API Production Deployment

## Service

Deploy this directory as the backend service:

```bash
edutu-platform/backend/services/services/api
```

Build and start commands for a Node host:

```bash
npm ci
npm run build
npm run start:prod
```

Docker hosts can use the included `Dockerfile`.

## Required Environment

Use `.env.example` as the source of truth. Required for production:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLERK_SECRET_KEY`
- `ADMIN_EMAILS`
- `GEMINI_API_KEY`
- `AI_KEY_ENCRYPTION_SECRET`
- `FRONTEND_URL`
- `ADMIN_URL`
- `MOBILE_APP_URL`

## Health Checks

- `GET /health` returns process health.
- `GET /ready` checks required production environment variables.
- `GET /api/scraper/engine-status` checks scraper database and Gemini readiness.

## Scheduler Safety

The scraper scheduler runs inside the API process. In production, do not enable it on multiple web instances.

Recommended first launch:

```bash
SCRAPER_SCHEDULER_ENABLED=false
```

Then trigger scrapes manually from the admin dashboard or from one external cron. If you later create a dedicated worker instance, set `SCRAPER_SCHEDULER_ENABLED=true` only there.

## Database

Apply all SQL files in `supabase/migrations` to the production Supabase project before routing traffic.

Important scraper/AI migrations:

- `20250120000000_scraper_tables.sql`
- `20260514093000_opportunity_admin_scale_dedupe.sql`
- `20260515000000_ai_control_plane.sql`
- `20260522000000_opportunity_engine_canonical_compat.sql`
- `20260522020000_backend_scale_safety.sql`
- `20260523000000_opportunity_verification_lifecycle.sql`

## Client Configuration

Point clients to the deployed API:

```bash
VITE_API_URL=https://edutu-api.onrender.com
VITE_BACKEND_URL=https://edutu-api.onrender.com
EXPO_PUBLIC_API_URL=https://edutu-api.onrender.com
```

## Launch Checklist

1. Deploy API with `SCRAPER_SCHEDULER_ENABLED=false`.
2. Apply Supabase migrations.
3. Verify `GET /health` and `GET /ready`.
4. Verify `GET /api/scraper/engine-status` from an authenticated admin session.
5. Run one small scrape with `maxPages=1`.
6. Inspect saved opportunities for title, summary, description, requirements, benefits, image, and apply URL.
7. Update admin, web app, and mobile env vars to the production API URL.
