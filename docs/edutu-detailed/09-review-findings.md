# 09. Review Findings

This file records concrete findings from local code inspection and the four parallel review lanes. It is intentionally direct: these are not all defects, but they are the areas most likely to cause production drift, runtime failures, or operational confusion.

## Critical and High-Priority Findings

### 1. Canonical opportunity schema drift

The active scraper and admin paths expect canonical fields such as:

- `canonical_url`
- `content_fingerprint`
- `quality_score`
- `validation_status`
- `image_url`
- `close_date`
- `is_featured`

The base schemas and Drizzle schema do not always define the same shape. Backend migrations add compatibility columns, so deployment order matters.

Impact: scraper/admin/web/API paths can see different opportunity records or fail on missing columns.

Recommended action: define one canonical `opportunities` schema and add a schema-drift CI check.

### 2. Drizzle and Supabase opportunity models are not equivalent

The NestJS internal product routes often use canonical Supabase opportunity rows first and Drizzle fallback second. The third-party `/v1` Edutu API uses Drizzle `opportunities`.

Impact: partner API can expose incomplete/stale data compared with the user-facing opportunity engine.

Recommended action: either mirror canonical rows into Drizzle reliably or update `/v1` to read the canonical source.

### 3. User ID model is inconsistent

Backend Drizzle uses UUID-shaped `profiles.user_id`. Mobile migrations convert many `user_id` columns to text for Clerk compatibility. Billing and credit migrations mix UUID, text, and Clerk helper approaches.

Impact: RLS, credits, CVs, pro status, notifications, and webhook writes can fail or create unreachable rows.

Recommended action: define the canonical app user ID type and migration strategy before adding more user-state tables.

### 4. Marketplace financial operations are not transactionally safe

Marketplace enrollment can update buyer credits, seller credits, transactions, enrollment, and listing count without an explicit database transaction or row locking.

Impact: race conditions can create negative balances, duplicate enrollments, or mismatched transaction records.

Recommended action: move marketplace purchase/enrollment into a single database transaction or stored procedure.

### 5. Credit transaction type mismatch

Inspection found functions that insert transaction types not allowed by the apparent check constraint, such as `add` or `credit` depending on migration path.

Impact: credit grants/purchases may fail at runtime.

Recommended action: reconcile `credit_transactions.type` constraints with `add_credits`, `spend_credits`, RevenueCat, Paystack, admin grant, and creator earning flows.

### 6. Possible n8n webhook auth weakness

The `n8n-webhook` edge function was reported to validate an API key only if `x-api-key` is present.

Impact: missing-key requests may proceed if not blocked elsewhere.

Recommended action: require the API key header unconditionally and add tests for missing, wrong, and valid keys.

### 7. Scraper jobs can overlap

The dynamic cron callback calls `runScraper`; inspection did not find a lock preventing overlap.

Impact: duplicate imports, source throttling, race conditions in `scraped_urls`, and higher AI cost.

Recommended action: add a distributed lock or active-job guard.

### 8. Scraper retention can delete too broadly

Retention was reported to delete old `opportunities` rows based on retention settings, not necessarily only scraper-owned rows.

Impact: manually curated or partner-imported opportunities can be removed.

Recommended action: scope retention by source/job ownership and soft-delete first.

### 9. Mobile deep-link mismatch

Mobile parser expects `edutu://opportunity/:id`, while widget/mobile-control emits `edutu://opportunities/:id`. Universal links also mention different domains.

Impact: widget or campaign links can fail to open the expected opportunity detail screen.

Recommended action: define one deep-link contract and update parser, widget, campaign creatives, and app config.

### 10. Billing entitlement source is split

Web/backend uses Paystack-oriented billing tables and mobile uses RevenueCat client/webhook paths.

Impact: a user can appear pro in one surface and not pro in another.

Recommended action: choose one entitlement table/source and have both Paystack and RevenueCat update it idempotently.

## Medium-Priority Findings

### Admin auth differs by surface

Standalone admin uses Supabase session plus `profiles.role`; embedded admin checks Clerk metadata, Supabase role, and env admin emails; backend uses `AdminGuard`.

Recommended action: write a single admin identity contract.

### Direct Supabase client access remains broad

Web, mobile, and admin directly use Supabase for many product tables.

Recommended action: classify all direct Supabase access as permanent RLS read, temporary migration path, or must move to NestJS.

### AI fallback settings are not fully implemented

`fallbackProvider` and `fallbackModel` are stored, but fallback execution after primary failure needs implementation.

Recommended action: implement fallback generation and log provider failover.

### Roadmap DTO validation is incomplete

Zod schemas exist for roadmaps, but controller usage is incomplete.

Recommended action: apply `ZodValidationPipe` to roadmap writes.

### Notifications do not fully use preferences

Preferences and quiet hours are stored, but broadcast delivery enforcement needs confirmation. Expo push sending also needs chunking and receipt handling.

Recommended action: enforce user preferences at send time and add push receipt processing.

### Delete-account may leave chat rows

Mobile review found `delete-account` deletes `chat_messages` by `user_id`, while chat messages may be keyed by `thread_id`.

Recommended action: verify DB cascades and delete by thread ownership.

### Offline queue is partial

Mobile has offline action queue infrastructure, but several save/apply/goal paths may still call Supabase directly.

Recommended action: route all offline-capable mutations through the queue.

### Archived docs can mislead contributors

Archived scraper docs still recommend patterns that conflict with current architecture.

Recommended action: add archival banners to `other-files` docs and move active docs to one canonical location.

## Verification Tasks

1. Run schema comparison between all SQL migration homes and Drizzle schema.
2. Test `/v1/opportunities` against canonical Supabase opportunity data.
3. Test Paystack and RevenueCat webhook idempotency with duplicate events.
4. Test n8n webhook with missing `x-api-key`.
5. Test scraper overlap by triggering manual run during scheduled run.
6. Test mobile widget deep link on a device/simulator.
7. Test Supabase RLS for mobile text user IDs and backend UUID user IDs.
8. Test admin access for non-admin Supabase user, Clerk admin, Clerk moderator, and env allowlisted user.

