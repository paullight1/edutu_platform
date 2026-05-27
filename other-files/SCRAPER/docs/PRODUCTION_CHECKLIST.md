# Edutu Scraper Engine - Production Deployment Checklist

## Pre-Deployment

### 1. Database Setup (Supabase)
- [ ] Run migration SQL in Supabase SQL Editor
  - File: `SCRAPER/supabase/migrations/001_initial_schema.sql`
- [ ] Verify tables created:
  - [ ] `scraping_sources` - Source management
  - [ ] `scraped_urls` - URL deduplication cache
  - [ ] `scrape_logs` - Audit trail
  - [ ] `scraper_config` - Configuration
- [ ] Check RLS policies enabled
- [ ] Verify service role key has correct permissions

### 2. Source Configuration
- [ ] Verify Tier 1 sources are seeded:
  - [ ] Opportunities Circle
  - [ ] OYA Opportunities
  - [ ] Global Scholar Desk
  - [ ] Scholars4Dev
  - [ ] Scholarship Portal
  - [ ] Scholarship Positions
  - [ ] International Scholarships

### 3. Environment Variables
Create production `.env` file:
```env
# Required
NODE_ENV=production
PORT=3001

# Supabase (get from Supabase dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (get from OpenAI platform)
OPENAI_API_KEY=sk-your-openai-key

# Generate secure API key (32+ random chars)
API_KEY=your-secure-random-api-key

# Admin emails (comma-separated)
ADMIN_EMAILS=admin@edutu.org

# Optional
LOG_LEVEL=info
```

### 4. GitHub Secrets
Add these to your GitHub repository secrets:
- [ ] `API_URL` - Your deployed backend URL
- [ ] `API_KEY` - Same as in .env
- [ ] `OPENAI_API_KEY` - Your OpenAI key
- [ ] `SUPABASE_URL` - Your Supabase URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

## Deployment

### 5. Deploy Backend
Choose one platform:

**Render.com:**
- [ ] Connect GitHub repository
- [ ] Set environment variables
- [ ] Deploy: `npm install && npx playwright install chromium && npm start`

**Railway:**
- [ ] Connect GitHub repository
- [ ] Set environment variables
- [ ] Deploy with `npm start`

**Custom Server (VPS):**
- [ ] Clone repository
- [ ] Install dependencies: `npm install`
- [ ] Install Playwright: `npx playwright install chromium`
- [ ] Set environment variables
- [ ] Run: `npm start` or use PM2

### 6. Verify Deployment
Test these endpoints:
- [ ] `GET /health` - Should return status: ok
- [ ] `GET /api/status` - Should show version 2.0.0
- [ ] `GET /api/sources` - Should list sources
- [ ] `GET /api/stats` - Should show database connected

### 7. Test Scraping
Run a test scrape:
```bash
curl -X POST "https://your-api-url/api/scrape/continuous" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"maxItems": 5}'
```

Expected response:
```json
{
  "success": true,
  "scraped": 5,
  "skipped": 0
}
```

### 8. GitHub Actions
- [ ] Verify workflow file exists: `.github/workflows/scrape.yml`
- [ ] Trigger manual run to test
- [ ] Verify scheduled runs (every 2 hours)

## Post-Deployment

### 9. Monitoring
- [ ] Set up error tracking (optional: Sentry)
- [ ] Configure log aggregation
- [ ] Set up alerts for failures
- [ ] Monitor API response times

### 10. Security
- [ ] Verify CORS restricted to production domains
- [ ] Check API key is strong (32+ chars)
- [ ] Verify RLS policies on Supabase
- [ ] Disable debug mode in production

## Quick Commands

### Start Backend
```bash
npm start
```

### Test Locally
```bash
npm run dev
```

### View Logs (PM2)
```bash
pm2 logs edutu-scraper
```

### Restart
```bash
pm2 restart edutu-scraper
```

## Support

If issues arise:
1. Check `/health` endpoint
2. Check `/api/logs` for errors
3. Verify environment variables
4. Check Playwright browser installation

## Files Created

| File | Purpose |
|------|---------|
| `admin/backend/server.js` | Main API server |
| `admin/backend/scraper.js` | Scraping engine |
| `admin/backend/database.js` | Database layer |
| `admin/backend/errors.js` | Error tracking |
| `SCRAPER/supabase/migrations/001_initial_schema.sql` | Database schema |
| `SCRAPER/.github/workflows/scrape.yml` | Scheduled scraping |
| `SCRAPER/docs/DEPLOYMENT.md` | Deployment config |
| `SCRAPER/docs/ROADMAP.md` | Build roadmap |
