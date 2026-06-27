# Operations

This document lists local development and verification commands for the `edutu-platform` repository boundary.

## Backend API

Path:

```bash
cd backend/services/services/api
```

Commands:

```bash
npm install
npm run dev
npm run build
npm run test
npm run test:e2e
npm run lint
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

Expected local port: `3000`.

## Standalone Admin

Path:

```bash
cd admin
```

Commands:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

Default Vite port is normally `5173` unless already in use.

## Main Web App

Path:

```bash
cd edutu-web-app
```

Commands:

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run preview
npm run android
```

## Scholarship Engine Docs Site

Path:

```bash
cd edutu-web
```

Commands:

```bash
npm install
npm run dev
npm run build
npm run start
```

## Crawl4AI Scraper

Path:

```bash
cd crawl4ai-scraper
```

Commands:

```bash
pip install -r requirements.txt
python main.py --source opportunities_circle
python main.py --all
python main.py --all --save
python cli.py scrape --all
```

## Environment Checklist

Backend:

```env
PORT=3000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
CLERK_SECRET_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
AI_KEY_ENCRYPTION_SECRET=...
ADMIN_EMAILS=admin@example.com
ADMIN_URL=http://localhost:5173
MOBILE_APP_URL=http://localhost:8081
```

Admin:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://edutu-api.onrender.com
```

Main web app:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=https://edutu-api.onrender.com
VITE_CLERK_PUBLISHABLE_KEY=...
```

## Verification Baseline

Run these before major releases:

```bash
cd backend/services/services/api && npm run test && npm run test:e2e && npm run build
cd admin && npm run build
cd edutu-web-app && npm run typecheck && npm run test && npm run build
cd edutu-web && npm run build
```

## Release Notes Checklist

- Backend routes changed
- Database schema or migration changed
- RLS policies changed
- AI route/provider changed
- Billing or webhook behavior changed
- Mobile control campaigns/flags changed
- Scraper source, rate limit, or quality threshold changed
- Environment variables added or renamed

## Incident Checklist

1. Identify impacted surface: backend, admin, web app, docs site, scraper, Supabase, or external provider.
2. Check recent deployments and migrations.
3. Check backend logs and AI usage logs if AI features are involved.
4. Check Supabase function logs for edge-function paths.
5. Disable risky mobile campaigns or feature flags if mobile behavior is involved.
6. Roll back migrations only with a reviewed rollback script.
7. Document root cause and add a regression test or operational guard.
