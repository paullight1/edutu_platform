# Edutu API Production Access and Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Ship a production-ready Edutu developer API where every signed-in user can create API keys at zero balance, buy non-expiring one-time credits, retrieve Edutu opportunities, and publish approved user submissions globally.

**Architecture:** Preserve Clerk as the only user identity system and NestJS as the application/API boundary. Clerk bearer tokens authorize the developer dashboard and key-management routes; generated Edutu API keys authorize /v1 integrations. Use one canonical credit ledger (profiles.credits plus credit_transactions) with server-owned product snapshots, verified provider webhooks, idempotent fulfillment, and fail-closed metering.

**Tech Stack:** NestJS, TypeScript, Drizzle/PostgreSQL, Supabase, Clerk, Bachs checkout/webhooks, legacy Paystack compatibility, React/Vite, Jest, Supertest, SQL migrations.

## Global Constraints

- Every signed-in user may create a developer project and API key without Pro status or existing credits.
- New users start at exactly 0 API credits.
- API credits are purchased one time and never expire.
- API health and usage inspection are free; chargeable API calls require at least one credit.
- A zero-credit chargeable API request returns structured HTTP 402 and does not execute the operation.
- Approved user submissions enter the shared opportunities catalog for all users and API customers.
- Users cannot directly publish an active opportunity.
- No raw API key, payment secret, or raw webhook payload may be exposed in logs or persisted outside intended secure records.
- Production must fail startup when critical API-key, Clerk, database, or enabled-billing configuration is missing.
- Existing unrelated worktree changes belong to the user and must not be reverted or reformatted.

## Source of truth

The approved design is [2026-08-12-edutu-api-production-design.md](../specs/2026-08-12-edutu-api-production-design.md). The implementation must satisfy its product decisions and acceptance criteria.

## Current implementation facts to preserve or correct

- /dashboard/developer is already protected by ProtectedRoute in edutu-web-app/src/App.tsx.
- /developer/* already uses the Clerk bearer token and creates/rotates/revokes api_consumers records.
- /v1/* is intentionally public to the global Clerk guard and separately protected by EdutuApiKeyGuard.
- EdutuApiKeyGuard currently reserves credits through EdutuApiUsageService; its database-error path currently fails open and must become fail closed.
- handleBachsWebhook currently verifies only the old HMAC envelope and returns ignored: true; it cannot be production-ready until it fulfills one-time credit products idempotently.
- The repository contains both profiles.credits and a credits_balance drift migration. The implementation must confirm and document which column is canonical before changing purchase or metering behavior. Existing API metering and credit ledger use profiles.credits.
- The worktree is already dirty. Each task must inspect its own diff and avoid unrelated files.

---

## Task 1: Establish the database and billing contract

**Files:**

- Create: backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql
- Modify: backend/services/services/api/src/db/schema.ts
- Modify: backend/services/services/api/src/billing/billing.repository.ts
- Modify: backend/services/services/api/src/billing/types/billing-checkout.types.ts
- Test: backend/services/services/api/src/billing/billing-schema.contract.spec.ts
- Create: backend/services/services/api/scripts/verify-api-production-schema.mjs

**Interfaces:**

- The migration defines the deployed contract for api_consumers, API usage tables, profiles.credits, credit_transactions, billing products, checkout intents, and billing events.
- BillingRepository.findEnabledProduct(productKey, environment) returns fulfillment kind, renewal mode, positive credit quantity, amount, currency, provider mapping, and null validity for credit products.
- The schema verification script exits non-zero when a required table, column, index, constraint, or product mapping is missing.

- [ ] **Step 1: Inventory schema assumptions**

Run:

~~~bash
cd backend/services/services/api
node scripts/verify-api-production-schema.mjs --print-required
~~~

Compare the required objects with src/db/schema.ts, BillingRepository, EdutuApiUsageService, and the checkout repositories. Do not assume a Drizzle definition means the Supabase migration has been applied.

- [ ] **Step 2: Add failing contract tests**

Extend billing-schema.contract.spec.ts to assert that a credit product has fulfillmentKind "credits", renewalMode "one_time", a positive creditQuantity, and validityDays null. Assert required api_consumers columns include owner_user_id, key_prefix, api_key_hash, and status. Assert the canonical balance is profiles.credits and new-account/default credit state is zero.

- [ ] **Step 3: Add an additive migration**

Use IF NOT EXISTS to add missing API-consumer columns/indexes, profiles.credits integer NOT NULL DEFAULT 0, and scoped idempotency indexes. Reconcile billing product/provider mapping, checkout-intent, and billing-event tables required by the current repositories. Add constraints preventing credit products from recurring renewal or expiry. Do not drop or delete legacy billing rows.

- [ ] **Step 4: Implement schema verification**

Connect using DATABASE_URL, query information_schema/Postgres catalogs, redact connection details from errors, and verify api_consumers ownership/key columns, profiles.credits, credit idempotency, billing catalog/mappings, checkout intents, and billing-event idempotency.

- [ ] **Step 5: Verify**

~~~bash
npm test -- --runInBand src/billing/billing-schema.contract.spec.ts
npm run build
~~~

Expected: selected tests pass and the Nest build exits 0.

- [ ] **Step 6: Commit**

~~~bash
git add backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql backend/services/services/api/src/db/schema.ts backend/services/services/api/src/billing backend/services/services/api/scripts/verify-api-production-schema.mjs
git commit -m "feat: define production API and credit billing contract"
~~~

---

## Task 2: Enforce production identity and zero-credit defaults

**Files:**

- Modify: backend/services/services/api/src/main.ts
- Modify: backend/services/services/api/src/auth/clerk-auth.guard.ts
- Modify: backend/services/services/api/src/developer/developer.service.ts
- Modify: backend/services/services/api/src/billing/billing.service.ts
- Modify: backend/services/services/api/supabase/migrations/20260812090000_api_production_contract.sql
- Create or modify: backend/services/services/api/src/auth/clerk-auth.guard.spec.ts
- Test: backend/services/services/api/src/developer/developer.service.spec.ts
- Test: backend/services/services/api/src/billing/billing.service.spec.ts

**Interfaces:**

- Developer routes accept verified Clerk bearer tokens only.
- DeveloperService.createProject does not inspect Pro status or credits.
- BillingService.getStatus returns credits: 0 for a valid new account with no ledger history.
- Production startup rejects missing API_KEY_PEPPER, database URL, Clerk verification config, or enabled-provider secrets.

- [ ] **Step 1: Add failing auth tests**

Test that a protected route without an Authorization header returns 401; a valid Clerk token populates id, authId, and email; an Edutu API key cannot authorize /developer/projects; and a Clerk token cannot substitute for an Edutu API key on /v1.

- [ ] **Step 2: Add failing zero-credit tests**

Test that a new account returns credits 0 and no transactions, and that project creation succeeds with zero credits and no Pro entitlement.

- [ ] **Step 3: Tighten environment validation**

In main.ts, require in production: NODE_ENV=production, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, Clerk verification configuration, and API_KEY_PEPPER of at least 16 characters. When Bachs is enabled require complete Bachs configuration; when the legacy Paystack webhook is enabled require its secret. Reject EDUTU_LOCAL_ADMIN_BYPASS=true in production.

- [ ] **Step 4: Normalize profile defaults**

Ensure every profile creation path writes profiles.credits = 0 unless a separate server-owned verified grant applies. Do not reuse the existing AI/signup-credit setting for API credits. Add an audit query for null or negative balances.

- [ ] **Step 5: Verify**

~~~bash
npm test -- --runInBand src/auth/clerk-auth.guard.spec.ts src/developer/developer.service.spec.ts src/billing/billing.service.spec.ts
npm run build
~~~

- [ ] **Step 6: Commit**

~~~bash
git add backend/services/services/api/src/main.ts backend/services/services/api/src/auth backend/services/services/api/src/developer backend/services/services/api/src/billing
git commit -m "feat: enforce production auth and zero API credit defaults"
~~~

---

## Task 3: Harden API-key ownership and lifecycle

**Files:**

- Modify: backend/services/services/api/src/developer/developer.service.ts
- Modify: backend/services/services/api/src/developer/developer.controller.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-key.guard.ts
- Modify: backend/services/services/api/src/common/api-key-hash.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-exception.filter.ts
- Test: backend/services/services/api/src/developer/developer.service.spec.ts
- Test: backend/services/services/api/src/edutu-api/edutu-api-key.guard.spec.ts
- Test: backend/services/services/api/src/common/api-key-hash.spec.ts

**Interfaces:**

- Create/rotate responses return rawKey and project once.
- Project summaries never include apiKeyHash or raw key material.
- Mutating ownership queries use owner_user_id; any legacy email fallback is read-only migration support and cannot grant ownership to another authenticated user.
- Guard failures use stable machine-readable error codes.

- [ ] **Step 1: Add ownership-isolation tests**

Create user A/project P; verify user B cannot read, rotate, or delete P; verify rotation rejects the old key and accepts the new key; verify revocation rejects the key immediately; verify dashboard responses contain neither rawKey nor apiKeyHash.

- [ ] **Step 2: Add hash/pepper tests**

Test production HMAC pepper for new keys, legacy unpeppered compatibility only during migration, invalid prefix rejection before unbounded database work, and absence of raw key material in logs/errors.

- [ ] **Step 3: Make ownership canonical**

Use owner_user_id in all new and mutating queries. If a legacy email fallback remains, require authenticated user ID plus matching normalized email, emit a migration metric, and prevent email-only cross-user mutation.

- [ ] **Step 4: Add stable errors**

Return structured missing_api_key, invalid_api_key, and scope_required errors with requestId. Keep raw keys out of every error path.

- [ ] **Step 5: Verify and commit**

~~~bash
npm test -- --runInBand src/developer/developer.service.spec.ts src/edutu-api/edutu-api-key.guard.spec.ts src/common/api-key-hash.spec.ts
git add backend/services/services/api/src/developer backend/services/services/api/src/edutu-api backend/services/services/api/src/common/api-key-hash.ts
git commit -m "fix: harden API key ownership and lifecycle"
~~~

---

## Task 4: Make API metering explicit and fail closed

**Files:**

- Create: backend/services/services/api/src/edutu-api/edutu-api-billing-policy.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-key.guard.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-usage.service.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api.controller.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-exception.filter.ts
- Test: backend/services/services/api/src/edutu-api/edutu-api-usage.service.spec.ts
- Test: backend/services/services/api/src/edutu-api/edutu-api-key.guard.spec.ts
- Test: backend/services/services/api/src/edutu-api/edutu-api.controller.spec.ts

**Interfaces:**

~~~ts
export type EdutuApiBillingClass = "free" | "credit";
export function billingClassForEndpoint(method: string, path: string): EdutuApiBillingClass;
export function stableApiError(code: string, requestId: string, message: string): Record<string, unknown>;
~~~

The guard calls reserveRequestCredit only for credit endpoints and throws 503 billing_unavailable when the reservation cannot be verified.

- [ ] **Step 1: Define and test policy**

Recommended initial policy: GET /v1/health, GET /v1/usage, and GET /v1/categories are free metadata; all opportunity detail/list/stats/sync, recommendations, and events calls cost one credit. Assert the exact classification in policy tests.

- [ ] **Step 2: Add failing enforcement tests**

Test zero balance -> 402 credits_exhausted; downstream operation is not called; reservation database error -> 503 billing_unavailable; same request ID is charged once; free endpoints never charge.

- [ ] **Step 3: Implement atomic fail-closed reservation**

Keep the idempotent ledger insert/debit transaction. Map InsufficientCreditsError to exhausted true. Map all other infrastructure failures to typed billing_unavailable. A database-backed consumer missing ownerUserId is a configuration error, not a free pass. Environment/internal keys remain explicitly internal and are never issued to normal users.

- [ ] **Step 4: Verify guard ordering**

Prove with controller/guard mocks: key -> scope -> rate limit -> monthly quota -> credit reservation -> controller. No opportunity query runs after a failed credit reservation.

- [ ] **Step 5: Verify and commit**

~~~bash
npm test -- --runInBand src/edutu-api/edutu-api-usage.service.spec.ts src/edutu-api/edutu-api-key.guard.spec.ts src/edutu-api/edutu-api.controller.spec.ts
git add backend/services/services/api/src/edutu-api
git commit -m "fix: fail closed on API credit metering failures"
~~~

---

## Task 5: Complete one-time credit product configuration

**Files:**

- Modify: backend/services/services/api/src/billing/billing.repository.ts
- Modify: backend/services/services/api/src/billing/billing-checkout.service.ts
- Modify: backend/services/services/api/src/billing/types/billing-checkout.types.ts
- Modify: backend/services/services/api/src/billing/providers/bachs/bachs.config.ts
- Modify: backend/services/services/api/src/settings/settings.dto.ts only if the admin credit-pack model needs reconciliation
- Test: backend/services/services/api/src/billing/billing-checkout.service.spec.ts
- Test: backend/services/services/api/src/billing/billing-schema.contract.spec.ts
- Test: backend/services/services/api/src/billing/providers/bachs/bachs.client.spec.ts
- Test: backend/services/services/api/src/settings/settings.dto.spec.ts

**Interfaces:**

- Product keys are server-owned, such as api_credits_100, api_credits_250, and api_credits_700.
- Client requests contain only productKey, returnSurface, and Idempotency-Key.
- Server products have fulfillmentKind credits, renewalMode one_time, positive creditQuantity, and validityDays null.
- Browser input never controls price, quantity, currency, or provider IDs.

- [ ] **Step 1: Add catalog tests**

Reject disabled products, missing provider mappings, recurring credit products, non-positive quantities, non-null validity, and amount/currency mismatches.

- [ ] **Step 2: Define production products**

Create explicit environment-specific product/mapping rows or controlled seed data. Do not derive credit quantity from payment amount.

- [ ] **Step 3: Enforce one-time semantics**

In BillingCheckoutService.assertProduct, require credits fulfillment, one_time renewal, integer quantity > 0, and null validity.

- [ ] **Step 4: Verify checkout idempotency**

Test same user/key/product replay, same key/different product rejection, cross-user isolation, exact Bachs hosted URL validation, and rejection of client price/quantity overrides.

- [ ] **Step 5: Verify and commit**

~~~bash
npm test -- --runInBand src/billing/billing-checkout.service.spec.ts src/billing/billing-schema.contract.spec.ts src/billing/providers/bachs/bachs.client.spec.ts src/settings/settings.dto.spec.ts
git add backend/services/services/api/src/billing backend/services/services/api/src/settings/settings.dto.ts
git commit -m "feat: configure one-time API credit products"
~~~

---

## Task 6: Implement verified Bachs credit fulfillment and preserve Paystack compatibility

**Files:**

- Create: backend/services/services/api/src/billing/credit-purchase.service.ts
- Modify: backend/services/services/api/src/billing/billing.controller.ts
- Modify: backend/services/services/api/src/billing/billing.service.ts
- Modify: backend/services/services/api/src/billing/billing-events.repository.ts
- Modify: backend/services/services/api/src/billing/billing.module.ts
- Modify: backend/services/services/api/src/billing/providers/bachs/bachs-webhook.verifier.ts only if event parsing needs extension
- Modify: backend/services/services/api/src/monetization/monetization.service.ts only for shared fulfillment helpers
- Test: backend/services/services/api/src/billing/credit-purchase.service.spec.ts
- Test: backend/services/services/api/src/billing/billing.service.spec.ts
- Test: backend/services/services/api/src/billing/billing-events.repository.spec.ts
- Test: backend/services/services/api/src/billing/billing-reconciliation.service.spec.ts

**Interfaces:**

~~~ts
type VerifiedCreditPurchase = {
  provider: "bachs" | "paystack";
  environment: "sandbox" | "live";
  eventId: string;
  providerReference: string;
  userId: string;
  productKey: string;
  creditQuantity: number;
  amountMinor: number;
  currency: string;
};

class CreditPurchaseService {
  fulfill(input: VerifiedCreditPurchase): Promise<{
    status: "fulfilled" | "duplicate" | "review";
    creditsAdded: number;
    ledgerId: string | null;
  }>;
}
~~~

- [ ] **Step 1: Add fulfillment tests**

Test valid completed Bachs payment adds the explicit quantity; profile and ledger update atomically; duplicate event/reference adds zero; product/amount/currency/environment/user mismatch routes to review or error; failed transaction adds zero; no expiry is written; legacy Paystack charge.success uses the same fulfillment service.

- [ ] **Step 2: Parse verified Bachs events**

Use BachsWebhookVerifier for raw bytes, timestamp, signature, organization, environment, and envelope. Accept only documented successful payment/checkout event types and extract event ID, provider payment/checkout ID, Edutu intent/reference, user identity, product ID, amount, currency, status, and environment. Unknown shapes grant nothing and become review cases.

- [ ] **Step 3: Resolve and validate local intent**

Load the intent by verified Edutu reference. Verify owner, provider, environment, intent status, product snapshot, provider product ID, amount, currency, and positive credit quantity. Never use browser return data for fulfillment.

- [ ] **Step 4: Fulfill atomically**

Within one database transaction: insert the billing event with provider identity uniqueness; insert a positive credit_transactions row with related_type api_credit_purchase; increment profiles.credits only when the ledger insert succeeds; mark intent/event processed. Use the existing privileged credit-operation setting and canonical profile-row selection.

- [ ] **Step 5: Replace ignored handler**

handleBachsWebhook returns fulfilled, duplicate, or review truthfully and never returns ignored for a successful production credit payment.

- [ ] **Step 6: Add reconciliation**

Repair only validated successful provider payments lacking a processed event. Product, amount, currency, environment, and identity mismatches create review cases without automatic grants.

- [ ] **Step 7: Verify and commit**

~~~bash
npm test -- --runInBand src/billing/credit-purchase.service.spec.ts src/billing/billing.service.spec.ts src/billing/billing-events.repository.spec.ts src/billing/billing-reconciliation.service.spec.ts
git add backend/services/services/api/src/billing backend/services/services/api/src/monetization/monetization.service.ts
git commit -m "feat: fulfill one-time API credit purchases idempotently"
~~~

---

## Task 7: Wire the developer dashboard to credit top-ups

**Files:**

- Modify: edutu-web-app/src/components/DeveloperDashboardPage.tsx
- Modify: edutu-web-app/src/services/billing.ts
- Modify: edutu-web-app/src/hooks/useBillingStatus.ts
- Modify: edutu-web-app/src/components/UpgradePage.tsx only if shared credit-pack navigation needs it
- Create or modify: edutu-web-app/src/components/developer/CreditPurchasePanel.tsx if the dashboard becomes difficult to test
- Test: edutu-web-app/src/services/billing.test.ts
- Test: edutu-web-app/src/test/__tests__/scholarshipEnginePages.test.tsx
- Test: edutu-web-app/src/test/__tests__/developerProductionFlow.test.tsx

**Interfaces:**

- Dashboard displays 0 credits for a new account.
- User selects a server-defined product, starts checkout, and returns through the approved Bachs result URL.
- Dashboard refreshes billing status after checkout.
- Copy states “One-time purchase. Credits never expire.”
- Browser code sends no price, quantity, or provider credentials.

- [ ] **Step 1: Add UI tests**

Test zero-credit purchase CTA; project creation enabled at zero; checkout body contains only productKey and returnSurface; idempotency key is stable during a request; success refreshes status; no recurring subscription claim appears.

- [ ] **Step 2: Implement product selection**

Render configured credit products and trusted price/quantity/currency values from the backend. Do not duplicate server prices as authority.

- [ ] **Step 3: Implement checkout/return**

Use existing createCheckout and pay.edutu.org/result. On return call billing/status, show balance, and display processing/retry state without exposing the API key.

- [ ] **Step 4: Add zero-credit API state**

When API returns credits_exhausted, show the purchase panel and preserve only safe request context.

- [ ] **Step 5: Verify**

~~~bash
cd edutu-web-app
npm test -- --runInBand src/services/billing.test.ts src/test/__tests__/scholarshipEnginePages.test.tsx src/test/__tests__/developerProductionFlow.test.tsx
npm run typecheck
npm run build
~~~

- [ ] **Step 6: Commit**

~~~bash
git add edutu-web-app/src/components edutu-web-app/src/services/billing.ts edutu-web-app/src/hooks/useBillingStatus.ts edutu-web-app/src/test
git commit -m "feat: add one-time API credit top-up flow"
~~~

---

## Task 8: Complete opportunity submission review and global publication

**Files:**

- Modify: backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.ts
- Modify: backend/services/services/api/src/opportunity-submissions/opportunity-submissions.controller.ts
- Modify: backend/services/services/api/src/opportunity-submissions/dto/opportunity-submission.dto.ts
- Modify: backend/services/services/api/src/opportunities/opportunities.service.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api.service.ts only if public projection needs a provenance field
- Test: backend/services/services/api/src/opportunity-submissions/opportunity-submissions.service.spec.ts
- Test: backend/services/services/api/src/opportunities/opportunities.controller.spec.ts
- Test: backend/services/services/api/src/edutu-api/edutu-api.controller.spec.ts
- Test: edutu-web-app/src/test/__tests__/opportunitySubmission.test.tsx

**Interfaces:**

- POST /opportunity-submissions always stores status pending.
- User list/detail/respond routes enforce submitter ownership.
- Admin review is the only approval path.
- Approval creates/links an opportunity through normal verification/enrichment; active rows appear in learner feeds and /v1.
- Pending, rejected, and unverified rows never leak through public catalogs.

- [ ] **Step 1: Add state-machine tests**

Cover submit -> pending; client status cannot set approved/active; cross-user read/respond fails; admin approve links a catalog row; reject creates no active row; needs_info -> response -> pending; active approved row appears in learner and API feeds.

- [ ] **Step 2: Validate content**

Require valid apply URL for publication, bound all user text/metadata, reject dangerous URL protocols, and prevent extra from becoming an unbounded/trusted internal field.

- [ ] **Step 3: Make approval recoverable**

Persist approvedOpportunityId and review result. If catalog creation fails, leave a recoverable review state and emit an alert; never report approved while losing the catalog row.

- [ ] **Step 4: Verify shared visibility**

Use an approved active fixture and assert both public learner feed and API opportunity list contain the same ID.

- [ ] **Step 5: Verify and commit**

~~~bash
cd backend/services/services/api
npm test -- --runInBand src/opportunity-submissions/opportunity-submissions.service.spec.ts src/opportunities/opportunities.controller.spec.ts src/edutu-api/edutu-api.controller.spec.ts
cd ../../../../edutu-web-app
npm test -- --runInBand src/test/__tests__/opportunitySubmission.test.tsx
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/opportunity-submissions backend/services/services/api/src/opportunities backend/services/services/api/src/edutu-api edutu-web-app/src/test
git commit -m "feat: publish approved user opportunities globally"
~~~

---

## Task 9: Align public API documentation and integration contracts

**Files:**

- Modify: backend/services/services/api/src/edutu-api/edutu-api-docs.controller.ts
- Modify: backend/services/services/api/docs/edutu-api.md
- Modify: edutu-web-app/src/components/DeveloperDocsPage.tsx
- Modify: edutu-web-app/src/components/DevelopersLandingPage.tsx
- Modify: edutu-web-app/src/components/DeveloperDashboardPage.tsx
- Test: backend/services/services/api/src/edutu-api/edutu-api-docs.controller.spec.ts
- Test: edutu-web-app/src/test/__tests__/scholarshipEnginePages.test.tsx

**Interfaces:**

Documentation must state that /developer/* requires Clerk, /v1/* requires an Edutu API key, health/usage/categories are free, chargeable calls cost one credit and return 402 at zero, credits are one-time and non-expiring, keys can be created without credits, and approved submissions become global catalog records.

- [ ] **Step 1: Add documentation contract tests**

Assert generated overview, llms.txt, and OpenAPI include the authentication boundary, billing errors, non-expiring credit policy, and correct live endpoint list.

- [ ] **Step 2: Remove stale endpoint claims**

Remove or correct claims about nonexistent /v1/match, /v1/scraper/run, or /v1/keys endpoints. Link users to /dashboard/developer for key generation.

- [ ] **Step 3: Add integration examples**

Include a curl request using x-edutu-api-key and a redacted example of the 402 credits_exhausted response. Document server-to-server usage and the CORS/browser-key tradeoff.

- [ ] **Step 4: Verify and commit**

~~~bash
cd backend/services/services/api
npm test -- --runInBand src/edutu-api/edutu-api-docs.controller.spec.ts
cd ../../../../edutu-web-app
npm test -- --runInBand src/test/__tests__/scholarshipEnginePages.test.tsx
npm run typecheck
npm run build
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add backend/services/services/api/src/edutu-api backend/services/services/api/docs/edutu-api.md edutu-web-app/src/components
git commit -m "docs: align API access and credit contracts"
~~~

---

## Task 10: Add observability, abuse controls, and operational runbooks

**Files:**

- Modify: backend/services/services/api/src/edutu-api/edutu-api-usage.service.ts
- Modify: backend/services/services/api/src/edutu-api/edutu-api-usage.interceptor.ts
- Modify: backend/services/services/api/src/billing/billing.service.ts
- Modify: backend/services/services/api/src/billing/billing-reconciliation.scheduler.ts
- Modify: backend/services/services/api/src/common/middleware/request-id.middleware.ts
- Create: backend/services/services/api/src/edutu-api/edutu-api-observability.spec.ts
- Create: docs/operations/edutu-api-production-runbook.md
- Create: docs/operations/edutu-api-incident-response.md

**Interfaces:**

Critical events carry safe IDs/dimensions: API request status/latency/billing class; exhausted/unavailable events; key created/rotated/revoked; purchase received/fulfilled/rejected/review; submission approved/rejected. Raw keys, auth headers, signatures, full payment payloads, and arbitrary user metadata are redacted.

- [ ] **Step 1: Add safe-event tests**

Test structured records include IDs and statuses but omit Authorization, x-edutu-api-key, apiKey, secret, signature, token, raw payment payload, and arbitrary opportunity metadata.

- [ ] **Step 2: Add metrics and alerts**

Track API 401/403/402/429/5xx, webhook verification failures, fulfillment duplicates/review cases, reconciliation repairs/mismatches, credit ledger mismatches, and key lifecycle events. Configure alert thresholds and runbook links.

- [ ] **Step 3: Write runbooks**

Document schema verification, staging/production migration, key revocation, webhook replay, credit reconciliation, billing outage mode, application rollback, and secret rotation. State that API_KEY_PEPPER rotation requires a compatibility window or coordinated customer-key rotation.

- [ ] **Step 4: Commit**

~~~bash
git add backend/services/services/api/src/edutu-api backend/services/services/api/src/billing backend/services/services/api/src/common/middleware/request-id.middleware.ts docs/operations
git commit -m "ops: add API billing observability and runbooks"
~~~

---

## Task 11: Build the end-to-end verification matrix

**Files:**

- Create: backend/services/services/api/test/api-production.e2e-spec.ts
- Create: backend/services/services/api/test/credit-purchase.e2e-spec.ts
- Create: backend/services/services/api/test/opportunity-publication.e2e-spec.ts
- Modify: backend/services/services/api/test/jest-e2e.json
- Modify: backend/services/services/api/package.json
- Create: backend/services/services/api/scripts/smoke-api-production.mjs
- Create: edutu-web-app/src/test/__tests__/developerProductionFlow.test.tsx

**Interfaces:**

The matrix covers Clerk dashboard access, zero-credit key creation, ownership isolation, API key/scope/free/402/503 behavior, one-time fulfillment, webhook replay idempotency, non-expiration, global submission visibility, pagination/filter contracts, environment validation, and production smoke behavior.

- [ ] **Step 1: Add disposable fixtures**

Use a test database or transaction-scoped fixtures. Do not use production credentials, real customer keys, or real payments.

- [ ] **Step 2: Implement smoke script**

Accept only API_BASE_URL, EDUTU_API_KEY, and optional EXPECTED_OPPORTUNITY_ID from environment. Check health, usage, opportunity response, and stable headers. Redact the API key on all failures.

- [ ] **Step 3: Verify backend**

~~~bash
cd backend/services/services/api
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run lint
npm run build
~~~

Expected: zero test failures, no lint errors, and successful compilation.

- [ ] **Step 4: Verify web**

~~~bash
cd ../../../../edutu-web-app
npm test -- --runInBand
npm run typecheck
npm run build
~~~

- [ ] **Step 5: Scan for secret leakage**

~~~bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
rg -n --glob '!node_modules/**' --glob '!dist/**' 'console\\.(log|error).*?(api.?key|authorization|secret|signature|token)' backend/services/services/api edutu-web-app
~~~

Review all matches; tests/docs must not contain real secrets.

- [ ] **Step 6: Commit**

~~~bash
git add backend/services/services/api/test backend/services/services/api/scripts backend/services/services/api/package.json edutu-web-app/src/test
git commit -m "test: verify production API and credit flows end to end"
~~~

---

## Task 12: Stage, launch, and verify production

**Files:**

- Modify: backend/services/services/api/.env.example
- Modify: backend/services/services/api/docs/edutu-api.md
- Create: docs/operations/edutu-api-launch-checklist.md
- Modify: deployment configuration only after provider/deployment target is confirmed

**Interfaces:**

- Staging and production use the same migrations and code paths.
- Production launch is blocked until all gates pass.
- Rollback preserves ledger/payment data; application rollback must not replay fulfilled purchases.

- [ ] **Step 1: Prepare deployment secrets**

Set in the deployment secret manager, never git:

~~~text
NODE_ENV=production
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
API_KEY_PEPPER
BACHS_CHECKOUT_ENABLED=true
BACHS_ENVIRONMENT=sandbox or live
BACHS_API_BASE_URL
BACHS_API_KEY
BACHS_WEBHOOK_SECRET
BACHS_EXPECTED_ORGANIZATION_ID
BACHS_PRODUCT_MAPPINGS
EDUTU_API_PUBLIC_URL
EDUTU_DOCS_URL
EDUTU_DASHBOARD_URL
FRONTEND_URL
ADMIN_URL
MOBILE_APP_URL
~~~

Set EDUTU_LOCAL_ADMIN_BYPASS=false or remove it. Keep EDUTU_API_KEYS empty unless an explicitly documented internal key is required.

- [ ] **Step 2: Apply and verify staging migration**

~~~bash
cd backend/services/services/api
npm run db:migrate
node scripts/verify-api-production-schema.mjs
~~~

Audit null/negative credits, duplicate API prefixes, orphaned intents, duplicate ledger references, and product mapping mismatches.

- [ ] **Step 3: Run staging smoke flow**

With a non-admin test account: sign in, confirm 0 credits, create a project, call health/usage, call opportunities and confirm 402, buy the smallest sandbox pack, verify exactly-once fulfillment, call opportunities successfully, rotate/revoke the key, submit an opportunity, approve it, and verify learner/API visibility.

- [ ] **Step 4: Verify webhooks**

Configure the provider endpoint and test: first signed delivery fulfills; replay is duplicate with no balance change; invalid signature rejects; wrong organization/environment rejects; unknown product/amount routes to review without credits.

- [ ] **Step 5: Production gate**

Do not enable live checkout until tests, migration verification, API_KEY_PEPPER, live product mappings, webhook replay tests, ledger reconciliation, CORS/public URLs, alerts, runbooks, rollback owner, and incident channel are all confirmed.

- [ ] **Step 6: Monitor first 24 hours**

Monitor API 402/503/5xx, purchase fulfillment latency, duplicate/review webhook counts, ledger/profile mismatches, key lifecycle rates, submission approval failures, DB locks, and transaction latency.

- [ ] **Step 7: Commit launch documentation**

~~~bash
git add backend/services/services/api/.env.example backend/services/services/api/docs/edutu-api.md docs/operations/edutu-api-launch-checklist.md
git commit -m "docs: add Edutu API production launch checklist"
~~~

---

## Definition of done

The work is complete only when:

- Every signed-in user can create a key without credits.
- New users start at zero credits.
- One-time credit purchases fulfill exactly once and never expire.
- Chargeable API calls fail with 402 at zero balance and 503 on billing-verification failure.
- API keys, ownership, scopes, rotation, and revocation are tested.
- Approved user submissions appear globally through learner and third-party API feeds.
- Bachs fulfillment is implemented, verified, idempotent, and no longer ignored.
- Production migrations are applied and schema verification passes.
- Production secrets/configuration are complete and local-admin bypass is disabled.
- Backend/web tests, type checks, builds, lint, e2e tests, and smoke tests pass.
- Runbooks, alerts, rollback instructions, and launch sign-off exist.
