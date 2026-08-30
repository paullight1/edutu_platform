# RevenueCat IAP launch evidence

Status: local backend implementation verified; external store/provider cutover pending.

## Local implementation evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Canonical catalog/lifecycle migration | Pass | Nine tier/cadence products, store bindings, idempotent lifecycle transaction, source-scoped grants, transfer and sandbox isolation tests. |
| Environment-specific delivery config | Pass | Separate sandbox/production flags, secrets, app/store allowlists, and startup validation. |
| Durable webhook acceptance | Pass | Exact raw-byte verification, HTTP 202 after inbox insert, duplicate and hash-conflict tests. |
| Async processing and reconciliation | Pass | Lifecycle normalization, retry/review/dead-letter behavior, provider-scoped leasing, secret-only reads, `is_sandbox` isolation, and drift classification tests. |
| Authoritative billing status | Pass | Canonical live grants outrank legacy display fields; state/hierarchy/scheduled-change tests. |
| Legacy writer retirement code | Pass locally | Supabase function contains only a mutation-free HTTP 410 response. Deployment must follow observed production health. |

Local verification gap: the Deno runtime is not installed on this workstation, so `index_test.ts` was not executed. Static mutation-path checks pass; CI or a Deno-enabled release host must run the test before deployment.

## External cutover evidence

Do not replace `Pending` with `Pass` without recording real provider/store evidence.

| Gate | Status | Timestamp / safe reference |
| --- | --- | --- |
| Migration deployed to target Supabase project | Pending | — |
| NestJS deployed with purchase initiation disabled | Pending | — |
| Sandbox TEST delivery processed | Pending | — |
| Sandbox lifecycle fixture matrix reconciled | Pending | — |
| Production TEST delivery processed | Pending | — |
| Controlled App Store transaction confirmed | Pending | — |
| Controlled Play Store transaction confirmed | Pending | — |
| Legacy RevenueCat registration removed | Pending | — |
| Legacy Supabase 410 function deployed | Pending | — |
| Queue/dead-letter/product-drift alerts observed | Pending | — |
| Purchase kill switch exercise completed | Pending | — |

## Release gate output

Executed locally on 2026-08-30 from branch `codex/revenuecat-iap-rollout`:

| Command | Result |
| --- | --- |
| `npm run lint` | Pass (zero ESLint errors) |
| `npm run build` | Pass (NestJS strict TypeScript build) |
| `npm test -- --runInBand` | Pass — 222 suites, 2,260 tests, 0 failures |
| `npm run test:e2e -- --runInBand` | Pass — 4 suites, 12 tests, 0 failures |

The full suite includes raw-delivery rejection, exact duplicate/hash conflict, lifecycle reorder/stale behavior, source isolation, transfer, authenticated-subject controller routing, canonical status states, provider-scoped leasing, retry/review/dead-letter behavior, and sandbox/live reconciliation isolation.

Remaining production evidence gaps:

- No isolated external test database or real RevenueCat integration was configured for this run. The current e2e suite is disposable/PGlite-based and does not perform a signed network delivery followed by a second Clerk user attempting to read the first user’s status.
- `NATIVE_IAP_PURCHASES_ENABLED=false` passes startup/configuration tests while webhook processing remains independently configured, but the kill switch has not been exercised against a store-signed mobile build.
- Deno is unavailable locally, so the mutation-free legacy 410 test remains for CI or a Deno-enabled release host.
- Real sandbox/production TEST IDs, controlled App Store/Play transactions, queue observations, and alert receipts remain pending in the external cutover table.

Secrets, customer payloads, emails, and full provider URLs are intentionally absent from this record.
