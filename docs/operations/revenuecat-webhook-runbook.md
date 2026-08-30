# RevenueCat webhook cutover and operations

Owner: Billing/Platform on-call  
Authority: NestJS `POST /billing/webhooks/revenuecat/{sandbox|production}`  
Rollback principle: stop new purchases; keep receipt, processing, restore, and reconciliation running.

## Preconditions

- Migration `20260830120000_revenuecat_subscription_authority.sql` is applied and its nine products match the approved RevenueCat offering.
- The backend is deployed with `NATIVE_IAP_PURCHASES_ENABLED=false`.
- Sandbox and production use distinct Authorization and HMAC secrets, app-ID allowlists, and store allowlists.
- `REVENUECAT_SECRET_API_KEY` is a server secret (`sk_...`), never an `EXPO_PUBLIC_` value.
- Queue, dead-letter, event-age, authentication rejection, product-mismatch, and paid-without-grant alerts are connected to the billing on-call.
- The legacy Supabase function remains enabled until the production endpoint is proven healthy. Do not deploy its 410 version early.

## Cutover order

1. Deploy the NestJS routes and processor with both RevenueCat webhook integrations disabled and native purchase initiation off.
2. Apply the billing migration, verify all nine live and sandbox/Test Store bindings, then restart the backend.
3. Configure the sandbox RevenueCat integration to `/billing/webhooks/revenuecat/sandbox`; enable only `REVENUECAT_SANDBOX_WEBHOOK_ENABLED`.
4. Send a RevenueCat TEST delivery. Confirm HTTP 202, one durable `billing_provider_events` row, and terminal `processed` status. TEST is an intentional no-op.
5. Exercise purchase, renewal, cancellation, billing issue, product change, refund/reversal, restore/transfer, and reordered/duplicate fixtures in sandbox. Reconcile to zero unexplained drift.
6. Configure `/billing/webhooks/revenuecat/production`; enable `REVENUECAT_PRODUCTION_WEBHOOK_ENABLED` while native purchase initiation remains off.
7. Confirm a production TEST delivery and one controlled App Store or Play transaction through inbox, subscription, source grant, projection, and authenticated `/billing/status`.
8. Remove the RevenueCat registration for the legacy Supabase URL, then deploy the legacy function’s mutation-free 410 implementation.
9. After the launch evidence is approved, enable `NATIVE_IAP_PURCHASES_ENABLED` for the intended release cohort.

Never point sandbox and production integrations at the same route or reuse either secret. The public route name `production` maps to database environment `live`.

## Health checks

Use service-role database access and a bounded time window:

```sql
select environment, status, count(*)
from public.billing_provider_events
where provider = 'revenuecat'
  and received_at >= now() - interval '24 hours'
group by environment, status
order by environment, status;

select environment, min(received_at) as oldest_unprocessed_at
from public.billing_provider_events
where provider = 'revenuecat'
  and status in ('received', 'processing', 'failed')
group by environment;

select id, environment, event_id, event_type, attempt_count, last_error,
       received_at, updated_at
from public.billing_provider_events
where provider = 'revenuecat'
  and status in ('dead_letter', 'review')
order by updated_at desc
limit 100;

select environment, case_type, count(*)
from public.billing_review_cases
where provider = 'revenuecat' and status = 'open'
group by environment, case_type
order by environment, case_type;
```

Alert immediately on a growing dead-letter count, oldest unprocessed age above five minutes, repeated signature/authentication rejection, `unknown_product`, `product_mismatch`, `paid_without_grant`, or `grant_without_provider_access`.

## Replay

Replay only after the cause is corrected and an incident/ticket records the inbox UUID. Never edit the provider event ID, environment, payload hash, or payload.

```sql
begin;
select id, provider, environment, event_id, status, attempt_count, last_error
from public.billing_provider_events
where id = '<inbox-uuid>'::uuid
for update;

update public.billing_provider_events
set status = 'received', next_retry_at = now(), processed_at = null,
    last_error = null, updated_at = now()
where id = '<inbox-uuid>'::uuid
  and provider = 'revenuecat'
  and status in ('failed', 'dead_letter', 'review');
commit;
```

The lifecycle SQL is idempotent by `(environment, event_id)`, so a crash after effect application but before inbox completion completes safely on replay. A same-ID/different-hash conflict requires manual investigation, not replay.

## Support lookup

Support may search by Clerk subject, RevenueCat App User ID, transaction/original transaction ID, event ID, inbox UUID, or the `/billing/status` support reference. Do not expose webhook bodies, subscriber attributes, Authorization/HMAC values, secret API keys, email as identity, or provider URLs containing customer identifiers.

## Rollback and incident response

1. Set `NATIVE_IAP_PURCHASES_ENABLED=false` to prevent new native checkout.
2. Keep both NestJS webhook receivers, the event processor, restore flow, authenticated status, and reconciliation enabled.
3. If a credential is suspected, rotate the affected environment’s HMAC and Authorization values independently, update backend secret storage, restart, then update only that RevenueCat integration.
4. Do not re-enable the legacy entitlement writer. Replaying two writers creates cross-source revocation and duplicate-effect risk.
5. Repair only a proven missing RevenueCat source grant. Product/identity mismatches, provider-without-local state, and local-grant-without-provider state remain review cases.
6. Record the first bad event, affected environment, queue depth, oldest event age, mitigation time, and reconciliation outcome in the launch evidence and incident record.

