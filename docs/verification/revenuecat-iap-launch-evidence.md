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

Task 8 records lint, build, full unit/integration test, production-focused e2e, and kill-switch results here. Secrets, customer payloads, emails, and full provider URLs must not be recorded.
