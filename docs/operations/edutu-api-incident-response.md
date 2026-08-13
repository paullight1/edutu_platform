# Edutu API incident response

Use this page with the production runbook. Incident notes should contain safe
request IDs, provider event IDs, consumer/project IDs, timestamps, status
classes, and categories only.

## Triage sequence

1. Declare the incident and record the release, environment, start time, and
   first affected request ID.
2. Check health, database connectivity, Clerk verification, API-key lookup,
   and enabled billing configuration.
3. Inspect structured events and aggregate by event, status class, provider,
   environment, category, and alert. Do not enable request-body logging.
4. Determine whether the issue is authentication, abuse/rate limiting, API
   metering, provider checkout/webhook, reconciliation, or opportunity
   verification.
5. Preserve fail-closed controls while mitigating. Escalate any live credit
   mismatch to the billing owner before making a grant.

## API authentication or abuse

For a spike in `401`, `403`, or `429`, compare the affected consumer/project
IDs with the baseline. Revoke compromised keys, verify scope enforcement, and
check the per-minute limiter and monthly quota. Do not log or request a raw
key. If the spike follows a deployment, verify Clerk configuration and the
`X-Request-Id` correlation path before changing limits.

## Credit exhaustion or billing unavailable

`402 credits_exhausted` is normal user state: confirm the balance and direct
the user to a server-selected one-time pack. `503 billing_unavailable` means
the balance reservation could not be verified: inspect database health,
transaction conflicts, schema verification, and ledger integrity. Do not
execute the downstream opportunity operation or manually return success.

## Webhook verification and fulfillment

For signature failures, verify provider secret version, raw-body handling,
clock tolerance, endpoint configuration, and deployment environment. A
verified event that fails local identity/product/amount/currency checks is a
review case, not a grant. Confirm duplicate events are no-ops using the
provider event ID and local idempotency record. Replay only the original
verified provider delivery through the supported replay procedure.

## Reconciliation and ledger mismatch

Pause manual credit changes. Capture the safe reconciliation category and
count, provider/environment, local intent ID, provider event ID, and ledger
transaction ID. Compare the provider record to the immutable local intent and
fulfillment event, then repair only through the atomic reconciliation path.
If the profile balance and ledger disagree, preserve the ledger evidence and
escalate to the database/billing owner; never update `profiles.credits` by
hand.

## Opportunity publication incident

If an unverified or rejected submission appears in public learner or `/v1`
results, disable the affected publication path, capture the opportunity ID and
request ID, and inspect the active/verified predicates plus cache invalidation.
Users must not be granted direct publish capability as a workaround.

## Recovery and closure

1. Verify the dependency and schema with the production runbook commands.
2. Run health, free metadata, zero-credit chargeable, and approved-opportunity
   visibility smoke checks using disposable credentials.
3. Replay only verified, idempotent events whose local intent still matches.
4. Monitor the alert signals through at least one five-minute reconciliation
   cycle and one daily cycle where applicable.
5. Document root cause, customer impact, safe IDs, remediation, and follow-up
   tests. Remove any temporary diagnostic access.
