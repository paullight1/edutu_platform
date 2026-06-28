# Edutu Platform - Agent Guidelines

## Project Structure

```
Edutu_Folder/
├── admin/                 # React + Vite + TypeScript admin dashboard
├── backend/
│   └── services/services/api/   # NestJS API server (actual path is nested)
├── crawl4ai-scraper/      # Python scholarship scraper (Crawl4AI)
├── edutu_mobile/          # React Native + Expo mobile app
├── edutu-web/             # Next.js waitlist landing page
├── edutu-web-app/         # Full Edutu web app (React + Vite + TypeScript + Capacitor/PWA)
├── supabase/              # Supabase edge functions
└── other-files/           # Archived/experimental code
```

## Critical Notes

### Backend Path Quirk
The NestJS API lives at `backend/services/services/api/` - **not** `backend/`. This nested `services/services/` path is unusual and easy to miss.

### Architecture
- **Client → Backend API → Supabase**: All client apps (admin, mobile) talk to the NestJS backend, **not** directly to Supabase (except mobile uses Supabase for auth)
- **Auth**: Clerk for authentication across all apps
- **AI**: Google Gemini API used in backend

## Developer Commands

### Backend (NestJS API)
```bash
cd backend/services/services/api
npm install
npm run dev          # Start dev server with auto-reload on port 3000
npm run lint
npm run test
npm run test:e2e
npm run db:push      # Drizzle ORM schema push
```

### Admin Dashboard
```bash
cd admin
npm install
npm run dev          # Vite dev server at http://localhost:5173
npm run build
```

### Mobile App (React Native + Expo)
```bash
cd edutu_mobile
npm install
npx expo start       # or npm run dev
npx expo run:android
npx expo run:ios
```

### Edutu Web App (React + Vite + Capacitor/PWA)
```bash
cd edutu-web-app
npm install
npm run dev          # Vite dev server
npm run build        # Production build → dist/
npm run typecheck    # TypeScript check
npm run android      # Build + open Android Studio
```

### Scraper (Python)
```bash
cd crawl4ai-scraper
pip install -r requirements.txt
python main.py --source opportunities_circle    # Scrape single source
python main.py --all --save                     # Scrape all + save to DB
python cli.py scrape --all                      # CLI interface
```

## Environment Setup

### Backend (.env at `backend/services/services/api/.env`)
```
PORT=3000
SUPABASE_URL=your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
CLERK_SECRET_KEY=your-clerk-key
GEMINI_API_KEY=your-gemini-key
```

### Admin (.env at `admin/.env`)
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3001
```

### Mobile (.env at `edutu_mobile/.env`)
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_API_URL=http://localhost:3001
```

### Web App (.env at `edutu-web-app/.env`)
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OPENROUTER_API_KEY=your_openrouter_api_key
```

## Key Dependencies

| Package | Tech | Purpose |
|---------|------|---------|
| `@nestjs/*` | NestJS | Backend API framework |
| `drizzle-orm` + `drizzle-kit` | Drizzle | ORM and migrations (PostgreSQL) |
| `@clerk/*` | Clerk | Authentication |
| `@google/genai` | Gemini | AI features |
| `@supabase/supabase-js` | Supabase | Database client |
| `react-native` + `expo` | Expo | Mobile app |
| `react` + `react-router-dom` | React SPA | Web app |
| `@capacitor/*` | Capacitor | Android native wrapper |
| `crawl4ai` | Crawl4AI | Web scraping |

## Testing

```bash
# Backend unit tests
cd backend/services/services/api && npm run test

# Backend e2e tests
cd backend/services/services/api && npm run test:e2e
```

## Scraper Dashboard

Access at `http://localhost:5173/scraper` (within admin app).

Key API endpoints:
- `POST /api/scraper/run` - Trigger scraping
- `GET /api/scraper/stats` - Get statistics
- `GET/POST/DELETE /api/scraper/sources` - Manage sources

## Database

- **Platform**: Supabase (PostgreSQL)
- **ORM**: Drizzle
- **Key tables**: `opportunities`, `profiles`, `scraping_sources`, `scrape_logs`, `scraped_urls`
- **Migrations**: Run via `npm run db:push` or manually in Supabase SQL Editor

## Conventions

- All API calls from clients go through the NestJS backend (not direct to Supabase)
- Use strict TypeScript in backend (`strictNullChecks: true`)
- Scraper uses rate limiting and respects robots.txt
- Mobile app uses Expo Router for navigation (`EXPO_ROUTER_APP_ROOT=app`)

## MCP Configuration

Apify MCP is configured in `opencode.json` for accessing scraper actors:
- `paullight/edutu-scraper1`
- `majestic_fund/the-scholarship-scraper-actor`
- `fiery_dream/scholarship-intel`
