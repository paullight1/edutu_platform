# Edutu Search Foundation

**Status:** Approved for implementation  
**Owner:** Web + API  
**Date:** 2026-08-23

## Objective

Make Edutu's public opportunity and blog surfaces reliably discoverable, crawlable, indexable, responsive, and measurable without depending on client-side JavaScript or a successful second API request.

The work must preserve the current React application for users while giving search crawlers complete HTML, canonical URLs, valid status codes, structured data, and dependable URL discovery.

## Current root causes

1. The build sitemap silently succeeds when the backend cannot be reached. The committed fallback opportunity snapshot is effectively empty, so a deployment can publish only static collection URLs.
2. `/blog` and `/opportunities` render their discoverable item links only after React mounts and fetches data.
3. Opportunity detail HTML rewrites metadata but leaves the body empty until the SPA loads the record.
4. Blog and opportunity archive pagination is button-based instead of URL-based.
5. Missing blog posts and opportunities return generic successful HTML instead of `404` responses.
6. Root and app-level deployment configurations implement different SEO routing rules.
7. Category discovery uses query-string filters rather than first-class category landing pages.
8. There is no focused CI contract proving sitemap inventory, crawler-visible content, canonical URLs, pagination links, or not-found behavior.

## Architecture

Add a focused public SEO module to the canonical NestJS API under `backend/services/services/api/src/seo/`. It will query the existing Blog and Opportunities services, render safe crawler-visible HTML, inject that fallback into the deployed SPA shell for routes already handled by React, and serve standalone category hubs where no client route exists.

The root Vercel configuration remains the production routing source of truth. Public search routes will be rewritten to the SEO module while retaining their user-facing URLs. The app-level Vercel configuration will mirror the same contract so local or independently deployed web builds do not diverge.

The React app remains responsible for interactive filtering, personalization, saving, and application flows. The API SEO layer is responsible only for public discovery, indexable copy, status codes, canonical metadata, pagination, sitemaps, robots directives, and crawler-safe fallbacks.

## Global constraints

- Do not alter recommendation, ranking, personalization, billing, community, mobile, or admin behavior.
- Do not expose internal or paid opportunity fields.
- Do not fabricate eligibility, funding, deadlines, verification, authorship, or application facts.
- Escape all database-derived HTML and JSON-LD values.
- Keep current public detail URLs working.
- Return `404` for unknown or unpublished detail records and `503` for temporary content-service failures.
- Add `noindex` directives to error responses.
- Preserve SPA scripts and assets on routes that already exist in React.
- Category hubs must remain useful without JavaScript.
- All production changes require regression tests and the existing repository CI gates.

## P0 — URL discovery and indexable HTML

### Deliverables

- Dynamic `/sitemap.xml` served from the API using live published blog posts and active opportunities.
- Dynamic `/robots.txt` referencing the canonical sitemap.
- Sitemap inventory must include public collection pages, first-class category hubs, active opportunities, and published blog posts.
- `/blog`, `/opportunities`, `/blog/:slug`, and `/opportunity/:id` return meaningful HTML before JavaScript executes.
- Build-time sitemap generation must fail closed on Vercel when required content inventory cannot be obtained.

### Acceptance gates

- Sitemap is valid XML and contains at least one blog post and one opportunity when the live catalog contains them.
- A backend failure cannot produce a successful production deployment with an unexplained empty dynamic inventory.
- Detail HTML contains one descriptive `h1`, canonical URL, meta description, and meaningful body copy.

## P1 — Crawl paths, pagination, and status integrity

### Deliverables

- Blog and opportunity archive pages expose real anchor links for next, previous, and numbered pages.
- Blog client pagination reads and writes the `page` query parameter.
- Missing or unpublished detail records return HTTP `404`, a `noindex` directive, and a useful path back to the collection.
- Temporary service failures return HTTP `503` and `Retry-After`.
- Root and app-level Vercel rules share one tested routing contract.

### Acceptance gates

- `/blog?page=2` and `/opportunities?page=2` have self-referencing canonical URLs and crawlable adjacent-page anchors.
- Invalid detail URLs never return `200`.
- CI fails when SEO rewrites diverge.

## P2 — Category authority and content quality

### Deliverables

- First-class landing pages for scholarships, internships, fellowships, and programs.
- Category pages include unique titles, introductions, canonical URLs, breadcrumbs, item lists, and crawlable pagination.
- Opportunity detail fallback presents only available fields: organization, category, location, deadline, summary/description, benefits, eligibility, application guidance, source, and update date.
- Blog detail structured data includes publication/update dates, author, publisher, canonical main entity, and breadcrumbs when available.
- Collection pages link contextually to category hubs and related public content.

### Acceptance gates

- Category hubs do not canonicalize to the generic opportunities page.
- Structured data is valid JSON and contains no unsupported fabricated values.
- Empty fields are omitted rather than rendered as misleading claims.

## P3 — Responsive, accessible, and performant search pages

### Deliverables

- Server HTML uses semantic `main`, `article`, `nav`, `time`, headings, lists, and descriptive link text.
- Fallback layouts work from 320px upward without horizontal scrolling.
- Images include dimensions where known, descriptive alt text, lazy loading outside the primary item, and safe URL handling.
- Responses use bounded CDN caching and stale-while-revalidate.
- The SPA replaces the fallback without losing route functionality.

### Acceptance gates

- No crawler fallback relies on fixed desktop widths.
- Archive and detail pages remain usable with JavaScript disabled.
- Existing web typecheck, lint, tests, build, and PWA validation pass.

## P4 — Governance, monitoring, and release evidence

### Deliverables

- Pure renderer tests covering escaping, canonical tags, pagination, JSON-LD, and responsive markup.
- Controller tests covering `200`, `404`, and `503` behavior.
- A repository SEO contract test covering Vercel rewrites and sitemap/robots routes.
- An operations runbook for deployment verification, Search Console submission, URL Inspection, sitemap inventory checks, and rollback.
- A machine-readable inventory header or endpoint suitable for production diagnostics without exposing private data.

### Acceptance gates

- Existing backend and web CI passes with zero newly introduced warnings.
- SEO-specific tests pass independently.
- The pull request has no P0/P1 review findings.
- The branch is rebased or otherwise confirmed mergeable against the latest `main` before merge.

## Release gate

Merge to `main` only after:

1. Backend unit tests, production E2E, lint, and build pass.
2. Web tests, lint, typecheck, build, and PWA validation pass.
3. Repository governance and Vercel configuration validation pass.
4. SEO-specific route and renderer tests pass.
5. A final diff review confirms changes are confined to SEO, public routing, public archive pagination, tests, and documentation.
6. Any external-only follow-up, such as Google Search Console submission, is clearly recorded rather than claimed as completed.
