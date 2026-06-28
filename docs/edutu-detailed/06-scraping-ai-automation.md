# 06. Scraping, AI, and Automation Documentation

## Scraping Systems

Edutu currently has three scraper-related code paths:

| Path | Status | Purpose |
| --- | --- | --- |
| `edutu-platform/crawl4ai-scraper` | Active Python scraper | Crawl4AI scholarship scraping, cleaning, Supabase save. |
| `edutu-platform/backend/services/services/api/src/scraper` | Active NestJS scraper control | Admin-triggered scraper runs, sources, jobs, stats, settings, scheduler. |
| `edutu-platform/admin/backend` and `edutu-platform/backend` | Secondary/legacy Express scraper APIs | URL scraping, bulk/upload, Apify/Gemini integrations, admin tooling. |
| `edutu-platform/other-files/*scraper*` | Archived/reference | Historical scraper actors, Crawl4AI study, deployment notes. |

## Python Crawl4AI Scraper

Path:

```bash
edutu-platform/crawl4ai-scraper
```

Commands:

```bash
pip install -r requirements.txt
python main.py --source opportunities_circle
python main.py --all
python main.py --all --save
python main.py --all --output scholarships.json
python cli.py scrape --all
```

### Components

| File | Responsibility |
| --- | --- |
| `crawler.py` | Core Crawl4AI wrapper and source crawling. |
| `extractors/scholarship_extractor.py` | HTML-to-scholarship extraction. |
| `processors/data_cleaner.py` | Data normalization and cleaning. |
| `database/supabase_client.py` | Supabase save path. |
| `main.py` | Main CLI entry point. |
| `cli.py` | Alternate CLI interface. |

### Python Scraper Process Flow

1. `main.py` parses `--source`, `--all`, `--max-pages`, `--output`, `--save`, and `--mock-db`.
2. `crawler.py` uses Crawl4AI `AsyncWebCrawler` with JavaScript enabled, full-page scan, popup/form removal, and per-page delay.
3. `ScholarshipExtractor` parses HTML cards with BeautifulSoup.
4. `DataCleaner` normalizes fields, detects currency, validates deadlines, generates tags/difficulty/match score, and dedupes by normalized URL/title.
5. `SupabaseClient` upserts into `opportunities` with `on_conflict='canonical_url'`.
6. Mock client is used when not saving or Supabase env is missing.

### Source List

The README names:

- `opportunities_circle`
- `oya_opportunities`
- `global_scholar`
- `scholars4dev`
- `scholarship_portal`

## NestJS Scraper Module

Controller root:

```text
/api/scraper
```

Endpoints:

- `POST /run`
- `GET /sources`
- `POST /sources`
- `PATCH /sources/:id`
- `DELETE /sources/:id`
- `GET /jobs`
- `DELETE /jobs/:id`
- `GET /stats`
- `GET /settings`
- `POST /settings`

### Scheduler Flow

1. `ScraperService` implements `OnModuleInit`.
2. On startup, it loads `scraper_config` from Supabase.
3. If `auto_run_enabled` is true, it schedules `scheduled-scrape` with configured cron.
4. Scheduled job calls `runScraper({ allSources: true, maxPages: 2 })`.
5. Admin can update settings and sources.

### Quality Controls Observed

- Browser-like headers.
- Fetch delays.
- Page caps.
- Enrichment concurrency.
- Minimum description length.
- Minimum publish quality score.
- AI extraction schema with Zod validation.
- Dedupe through source URLs/scraped URLs.
- Supabase image proxying into `opportunities_images`.
- Retention cleanup based on `data_retention_days`.

## Legacy Express Scraper APIs

### Simple Express Scraper API

Path:

```bash
edutu-platform/backend
```

Endpoints:

- `GET /health`
- `GET /api/status`
- `POST /api/scrape`
- `POST /api/scrape/bulk`
- `POST /api/scrape/upload`

### Admin Express Scraper API

Path:

```bash
edutu-platform/admin/backend
```

Representative endpoints:

- health checks: `/health`, `/health/simple`, `/health/detailed`
- scrape runs: `/api/scrape`, `/api/scrape/preview`, `/api/scrape/bulk`, `/api/scrape/discover`, `/api/scrape/continuous`, `/api/scrape/upload`
- sources: `/api/sources`, `/api/sources/configs`, `/api/sources/:id`, toggle/update/delete
- logs: `/api/logs`, `/api/logs/:id`, `/api/logs/stats/summary`
- validation/quality/duplicates/discovery
- Apify preview/save/sync
- opportunity filtering

This server supports API-key or Supabase auth and admin email checks. It should be marked legacy/secondary if the NestJS scraper module is the intended production path.

## AI Control Plane

The active backend AI layer lives under:

```bash
edutu-platform/backend/services/services/api/src/ai
```

### Components

| File | Responsibility |
| --- | --- |
| `ai.service.ts` | Route resolution, provider key lookup, generation, JSON parsing, usage logging. |
| `ai-encryption.service.ts` | API key encryption and previewing. |
| `ai.controller.ts` | Admin/config endpoints. |
| `adapters/gemini.adapter.ts` | Gemini text/JSON generation. |
| `adapters/openrouter.adapter.ts` | OpenRouter generation. |
| `ai.types.ts` | Provider/route/generation types. |

### Default AI Routes

| Feature | Provider | Model | Purpose |
| --- | --- | --- | --- |
| `chat.coach` | OpenRouter | `openrouter/auto` | AI mentor/coach chat. |
| `chat.transcribe` | Gemini | `gemini-2.0-flash` | Voice/transcription support. |
| `scraper.extract` | Gemini | `gemini-2.5-flash` | Scraper structured extraction. |
| `opportunities.enhance` | Gemini | `gemini-1.5-flash` | Opportunity enrichment. |
| `opportunities.extract` | Gemini | `gemini-1.5-flash` | Opportunity extraction. |
| `opportunities.rerank` | Gemini | `gemini-2.0-flash` | Personalized reranking. |
| `cv.draft` | Gemini | `gemini-2.0-flash` | CV drafting. |
| `cv.tailor` | Gemini | `gemini-2.0-flash` | CV tailoring. |
| `roadmaps.questions` | Gemini | `gemini-2.0-flash` | Roadmap intake questions. |
| `roadmaps.intent_tags` | Gemini | `gemini-2.0-flash` | Intent tag extraction. |
| `roadmaps.match` | Gemini | `gemini-2.0-flash` | Roadmap matching. |
| `quiz.generate` | Gemini | `gemini-1.5-flash` | Quiz generation. |

## Automation Integrations

| Integration | Evidence | Purpose |
| --- | --- | --- |
| n8n | `n8nIntegration.ts`, `n8n-webhook` functions | Workflow/webhook automation. |
| Apify | `opencode.json`, admin backend Apify client, archived actor | Scraper actors. |
| Supabase scheduled/manual functions | `supabase/functions/scrape` | Serverless scrape invocation. |
| Notification queue | backend notification service/schema | Delayed or broadcast notifications. |

## Archived Scraper Assets

| Path | Notes |
| --- | --- |
| `other-files/crawl4ai-study` | Minimal Crawl4AI experiment replaced by active scraper. |
| `other-files/edutu-scraper1` | Apify/Crawlee Playwright actor; can POST normalized scholarships to backend. |
| `other-files/SCRAPER` | Second-generation scraper docs/schema with views and helper functions. |
| `other-files/documentation` | Old quickstart/scraper docs slated for consolidation. |

## Launch Video Package

`edutu-launch-video` is a Remotion vertical launch video project. It defines `EdutuLaunch` at 1080x1920, 900 frames, 30 fps, using local assets and lucide icons.

Commands:

```bash
cd edutu-launch-video
npm run dev
npm run render
npm run still
npm run lint
```

## Scraping/AI Risks

1. Multiple scraper implementations can confuse operations.
2. Scraper quality and dedupe must be measured, not assumed.
3. AI extraction needs stable JSON schemas and fallback behavior.
4. API keys are powerful and need rotation/runbooks.
5. Admin-triggered scraper and Apify paths need access control clarity.
6. Canonical opportunity column availability must be verified before saving active scraper output.
7. AI fallback route settings are stored, but backend fallback execution needs implementation.
