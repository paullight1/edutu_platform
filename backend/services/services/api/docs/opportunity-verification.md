# Opportunity Verification

The opportunity database is designed to grow to tens or hundreds of thousands of scholarships and global opportunities without losing trust.

## Lifecycle Fields

Each opportunity tracks:

- `first_seen_at`: when Edutu first discovered it.
- `last_seen_at`: when a scraper/import last saw it.
- `last_verified_at`: when Edutu last checked the opportunity link.
- `verification_status`: `unverified`, `verified`, `stale`, `broken_link`, `expired`, or `needs_review`.
- `verification_attempts`: total verification attempts.
- `verification_next_check_at`: next scheduled check.
- `last_http_status`: last HTTP status returned by the application/source URL.
- `broken_link_count`: repeated failure counter.

## Verification Rules

- Expired deadlines become `expired` and are removed from active partner results.
- Valid application/source links become `verified`.
- Temporary failures become `stale` and are retried soon.
- Hard failures such as `404` or repeated failures become `broken_link` and move to `pending_review`.
- Opportunities close to deadline are checked more often than long-running opportunities.

## Admin Endpoints

```http
GET /opportunities/admin/verification/stats
```

Returns catalog verification coverage and stale/broken counts.

```http
POST /opportunities/admin/verification/run
Content-Type: application/json

{
  "limit": 500,
  "concurrency": 5,
  "maxAgeHours": 24,
  "dryRun": false
}
```

Runs a bounded verification batch.

```http
POST /opportunities/admin/verification/:id
Content-Type: application/json

{
  "dryRun": false
}
```

Rechecks one opportunity.

## Scheduled Verification

The verifier is opt-in. Enable it in production:

```bash
OPPORTUNITY_VERIFICATION_ENABLED=true
OPPORTUNITY_VERIFICATION_BATCH_SIZE=250
OPPORTUNITY_VERIFICATION_CONCURRENCY=5
```

The scheduled job runs hourly and processes due opportunities in small batches. This avoids scanning or checking the whole catalog at once.

## Large-Volume Operating Model

For heavy scraping:

1. Scrapers upsert by `canonical_url`.
2. Every scrape refreshes `last_seen_at`.
3. New or changed opportunities get `verification_next_check_at = now()`.
4. The verifier continuously checks due opportunities.
5. Partner API responses include the `trust` block.
6. Partner clicks/applies are recorded in `api_partner_events`, so high-traffic opportunities can be prioritized for future verification.
