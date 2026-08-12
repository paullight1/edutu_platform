# Uncommitted Work Audit — 2026-08-12

The pre-existing working tree was reviewed and split into feature-scoped commits before starting the Supabase/Render remediation work.

## Commit groups

1. Backend billing authority, provider adapters, event inbox, and reconciliation.
2. `pay-edutu-org` migration to a server-side billing status/account shell.
3. Web/mobile billing clients and launch-gated checkout UI.
4. AI cancellation propagation, streaming chat, voice metering, and mobile voice lifecycle.
5. Community inbox/discovery, unread counts, notification fan-out, and mobile control campaign placement.
6. Opportunity taxonomy, enrichment jobs, scraper integration, and opportunity UI/client changes.
7. Edutu For You/Impact campaign presentation and related documentation/plans.
8. Security review and implementation-plan documentation.

## Verification performed

- Backend billing, monetization, opportunities, and voice tests: 34 suites / 325 tests passed.
- Backend production build: passed.
- Web typecheck and focused billing/dashboard/impact tests: passed.
- Mobile typecheck: passed.
- Mobile focused billing, voice, community, opportunity, and mobile-control tests: 11 suites / 102 tests passed.
- Payment shell tests and typecheck: passed; production build had already passed during review.
- Admin tests: 4 files / 12 tests passed.

## Rollout holds

- The payment shell calls `/billing/pay-shell/exchange`, `/billing/account`, and `/billing/intent-status`; those handlers are not present in the current Nest billing controller. Keep the shell and Bachs launch flag disabled until the contract is implemented and tested end-to-end.
- Bachs webhook verification exists, but the current billing service returns an acknowledged/ignored response instead of fulfilling a purchase. Do not set `VITE_BACHS_CHECKOUT_ENABLED=true` until fulfillment is wired and staging payment tests pass.
- Mobile tests emit existing asynchronous `act(...)` warnings and occasional open-handle notices; these do not fail the focused suite but should be cleaned up before a release build.

## Safety boundary

No credentials were printed or staged. The security remediation implementation will begin from the final commit checkpoint in an isolated worktree.

