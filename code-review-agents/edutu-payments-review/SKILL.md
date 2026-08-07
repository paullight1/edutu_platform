---
name: edutu-payments-review
description: Review Edutu Paystack and RevenueCat billing changes for monetary correctness, webhook authenticity, idempotency, entitlement integrity, credit accounting, privacy, and fraud resistance.
---

# Edutu Payments Review

Use with `../edutu-code-review/references/edutu-context.md`. Review related client, backend, edge-function, migration, and admin changes together; billing bugs cross boundaries.

## Non-negotiable invariants

- Clients may display prices and initiate checkout, but cannot decide payment success, grant Pro, add credits, or repair billing records.
- Paystack webhooks authenticate the raw body with the provider signature, validate event/reference/metadata, reject unknown ownership, and are replay-safe.
- RevenueCat webhooks use the configured secret/header contract, validate event identity and environment, and are idempotent before side effects.
- Every provider event and transaction has a stable unique provider ID/reference. Retries must not double-grant credits, extend subscriptions twice, or duplicate ledger rows.
- Entitlement, subscription, transaction, and profile-mirror writes agree transactionally or have a deliberate repair path. Expiry, renewal, cancellation, retry, pause, refund, revoke, and grace periods are explicit.
- Preserve units: Paystack `billing_transactions.amount` is major NGN units; RevenueCat/mobile `payment_transactions.amount` is minor units before normalization. Never mix currencies or floats silently.
- Bind checkout, webhook metadata, customer identity, and entitlement user IDs. Never accept an arbitrary user ID from the browser as purchaser.
- API-credit and AI-metering flows need atomic decrement/ledger behavior, no negative balances, clear 402/429 semantics, and idempotency under retries.
- Paystack, webhook, RevenueCat, service-role, encryption, and provider credentials stay server-side, out of public env vars, logs, and errors.

## Focused checks

- Inspect `backend/services/services/api/src/billing`, `edutumobile/supabase/functions/revenuecat-webhook`, mobile payment hooks/services, web billing/paywalls, migrations, and duplicate/legacy webhooks.
- Verify raw-body handling, constant-time comparison where applicable, environment validation, rate/body limits, and redacted structured logs.
- Verify price/plan selection is server-owned and cannot be changed by client amount, currency, feature, or plan code. A checkout callback is not proof of payment.
- Verify restore, offline state, cache/realtime updates, and UI `isPro` checks never become fail-open privilege escalation.
- Require tests for duplicate/out-of-order delivery, renewal extension from future expiry, expired/revoked grants, refunds, wrong-user metadata, wrong units, malformed signatures, and provider outages.

## Verification

Prefer backend billing unit tests and edge-function tests, then affected lint/tests/typechecks. Never use production credentials or live provider calls during review.
