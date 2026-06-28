# Edutu Engine API Production Improvements

## Review Scope

This document captures the production readiness areas to validate and improve for `edutuengineapi`.

The current shell session could not return file contents, so this is a first-pass production review based on the intended API-as-a-service model. It should be reconciled against the implementation once terminal access is stable.

## Highest Priority Improvements

### 1. API Key Security

API keys must be treated like passwords.

Required:

- Show raw key only once.
- Store only a hash of the key.
- Use a recognizable non-secret prefix for lookup.
- Support key rotation without downtime.
- Support immediate revocation.
- Track `last_used_at`.
- Never log raw API keys.

Recommended:

- Use `Authorization: Bearer <api_key>`.
- Redact keys from logs and errors.
- Use separate `test` and `live` keys.
- Add scopes to every key.

### 2. Authorization and Scopes

Do not treat a valid key as permission to do everything.

Required scopes:

- `opportunities:read`
- `opportunities:sync`
- `usage:read`

Every protected endpoint should explicitly require one or more scopes.

### 3. Rate Limits and Quotas

Rate limits protect reliability and cost.

Recommended starting limits:

- Free/test: 60 requests per minute, 5,000 requests per month.
- Starter: 300 requests per minute, 100,000 requests per month.
- Growth: 1,000 requests per minute, 1,000,000 requests per month.
- Enterprise: custom.

Implementation options:

- Redis/Valkey token bucket for per-minute limits.
- Database usage table for monthly quotas.
- Separate burst and sustained limits.

Return:

```http
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 289
X-RateLimit-Reset: 1780000000
```

### 4. Stable Public DTOs

The public API should not expose database rows directly.

Create explicit response DTOs for:

- Opportunity list item
- Opportunity detail
- Category
- Usage summary
- API key metadata
- Error response

This prevents scraper/internal schema changes from breaking customers.

### 5. Pagination

Use cursor pagination, not offset pagination, for opportunity feeds.

Recommended cursor:

- Encoded combination of `updated_at` and `id`.
- Stable sort order.
- Maximum `limit`, such as `100`.

This makes large feeds scalable and avoids duplicate/missing rows when data changes.

### 6. Observability

Every request should produce useful operational data.

Required:

- `request_id`
- API key prefix, never raw key
- project ID
- endpoint
- status code
- latency
- error code
- rate-limit decision

Metrics:

- Requests per minute
- p50/p95/p99 latency
- 4xx/5xx error rates
- Top API keys by usage
- Quota exceeded count
- Database query latency
- Cache hit rate

### 7. OpenAPI Documentation

Publish an OpenAPI spec for customers.

Docs should include:

- Authentication
- Endpoint reference
- Error codes
- Pagination
- Rate limits
- SDK examples
- Changelog
- Status page link

Generate the spec from code where possible.

### 8. Data Quality Controls

Global opportunity data needs quality guarantees.

Recommended checks:

- Required fields: title, description, application URL, category.
- Deadline validation.
- Duplicate detection by canonical URL and title/provider similarity.
- Source trust score.
- Last verified timestamp.
- Moderation status.
- Broken link detection.

Only expose records with a public/approved status.

### 9. Multi-Tenant Boundaries

External API customers are tenants.

Ensure:

- Every API key belongs to a project.
- Every usage record belongs to a project.
- Every audit log belongs to a project/user.
- Admin APIs cannot be reached by public API keys.
- API keys cannot access customer data from another project.

### 10. Production Configuration

Required environment variables should be validated at startup.

Recommended:

- Fail fast on missing database URL, key pepper, Redis URL, and required secrets.
- Use separate staging and production configs.
- Use HTTPS-only public URLs.
- Disable stack traces in public production errors.
- Configure CORS intentionally; server-to-server API usually does not need broad browser CORS.

## Suggested Database Tables

### `api_projects`

- `id`
- `owner_user_id`
- `name`
- `status`
- `created_at`
- `updated_at`

### `api_keys`

- `id`
- `project_id`
- `name`
- `key_prefix`
- `key_hash`
- `scopes`
- `environment`
- `status`
- `rate_limit_per_minute`
- `monthly_quota`
- `last_used_at`
- `expires_at`
- `created_at`
- `revoked_at`

### `api_usage_events`

- `id`
- `project_id`
- `api_key_id`
- `request_id`
- `method`
- `path`
- `status_code`
- `latency_ms`
- `units`
- `created_at`

### `api_audit_logs`

- `id`
- `project_id`
- `actor_user_id`
- `action`
- `target_type`
- `target_id`
- `metadata`
- `created_at`

## Security Checklist

- Raw API keys are never persisted.
- API keys are redacted from logs.
- Request bodies have size limits.
- Query parameters are validated.
- Database queries are parameterized.
- Public errors do not expose stack traces.
- Admin endpoints require user auth and admin roles, not public API keys.
- Rate limiting cannot be bypassed with different IPs.
- Revoked keys stop working immediately.
- Usage/audit records are append-only from the customer perspective.

