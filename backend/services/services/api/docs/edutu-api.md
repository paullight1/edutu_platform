# Edutu API

Edutu API exposes the opportunity engine as a paid third-party API for apps, agents, scholarship portals, CRMs, and student success platforms.

## Identity and authentication boundary

- Package name: `edutu-api`
- Base URL: `https://api.edutu.org/v1`
- Local URL: `http://localhost:3000/v1`
- Clerk user session: sign in to Edutu to access `/developer/*` and `/dashboard/developer`, create projects, and manage keys. There is no separate developer login.
- API access: `/v1/*` requires an Edutu API key, sent as `X-Edutu-API-Key: <api-key>`, `x-api-key: <api-key>`, or `Authorization: Bearer <api-key>`.
- A Clerk bearer token is not an Edutu API key and is not accepted by `/v1/*`.
- Integration model: server-to-server by default. Browser-based partner apps need an approved CORS origin before calling the API directly.

The documentation endpoints `GET /v1`, `GET /v1/llms.txt`, and `GET /v1/openapi.json`, plus `GET /v1/health`, are public. `GET /v1/usage` and `GET /v1/categories` require an Edutu API key but are free.

## Projects and API Keys

Production keys must be high-entropy random values. With `API_KEY_PEPPER` configured (at least 16 characters), store only the peppered HMAC-SHA256 digest in `api_consumers.api_key_hash`; never store the raw key. Legacy pre-pepper SHA-256 hashes remain accepted indefinitely while the compatibility matcher is enabled; there is no automatic cutoff. Rotate legacy keys as an operational security action to write the peppered HMAC form, and plan any future compatibility deprecation explicitly. Without a configured pepper, local development retains the legacy SHA-256 fallback.

For local development, set `EDUTU_API_KEYS` to a comma-separated list of raw keys or `sha256:<hash>` values.

```bash
EDUTU_API_KEYS="$EDUTU_API_KEY" npm run dev
```

For local development without a pepper, create a legacy SHA-256 value before storage:

```bash
openssl rand -hex 32
printf '%s' "$EDUTU_API_KEY" | shasum -a 256
```

In production, set `API_KEY_PEPPER` and use the server's peppered HMAC-SHA256 hashing path. Existing legacy hashes remain compatible indefinitely while the matcher is enabled; rotate those keys as an operational security action to upgrade their stored digest, without relying on an unenforced deadline.

Create a project and generate a key at [`/dashboard/developer`](https://www.edutu.org/dashboard/developer) without buying credits. The raw key is shown once at creation/rotation; store it in a server-side secret manager. Link users to the dashboard for key generation; keys are not created through the data API.

Required scopes:

- `opportunities:read`
- `opportunities:sync`
- `usage:read`
- `recommendations:read`
- `events:write`

This list is exhaustive. `opportunities:read` covers opportunities, stats, detail, and categories; `opportunities:sync` covers sync; `usage:read` covers usage; the remaining scopes cover their same-named recommendation and event operations.

## Credits and endpoint pricing

- Every new account starts with **0 API credits**.
- Credit purchases are one-time top-ups. Credits do not expire and there is no recurring API subscription requirement.
- Free endpoints: `GET /v1/health`, `GET /v1/usage`, and `GET /v1/categories`. A key is still required for usage and categories.
- Chargeable endpoints: `GET /v1/opportunities`, `GET /v1/opportunities/stats`, `GET /v1/opportunities/sync`, `GET /v1/opportunities/:id`, `POST /v1/recommendations`, and `POST /v1/events`.
- Each chargeable request costs one credit. With zero credits, the API returns `402 Payment Required` with `code: "credits_exhausted"` before the paid operation runs.

## Endpoints

### Health

```http
GET /v1/health
X-Edutu-API-Key: $EDUTU_API_KEY
```

### Categories (free)

```http
GET /v1/categories
X-Edutu-API-Key: $EDUTU_API_KEY
```

### Usage (free)

```http
GET /v1/usage
X-Edutu-API-Key: $EDUTU_API_KEY
```

### List Opportunities

```http
GET /v1/opportunities?category=scholarship&limit=25&offset=0&sort=updated_desc&updatedSince=2026-05-01
X-Edutu-API-Key: $EDUTU_API_KEY
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
X-Edutu-API-Key: $EDUTU_API_KEY
```

Returns active opportunity counts and the latest catalog update timestamp.

### Get Opportunity

```http
GET /v1/opportunities/:id
X-Edutu-API-Key: $EDUTU_API_KEY
```

### Recommendations

```http
POST /v1/recommendations
Content-Type: application/json
X-Edutu-API-Key: $EDUTU_API_KEY

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
X-Edutu-API-Key: $EDUTU_API_KEY

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
    "nextCursor": null,
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

Opportunity objects are normalized for third-party users and do not expose internal status, raw scraper JSON, provider IDs, or admin review fields. The public projection fields are `id`, `object`, `title`, `description`, `category`, `canonicalCategory`, `type`, `eligibilityCriteria`, `fundingType`, `targetRegion`, `deadline`, `remote`, `urls.source`, `urls.apply`, `imageUrl`, `trust.verificationStatus`, `trust.lastVerifiedAt`, `trust.lastSeenAt`, `trust.qualityScore`, `match`, `matchReasons`, `matchRisks`, `aiSummary`, `aiTags`, and `updatedAt`. Admin approval creates a shared catalog record in `pending_review`/`unverified` state. Learner and `/v1` visibility begins only after verification/enrichment succeeds and the record transitions to `active`/`verified`; pending and rejected submissions are not returned.
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
    "code": "invalid_api_key",
    "details": []
  },
  "requestId": "request-id"
}
```

Zero-credit response (redacted):

```http
HTTP/1.1 402 Payment Required
```

```json
{"error":{"message":"API credits exhausted","status":402,"code":"credits_exhausted"},"requestId":"req_..."}
```

Common contract codes include `missing_api_key`, `invalid_api_key`, `scope_required`, `rate_limit_exceeded`, `quota_exceeded`, `credits_exhausted`, and `billing_unavailable`.

When credit reservation cannot be verified, a chargeable operation returns `503 Service Unavailable` with `code: "billing_unavailable"`; retry later and do not assume the paid operation executed.

## Quota and headers

Use `api_consumers.plan`, `monthly_quota`, and `allowed_scopes` to map paid plans to product access:

- Starter: `1,000` requests/month
- Growth: `10,000` requests/month
- Scale: custom quota

`GET /v1/health` is public. `GET /v1/usage` and `GET /v1/categories` are free in credit terms, but they still require an API key and count toward the applicable per-minute rate limit and monthly quota. Free means no credit debit, not an exemption from those request controls.

`api_usage_events` records request activity for usage and reporting. Chargeable API calls debit the account credit ledger by one credit; free endpoints do not.
`api_usage_buckets` enforces monthly quota atomically without scanning all usage events on every request.
`api_partner_events` records partner-side opportunity engagement so Edutu can report performance and improve recommendations.

## Server-to-server integration

Keep Edutu API keys on your backend, worker, or serverless function. A browser-visible key is not secret. Direct browser use requires an approved CORS origin and should be chosen only when exposing the key is acceptable; otherwise proxy requests through your server.
