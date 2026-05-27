# Edutu API

Edutu API exposes the opportunity engine as a paid third-party API for apps, agents, scholarship portals, CRMs, and student success platforms.

## Identity

- Package name: `edutu-api`
- Base URL: `https://api.edutu.org/v1`
- Local URL: `http://localhost:3000/v1`
- Auth: `X-Edutu-API-Key: <api-key>` or `Authorization: Bearer <api-key>`
- Integration model: server-to-server by default. Browser-based partner apps need an approved CORS origin before calling the API directly.

## API Keys

Production keys must be high-entropy random values. Store only SHA-256 hashes in `api_consumers.api_key_hash`.

For local development, set `EDUTU_API_KEYS` to a comma-separated list of raw keys or `sha256:<hash>` values.

```bash
EDUTU_API_KEYS=edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b npm run dev
```

Create a production consumer by hashing the key before storage:

```bash
openssl rand -hex 32
printf '%s' 'edutu_live_<64_hex_chars>' | shasum -a 256
```

Required scopes:

- `opportunities:read`
- `recommendations:read`
- `events:write`

## Endpoints

### Health

```http
GET /v1/health
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b
```

### List Opportunities

```http
GET /v1/opportunities?category=scholarship&limit=25&offset=0&sort=updated_desc&updatedSince=2026-05-01
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b
```

Query parameters:

- `q`
- `category`
- `type`
- `fundingType`
- `targetRegion`
- `remote=true|false`
- `deadlineFrom`
- `deadlineTo`
- `updatedSince` for incremental sync
- `includeExpired=true|false`
- `includeTotal=true|false` for exact counts; default avoids expensive counts
- `limit` max `100`
- `offset`
- `sort=updated_desc|updated_asc|created_desc|created_asc|deadline_asc|deadline_desc`

For continuous partner sync, poll with `sort=updated_asc&updatedSince=<last_seen_updatedAt>` and persist the highest `updatedAt` returned.

### Opportunity Catalog Stats

```http
GET /v1/opportunities/stats
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b
```

Returns active opportunity counts and the latest catalog update timestamp.

### Get Opportunity

```http
GET /v1/opportunities/:id
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b
```

### Recommendations

```http
POST /v1/recommendations
Content-Type: application/json
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b

{
  "profile": {
    "country": "Nigeria",
    "skills": ["data analysis", "python"],
    "interests": ["scholarships", "technology"]
  },
  "preferences": {
    "preferredCategories": ["scholarship"],
    "preferredRegions": ["Europe", "Remote"],
    "remoteOnly": false
  },
  "message": "Find undergraduate scholarships for computer science students.",
  "limit": 10,
  "minMatchScore": 50
}
```

### Track Partner Events

Use this when a user in a partner product views, clicks, saves, dismisses, or applies to an opportunity.

```http
POST /v1/events
Content-Type: application/json
X-Edutu-API-Key: edutu_test_8b2c4f6e9a1d4c7f8e0b2a5c6d9f1a3b

{
  "eventType": "click",
  "opportunityId": "00000000-0000-0000-0000-000000000000",
  "externalUserId": "partner-user-123",
  "sessionId": "session-abc",
  "source": "web",
  "metadata": {
    "placement": "dashboard"
  }
}
```

Supported event types:

- `impression`
- `view`
- `click`
- `save`
- `apply`
- `dismiss`
- `recommendation_shown`

## Response Shape

List endpoints return:

```json
{
  "object": "list",
  "data": [],
  "meta": {
    "limit": 25,
    "offset": 0,
    "nextOffset": null,
    "total": null,
    "hasMore": false,
    "generatedAt": "2026-05-22T00:00:00.000Z",
    "requestId": "request-id",
    "quota": {
      "limit": 1000,
      "remaining": 999,
      "resetAt": "2026-06-01T00:00:00.000Z"
    }
  }
}
```

Opportunity objects are normalized for third-party users and do not expose internal status, raw scraper JSON, provider IDs, or admin review fields.
Each opportunity includes a `trust` block:

```json
{
  "trust": {
    "verificationStatus": "verified",
    "lastVerifiedAt": "2026-05-23T00:00:00.000Z",
    "lastSeenAt": "2026-05-23T00:00:00.000Z",
    "qualityScore": 92
  }
}
```

Verification statuses include `unverified`, `verified`, `stale`, `broken_link`, `expired`, and `needs_review`.

## Response Headers

Every authenticated `/v1` response includes:

- `X-Edutu-Request-Id`
- `X-Edutu-Quota-Limit`
- `X-Edutu-Quota-Remaining`
- `X-Edutu-Quota-Reset`

Error bodies use a stable shape:

```json
{
  "error": {
    "message": "Invalid query payload",
    "status": 400,
    "details": []
  },
  "requestId": "request-id"
}
```

## Monetization

Use `api_consumers.plan`, `monthly_quota`, and `allowed_scopes` to map paid plans to product access:

- Starter: `1,000` requests/month
- Growth: `10,000` requests/month
- Scale: custom quota

`api_usage_events` records billable request activity for usage-based billing and reporting.
`api_usage_buckets` enforces monthly quota atomically without scanning all usage events on every request.
`api_partner_events` records partner-side opportunity engagement so Edutu can report performance and improve recommendations.
