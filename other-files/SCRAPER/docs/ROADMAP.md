# Edutu Opportunity Scraper Engine - Build Roadmap

## Vision

**One sentence**: A continuous, AI-powered opportunity aggregation engine that automatically scrapes scholarships, internships, fellowships, grants, and programs from aggregator websites and stores them in Supabase.

**Who**: Edutu platform users (students seeking opportunities), admins managing content, automated scheduled jobs.

**Why**: Manual opportunity entry is slow and error-prone; aggregators have fresh content that needs to be automatically captured, deduplicated, and stored.

**Constraint**: Node.js/Express backend, Supabase (PostgreSQL), OpenAI for AI extraction, Playwright for scraping, GitHub Actions for scheduling.

**Not building**: Real-time collaborative editing, plugin ecosystem, mobile app scraper UI, public-facing scraper API.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Node.js + Express (ES Modules) | Already exists at `admin/backend/` |
| Scraping | Playwright + Cheerio | Robust browser automation + fast HTML parsing |
| AI Extraction | OpenAI GPT-3.5/4 | Structured data extraction from raw HTML |
| Database | Supabase (PostgreSQL) | Single source of truth for Edutu platform |
| Scheduler | GitHub Actions | Free, reliable cron scheduling (every 2 hours) |
| Storage | Supabase Storage | Opportunity images/assets |
| Hosting | Render/Railway | Backend deployment target |

---

## Data Model

### opportunities
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
title TEXT NOT NULL
summary TEXT
description TEXT
category TEXT -- 'Scholarships', 'Internships', 'Fellowships', 'Grants', 'Programs', 'Competitions'
organization TEXT
location TEXT
is_remote BOOLEAN DEFAULT false
application_url TEXT
close_date TIMESTAMP
image_url TEXT
award_amount TEXT
duration TEXT
is_featured BOOLEAN DEFAULT false
status TEXT DEFAULT 'pending' -- 'pending', 'active', 'closed', 'draft'
views INTEGER DEFAULT 0
applications INTEGER DEFAULT 0
eligibility JSONB -- {school, major, min_cgpa, countries}
requirements JSONB -- array of strings
benefits JSONB -- array of strings
source_url TEXT
source_name TEXT
source_id INTEGER REFERENCES scraping_sources(id)
scraped_at TIMESTAMP
confidence_score INTEGER -- 0-100 extraction quality
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

### scraping_sources
```sql
id SERIAL PRIMARY KEY
url TEXT NOT NULL UNIQUE
name TEXT
tier INTEGER DEFAULT 1 -- 1=aggregator, 2=direct, 3=hidden
category TEXT -- 'aggregator', 'scholarship', 'fellowship', etc.
enabled BOOLEAN DEFAULT true
priority INTEGER DEFAULT 1 -- scraping order
config JSONB -- custom scraping config per source
last_scraped TIMESTAMP
last_success TIMESTAMP
last_error TEXT
total_scraped INTEGER DEFAULT 0
total_failed INTEGER DEFAULT 0
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

### scrape_logs
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
source_id INTEGER REFERENCES scraping_sources(id)
run_type TEXT -- 'manual', 'scheduled', 'continuous'
status TEXT -- 'started', 'completed', 'failed'
urls_discovered INTEGER DEFAULT 0
urls_scraped INTEGER DEFAULT 0
urls_saved INTEGER DEFAULT 0
urls_skipped INTEGER DEFAULT 0
errors JSONB -- array of error details
duration_seconds INTEGER
started_at TIMESTAMP
completed_at TIMESTAMP
created_at TIMESTAMP DEFAULT NOW()
```

### scraped_urls (dedup cache)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
url TEXT NOT NULL UNIQUE
source_id INTEGER REFERENCES scraping_sources(id)
opportunity_id UUID REFERENCES opportunities(id)
status TEXT -- 'pending', 'processed', 'failed'
first_seen TIMESTAMP
last_checked TIMESTAMP
created_at TIMESTAMP DEFAULT NOW()
```

### Relationships
- `opportunities` belongs to `scraping_sources` via `source_id`
- `scrape_logs` belongs to `scraping_sources` via `source_id`
- `scraped_urls` belongs to `scraping_sources` via `source_id`
- `scraped_urls` optionally links to `opportunities` via `opportunity_id`

---

## Schema Evolution Map

| Table | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|-------|---------|---------|---------|---------|---------|
| scraping_sources | ✓ | +config col | +priority | | |
| opportunities | ✓ | +source cols | +confidence | | |
| scrape_logs | | ✓ | | +metrics | |
| scraped_urls | | ✓ | | | |
| scraper_config | | | | ✓ | |

---

## API Surface Map

| Route | Phase | Auth | Purpose |
|-------|-------|------|---------|
| GET /health | 1 | - | Health check |
| GET /api/status | 1 | - | API info |
| POST /api/scrape | 1 | Bearer | Single URL extraction |
| POST /api/scrape/bulk | 1 | Bearer | Bulk extraction (max 50) |
| POST /api/scrape/discover | 1 | Bearer | Find opportunity URLs on page |
| POST /api/scrape/continuous | 1 | Bearer | Full scrape cycle |
| POST /api/scrape/upload | 1 | Bearer | Excel/CSV upload |
| GET /api/sources | 2 | Bearer | List scraping sources |
| POST /api/sources | 2 | Bearer | Add scraping source |
| PATCH /api/sources/:id | 2 | Bearer | Update source config |
| DELETE /api/sources/:id | 2 | Bearer | Disable source |
| GET /api/logs | 3 | Bearer | View scrape history |
| GET /api/logs/:id | 3 | Bearer | Single log details |
| POST /api/scrape/test | 4 | Bearer | Test source config |
| GET /api/stats | 4 | Bearer | Scraping statistics |

---

## Phase 1 — Core Scraper Engine (Enhancement)
*Goal: Strengthen existing scraper with robust error handling, retry logic, and source management.*
*Depends on: Existing backend at `admin/backend/`*
*Estimated effort: 2-3 sessions*

### What's New
- Enhanced scraper with retry logic and exponential backoff
- Source-specific scraping configurations
- Better deduplication with URL caching
- Improved confidence scoring with validation
- Rate limiting and request throttling

### Database Changes
- Create `scraping_sources` table (if not exists)
- Add `confidence_score` column to opportunities
- Add `config` JSONB column to scraping_sources

### Task Checklist

#### Setup
- [ ] Verify existing backend dependencies work (Playwright, OpenAI, Supabase)
- [ ] Add missing packages: `p-retry`, `p-queue`, `date-fns`
- [ ] Create `.env` with all required secrets

#### Data Layer
- [ ] Create `supabase/migrations/001_initial_schema.sql` with full table definitions
- [ ] Add seed data for Tier 1 aggregator sources (7 sources)
- [ ] Create database helper functions for batch operations

#### Scraper Enhancement
- [ ] Add retry logic with exponential backoff (max 3 retries)
- [ ] Add request queue with concurrency limit (3 concurrent)
- [ ] Add rate limiting per source (configurable requests per minute)
- [ ] Improve `discoverOpportunities` with site-specific selectors
- [ ] Add source-specific scraping configs (JSON patterns per site)
- [ ] Add confidence score validation (reject if < 50)
- [ ] Add screenshot capture for failed scrapes (debugging)

#### API Enhancement
- [ ] Add `/api/sources` CRUD endpoints
- [ ] Add source config validation endpoint
- [ ] Add scraping preview endpoint (scrape without save)
- [ ] Improve error responses with detailed messages

#### Testing
- [ ] Test single URL scrape with real opportunity URL
- [ ] Test bulk scrape with 5 URLs
- [ ] Test discover on Opportunities Circle homepage
- [ ] Test continuous scrape cycle
- [ ] Verify deduplication works

### Definition of Done
- [ ] Single URL scrape returns structured data with confidence > 70
- [ ] Bulk scrape processes 10 URLs without rate limit errors
- [ ] Discover finds at least 20 opportunities from aggregator homepage
- [ ] Continuous scrape saves new opportunities to Supabase
- [ ] Deduplication prevents duplicate entries

---

## Phase 2 — Database & Source Management
*Goal: Full Supabase integration with source management UI and logging.*
*Depends on: Phase 1*
*Estimated effort: 1-2 sessions*

### What's New
- Complete Supabase schema with RLS policies
- Source management UI in admin panel
- Scrape logs for audit trail
- URL deduplication cache

### Database Changes
- Create `scrape_logs` table
- Create `scraped_urls` table
- Enable RLS on all scraper tables
- Add indexes for performance

### Task Checklist

#### Data Layer
- [ ] Run full migration in Supabase SQL Editor
- [ ] Create RLS policies for scraper tables
- [ ] Add indexes: `opportunities(source_url)`, `scraped_urls(url)`, `scrape_logs(source_id)`
- [ ] Create database functions for log insertion
- [ ] Add seed sources: Opportunities Circle, OYA, Global Scholar Desk, etc.

#### API
- [ ] Create `/api/sources` endpoints (GET, POST, PATCH, DELETE)
- [ ] Create `/api/logs` endpoints with pagination
- [ ] Add source enable/disable toggle endpoint
- [ ] Add source priority ranking endpoint

#### Scraper Integration
- [ ] Insert scrape_logs entry at start of continuous scrape
- [ ] Update scrape_logs with results at completion
- [ ] Insert scraped_urls for every discovered URL
- [ ] Link scraped_urls to opportunities on save

#### Admin Panel Integration
- [ ] Create Sources management page in admin panel
- [ ] Create Logs viewer page in admin panel
- [ ] Add source stats dashboard widget

#### Testing
- [ ] Test source CRUD via API
- [ ] Test log creation and retrieval
- [ ] Verify RLS policies work with anon/service role keys
- [ ] Test source enable/disable toggles

### Definition of Done
- [ ] Sources can be added/edited via admin panel
- [ ] Scrape logs visible in admin dashboard
- [ ] RLS protects tables from unauthorized access
- [ ] All 7 Tier 1 sources seeded and enabled

---

## Phase 3 — GitHub Actions Automation
*Goal: Automated continuous scraping every 2 hours with monitoring.*
*Depends on: Phase 2*
*Estimated effort: 1-2 sessions*

### What's New
- GitHub Actions workflow for scheduled scraping
- Slack/email notifications on completion/failure
- Scrape status dashboard
- Automatic source rotation

### Task Checklist

#### GitHub Actions
- [ ] Create `.github/workflows/scrape.yml` workflow file
- [ ] Configure schedule: `cron: '0 */2 * * *'` (every 2 hours)
- [ ] Add manual trigger (`workflow_dispatch`)
- [ ] Add secrets: `API_URL`, `API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- [ ] Add job steps: health check, continuous scrape, log results
- [ ] Add failure notification step

#### Notifications
- [ ] Create Slack webhook integration (optional)
- [ ] Create email notification via Supabase Edge Functions (optional)
- [ ] Add success/failure status messages

#### API Enhancement
- [ ] Add `/api/scrape/scheduled` endpoint for GitHub Actions
- [ ] Add scrape results summary endpoint
- [ ] Add health check with dependency status (Supabase, OpenAI)

#### Monitoring
- [ ] Create `/api/health/detailed` endpoint
- [ ] Add scrape metrics endpoint (last run, totals, errors)
- [ ] Add source status endpoint (last scraped, success rate)

#### Testing
- [ ] Test workflow manually via GitHub Actions UI
- [ ] Verify secrets are correctly passed
- [ ] Test notification on failure scenario
- [ ] Verify 2-hour schedule triggers correctly

### Definition of Done
- [ ] GitHub Actions workflow runs successfully
- [ ] Continuous scrape triggers every 2 hours
- [ ] Notifications sent on completion/failure
- [ ] Scrape metrics visible in API responses

---

## Phase 4 — Advanced Scraping Features
*Goal: Site-specific scrapers, pagination handling, and quality validation.*
*Depends on: Phase 3*
*Estimated effort: 2-3 sessions*

### What's New
- Site-specific scraping configurations per source
- Pagination and infinite scroll handling
- Date validation and opportunity expiry detection
- Duplicate content detection (not just URL)
- Quality scoring and auto-approval thresholds

### Task Checklist

#### Site-Specific Scrapers
- [ ] Create scraper configs for each Tier 1 source
- [ ] Add custom selectors for Opportunities Circle
- [ ] Add custom selectors for OYA Opportunities
- [ ] Add custom selectors for Global Scholar Desk
- [ ] Add custom selectors for Scholars4Dev
- [ ] Add pagination handling for list pages
- [ ] Add infinite scroll handling for dynamic sites

#### Quality Validation
- [ ] Add title similarity detection (prevent near-duplicates)
- [ ] Add deadline validation (must be future date)
- [ ] Add required field validation (title, organization, category)
- [ ] Add auto-approval threshold (confidence >= 80)
- [ ] Add manual review flag for low confidence

#### Scraper Enhancement
- [ ] Add parallel source scraping (multiple sources per run)
- [ ] Add source priority ordering
- [ ] Add source-specific rate limits
- [ ] Add scraping timeout per source (5 minutes max)
- [ ] Add graceful error recovery per source

#### API Enhancement
- [ ] Add `/api/scrape/test/:sourceId` endpoint
- [ ] Add `/api/validate` endpoint for quality checks
- [ ] Add `/api/stats/quality` endpoint for quality metrics

#### Testing
- [ ] Test site-specific scrapers on each source
- [ ] Test pagination on sites with > 50 opportunities
- [ ] Test quality validation with low-quality data
- [ ] Test parallel scraping with 3 sources

### Definition of Done
- [ ] All Tier 1 sources have working site-specific configs
- [ ] Pagination works for sites with 100+ opportunities
- [ ] Low-quality opportunities flagged for manual review
- [ ] Parallel scraping processes 3 sources simultaneously

---

## Phase 5 — Production Deployment & Monitoring
*Goal: Deploy to production with full monitoring and error recovery.*
*Depends on: Phase 4*
*Estimated effort: 1-2 sessions*

### What's New
- Production deployment on Render/Railway
- Error recovery and auto-retry on failures
- Monitoring dashboard with Grafana/Posthog (optional)
- Performance optimization for high-volume scraping

### Task Checklist

#### Deployment
- [ ] Create `render.yaml` or Railway config
- [ ] Set production environment variables
- [ ] Configure production Supabase keys
- [ ] Set up logging and error tracking (Sentry optional)
- [ ] Configure Playwright for production (install browsers)

#### Monitoring
- [ ] Add request/response logging
- [ ] Add performance timing metrics
- [ ] Add error tracking with stack traces
- [ ] Create monitoring dashboard (optional)

#### Performance
- [ ] Optimize AI extraction prompt (reduce tokens)
- [ ] Add caching for repeated scrapes
- [ ] Add batch database operations
- [ ] Optimize Playwright browser reuse

#### Error Recovery
- [ ] Add automatic retry on transient failures
- [ ] Add source disable on repeated failures (3+ consecutive)
- [ ] Add error notification escalation
- [ ] Add manual retry endpoint

#### Final Testing
- [ ] Test production deployment health
- [ ] Test production continuous scrape
- [ ] Test error recovery scenarios
- [ ] Test performance under load (50 URLs)

### Definition of Done
- [ ] Backend deployed and accessible at production URL
- [ ] GitHub Actions triggers production endpoint successfully
- [ ] Error tracking captures all failures
- [ ] Scraping performance < 30 seconds per URL average

---

## Build Order Summary

| Phase | Goal | New tables | New routes | Sessions |
|-------|------|-----------|-----------|----------|
| 1 | Enhanced scraper core | +2 cols | +3 | 2-3 |
| 2 | Database & sources | +2 | +6 | 1-2 |
| 3 | GitHub Actions automation | 0 | +3 | 1-2 |
| 4 | Advanced scraping | +1 (config) | +3 | 2-3 |
| 5 | Production deployment | 0 | +2 | 1-2 |

**Total estimated sessions: 7-12**

---

## Deliberately Not Building (v1)

- **Browser extension for manual scraping** — unnecessary complexity
- **Public API for third-party access** — security risk, not needed
- **Real-time scraping updates** — scheduled is sufficient
- **Mobile app scraper UI** — admin panel handles this
- **AI-powered source discovery** — manual source addition is fine
- **Full-text search on scraped content** — Supabase handles this separately
- **User-submitted scraping rules** — admin-only configuration
- **Multi-language opportunity extraction** — English-only for MVP

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `admin/backend/server.js` | Express API server |
| `admin/backend/scraper.js` | Playwright + AI extraction |
| `admin/backend/database.js` | Supabase client & helpers |
| `.github/workflows/scrape.yml` | Scheduled scraping workflow |
| `supabase/migrations/*.sql` | Database schema migrations |
| `SCRAPER/docs/ROADMAP.md` | This roadmap file |

---

## Execution Commands

### Start Build
```
/start building
```

### Resume Build
```
/resume the build
```

### Check Status
```
/roadmap status
```

---

## Notes

- Existing backend at `admin/backend/` already has core functionality
- Roadmap focuses on enhancement, automation, and production readiness
- Supabase connection requires service role key for admin operations
- OpenAI API key required for AI extraction (estimated $0.01-0.02 per URL)
- Playwright browsers need to be installed on deployment platform