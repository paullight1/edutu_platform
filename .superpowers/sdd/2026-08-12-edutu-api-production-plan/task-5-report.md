# Task 5 Report: One-time API credit product configuration

## Status

**Complete for the scoped Task 5 work.** Task 6 webhook fulfillment was not
implemented or staged.

## Contract delivered

- Canonical API-only product keys are `api_credits_100`, `api_credits_250`,
  and `api_credits_700`; the existing broader-app `credits_*` products remain
  separate and unchanged.
- API products resolve to application-level `fulfillmentKind: "credits"`,
  `renewalMode: "one_time"`, exact positive quantities of 100/250/700, and
  `validityDays: null`.
- The database keeps its existing raw `credit_pack` discriminator and the
  repository maps it to the application-level `credits` contract. This
  preserves the deployed billing schema and existing fulfillment boundary.
- Bachs configuration requires a complete API-credit catalog whenever any API
  credit mapping is present. Each entry must agree on provider product ID,
  positive minor-unit amount, uppercase supported currency, and sandbox/live
  environment.
- Checkout accepts only the server-owned product key and return surface. The
  service rejects missing/mismatched Bachs provider or environment metadata,
  provider IDs, amounts, currencies, quantities, renewal mode, and validity
  before calling Bachs.
- Repository product lookup requires an enabled product and an environment-
  specific Bachs mapping, then revalidates the one-time credit contract before
  returning it.

## Files in the Task 5 commit

- Billing checkout service, repository, types, and Bachs config.
- Focused checkout, schema-contract, and Bachs config/client tests.
- Root and backend API Supabase API-credit product migrations.
- This report.

## Verification

```text
Focused backend tests:
  4 suites passed, 81 tests passed

Backend build:
  npm run build — passed

Task 5 source/test lint:
  npx eslint <Task 5 files> — passed

Diff whitespace check:
  git diff --check — passed
```

The repository-wide `npm run lint` remains red because unrelated dirty Task 3,
Task 8, and other files contain 132 existing Prettier errors. Those files are
not included in the Task 5 commit.
