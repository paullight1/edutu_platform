# RevenueCat IAP and Store Pricing Design

**Date:** 2026-08-30
**Status:** Approved design; implementation has not started

## Objective

Launch Edutu's native iOS and Android subscriptions through RevenueCat with one authoritative server-side entitlement pipeline, safe upgrades and downgrades, complete recovery behavior, and an admin workflow that publishes real prices to Apple and Google.

This design extends the existing RevenueCat project and retains its Test Store app for development. It replaces the legacy production RevenueCat webhook path in Supabase with the NestJS billing module at `backend/services/services/api` as the only component allowed to mutate durable billing, subscription, or entitlement state.

## Approved business model

Edutu sells three auto-renewing subscription tiers. Access is hierarchical:

1. Scholar includes all Pro and Lite access.
2. Pro includes all Lite access.
3. Lite contains the entry-level paid feature set.

Every tier has weekly, monthly, and yearly billing. No introductory trial is offered at launch.

| Tier | Weekly USD anchor | Monthly USD anchor | Yearly USD anchor |
| --- | ---: | ---: | ---: |
| Lite | 3.99 | 10.00 | 100.00 |
| Pro | 5.00 | 15.00 | 150.00 |
| Scholar | 7.99 | 24.99 | 200.00 |

These are anchor prices. The store's supported price point and localized price are authoritative. If Apple does not provide an exact anchor price point, the admin preview must show the available choices and require an explicit selection; Edutu must not silently round.

Season passes, consumable credit packs, introductory offers, promotional offers, win-back offers, and web checkout changes are outside this native-subscription launch. The existing web/Bachs rail remains separate.

## Account and app ownership

Both store accounts will be enrolled as organization accounts under Edutu's registered legal entity and D-U-N-S identity. Agreements, tax information, banking, identity verification, recovery contacts, and administrator access must be complete before product setup.

| Platform | App name | Permanent application identifier |
| --- | --- | --- |
| App Store | Edutu | `com.tegm.edutuios` |
| Google Play | Edutu | `com.edutu.com` |

The application identifiers match the committed Expo/native configuration and must not be changed as part of this work.

## Store catalog

### App Store Connect

Create one subscription group named **Edutu Membership**. Customers can hold only one subscription in this group. Rank products by access level: Scholar at level 1, Pro at level 2, and Lite at level 3. Products with different durations but the same tier share a level.

Create these auto-renewing products:

| Tier | Duration | Product ID |
| --- | --- | --- |
| Lite | Weekly | `edutu_lite_weekly_v1` |
| Lite | Monthly | `edutu_lite_monthly_v1` |
| Lite | Yearly | `edutu_lite_yearly_v1` |
| Pro | Weekly | `edutu_pro_weekly_v1` |
| Pro | Monthly | `edutu_pro_monthly_v1` |
| Pro | Yearly | `edutu_pro_yearly_v1` |
| Scholar | Weekly | `edutu_scholar_weekly_v1` |
| Scholar | Monthly | `edutu_scholar_monthly_v1` |
| Scholar | Yearly | `edutu_scholar_yearly_v1` |

The `_v1` suffix leaves a clean migration path if a future catalog must use new products. Product identifiers are treated as permanent once activated.

Enable a 16-day Apple billing grace period for paid-to-paid renewals in sandbox and production. Apple limits weekly subscriptions to a six-day grace period even under this configuration.

### Google Play Console

Create three subscriptions:

- `edutu_lite_v1`
- `edutu_pro_v1`
- `edutu_scholar_v1`

Each subscription contains three auto-renewing base plans:

- `weekly-auto`
- `monthly-auto`
- `yearly-auto`

Enable a grace period and retain Google's automatically calculated account-hold recovery. During grace, access remains active. During account hold, access is inactive until recovery. Store-reported state remains authoritative; Edutu does not hardcode Google's recovery duration.

## RevenueCat configuration

Keep the existing Edutu project and its Test Store app. Add one App Store app and one Google Play app using the approved application identifiers.

Create or retain these entitlements:

- `lite`
- `pro`
- `scholar`

Each store product attaches only to its exact tier entitlement. Tier inheritance is Edutu business logic, not a set of duplicated RevenueCat entitlement attachments.

Create the offering `edutu_mobile_v1` and mark it current. It contains nine custom packages:

- `lite_weekly`, `lite_monthly`, `lite_yearly`
- `pro_weekly`, `pro_monthly`, `pro_yearly`
- `scholar_weekly`, `scholar_monthly`, `scholar_yearly`

Each package groups the equivalent App Store, Google Play, and Test Store products. The Test Store catalog mirrors all nine packages so development exercises the same tier and cadence selection as production.

New Google Play products appear to RevenueCat as `<subscription-id>:<base-plan-id>`. Mobile selection must therefore use the RevenueCat package identifier as the cross-platform key. It must not compare a package's underlying product identifier to an iOS-only ID such as `pro_monthly`.

Production EAS builds receive the public RevenueCat SDK keys for the App Store app (`appl_...`) and Google Play app (`goog_...`). Test Store keys (`test_...`) remain development-only. RevenueCat public SDK keys may be embedded in the app; store credentials, RevenueCat secret API keys, webhook secrets, and HMAC secrets must never use an `EXPO_PUBLIC_` variable.

## Customer identity

Purchasing requires an authenticated Clerk user. The Clerk subject is the canonical RevenueCat App User ID and canonical billing owner. Email addresses are not identifiers.

When the user is already authenticated, initialize RevenueCat with the Clerk subject directly to avoid creating an unnecessary anonymous identity. If authentication becomes available after SDK initialization, log in explicitly. On logout, call the RevenueCat logout flow and clear all cached customer, entitlement, and paywall state before another Edutu user can sign in.

Use RevenueCat's **Transfer to new App User ID** restore behavior. A customer who controls the underlying Apple or Google store account can restore the purchase to their current Edutu account. The webhook processor handles `TRANSFER` atomically: revoke or close only the transferred source grants on the old owner, create corresponding grants for the new owner, recompute both entitlement projections, and record an audit event.

## Purchase and entitlement flow

1. The authenticated app configures RevenueCat with the platform public SDK key and Clerk subject.
2. The app fetches the current `edutu_mobile_v1` offering.
3. The paywall selects packages by the approved package identifiers and renders the underlying store product's localized `priceString` and billing period.
4. The user confirms a package with the platform purchase sheet.
5. A successful SDK response means the store accepted the transaction. It does not authorize the client to grant access.
6. RevenueCat delivers the store lifecycle event to NestJS.
7. NestJS authenticates the delivery, checks the integration boundary, and durably inserts the unique event into the billing inbox before returning success.
8. A retryable worker processes the event transactionally, validates the product binding and owner, updates the provider subscription record, creates/revokes the affected source grant, and recomputes the derived tier projection.
9. The app polls an authenticated NestJS billing-status endpoint until the server projection confirms the expected access.
10. If confirmation is delayed, the app remains in a recoverable `confirming` state and displays a support reference. It does not ask the customer to purchase again.

All mobile subscription-status reads move behind the NestJS API. The client must not directly write Supabase profiles, billing tables, subscriptions, ledgers, or entitlement projections.

### Plan changes

On Apple, the subscription group's levels and durations determine upgrade, downgrade, and crossgrade behavior.

On Google, Edutu supplies the existing subscription and a replacement mode:

- A higher-tier change takes effect immediately with store-calculated proration.
- A lower-tier change is deferred until the next renewal.
- A same-tier billing-period change is deferred until the next renewal.

The app must show the current tier and any scheduled replacement tier/cadence with its effective date.

## RevenueCat webhook boundary

Create separate RevenueCat webhook integrations for sandbox and production. Each points to an environment-specific NestJS endpoint and has distinct authorization and HMAC secrets. The delivery configuration may include both store apps, but NestJS maintains an explicit allowlist of expected RevenueCat app IDs and stores for that environment.

For every request, NestJS must:

- preserve and size-limit the exact raw body;
- verify the configured Authorization value in constant time;
- verify `X-RevenueCat-Webhook-Signature` over the timestamp and raw bytes;
- enforce a bounded signature timestamp tolerance;
- validate the flat RevenueCat `api_version: "1.0"` envelope while tolerating additive fields and unknown event types;
- reject unexpected app IDs, stores, and environments;
- deduplicate on `(provider, environment, event_id)`;
- acknowledge only after the event is durably stored.

The event processor handles initial purchase, renewal, cancellation, uncancellation, product change, billing issue, pause, extension, expiration, refund, refund reversal, transfer, and temporary entitlement events. Cancellation does not end access before the paid-through timestamp. An expiration or refund revokes only the source grant associated with that provider subscription; it cannot revoke a simultaneous valid grant from another payment rail.

The existing Supabase RevenueCat function is disabled only after sandbox and production deliveries have cut over successfully. It remains disabled thereafter so NestJS is the sole entitlement writer.

## Customer experience and recovery states

The native subscription UI supports these explicit states:

| State | Required behavior |
| --- | --- |
| Loading | Fetch offering; do not show hardcoded chargeable prices. |
| Unavailable | Explain that store products could not load; offer Retry and Restore Purchases. |
| Purchasing | Prevent duplicate taps while the platform sheet is active. |
| Confirming | State that the purchase was received and is being confirmed; show a support reference. |
| Active | Show tier, cadence, store, renewal or paid-through date, and Manage Subscription. |
| Canceled | Retain access through the paid-through date and show that renewal is off. |
| Grace period | Retain access and show a Fix Payment action. |
| Account hold | Suspend the affected access and show a store-management recovery action. |
| Expired/refunded | Remove the affected source access and provide resubscribe/support actions. |
| Price consent required | Explain that store approval is required before renewal and link to store management. |
| Deferred change | Show both current access and the scheduled next tier/cadence with effective date. |

Restore Purchases appears in both the paywall and Settings. Terms, Privacy, recurring-price disclosure, billing frequency, renewal behavior, cancellation instructions, and Manage Subscription remain visible and localized.

## Admin-native-price publisher

The existing admin route `/monetization/pricing` gains a distinct **Native IAP prices** panel. Native price publishing is separated from web/Bachs pricing, AI credit costs, promos, and merchandising copy.

The workflow is:

1. An authorized admin edits the nine USD anchor prices as a draft.
2. **Preview store prices** asks NestJS to retrieve Apple price points/equalizations and Google's regional base-plan prices.
3. The preview shows current and proposed US prices, mapped Apple price points, proposed Google regional values, effective dates, and existing-subscriber impact.
4. Any non-exact Apple mapping requires explicit selection. The preview expires after a bounded period so stale store state cannot be published.
5. After reauthentication, one **Publish to Apple & Google** action creates a durable price-change batch.
6. Server-side Apple and Google adapters publish each store item and persist provider responses.
7. A reconciliation job reads both stores back. An item is `verified` only when observed state matches the approved proposal.
8. Partial failure remains visible and retryable without republishing successful items.

The system does not promise a distributed atomic transaction across Apple and Google. Batch state is one of `draft`, `publishing`, `partially_published`, `published`, `verified`, or `failed`. Individual items use `pending`, `published`, `verified`, or `failed`.

Required durable data includes:

- `store_product_bindings` for internal package, store product/base plan, entitlement, cadence, and environment mapping;
- `store_price_change_batches` for actor, approved proposal, effective-date policy, state, and audit timestamps;
- `store_price_change_items` for each provider/product/territory operation and verification result;
- immutable admin audit events containing before/after values and safe provider references.

Apple and Google credentials are server-only and least-privileged. Price publication requires an authorized named administrator and fresh reauthentication. A base-price update targets new subscribers by default. Migrating existing Apple price consent or Google legacy cohorts is a separate explicit workflow and is not hidden behind the normal publish button.

The mobile paywall always renders store-localized prices returned through RevenueCat. Admin draft values never become chargeable UI. Web/Bachs pricing remains a separate rail, and the current admin promise that one saved display value is immediately “live for all apps” is removed.

Native promo controls remain disabled or clearly labeled as merchandising-only until real App Store and Google Play offers are designed and implemented.

## Operational controls

An emergency switch disables initiation of new native purchases without disabling webhook receipt, entitlement recovery, renewals, restores, or reconciliation. Operators can replay failed inbox events safely, inspect dead letters, reconcile provider state with local source grants, and see the oldest unprocessed event.

Alerts cover invalid authentication/signatures, repeated processing failure, dead-letter count, event age, product-binding mismatches, paid-without-grant cases, cross-store price drift, and price batches stuck in partial state.

Support can search by Clerk subject, RevenueCat App User ID, provider transaction/original transaction ID, event ID, and the user-visible support reference. Secrets and full payment payloads are not exposed in admin logs.

## Setup and rollout order

1. Enroll and verify Apple and Google organization accounts.
2. Complete contracts, banking, tax, identity, and administrator access.
3. Create the App Store and Play Console app records.
4. Create the approved store subscription catalogs and pricing.
5. Create Google service credentials early because propagation may take up to 36 hours.
6. Connect the two real store apps to the existing RevenueCat project.
7. Configure entitlements, Test Store mirrors, packages, offering, and restore behavior.
8. Configure isolated sandbox and production webhooks.
9. Implement the mobile package/identity/plan-change flow, NestJS webhook processor and status API, and admin price publisher.
10. Test with RevenueCat Test Store.
11. Test Apple through Sandbox/TestFlight and Google through license testers and an internal-track signed bundle.
12. Run reconciliation and failure-injection tests.
13. Release to internal users, then stage the production rollout while monitoring billing signals.

The first App Store subscription group and products are submitted with the first app version that offers them.

## Verification and launch gates

Repository verification includes focused unit/integration tests, lint, strict type checking, backend tests, mobile tests, and production builds. Operational launch additionally requires recorded evidence for:

- all nine packages purchasing successfully on iOS and Android;
- Lite to Pro, Pro to Scholar, and Lite to Scholar upgrades;
- Scholar to Pro and Pro to Lite deferred downgrades;
- weekly/monthly/yearly cadence changes;
- renewal, cancellation, uncancellation, billing issue, grace, account hold, pause, expiration, extension, refund, and refund reversal;
- restore on another device and transfer to a different authenticated Edutu account;
- duplicate, delayed, reordered, unknown, invalid-signature, stale-signature, wrong-app, wrong-store, and wrong-environment webhook deliveries;
- exactly one financial/subscription effect per provider event and transaction;
- sandbox events having no effect on production grants;
- overlapping provider grants surviving revocation of only one source;
- admin price preview, exact/non-exact Apple mapping, successful publication, partial failure, safe retry, read-back verification, and drift alerting;
- mobile display matching the store-localized amount actually charged;
- Restore Purchases, Manage Subscription, Terms, Privacy, recurring billing disclosure, and support recovery on physical devices;
- the purchase kill switch preventing new checkout while webhook and reconciliation processing continue.

Production is not approved until both store apps, all store products, RevenueCat credentials, webhook integrations, EAS public SDK keys, server secrets, alerting, reconciliation, and support runbooks are verified against their real environments.

## Primary implementation areas

- `edutumobile/packages/core/src/services/payments.ts`
- `edutumobile/lib/billingRouting.ts`
- `edutumobile/app/(app)/paywall.tsx`
- `edutumobile/packages/core/src/hooks/useProStatus.ts`
- authenticated mobile billing-status client code
- `backend/services/services/api/src/billing/`
- `backend/services/services/api/src/billing/providers/revenuecat/`
- backend environment configuration and raw-body bootstrap
- canonical Supabase billing migrations
- `admin/src/pages/Monetization.tsx`
- `admin/src/lib/monetizationApi.ts`
- deployment, reconciliation, incident, and support runbooks

Implementation must preserve unrelated worktree changes and must not reactivate direct client entitlement writes or the legacy Supabase webhook authority.

## References

- [RevenueCat offerings](https://www.revenuecat.com/docs/offerings/overview)
- [RevenueCat entitlements](https://www.revenuecat.com/docs/getting-started/entitlements)
- [RevenueCat Google Play products](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [RevenueCat webhook security and retries](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers)
- [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [RevenueCat sandbox workflow](https://www.revenuecat.com/docs/test-and-launch/sandbox)
- [Apple auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/)
- [Apple billing grace period](https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions/)
- [Apple subscription pricing API](https://developer.apple.com/documentation/appstoreconnectapi/subscription-price-points-and-subscription-prices)
- [Google Play subscriptions API](https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions)
- [Google Play license testing](https://support.google.com/googleplay/android-developer/answer/6062777)
