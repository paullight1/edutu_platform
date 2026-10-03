---
name: edutu-backend-engineering
description: Implement or review Edutu's NestJS API, data models, authentication, authorization, AI, billing, notifications, scraper controls, and integrations. Use for backend or API work.
---

# Edutu Backend Engineering

The canonical NestJS API lives at `backend/services/services/api`. Start with the relevant module, neighboring tests, `docs/ARCHITECTURE.md`, and `docs/API.md`; do not assume the API path from older root guidance.

## Edutu constraints

- Keep privileged business rules, provider secrets, billing/credits/entitlements, moderation authority, scraper execution, and cross-user operations in the API.
- Treat Clerk as primary auth. Check guards and ownership in services/repositories, not only client visibility. Public and webhook routes must be explicitly justified and provider callbacks must verify signatures/replay protection.
- Use the existing NestJS module/controller/service/repository patterns, DTO/Zod validation, Drizzle/Postgres schema, and canonical migration directory. Inspect `package.json` before choosing commands or APIs.
- Maintain request IDs, bounded operations, rate limits, sanitized errors, and useful logs. For AI work, follow server-side provider routing, schema validation, usage/cost controls, and existing policy.
- For payment changes, trace checkout, provider callback, persistence/ledger, entitlement return, retries, reconciliation, and tests as one flow. For scraper work, trace source controls through normalization, review, and publication.
- Coordinate contract changes with `edutu-web-app`, `admin`, and the separate `edutumobile` boundary when they consume the route.
- Avoid broad refactors while implementing a feature. Preserve unrelated working-tree changes.

## Verification

Use the narrowest relevant tests first, then the package's lint/build/e2e commands when the scope warrants them. The API package scripts are authoritative. Report exactly what ran and what remains unverified.

## References

- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/DATA_MODEL.md`
- `backend/services/services/api/README.md`
