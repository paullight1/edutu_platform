# Task 7 report: developer dashboard API credit top-ups

## Implemented

- Completed the developer dashboard credit purchase panel for new accounts:
  verified zero balances are shown clearly, project creation remains available
  at zero credits, and the dashboard states “One-time purchase. Credits never
  expire.”
- Loaded display-only credit pack metadata from the server configuration and
  mapped only the API catalog products (`api_credits_100`,
  `api_credits_250`, and `api_credits_700`). Prices, quantities, provider
  product IDs, and provider credentials are never sent by browser checkout
  code.
- Kept checkout requests limited to `productKey` and `returnSurface` in the
  JSON body, with the stable action idempotency key in the request header.
  Checkout responses accept server-owned renewal policy and validate the
  returned URL against the approved Bachs checkout origin.
- Added safe billing error handling for `credits_exhausted` and
  `billing_unavailable`, plus a pending-payment state that tells users credits
  appear only after provider verification and provides a balance retry action.
- Extended `useBillingStatus` to refresh status and products together, refresh
  on tab visibility, and clear unverified stale balances or products when a
  billing read fails.

## Scoped files

- `edutu-web-app/src/components/DeveloperDashboardPage.tsx`
- `edutu-web-app/src/components/developer/CreditPurchasePanel.tsx`
- `edutu-web-app/src/hooks/useBillingStatus.ts`
- `edutu-web-app/src/services/billing.ts`
- `edutu-web-app/src/services/billing.test.ts`
- `edutu-web-app/src/test/__tests__/developerProductionFlow.test.tsx`
- `edutu-web-app/src/test/__tests__/scholarshipEnginePages.test.tsx`

## Verification

- Focused web tests: 3 files, 17 tests passed.
- Full web tests: 51 files, 305 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with `--max-warnings 0`.
- `npm run build`: passed. Vite emitted the existing ineffective dynamic-import
  warning for `src/services/opportunities.ts`.
- `git diff --check`: passed.

## Scope protection

Only the Task 7 web dashboard/billing files, tests, and this report are being
staged. Existing backend billing/metering/auth changes, Task 3/5/6 files,
Task 8 opportunity changes, Task 9 documentation, generated/build artifacts,
temporary Supabase files, and unrelated dirty files remain unstaged.
