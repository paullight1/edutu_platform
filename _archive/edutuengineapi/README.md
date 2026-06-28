# Edutu Engine API

Standalone API service for discovering, extracting, enriching, and publishing opportunity data.

This service is intentionally separate from the main Edutu app. The main Edutu platform should consume this API instead of owning scraper logic.

## Commands

```bash
npm install
npm run dev
npm run build
npm run start:prod
```

## Environment

```bash
PORT=3100
EDUTU_ENGINE_API_KEYS=local-dev-key,second-key
EDUTU_ENGINE_PUBLIC_URL=http://localhost:3100/v1
EDUTU_ENGINE_OPENAPI_URL=http://localhost:3100/v1/openapi.json
EDUTU_ENGINE_DOCS_URL=https://docs.edutu.org
EDUTU_ENGINE_DASHBOARD_URL=https://www.edutu.org/developers
EDUTU_ENGINE_MARKETING_URL=https://www.edutu.org/scholarship-engine
DEEPSEEK_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Configure `EDUTU_ENGINE_API_KEYS` before exposing the service. Protected routes require:

```txt
x-api-key: local-dev-key
```

or:

```txt
Authorization: Bearer local-dev-key
```

If `EDUTU_ENGINE_API_KEYS` is missing or empty, protected routes reject requests instead of failing open.

## First API Surface

```txt
GET  /
GET  /health
GET  /v1/health
GET  /openapi.json
GET  /v1/openapi.json
POST /v1/extract/url
POST /v1/scrape/run
```

`GET /` and `GET /v1` return a public product overview with docs links, dashboard links, auth headers, and the supported endpoints.
`GET /openapi.json` and `GET /v1/openapi.json` return the machine-readable OpenAPI document.

## Example

```bash
curl -X POST http://localhost:3100/v1/extract/url \
  -H "content-type: application/json" \
  -H "x-api-key: local-dev-key" \
  -d '{"url":"https://jobs.smartyacad.com/fsdh-launchpad-program-2026-for-recent-graduates/"}'
```

Discover the API first:

```bash
curl http://localhost:3100/
```

Inspect the OpenAPI spec:

```bash
curl http://localhost:3100/v1/openapi.json
```

## Core Contract

Every extracted opportunity keeps URLs separate:

```txt
detailUrl       = third-party article/detail page
applicationUrl  = real provider application link, if found
sourceUrl       = source/list page that produced it
```

If `applicationUrl` is missing, the opportunity is returned with `status: "needs_review"`.

The engine also blocks localhost, private IPs, and unsafe redirect targets when fetching URLs.
