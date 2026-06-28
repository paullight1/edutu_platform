# Edutu Engine API Implementation Audit Checklist

## Purpose

Use this checklist to validate whether `edutuengineapi` is ready to become an API-as-a-service product where users generate API keys and access Edutu's global opportunity database.

The earlier planning docs define the target state. This file defines the code evidence needed before the review can be considered complete.

## Current Status

Created planning docs:

- `API_AS_A_SERVICE_PLAN.md`
- `PRODUCTION_IMPROVEMENTS.md`
- `SCALABILITY_AND_TESTING.md`

Still required:

- Inspect actual routes, auth, data access, tests, and deployment config.
- Separate existing functionality from missing production work.
- Add file/line-grounded findings once shell access is stable.

## Functionality To Verify

### Entrypoint And Runtime

Evidence needed:

- Main app/server entrypoint.
- Package/runtime configuration.
- Build and start commands.
- Environment variable loading.
- Health endpoint.

Pass criteria:

- The service can run independently in production.
- Required config is validated at startup.
- A health endpoint exists and does not require auth.

### Public Opportunity API

Evidence needed:

- Opportunity list endpoint.
- Opportunity detail endpoint.
- Query/filter validation.
- Pagination implementation.
- DTO/serializer layer.
- Database query layer.

Pass criteria:

- Only public/approved opportunities are returned.
- Responses do not expose scraper/admin/internal fields.
- Descriptions are full enough for external platforms.
- Pagination is cursor-based or has a migration path away from offset pagination.

### API Key Lifecycle

Evidence needed:

- API key generation endpoint.
- API key database schema/model.
- Key hashing logic.
- Key revoke/rotate support.
- API key metadata returned to users.

Pass criteria:

- Raw keys are shown once.
- Only hashes are stored.
- Keys can be named, revoked, rotated, scoped, and separated into test/live environments.

### API Key Authentication

Evidence needed:

- Auth middleware/guard.
- Scope checks.
- Invalid/revoked/expired key handling.
- Redaction in logs.

Pass criteria:

- Every protected public endpoint requires a valid API key.
- A valid key only grants its assigned scopes.
- Raw API keys are never logged or returned.

### Usage And Quotas

Evidence needed:

- Usage event table/model.
- Per-key/project request logging.
- Rate-limit implementation.
- Monthly quota implementation.
- Usage summary endpoint.

Pass criteria:

- Usage is tracked per API key and project.
- Rate limits return `429`.
- Customers can see their own usage.

## Security Checks

Required checks:

- Public API keys cannot call admin endpoints.
- API keys are scoped to one project/tenant.
- Raw keys are not stored.
- Secrets are not committed.
- Production errors do not expose stack traces.
- Query params and request bodies are validated.
- Request size limits are enforced.
- CORS is intentionally configured.

## Scalability Checks

Required checks:

- Opportunity queries use indexes for common filters.
- Public list/sync endpoints avoid large offset pagination.
- Rate limiting uses Redis/Valkey or another shared store in production.
- Hot reads can be cached.
- Scraping/enrichment does not run inline during public API requests.
- Dependency failures return controlled `503` responses with request IDs.

## Test Coverage Required

Minimum tests:

- Health endpoint succeeds.
- Missing API key returns `401`.
- Invalid API key returns `401`.
- Revoked API key returns `401`.
- Key without required scope returns `403`.
- Valid key can list opportunities.
- Only public opportunities are returned.
- Pagination returns stable next cursor.
- Rate-limited key returns `429`.
- Usage is recorded after a request.
- Public response matches OpenAPI schema.

## Commands To Run When Shell Access Recovers

```bash
find edutuengineapi -maxdepth 3 -type f | sort
cat edutuengineapi/package.json
rg -n "api.?key|Authorization|Bearer|scope|rate|quota|usage" edutuengineapi
rg -n "opportunit|scholarship|deadline|category|cursor|pagination|limit|offset" edutuengineapi
rg -n "CREATE TABLE|api_keys|usage|project|tenant|schema|drizzle|prisma|supabase" edutuengineapi
```

Then run the project build/test commands discovered from its package or runtime config.

## Completion Criteria

The review is complete only when:

- Current routes are listed.
- Current auth behavior is documented.
- Current opportunity data flow is documented.
- Current tests are reviewed.
- Production blockers include file references.
- The planning docs are updated to distinguish existing functionality from missing work.

