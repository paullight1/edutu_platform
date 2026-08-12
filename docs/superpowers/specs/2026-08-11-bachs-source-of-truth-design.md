# Bachs Source-of-Truth Payment Design

Date: 2026-08-11

## Decision

Edutu will use Bachs as the only web/PWA payment provider for new purchases. The NestJS API is the only Edutu component allowed to create provider sessions, accept provider lifecycle events, change financial records, grant credits, or change Pro access. `pay.edutu.org` remains an Edutu-branded shell around Bachs-hosted checkout and account-management UI. RevenueCat remains the only native App Store/Play Store purchase rail.

Legacy Paystack webhook handling stays available only to finish and reconcile already-created transactions. No client may initiate a new Paystack checkout after the Bachs feature flag is enabled.

## Boundaries

- Clients submit an authenticated `productKey` and an idempotency key. They never submit the billing owner, amount, currency, provider product ID, plan code, grant duration, or payment result.
- Bachs owns payment-detail collection and hosted payment/portal UI. Edutu never receives card, bank, wallet, or crypto credentials.
- Browser redirects and overlay callbacks update presentation only. Signed provider events are the fulfillment authority.
- All canonical billing writes occur in PostgreSQL through the backend transaction boundary. Direct client and Supabase Edge Function writes are removed from canonical financial tables.
- Bachs live collection remains disabled unless the server passes readiness and the sandbox launch gates.

## Canonical identity and identifiers

The raw authentication subject is the canonical `user_id` text value for billing. Clerk subjects such as `user_...` and Supabase UUID subjects remain strings exactly as issued. Internal record primary keys are random UUIDs. Provider customer, checkout, collection, invoice, subscription, refund, dispute, and event identifiers remain provider-prefixed text.

Legacy derived UUID records are linked through `billing_identity_aliases`. Automated migration is allowed only for deterministic, unambiguous mappings. Email is not an ownership key. Ambiguous and orphaned records become review cases.

## Catalog and money

`billing_products` is the server-owned catalog. Each product fixes provider/environment mapping, fulfillment kind, renewal mode, amount, currency, credit quantity or access duration, and enabled state. Cadence and renewal are separate: a monthly product can be recurring or a bounded one-time pass.

The canonical ledger stores signed integer minor units with an uppercase ISO currency and explicit provider/environment. The Bachs API boundary converts those values to currency-precision decimal strings without floating-point arithmetic. Customer payment currency and settlement currency are stored separately when Bachs reports both; exact fulfillment validation uses the checkout/product resource rather than assuming a collection's settlement amount equals the catalog price.

## Checkout flow

1. An authenticated client calls `POST /billing/checkout` with `productKey`, `returnSurface`, and `Idempotency-Key`.
2. NestJS resolves the raw authenticated subject, validates the server catalog, and inserts a checkout intent before any provider call.
3. NestJS calls Bachs with its own idempotency key and the opaque Edutu intent reference.
4. The API validates the returned Bachs checkout origin, persists the provider checkout identity, and returns a client-safe checkout URL plus opaque intent token.
5. The client opens Bachs hosted checkout or the Bachs overlay. UI events never fulfill.
6. The result shell polls an authenticated intent-status endpoint and renders a precise state without changing it.

Repeated client calls using the same user/idempotency key return the same open intent. Timeouts are safe to retry. Provider failure leaves a resumable local intent rather than creating an untracked provider transaction.

## Provider event flow

The webhook controller verifies the exact raw body, timestamp tolerance, signature, organization and envelope. Environment is bound to the configured ingress secret/route because Bachs does not include it in the webhook envelope. Runtime schemas require critical documented fields but allow additive provider fields. The controller durably inserts a unique `(provider, environment, event_id)` inbox row before acknowledging the delivery. Duplicate delivery returns success without repeating effects.

The processor locks the inbox row and related intent/subscription/grant rows. Within one database transaction it validates provider resource identity, product, owner, amount and currency; appends ledger records; updates provider customer/subscription/refund state; creates or revokes only the affected source grant; recomputes the entitlement projection; writes review/audit records; and marks the event processed. A failure rolls back the financial effects and schedules a bounded retry. Repeated failure becomes a visible dead letter.

Unsupported subscribed event types do not silently return `ignored: true`. They become a review/dead-letter state until explicitly classified as safe no-ops.

## Entitlements and credits

Every paid source creates an immutable provider-scoped grant. Pro is effective while at least one non-revoked grant is currently valid. Expiration, refund, cancellation, dispute or manual action changes the matching source grant only; it never revokes the aggregate projection directly.

Credit purchases insert the provider ledger row, credit ledger row and balance change atomically under a unique provider resource. Season passes insert one bounded grant under the same rule. Duplicate and concurrent delivery therefore converge on one effect.

`billing_entitlements` and `profiles.is_pro` remain temporary compatibility projections. They are recomputed transactionally from grants and cannot independently create access.

## Lifecycle policy

- `collection.succeeded` may fulfill an eligible one-time product after exact validation.
- Recurring grants follow provider invoice/payment success and exact provider period boundaries. Invoice effects are idempotent by `invoice_id` because a paid invoice may have no charge ID.
- `collection.failed`, `collection.underpaid`, and unconfirmed browser returns never grant.
- `past_due` retains already-paid access through the paid-through boundary and any explicitly configured grace period; it does not create a new period.
- Scheduled cancellation retains paid access to period end. Immediate cancellation ends only that provider grant according to provider state.
- A refund webhook starts reconciliation of the refund and original payment. Only a retrieved, confirmed full refund revokes the affected source grant; partial or ambiguous refunds and over/underpayment create a review case instead of guessing. Multiple partial refunds remain disabled until the provider's one-refund-per-charge documentation conflict is resolved in sandbox.
- Disputes apply the configured risk state to the affected grant and require a provider event or audited operator action to restore it.

## Customer experience

Checkout states are `creating`, `open`, `processing`, `active`, `failed`, `cancelled`, `underpaid`, `needs_review`, and `expired`. The UI never says “not charged” when state is uncertain. Processing pages tell customers not to pay again and display an opaque support reference.

Account management shows provider, product, renewal mode, paid-through date, recovery state, and correct management destination. Bachs customers receive a fresh server-created portal session. Native customers go to Apple or Google management. Portal URLs and authentication tokens are never placed in query strings or logs.

## Security and operations

- Bachs, RevenueCat, Paystack, service-role and admin credentials remain server-only and environment-separated.
- Checkout/provider URLs use exact HTTPS origin allowlists.
- Webhooks have bounded bodies and preserve raw bytes for signature verification.
- Admin refund, replay, grant and revoke actions require named Clerk admin identity, role policy, explicit reason, confirmation and an append-only audit row.
- Logs redact secrets, signatures, emails, portal URLs and raw payloads.
- Reconciliation checks payment-without-grant, grant-without-payment, pending refund, dead event, identity split and provider drift.
- Turning `BACHS_CHECKOUT_ENABLED` off stops new sessions while webhook processing and reconciliation continue for in-flight payments.

## Test and launch criteria

Tests cover authentication, wrong owner, server-owned catalog, idempotent checkout, provider timeout, URL allowlisting, signature/timestamp/envelope validation, duplicates, reordering, concurrency, injected transaction failures, wrong money/environment/organization, recurring periods, credits, passes, refunds, disputes, underpayment and cross-provider grants.

Repository completion means compilation, unit/integration suites, migration contracts, client routing tests, secret scans and production builds pass. Operational launch additionally requires valid Bachs sandbox credentials/products, dashboard webhook configuration, a full sandbox lifecycle matrix, credential rotation, reconciliation with zero unexplained drift and staged rollout. Repository code must not substitute guessed provider identifiers for these external prerequisites.

## Approved implementation plan

The executable plan is [`../plans/2026-08-11-bachs-universal-web-payments.md`](../plans/2026-08-11-bachs-universal-web-payments.md). The user's instruction to implement every audit recommendation without further questions is approval of this design and the subagent-driven execution choice.
