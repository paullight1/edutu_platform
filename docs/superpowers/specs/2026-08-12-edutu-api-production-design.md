# Edutu API Production Access and Credit Billing Design

**Date:** 2026-08-12  
**Status:** Approved for implementation planning  
**Scope:** Edutu API access, developer projects/API keys, one-time API-credit purchases, opportunity delivery, user opportunity submissions, and production readiness.

## Goal

Make the Edutu API production-ready so every signed-in Edutu user can generate an API key immediately, start with zero API credits, purchase non-expiring credits one time at a time, use those credits to retrieve Edutu opportunities, and submit opportunities that become globally available after approval.

## Product decisions

- Every verified/signed-in Edutu user can access the developer dashboard.
- There is no separate developer login. Clerk remains the identity provider.
- Users can create, rotate, and revoke API projects/keys without first purchasing credits.
- New users start with `0` API credits.
- Credit purchases are one-time top-ups; there is no recurring API subscription requirement.
- Purchased credits never expire and remain available until consumed.
- API health and usage inspection are free; opportunity/recommendation/event API calls consume one credit per request unless an explicit endpoint policy says otherwise.
- API requests with zero credits return structured `402 Payment Required` responses and do not execute the paid operation.
- Approved user-submitted opportunities enter the shared active catalog and are visible to Edutu users and API customers.
- User submissions remain pending review by default; no user can directly publish an active opportunity.

## Existing architecture to preserve

The implementation uses the current boundaries rather than introducing a second identity or billing system:

```text
Clerk user session
        │ Clerk bearer token
        ▼
NestJS authenticated developer routes
        │ creates/owns api_consumers row
        ▼
One-time raw API key shown once; hash stored server-side
        │ x-edutu-api-key / x-api-key / Authorization: Bearer <api-key>
        ▼
NestJS /v1 API key guard
        │ key → scope → rate limit → monthly quota → credit reservation
        ▼
Edutu opportunities catalog
```

The global NestJS `ClerkAuthGuard` continues to protect normal application routes. The `/v1` controller remains explicitly public to that global guard and is protected by `EdutuApiKeyGuard`, so a Clerk token cannot accidentally substitute for a third-party API key. The `/developer/*` routes remain protected by Clerk authentication and are not accessible with an Edutu API key.

Billing remains server-owned. The client sends only a catalog `productKey`; the backend resolves the product, creates an idempotent checkout intent, and fulfills credits only from a verified provider webhook. The canonical balance/ledger must be one system (`profiles.credits` plus `credit_transactions`) for API metering and purchases.

## Components and responsibilities

### 1. Identity and access

Files/components:

- `backend/services/services/api/src/auth/clerk-auth.guard.ts`: verify Clerk/Supabase bearer tokens and populate the canonical user context.
- `backend/services/services/api/src/developer/developer.controller.ts`: expose authenticated dashboard/project operations.
- `edutu-web-app/src/App.tsx`: keep `/dashboard/developer` behind `ProtectedRoute`.
- `edutu-web-app/src/services/developer.ts`: send Clerk bearer tokens to developer routes.

Rules:

- A valid Clerk-authenticated user with a verified email may create a project.
- No role, Pro entitlement, or API-credit balance is required for key creation.
- Server-side ownership checks must use authenticated user identity, not client-provided owner IDs.
- Email may be used only as a legacy ownership fallback where already required; new ownership records must use `owner_user_id`.

### 2. API key lifecycle

Files/components:

- `src/developer/developer.service.ts`: generate high-entropy keys, hash them, create projects, rotate keys, revoke keys, and return only non-secret summaries after creation.
- `src/edutu-api/edutu-api-key.guard.ts`: resolve active keys by prefix and constant-time secret verification.
- `src/common/api-key-hash.ts`: use `API_KEY_PEPPER` in production and support legacy hash migration only during the defined rotation window.
- `src/db/schema.ts` and `supabase/migrations/*api_consumers*`: store ownership, prefix, environment, scope, rate limit, status, revocation, and expiry metadata.

Key contract:

- Raw key format: `edu_test_<8 hex prefix>_<40 hex secret>` or `edu_live_<8 hex prefix>_<40 hex secret>`.
- The raw key is returned only in the create/rotate response and never persisted.
- `api_key_hash` is unique; `key_prefix` is unique for generated projects.
- Default scopes are limited to the documented opportunity/read, sync, usage, recommendation, and event scopes.
- Users may select scopes only from the allowlisted DTO enum.
- Revoke changes the project to `revoked` and records `revoked_at`; the guard rejects it immediately.

### 3. Credit ledger and purchases

Files/components:

- `src/billing/billing.controller.ts`: authenticated checkout/status routes and public signed webhook routes.
- `src/billing/billing-checkout.service.ts`: product lookup, checkout intent creation, idempotency, provider URL validation, and checkout creation.
- `src/billing/billing.service.ts`: billing status, provider webhook verification, and purchase fulfillment.
- `src/billing/billing-events.repository.ts` and related billing repositories: durable event/idempotency storage.
- `src/monetization/monetization.service.ts`: transactional credit debit/refund patterns.
- `src/billing/types/billing-checkout.types.ts`: make credit products explicit as `fulfillmentKind: "credits"`, `renewalMode: "one_time"`, `creditQuantity > 0`, and `validityDays: null`.

Credit contract:

- Every profile has a non-null integer credit balance defaulting to zero.
- A completed credit purchase creates exactly one positive `credit_transactions` ledger entry with a provider reference and purchase-related type.
- The profile balance and ledger entry are updated atomically under the existing privileged credit-operation guard.
- Provider retries, client retries, and reconciliation jobs are idempotent by provider event/reference and checkout intent.
- The fulfillment path rejects product/amount/currency mismatches instead of trusting client metadata.
- A successful one-time top-up has no expiry timestamp and never creates a recurring subscription entitlement.
- Payment/provider/database failures fail closed for fulfillment and API metering; no paid API call becomes free because billing is unavailable.

### 4. API metering and enforcement

Files/components:

- `src/edutu-api/edutu-api-key.guard.ts`: authentication, scope checks, rate limit, monthly quota, and credit reservation.
- `src/edutu-api/edutu-api-usage.service.ts`: atomic request-credit reservation and usage accounting.
- `src/edutu-api/edutu-api-usage.interceptor.ts`: durable usage event recording.
- `src/edutu-api/edutu-api.service.ts`: normalized opportunity/recommendation/category/event responses.

Required request order:

1. Resolve key and reject missing, inactive, revoked, or expired keys.
2. Check endpoint scope and reject insufficient scopes with `403`.
3. Enforce per-consumer rate limit.
4. Enforce monthly request quota.
5. For chargeable endpoints, atomically reserve one credit using a request ID/idempotency key.
6. Only then execute the endpoint operation.

Free endpoints:

- `GET /v1/health`.
- `GET /v1/usage`.

Chargeable endpoints:

- `GET /v1/opportunities`.
- `GET /v1/opportunities/stats`.
- `GET /v1/opportunities/sync`.
- `GET /v1/opportunities/:id`.
- `POST /v1/recommendations`.
- `POST /v1/events`.
- `GET /v1/categories` unless product pricing explicitly classifies it as free.

The final implementation must define and test the exact policy rather than leave it implicit in endpoint strings. Responses must include stable machine-readable codes such as `missing_api_key`, `invalid_api_key`, `scope_required`, `rate_limit_exceeded`, `quota_exceeded`, `credits_exhausted`, and `billing_unavailable`.

### 5. Opportunity submissions and publication

Files/components:

- `src/opportunity-submissions/opportunity-submissions.controller.ts`: authenticated submit/list/detail/respond routes and admin review routes.
- `src/opportunity-submissions/opportunity-submissions.service.ts`: pending submission storage, review state machine, approval conversion, notifications, and ownership checks.
- `src/opportunity-submissions/dto/opportunity-submission.dto.ts`: input validation.
- `src/opportunities/opportunities.service.ts`: catalog insertion and normal verification/enrichment pipeline.
- `src/opportunities/opportunities.controller.ts`: public learner feed and admin operations.

Publication state machine:

```text
authenticated user submits
        ↓
opportunity_submissions.status = pending
        ↓ admin review
approved ───────────────► opportunities.status = pending_review
                             ↓ verification/enrichment
                         opportunities.status = active
```

If the existing admin setting intentionally disables approval, auto-publish may remain available, but it must be an explicit server-side setting and must still pass the same validation and catalog insertion path. User input must never set `status: active` directly. Once the catalog row is active, it is returned by the learner feed and `/v1` API.

### 6. Production operations

Required production controls:

- Apply all API-consumer, credit-ledger, checkout-intent, and billing-event migrations before enabling the dashboard.
- Set `NODE_ENV=production`, `API_KEY_PEPPER` (at least 16 characters; use a strong random secret), Clerk secrets, database/Supabase secrets, provider product mappings, webhook secrets, and public URLs.
- Ensure `EDUTU_LOCAL_ADMIN_BYPASS` is absent/false in production.
- Ensure CORS includes only approved production origins and the API-key headers required by documented integrations.
- Configure API credit products with one-time renewal mode, positive credit quantities, correct currency/amount, and `validityDays: null`.
- Configure provider webhooks for both success and failure/reversal events, with signature verification and replay-safe event storage.
- Back up and reconcile credit balances against the ledger and payment provider before launch.
- Add alerting for webhook failures, billing reconciliation mismatches, API `402` spikes, `5xx` spikes, rate-limit abuse, and key-revocation/security events.
- Perform a live smoke test with a non-admin test account and a real/sandbox provider payment according to the selected environment.

## Error and security requirements

- Never expose raw API keys in logs, database queries, analytics, usage events, or dashboard summaries.
- Never trust client-supplied `ownerUserId`, credit quantity, price, currency, payment status, or publication status.
- Use constant-time API-key hash comparisons.
- Use structured error bodies and correct status codes.
- Preserve request IDs through guard, controller, usage event, and billing logs.
- Use idempotency for checkout creation, webhook fulfillment, and API credit reservation.
- Fail closed when credit reservation or payment fulfillment cannot be verified.
- Keep API keys server-to-server by default; browser integrations require explicit approved CORS origins and must understand that a browser-visible key is not secret.
- Redact payment payloads and user-provided opportunity metadata from logs where it can contain sensitive data.

## Acceptance criteria

### Identity and keys

- A new signed-in user can open `/dashboard/developer`.
- The user sees zero credits and can create a test or live project without purchasing credits.
- The create response contains a raw key once; subsequent dashboard responses never contain it.
- The user can rotate and revoke only their own projects.
- Another user cannot read, rotate, or revoke the project by changing the project ID.

### API access

- Missing/invalid/revoked/expired keys are rejected.
- Valid keys can retrieve active opportunities with documented filters and pagination.
- Scope, rate, quota, and credit checks are enforced server-side.
- Zero-credit paid calls return `402 credits_exhausted` without querying or mutating the opportunity result.
- Health and usage behavior matches the documented free-endpoint policy.

### Billing

- Every account starts at zero credits.
- A successful one-time purchase increases credits exactly once.
- Webhook retries do not duplicate credits.
- Credits do not expire and do not create a recurring subscription.
- Payment/product mismatch and provider outage do not grant credits.
- A failed database or ledger operation does not allow paid API usage through a fail-open path.

### Opportunity publication

- Authenticated users can submit valid opportunities.
- Submissions are isolated per user in list/detail/respond operations.
- Users cannot self-approve or publish directly.
- Admin approval creates/links a catalog opportunity and the active record is visible to all supported clients and API customers.
- Rejected and pending submissions are not returned by the public/API catalog.

### Production readiness

- Migrations are applied and verified in a staging-like database.
- Environment validation fails startup for missing production-critical secrets/configuration.
- API, billing, webhook, migration, and smoke tests pass.
- Logs, metrics, dashboards, alerts, rollback instructions, and key-revocation procedures are documented.

## Out of scope

- Separate developer accounts or a second login system.
- Recurring API subscriptions.
- Expiring credits.
- Letting users publish directly without review.
- Building a second opportunity database for API customers.
- Replacing Clerk, NestJS, Supabase/Postgres, or the current provider integration.
