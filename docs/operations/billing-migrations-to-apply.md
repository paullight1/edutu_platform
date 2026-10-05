# Billing and adjacent migrations to apply

Verified on 2026-10-05 against project `sioxocmrjmdevsdlzjns` (`edutu.ai`).
All eleven migrations below and `20261005220804_bachs_recurring_consumer_plans.sql`
have been applied. After successful execution, connector-generated history
versions were aligned with the canonical local timestamps.

All nine consumer plans are enabled in the catalog, recurring, card-only USD,
and mapped to the supplied live Bachs products. Edutu/Lite yearly is **$99.99**.
Live purchases still need server Bachs credentials, webhook setup, and deployment
of the backend changes. Provider prices and recurrence are checked at checkout.

The Community admin migration now supports existing tables, indexes, and
constraints so it can run against the hosted schema without deleting data.

## Applied SQL files, in canonical timestamp order

1. [`20260812173654_revoke_legacy_credit_mutation_rpcs.sql`](../../supabase/migrations/20260812173654_revoke_legacy_credit_mutation_rpcs.sql)
2. [`20260812174910_harden_legacy_admin_privileges.sql`](../../supabase/migrations/20260812174910_harden_legacy_admin_privileges.sql)
3. [`20260812181300_harden_profile_authorization.sql`](../../supabase/migrations/20260812181300_harden_profile_authorization.sql)
4. [`20260813160000_api_credit_products.sql`](../../supabase/migrations/20260813160000_api_credit_products.sql)
5. [`20260813170000_verified_api_credit_fulfillment.sql`](../../supabase/migrations/20260813170000_verified_api_credit_fulfillment.sql)
6. [`20260827070117_seed_community_first_impression_groups.sql`](../../supabase/migrations/20260827070117_seed_community_first_impression_groups.sql)
7. [`20260828153000_community_admin_management.sql`](../../supabase/migrations/20260828153000_community_admin_management.sql)
8. [`20260830120000_revenuecat_subscription_authority.sql`](../../supabase/migrations/20260830120000_revenuecat_subscription_authority.sql)
9. [`20261002090000_billing_pay_shell_sessions.sql`](../../supabase/migrations/20261002090000_billing_pay_shell_sessions.sql)
10. [`20261003120000_billing_provider_event_reference.sql`](../../supabase/migrations/20261003120000_billing_provider_event_reference.sql)
11. [`20261003121000_billing_pay_shell_constraints.sql`](../../supabase/migrations/20261003121000_billing_pay_shell_constraints.sql)

## Other remote history

Version `20260830160050` is named `restore_community_first_impression_groups`.
It is separate from RevenueCat and has no matching local file. Its history was
preserved without fabricating a placeholder migration.

## Remaining payment deployment setup

Configure `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`,
`BACHS_EXPECTED_ORGANIZATION_ID`, the live API URL/environment, and the checkout
product mapping configuration using the server secret manager. Configure the
pay-shell URL, API key, and enabled settings. Deploy the updated backend and
register the signed Bachs webhook before enabling the checkout/webhook flags.
No credentials should be pasted into chat or committed.

Verify a real checkout, renewal, failed renewal, cancellation, and return to
Edutu before opening production payments. The local renewal, ownership,
idempotency, and cancellation tests do not substitute for provider integration.

## Recurring security follow-up (2026-10-05)

Applied `20261005222459_enforce_billing_grant_access_windows.sql` and
`20261005223143_isolate_live_billing_entitlements.sql`. Hosted checks confirm
access start bounds, live-only entitlement projections, and a server-only
recurring checkout trigger preventing a different-key duplicate checkout or
subscription. Backend deployment must include invoice-only grants, invoice
idempotency, cancellation ordering, bounded periods, current-grant tool access,
and the minute-by-minute compatibility-cache refresh.

Verification: 31 billing/monetization suites, 376 tests passed; backend build
TypeScript check passed. Real Bachs integration remains a deployment check.
