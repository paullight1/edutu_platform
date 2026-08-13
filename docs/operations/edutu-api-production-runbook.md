# Edutu API production runbook

This runbook covers the Edutu developer API, API-key authentication, API
credits, checkout providers, and the shared opportunity catalog. Keep the
operator on-call, database owner, and billing owner involved for any credit
balance change.

## Safety rules

- Never place an API key, Clerk bearer token, payment secret, webhook
  signature, card data, or full provider payload in logs, tickets, chat, or a
  shell command. The API emits allowlisted structured events only.
- A chargeable request with no credits is an expected `402
  credits_exhausted`. A `503 billing_unavailable` is fail-closed and must not
  be bypassed by retrying with an internal key.
- Credit packs are one-time, positive, and non-expiring. Do not manually edit
  `profiles.credits`; use the verified fulfillment or approved reconciliation
  procedure.
- Approved submissions become globally visible only after the verification
  pipeline makes them `active` and `verified`.

## Pre-deploy schema verification

From the API directory, run:

```bash
node scripts/verify-api-production-schema.mjs --print-required
node scripts/verify-api-production-schema.mjs
```

The second command requires a non-production database connection available to
the operator. It must confirm `profiles.credits`, API consumer ownership and
hash columns, usage/idempotency indexes, checkout intents, billing events, and
the one-time API credit product mappings. Stop if it reports a missing object;
do not substitute a Drizzle schema for an applied Supabase migration.

## Staging and production migrations

1. Apply additive migrations to a disposable staging project first.
2. Run the schema verifier and the focused billing/API tests against staging.
3. Check that existing `profiles.credits` balances are preserved and that
   null/negative audit queries return no unexpected rows.
4. Take or verify a database backup and record the migration identifiers.
5. Apply the same migrations to production during the approved change window.
6. Re-run the verifier and the smoke script with a disposable API key.
7. Monitor `api_http_response`, `api_request`, and billing reconciliation
   events for at least one normal reconciliation interval.

Never run a destructive rollback against billing tables. Roll forward with a
new additive migration and keep the previous application version available.

## Key revocation and suspected compromise

1. Identify the project by owner and project ID; do not ask the customer to
   send the raw key.
2. Revoke the project through the Clerk-authenticated developer route.
3. Confirm the revoked key receives `401 invalid_api_key` and that a new key,
   if requested, is shown only once.
4. Review request IDs, consumer IDs, status classes, latency, and rate-limit
   events. These dimensions are safe to share with support.
5. If a user account is compromised, revoke all of its projects and start the
   Clerk account recovery process.

## Webhook replay and billing outage mode

Replay only a provider event that has been verified by the provider adapter.
Use its provider event ID and local checkout intent; never replay an edited
payload. A duplicate provider event must be a no-op. Amount, currency,
environment, product, owner, and success status must match the local intent;
otherwise place the event in review and grant no credits.

During a provider or ledger outage, leave chargeable API requests in
`503 billing_unavailable` mode. Do not make the guard fail open, grant credits
from a client-supplied quantity, or ask customers to retry with a privileged
key. Restore the dependency, verify the ledger, then replay only verified
events.

## Credit reconciliation

Run the recent reconciliation after a provider incident and the daily
reconciliation on its normal schedule. Inspect the safe metrics by provider,
environment, category, and count:

- `missing_provider_event` / repair: verify the local intent and provider
  success before allowing the atomic repair.
- `duplicate_repair`: confirm it is an idempotent no-op.
- mismatch or review categories: do not grant; resolve through the billing
  review queue.
- provider errors: treat as an outage until the provider read path succeeds.

Compare the provider event, checkout intent, billing event, credit ledger row,
and `profiles.credits` in one transaction-aware investigation. Record the
request/event IDs and operator decision, never the raw payload.

## Application rollback

1. Stop the rollout and compare error rates, `402`, `503`, webhook verification,
   fulfillment review, and reconciliation metrics with the last known-good
   release.
2. Roll back the application binary/container only if the database contract is
   compatible. Do not roll back an applied additive migration by deleting
   rows or columns.
3. Keep webhook idempotency enabled during rollback; replay verified events
   only after the active version is known.
4. Run health, authenticated usage, one free endpoint, and one chargeable
   zero-credit check before reopening traffic.

## Secret rotation

Rotate provider secrets and Clerk verification configuration through the secret
manager, deploy the new configuration, and verify startup in staging before
production. Webhook secret rotation needs a provider-supported overlap window
or a coordinated cutover with replay protection.

`API_KEY_PEPPER` rotation is a customer-impacting migration. It requires a
compatibility window in which old hashes can be verified with the previous
pepper, followed by coordinated customer-key rotation and removal of the old
pepper. Never rotate it as a single environment change that invalidates every
existing customer key without a recovery plan.

## Alert links and thresholds

Configure alerts in the deployment's metrics backend with links to
`edutu-api-incident-response.md`:

| Signal | Initial threshold | Action |
| --- | --- | --- |
| API 5xx or `billing_unavailable` | >1% for 5 minutes | Check dependency health and enter outage mode |
| API 401/403/429 | 3x seven-day baseline for 10 minutes | Check abuse, key compromise, and auth rollout |
| API p95 latency | >2 seconds for 10 minutes | Inspect database/provider latency |
| webhook verification failures | 5 in 5 minutes | Check secret/config and provider delivery |
| fulfillment review/mismatch | any live event | Stop automatic granting and investigate |
| reconciliation provider errors | any daily run | Check provider access and replay safety |
| credit ledger mismatch | any row | Freeze manual grants and reconcile transactionally |

Thresholds are starting points; tune them from production baselines without
weakening the fail-closed behavior.
