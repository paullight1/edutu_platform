# DEPRECATED — Do not use

**Status:** Retired on 2026-06-26. This standalone service is no longer the product.

## Why it was retired

This folder was a standalone "Engine API" facade that:

- Served **5 hardcoded fake scholarship rows** (`example.edu` URLs) — no real database.
- Persisted API keys, projects, usage, and billing to a **local JSON file** (`edutuengineapi-data.json`).
- Had a **broken developer bootstrap flow** (management routes trapped behind the API-key guard).
- Contained a **mock `billing/mock-success` endpoint that let users self-pay** for free, plus a secret-prefix leak.
- Hashed keys with plain SHA-256 and enforced rate limits only in-process.

## Where the real product lives

The actual, production-grade Scholarship API **already exists inside the main platform** and is the single product going forward:

```
edutu-platform/backend/services/services/api/src/edutu-api/
edutu-platform/backend/services/services/api/src/developer/
edutu-platform/backend/services/services/api/src/billing/
```

The real backend is **DB-backed (Supabase/Drizzle)**, **Clerk-authenticated**, has **real Paystack checkout + signed webhooks**, **atomic monthly-quota + credit metering**, **scoped keys**, and a **complete `/v1` surface** (`opportunities`, `opportunities/stats`, `opportunities/sync`, `recommendations`, `events`, `categories`, `usage`, `health`).

## Migration pointers

- API key generation/rotate/revoke → `developer.service.ts`
- Public data surface → `edutu-api.controller.ts` (`/v1/...`)
- Payments → `billing.service.ts` (real Paystack, not the mock here)
- Key validation → `edutu-api-key.guard.ts`
- OpenAPI → `edutu-api-docs.controller.ts` (`GET /v1/openapi.json`)

Nothing in the platform imports or depends on this archived folder. It is preserved for reference only.
