# Edutu Engine API Scalability and Testing Plan

## Scalability Goals

The API should support external platforms pulling global opportunities without degrading the core Edutu app.

Initial goals:

- p95 latency under 500 ms for cached opportunity list requests.
- p95 latency under 800 ms for uncached filtered opportunity searches.
- 99.9% monthly availability target after launch.
- No single customer can exhaust shared capacity.
- Opportunity sync endpoint supports large customers efficiently.

## Architecture Recommendations

### Separate Public API From Internal Admin Workloads

Keep public API endpoints separate from scraper/admin endpoints.

Benefits:

- Easier rate limiting.
- Safer authorization.
- Cleaner API contracts.
- Better scaling and caching.

### Add a Cache Layer

Use Redis/Valkey for:

- Rate limiting
- Hot opportunity queries
- Category lists
- API key metadata cache

Cache keys should include:

- endpoint version
- query filters
- customer tier if response differs by tier

Use short TTLs for search results and longer TTLs for stable category data.

### Database Indexing

Opportunity API queries should have indexes for common filters:

- `status`
- `category`
- `deadline`
- `country`
- `remote`
- `updated_at`
- full-text search over title/provider/description

Recommended composite indexes:

- `(status, updated_at, id)`
- `(status, category, deadline)`
- `(status, deadline)`

Use database explain plans before launching high-traffic endpoints.

### Cursor Pagination

All list/sync endpoints should use cursor pagination.

Avoid:

```sql
LIMIT 50 OFFSET 50000
```

Prefer:

```sql
WHERE (updated_at, id) > (:cursor_updated_at, :cursor_id)
ORDER BY updated_at, id
LIMIT 100
```

### Queue Heavy Work

Do not make public API requests wait for:

- scraper refreshes
- enrichment
- duplicate cleanup
- link checks
- customer usage aggregation

Use background jobs for those tasks.

### Protect Shared Dependencies

Add timeouts and circuit breakers around:

- database
- Supabase
- Redis
- AI enrichment services
- scraper dependencies

If a dependency fails, return a controlled `503` error with a request ID.

## Test Strategy

### Unit Tests

Cover:

- API key parsing
- API key hashing and verification
- scope checks
- rate-limit decisions
- cursor encode/decode
- query DTO validation
- error response formatting
- opportunity DTO mapping

### Integration Tests

Cover:

- valid API key can call opportunity list.
- invalid API key gets `401`.
- revoked key gets `401`.
- valid key without scope gets `403`.
- limit over maximum is rejected or clamped.
- cursor pagination returns stable next page.
- only public/approved opportunities are returned.
- usage records are written.
- rate limit returns `429`.

### Contract Tests

Maintain an OpenAPI schema and test responses against it.

Contract tests should prevent accidental breaking changes to:

- field names
- field types
- required fields
- error format
- pagination format

### Load Tests

Recommended scenarios:

1. 100 customers each doing light search traffic.
2. 10 customers doing sync jobs concurrently.
3. One customer exceeding limits.
4. Cache cold start.
5. Database latency spike.

Track:

- throughput
- p50/p95/p99 latency
- error rate
- CPU/memory
- database connections
- Redis operations

### Security Tests

Cover:

- raw API key never appears in logs.
- API key cannot call admin endpoints.
- expired/revoked keys are denied.
- keys from one project cannot read another project's usage.
- malformed cursors do not crash the service.
- query injection attempts are rejected.
- very large query strings and request bodies are rejected.

## CI Requirements

Every pull request should run:

- typecheck
- lint
- unit tests
- integration tests against a test database
- OpenAPI schema generation check
- migration check

Recommended minimum commands:

```bash
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
```

## Release Process

Use staged rollout:

1. Deploy to staging.
2. Run smoke tests.
3. Run contract tests.
4. Run a small load test.
5. Deploy to production.
6. Verify health endpoint.
7. Verify one test API key can search opportunities.
8. Watch metrics for 30 minutes.

## Production Readiness Gates

Do not launch external API keys until:

- API keys are hashed and revocable.
- Rate limits are enforced.
- Public opportunity DTOs are stable.
- Cursor pagination exists.
- Usage tracking exists.
- OpenAPI docs exist.
- Integration tests cover auth and opportunity access.
- Monitoring and alerting are configured.
- Admin and public API permissions are separated.

