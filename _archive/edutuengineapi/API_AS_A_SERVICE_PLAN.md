# Edutu Engine API as a Service Plan

## Objective

Turn Edutu Engine into a reliable API product that lets external platforms generate API keys and access global opportunities stored in Edutu's database.

The service should expose curated opportunity search, detail, category, and sync endpoints while protecting Edutu's data, enforcing usage limits, and giving customers clear operational guarantees.

## Target Customers

- Universities and student portals that want scholarship and career opportunity feeds.
- Edtech products that need verified global opportunities.
- Community platforms that want opportunity recommendations for their users.
- Internal Edutu surfaces such as the web app, mobile app, admin dashboard, and scraper tooling.

## Core Product Surface

### Developer Account Flow

1. User signs in to Edutu.
2. User opens developer settings.
3. User creates an API project.
4. User generates an API key.
5. API key is shown once and stored hashed server-side.
6. User can rotate, revoke, name, and scope keys.
7. User can view usage, errors, quota, and billing tier.

### Minimum API Key Metadata

Each API key should have:

- `id`
- `project_id`
- `owner_user_id`
- `key_hash`
- `key_prefix`
- `name`
- `scopes`
- `environment` (`test`, `live`)
- `status` (`active`, `revoked`, `expired`)
- `rate_limit_per_minute`
- `monthly_quota`
- `last_used_at`
- `created_at`
- `expires_at`
- `revoked_at`

Never store raw API keys after creation.

## Recommended Public Endpoints

### Health

```http
GET /v1/health
```

Returns service status and version. Does not require authentication.

### Opportunity Search

```http
GET /v1/opportunities
Authorization: Bearer edu_live_xxx
```

Query parameters:

- `q`
- `category`
- `country`
- `remote`
- `deadline_after`
- `deadline_before`
- `difficulty`
- `limit`
- `cursor`
- `sort`

Response should be cursor-paginated:

```json
{
  "data": [],
  "pagination": {
    "next_cursor": null,
    "has_more": false
  }
}
```

### Opportunity Detail

```http
GET /v1/opportunities/{id}
Authorization: Bearer edu_live_xxx
```

Returns one normalized opportunity with full description, requirements, benefits, source, deadline, location, and application URL.

### Categories

```http
GET /v1/categories
Authorization: Bearer edu_live_xxx
```

Returns stable category slugs and labels.

### Delta Sync

```http
GET /v1/opportunities/sync?updated_after=2026-06-01T00:00:00Z
Authorization: Bearer edu_live_xxx
```

Allows customers to sync changes without repeatedly pulling the full dataset.

### Usage

```http
GET /v1/usage
Authorization: Bearer edu_live_xxx
```

Returns usage for the current key/project.

## Authentication Model

Use API keys for external server-to-server integrations.

Recommended format:

```text
edu_test_<public_prefix>_<secret>
edu_live_<public_prefix>_<secret>
```

Validation steps:

1. Parse key prefix and environment.
2. Hash submitted key using a slow hash or HMAC with a server-side pepper.
3. Look up active key by prefix and hash.
4. Check revoked/expired status.
5. Check scopes.
6. Enforce quota and rate limits.
7. Attach `project_id`, `owner_user_id`, and scopes to request context.

## Scopes

Start small:

- `opportunities:read`
- `opportunities:sync`
- `usage:read`

Add admin/write scopes later only if needed.

## Data Contract

The public API should expose a stable normalized shape, not raw scraper rows.

Recommended opportunity fields:

- `id`
- `title`
- `provider`
- `description`
- `category`
- `difficulty`
- `location`
- `countries`
- `remote`
- `deadline`
- `application_url`
- `source_url`
- `requirements`
- `benefits`
- `tags`
- `updated_at`
- `created_at`

Avoid leaking internal fields such as scrape logs, scoring internals, admin notes, raw HTML, or moderation flags.

## Versioning

Use path-based versions:

```text
/v1/...
```

Breaking changes go to `/v2`. Additive fields can be added to `/v1`.

## Error Format

Use one consistent error response:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded.",
    "request_id": "req_123",
    "docs_url": "https://docs.edutu.org/errors/rate_limit_exceeded"
  }
}
```

Recommended status codes:

- `400` invalid request
- `401` missing or invalid API key
- `403` valid key but missing scope
- `404` resource not found
- `409` state conflict
- `422` validation error
- `429` rate limit exceeded
- `500` server error
- `503` dependency unavailable

## Launch Checklist

- API key generation and revocation exist.
- Raw API keys are never stored.
- Rate limiting exists per key and per IP.
- Cursor pagination exists on list endpoints.
- Request IDs exist on every response.
- Audit logs exist for key creation, rotation, revoke, and privileged actions.
- Public API responses use a stable DTO.
- OpenAPI documentation is generated and published.
- Integration examples exist for Node, Python, and cURL.
- Production monitoring tracks latency, error rate, request count, quota usage, and dependency health.
