# Opportunity Journey Backfill and Parity Runbook

## Safety defaults

`backfill-opportunity-journeys.ts` is dry-run by default. It does not write unless `--write` is present. `audit-opportunity-journey-parity.ts` is always read-only and ignores `--write`.

Use only a local or isolated staging database during PR review.

## Dry run

```bash
cd backend/services/services/api
npx ts-node --transpile-only scripts/backfill-opportunity-journeys.ts \
  --dry-run \
  --limit=100
```

Review `usersScanned`, `usersWithMismatches`, `mismatches`, `failures`, and `nextAfterUserId`. Continue a batch with:

```bash
npx ts-node --transpile-only scripts/backfill-opportunity-journeys.ts \
  --dry-run \
  --limit=100 \
  --after-user-id=<last-user-id>
```

## Parity audit

```bash
npx ts-node --transpile-only scripts/audit-opportunity-journey-parity.ts \
  --limit=100
```

Exit code `2` means mismatches were found; it is not permission to write. Explain every unsupported status and mismatch before staging write mode.

## Explicit staging write

Create a current staging backup first. Then run against staging only:

```bash
npx ts-node --transpile-only scripts/backfill-opportunity-journeys.ts \
  --write \
  --limit=100
```

Immediately rerun the read-only parity audit. Store both JSON reports with the exact Git SHA and staging database identity.

## Mapping

- Bookmark only → `shortlisted`
- Draft/interested/preparing application → `preparing`
- Submitted/applied → `applied`
- Interview/interviewing → `interview`
- Offer/offered → `offer`
- Rejected → `rejected`
- Withdrawn → `withdrawn`
- No response → `no_response`

Application state wins over bookmark state for the same opportunity. Reconciliation never downgrades a stronger existing journey. Import idempotency keys use `legacy-import-v1:<table>:<record-id>`.

## Rollback

The backfill is additive. Legacy rows are not deleted. If staging review fails, disable every opportunity-pipeline flag, stop further batches, and leave imported journey/event rows available for diagnosis. Do not run an unreviewed destructive reverse migration.
