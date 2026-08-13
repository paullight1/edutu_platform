# Edutu API production launch checklist

This checklist is the release gate for the Edutu developer API, API-credit
checkout, and globally visible approved opportunities. It is an operational
record: attach command output, request IDs, and provider references in the
restricted change ticket rather than committing secrets, raw keys, payment
payloads, or customer data here.

## Launch rule and ownership

- [ ] Release owner, database owner, billing owner, and incident commander are
      named in the change ticket.
- [ ] A backup/PITR checkpoint and rollback owner are recorded in the change
      ticket.
- [ ] The incident channel and provider escalation contacts are confirmed.
- [ ] Product, engineering, security, and finance sign-off is recorded.
- [ ] No live checkout, production migration, secret change, or credit purchase
      is performed from this checklist without the named owner’s approval.

Production launch is blocked until every required gate below is checked and
signed off. A passing local test suite is not a substitute for staging
migration verification, provider replay evidence, or live configuration review.

## 1. Configuration and secret readiness

Set values in the deployment secret manager, never in git, shell history, or
logs. Use the same configuration names in staging and production; change only
the environment-specific values.

- [ ] `NODE_ENV=production`.
- [ ] `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, and
      `SUPABASE_SERVICE_ROLE_KEY` are present and point to the intended
      environment.
- [ ] Clerk verification is configured with `CLERK_SECRET_KEY`, or the
      approved JWKS configuration (`CLERK_JWT_KEY` or issuer plus publishable
      key).
- [ ] `API_KEY_PEPPER` is a strong value of at least 16 characters and is not
      present in source control.
- [ ] `EDUTU_LOCAL_ADMIN_BYPASS` is false or absent.
- [ ] `EDUTU_API_KEYS` is empty unless an explicitly approved internal key is
      documented. `API_KEY_ALLOW_LEGACY_HASHES` remains false unless a reviewed
      compatibility exception exists.
- [ ] `EDUTU_API_PUBLIC_URL`, `EDUTU_DOCS_URL`, `EDUTU_DASHBOARD_URL`,
      `FRONTEND_URL`, `ADMIN_URL`, and `MOBILE_APP_URL` match the deployed
      origins and CORS policy.
- [ ] Before live checkout, Bachs has all of the following:
      `BACHS_CHECKOUT_ENABLED=true`, `BACHS_ENVIRONMENT=live`, the exact live
      `BACHS_API_BASE_URL`, `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`,
      `BACHS_EXPECTED_ORGANIZATION_ID`, `BACHS_PRODUCT_MAPPINGS`, and
      `BACHS_PRODUCT_CATALOG`.
- [ ] Bachs catalog mappings contain exactly the server-owned API credit
      products `api_credits_100`, `api_credits_250`, and `api_credits_700`, with
      positive minor-unit amounts, uppercase ISO currency, matching provider
      IDs, and `environment=live`.
- [ ] Legacy Paystack is disabled unless an existing integration has a named
      owner, `PAYSTACK_SECRET_KEY`, the appropriate webhook-enable flag, and a
      tested raw-body signature path.

## 2. Apply and audit the staging schema

Staging and production must use the same migrations and application code paths.
Create the approved backup/PITR checkpoint before applying anything.

From `backend/services/services/api`:

```bash
npm run db:migrate
node scripts/verify-api-production-schema.mjs
```

- [ ] Migration output identifies the intended staging database.
- [ ] Schema verification passes with exit code 0.
- [ ] `profiles.credits` is present, non-null, integer, and canonical; no
      negative or unexpected null balances remain.
- [ ] API-consumer ownership, key-prefix uniqueness, status, scopes, and
      rotation/revocation columns and indexes are present.
- [ ] Billing product rows are enabled only for the intended provider and
      environment; API-credit rows are one-time, positive, and non-expiring.
- [ ] Checkout intents have owner, product snapshot, provider/environment,
      idempotency, status, and expiry fields; orphaned or ambiguous intents are
      reviewed.
- [ ] Provider events are idempotent by provider, environment, and event ID;
      duplicate ledger references and mismatched product mappings are absent or
      assigned to review.
- [ ] The audit output is stored in the restricted change ticket with secrets,
      raw payloads, and personal data redacted.

## 3. Clerk and API-key smoke test

Use a non-admin staging account. Record request IDs and timestamps, not raw
Clerk tokens or API keys.

- [ ] Sign in with Clerk; confirm there is no separate developer login.
- [ ] Confirm `GET /billing/status` reports `credits: 0` for the new account.
- [ ] Create a developer project and API key with zero credits.
- [ ] Confirm the raw key is shown only at creation/rotation and is not present
      in project summaries, responses after the first view, logs, or database
      records.
- [ ] Call `GET /v1/health` with the Edutu API key successfully.
- [ ] Call `GET /v1/usage` with the Edutu API key and confirm it is free in
      credit terms but still subject to authentication, rate limits, and quota.
- [ ] Call a chargeable `/v1` endpoint at zero balance; confirm HTTP `402` with
      `code=credits_exhausted`, no paid operation execution, and no balance
      mutation.
- [ ] Confirm a Clerk bearer token cannot authorize `/v1`, and an Edutu API key
      cannot authorize `/developer` or `/billing` routes.
- [ ] Rotate the key; confirm the old key fails and the new key works.
- [ ] Revoke the key; confirm subsequent `/v1` requests fail with the stable
      invalid/revoked-key error.

## 4. Bachs and legacy Paystack webhook verification

Run these tests in Bachs sandbox first, then repeat the approved subset against
the live configuration only after the production gate is signed. Use the exact
raw provider body for signature verification.

### Bachs

- [ ] A signed `collection.succeeded` delivery for a matching local checkout
      intent, product, provider ID, amount, currency, organization, and
      environment fulfills exactly once.
- [ ] Replay the identical event; receive the duplicate result and confirm no
      second `profiles.credits` increment, credit transaction, or ledger effect.
- [ ] Send an invalid signature and confirm rejection without a provider-event
      grant.
- [ ] Send the wrong organization or environment and confirm rejection.
- [ ] Send `checkout.completed` without a settled collection and confirm it is
      routed to review without credits.
- [ ] Send an unknown product, amount, currency, checkout intent, or mismatched
      reference and confirm review status without credits.
- [ ] Confirm a webhook response does not expose the raw payload or secrets.

### Paystack compatibility

- [ ] If enabled, send a correctly signed legacy `charge.success` event using
      the exact raw request bytes and confirm the expected existing integration
      behavior.
- [ ] Replay the same Paystack event and confirm idempotency: no duplicate
      transaction, entitlement, or credit grant.
- [ ] Send an invalid signature and confirm rejection.
- [ ] Send a mismatched or unknown API-credit product/amount and confirm it is
      rejected or held for review without a grant.
- [ ] If no legacy integration is approved, keep the Paystack webhook flag and
      checkout path disabled.

## 5. 402/503 and fail-closed billing checks

- [ ] Zero-credit chargeable requests return HTTP `402` with
      `code=credits_exhausted` before the paid operation runs.
- [ ] A database, ledger, idempotency, or billing-verification failure returns
      HTTP `503` with `code=billing_unavailable`; the operation does not run and
      the client is told to retry rather than assume success.
- [ ] A free endpoint does not debit credits, but still enforces API-key
      authentication, rate limits, and monthly quota where applicable.
- [ ] Concurrent requests cannot overspend a balance or create duplicate
      idempotency effects.

## 6. Global opportunity visibility

Use a test account and a clearly marked staging opportunity; do not publish
unreviewed or fabricated opportunities to production.

- [ ] A user submits an opportunity and it remains pending/unverified while
      review or verification is incomplete.
- [ ] A reviewer approves it; the verification/enrichment worker transitions it
      to the active/verified shared catalog state.
- [ ] Pending, rejected, stale, or unverified records are not returned by
      learner feeds or `/v1` lists, detail, search, recommendations, share, or
      sync endpoints.
- [ ] After active/verified publication, the same opportunity is visible to
      learners and third-party API consumers, subject to normal filters and
      scopes.
- [ ] Cache invalidation or refresh makes the newly approved record visible
      without exposing an old pending projection.

## 7. Production launch gate

Do not enable live checkout or announce the API until all of these are signed
off:

- [ ] Tests, type checks, builds, lint, e2e checks, and staging smoke evidence
      are attached.
- [ ] Staging migration and schema verification pass; reconciliation has no
      unresolved blocking findings.
- [ ] Clerk production verification, API key pepper, CORS, and public URLs are
      confirmed.
- [ ] Live Bachs product mappings and webhook endpoint are verified; replay,
      invalid-signature, mismatch, and idempotency evidence is attached.
- [ ] 402/503 fail-closed behavior is verified.
- [ ] Global approved-opportunity visibility is verified.
- [ ] Alerts, dashboards, runbooks, rollback owner, backup/PITR checkpoint, and
      incident channel are ready.
- [ ] Product, engineering, security, and finance owners explicitly approve
      the live launch.

If any item is unchecked, keep `BACHS_CHECKOUT_ENABLED=false` and do not launch.

## 8. Rollback and recovery

- [ ] If an application release is rolled back, keep the database migrations,
      payment events, provider references, and append-only ledgers intact.
- [ ] Do not replay fulfilled provider events as a rollback mechanism. Resume
      from idempotent state and reconcile only unresolved intents/events.
- [ ] If billing behavior is unsafe, disable checkout, preserve webhook
      ingestion/reconciliation for in-flight events where safe, and route
      exceptions to review.
- [ ] Correct financial history with compensating ledger entries and named
      operator audits; correct schema issues with an additive roll-forward
      migration or approved recovery checkpoint.
- [ ] Record the rollback decision, affected request IDs, provider event IDs,
      balances, and follow-up owner in the restricted incident record.

## 9. First 24 hours monitoring

Assign an owner and alert threshold for each signal:

- API `402`, `503`, and `5xx` rates and latency.
- Checkout creation failures and fulfillment latency.
- Duplicate, review, invalid-signature, and mismatched webhook counts.
- `profiles.credits` versus credit-ledger reconciliation mismatches.
- Key creation, rotation, revocation, invalid-key, and scope-denial rates.
- Opportunity submission approval, verification, publication, and visibility
  failures.
- Database locks, transaction latency, migration errors, and queue/retry depth.

At the end of the first 24 hours, attach the monitoring summary and any
reconciliation result to the launch record. Keep the incident channel staffed
for the agreed post-launch window.
