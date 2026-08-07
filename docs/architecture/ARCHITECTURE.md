# Edutu platform architecture

## System boundary

Edutu serves opportunity discovery, recommendations, applications, community,
and paid features through web, mobile, and admin clients. Client applications
use the NestJS API for business operations; Supabase is the PostgreSQL platform
and Auth/identity integrations remain provider boundaries.

## Runtime containers

| Container | Owns | Must not own |
| --- | --- | --- |
| Client routes/screens | Navigation and composition | Database/provider calls or business rules |
| Client feature hooks/services | UI state and API interaction | Route layout or privileged secrets |
| NestJS controllers | Validation, auth context, response mapping | Persistence queries or domain policy |
| NestJS feature services | Application workflows and domain policy | HTTP parsing and provider protocol details |
| Repositories/adapters | Supabase/HTTP/provider interaction | Screen logic or cross-feature orchestration |

## Scraper boundaries

- `ScraperService` orchestrates schedules, source selection, crawling, enrichment,
  quality gates, and the existing public API.
- `ScraperHttpClient` owns request routing, retries, blocked-host memory, proxy/
  relay escalation, and relay rate limiting.
- `OpportunityStatusRepository` owns the read-only status lookup that prevents a
  re-scrape from overwriting an admin decision.
- `ScrapedUrlIndexRepository` owns processed-URL indexing, incremental skip
  decisions, and last-seen updates for existing listings.
- `ScraperRunControl` owns in-process pause, resume, and graceful stop state.
- `scraper.config` and `scraper.types` are the stable contracts/configuration
  boundary; consumers should not import scraper-service internals.

## Data ownership and failure behavior

- Supabase owns opportunity, scrape-log, source, and processed-URL records.
- A failed status lookup is intentionally fail-open, matching the prior behavior;
  it logs a warning and allows the run to continue.
- HTTP transport remembers a blocked host only for the active scrape run. Relay
  throughput remains process-wide and serialized by configured minimum spacing.
- The status-preservation sequence remains: transform, deduplicate, preserve
  existing statuses, apply gates, upsert, mark processed URLs, create share assets.

## Refactor guardrails

- Preserve route/API/database shapes during structural changes.
- Add characterization tests before extracting stateful behavior.
- Keep feature public APIs deliberate; cross-feature imports use exported
  contracts/services rather than implementation files.
- Run the relevant build, focused tests, and `npm run check:architecture` before
  accepting an extraction.
