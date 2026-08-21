# Backend Boundary

Edutu has one canonical Node backend runtime in this repository:

```text
backend/services/services/api
```

That directory contains the NestJS API, production Docker/Render configuration, database access, auth, billing, opportunity intelligence, scraper controls, admin mutations, and server-side AI integrations.

The voice gateway is a separate runtime at:

```text
backend/services/services/voice
```

The old root-level Express scraper API (`server.js`, `scraper.js`, `database.js`, and its standalone npm package) was retired during the architecture-simplification work after confirming that current CI, admin clients, and production deployment configuration use the NestJS API instead. Do not recreate a second backend runtime under `backend/`.

## API commands

```bash
cd backend/services/services/api
npm install
npm run dev
npm run test
npm run test:e2e
npm run build
npm run lint
```

## Voice commands

```bash
cd backend/services/services/voice
npm install
npm run typecheck
npm run test
npm run build
npm run test:smoke
```

## Scraping ownership

Operational scraper controls are owned by the NestJS `api/scraper` module. The separate `crawl4ai-scraper/` project remains the Python crawling/extraction service. Neither requires a second Express API at the `backend/` root.

The repeated `services/services` physical path is known architecture debt and will be flattened only after logical module/package ownership is stable and deployment/CI paths can move atomically.
