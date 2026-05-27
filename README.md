# Edutu Platform

This repository boundary contains the Edutu platform services and web surfaces. It is intentionally separate from the `edutumobile` repository.

## Repository Boundary

`edutu-platform` owns:

- NestJS backend API
- Standalone admin dashboard
- Main React/Vite web app and Capacitor Android shell
- Next.js waitlist site
- Crawl4AI scraper
- Shared Supabase migrations/functions for platform features
- Platform documentation

The Expo mobile app is owned by the separate `edutumobile` repository boundary. Do not treat the parent workspace as a monorepo.

## Critical Path Note

The backend API lives at:

```bash
backend/services/services/api
```

This nested `services/services` path is intentional in the current checkout. Run backend commands from that directory, not from `backend/`.

## Project Structure

```text
edutu-platform/
├── admin/                          # Standalone React/Vite admin dashboard
├── backend/services/services/api/  # NestJS API server
├── crawl4ai-scraper/               # Python scholarship/opportunity scraper
├── docs/                           # Platform architecture and operating docs
├── edutu-web/                      # Next.js waitlist landing page
├── edutu-web-app/                  # Main React/Vite web app + Capacitor/PWA
├── supabase/                       # Shared Supabase migrations/functions
└── other-files/                    # Archived or experimental material
```

## Main Architecture

Clients should prefer the NestJS API for business logic and privileged operations. Some current surfaces still use Supabase directly for auth bridging, RLS-backed reads/writes, and edge functions; those access paths are documented in `docs/ARCHITECTURE.md`.

High-level flow:

```text
Web/Admin/Mobile clients
  -> NestJS API
  -> Supabase Postgres
  -> external services: Clerk, Gemini, OpenRouter, Paystack, Apify, n8n
```

## Common Commands

### Backend API

```bash
cd backend/services/services/api
npm install
npm run dev
npm run test
npm run test:e2e
npm run db:generate
npm run db:migrate
npm run db:push
```

### Standalone Admin

```bash
cd admin
npm install
npm run dev
npm run build
```

### Main Web App

```bash
cd edutu-web-app
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```

### Waitlist Site

```bash
cd edutu-web
npm install
npm run dev
npm run build
```

### Crawl4AI Scraper

```bash
cd crawl4ai-scraper
pip install -r requirements.txt
python main.py --all --save
python cli.py scrape --all
```

## Environment

Backend variables are read from `backend/services/services/api/.env`.

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

Client apps use their own `VITE_*` or package-specific environment files.

## Documentation

- `docs/ARCHITECTURE.md` - system boundaries, runtime surfaces, and process flows
- `docs/API.md` - backend modules, endpoint groups, and auth matrix
- `docs/DATA_MODEL.md` - table ownership and migration guidance
- `docs/OPERATIONS.md` - local commands, verification, and deployment notes
- `docs/edutu-architecture.html` - standalone visual documentation artifact

## Development Rules

- Keep platform and mobile repository ownership separate.
- Keep privileged business logic in the backend API.
- Treat direct Supabase client access as an explicit feature decision, not a default.
- Update docs when routes, migrations, auth behavior, or service ownership changes.
