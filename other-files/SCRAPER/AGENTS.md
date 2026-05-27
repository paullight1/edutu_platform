# Edutu Scraper - AGENTS.md

## Quick Start

Backend API: `http://localhost:3001`

## Required Environment Variables

Create `.env` in backend directory:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
API_KEY=your-secure-api-key-min-32-chars
OPENAI_API_KEY=sk-your-openai-key
ADMIN_EMAILS=admin@edutu.org
PORT=3001
```

## Key Commands

- CI runs every 2 hours automatically via `.github/workflows/scrape.yml`
- Manual trigger: GitHub Actions → Continuous Scrape → Run workflow
- Production build: `npm install && npx playwright install --with-deps chromium`

## API Endpoints (require Bearer auth with API_KEY)

| Endpoint | Description |
|----------|-------------|
| `POST /api/scrape/continuous` | Main scrape (sourceId, maxItems) |
| `POST /api/scrape/discover` | Find opportunity URLs |
| `POST /api/scrape` | Single URL scrape |
| `POST /api/scrape/bulk` | Bulk scrape |
| `GET /health` | Health check |
| `GET /health/simple` | Quick health check |

## Database

- Supabase (PostgreSQL)
- Schema in `docs/SCRAPING_SYSTEM.md` and `INTEGRATION_GUIDE.md`
- Key tables: `opportunities`, `profiles`, `scraping_sources`

## Production Notes

- Playwright required: `npx playwright install --with-deps chromium`
- Rate limits: 10 req/min per source, 60 req/min (Supabase free tier)
- Health check path: `/health/simple`

## Key Files

- `docs/SCRAPING_SYSTEM.md` - Main system docs
- `docs/DEPLOYMENT.md` - Production deployment
- `INTEGRATION_GUIDE.md` - Full integration reference
- `admin/backend/apify-client.js` - Apify scraper client
