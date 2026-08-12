# Billing schema cutover

The root `supabase/migrations/` directory is the canonical migration directory
for unified billing. Do not add billing migrations to a client, pay site, Edge
Function, or backend-local Supabase directory.

This is a schema-only cutover. Bachs checkout must remain disabled before,
during, and after it. These migrations do not create a checkout, register a
webhook, call a provider, or expose canonical billing tables to clients.

## Preconditions

1. Create a verified database backup or point-in-time-recovery checkpoint.
   Record its reference in the restricted change ticket, never in this repo.
2. Supply a short-lived read-only connection through the deployment secret
   manager as `BILLING_DATABASE_URL`. Do not paste it into shell history,
   transcripts, issues, or the audit output.
3. From `backend/services/services/api`, run:

   ```bash
   node scripts/audit-billing-schema.mjs > /approved/restricted/path/billing-schema-audit.json
   ```

4. Review the report's actual columns, constraints, unique indexes, RLS,
   triggers, exact row counts, aggregate identity shapes, and grouped
   provider/type/plan/status values. The report intentionally emits no contact
   data, auth subjects, customer IDs, or raw provider payloads.
5. Resolve every `nonconforming` or `catalog_review_required` value. Confirm
   that changing existing `credit_transactions.user_id` and
   `billing_entitlements.user_id` values to text will not violate a foreign key,
   dependent view, or function signature. Stop if the audit shows an unhandled
   conflict.
6. Approve only deterministic identity aliases. Unknown, ambiguous, or orphaned
   records become review cases; never use an email address as an ownership key.

## Apply order

Apply the root migrations in timestamp order through the normal reviewed
Supabase deployment process:

1. `20260811120000_bachs_unified_billing_core.sql`
2. `20260811121000_billing_identity_aliases.sql`
3. `20260811122000_atomic_billing_fulfillment.sql`
4. `20260811123000_derived_entitlements.sql`

The core migration establishes provider/environment lookups, a disabled
server-owned catalog, text external/user identifiers, bigint minor-unit money,
separate customer and settlement money, durable event idempotency, append-only
payment/audit ledgers, and restricted raw-payload retention metadata. The alias
migration records deterministic/provider-backed mappings only. Fulfillment
functions make a provider resource produce at most one ledger effect. The last
migration keeps `billing_entitlements` as a service-only compatibility table
derived from source grants.

## Post-apply checks

Run the audit again with an approved read-only operations connection and run
the repository contract locally:

```bash
node scripts/audit-billing-schema.mjs > /approved/restricted/path/billing-schema-audit-after.json
npm test -- billing/billing-schema.contract.spec.ts --runInBand
```

Before application behavior changes, confirm:

- Every canonical `billing_*` table has RLS enabled and `anon` and
  `authenticated` have no base-table privileges.
- `billing_account_summary` is security-invoker and its backing function
  derives the subject from the verified JWT; it returns only a derived summary.
- Provider events are unique by `(provider, environment, event_id)`.
- Payment-ledger and admin-audit updates/deletes are rejected.
- External provider IDs and raw auth subjects are text; internal primary keys
  are UUIDs.
- Money is integer minor units with uppercase three-letter currencies, and
  customer money is not conflated with settlement money.
- Every Bachs catalog row remains disabled until the separate launch gate.
- `billing_entitlement_grants` is authoritative. `billing_entitlements` and
  `profiles.is_pro` are projections only, with profile cache expiry updated in
  the same transaction.
- Duplicate fulfillment attempts return a duplicate result without adding
  credits or extending access again.
- A restricted retention job removes raw payloads after
  `raw_payload_expires_at`; normalized ledger rows remain under the accounting
  retention policy.

## Rollback and recovery

Do not roll back by deleting financial, grant, event, or audit rows. Keep
`BACHS_CHECKOUT_ENABLED=false`, leave event ingestion/reconciliation available
for already in-flight payments, and stop application rollout if a schema check
fails. Restore or replay from the verified recovery checkpoint only through
change control. Correct financial history with compensating ledger entries and
named operator audits; correct schema issues with an additive roll-forward
migration.
