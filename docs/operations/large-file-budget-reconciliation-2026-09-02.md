# Large-File Budget Reconciliation — 2026-09-02

## Purpose

The repository's line-count guard is a debt ceiling. It is intended to reject new growth in already-large files, not to retroactively reject feature work that is already merged into the baseline without explaining why.

The previous ceilings were last changed in commit:

```text
254e0fc5c268414929ac4fe25cb1142c4fbe3476
feat(engine): add cross-source title fingerprints
```

Three guarded files later received intentional, tested feature work on `main`, but their ceilings were not synchronised. Full CI therefore failed before reaching later governance checks.

## Reconciled files

### `admin/src/pages/Opportunities.tsx`

Previous ceiling: `5175`  
Exact current count: `5317`  
Net increase after the previous refresh: `142` lines

Relevant merged work:

```text
e03fbfebe84168f53e11e7970e2511a3cb6b8dca
feat(admin): add bulk AI opportunity enhancement

227cd8a837f8600847864abbeb34394f3d451d27
fix(opportunities): harden bulk AI completion
```

The implementation also extracted the progress popup and bulk-enhancement logic into focused neighbouring files. This reconciliation adds no extra headroom beyond the exact current line count.

### `backend/services/services/api/src/opportunities/opportunities.service.ts`

Previous ceiling: `3627`  
Exact current count: `3777`  
Net increase after the previous refresh: `150` lines

Relevant merged work:

```text
59066bd5cc043d2b91d53278b6943dd3b50f817b
feat(api): strengthen AI opportunity enrichment

95c5cee9f05b7bab8f67739a6de9d05a4c96f248
perf(api): bound concurrent opportunity enhancement

227cd8a837f8600847864abbeb34394f3d451d27
fix(opportunities): harden bulk AI completion
```

The ceiling is set to the exact current count. Future opportunity-pipeline work must not add orchestration directly to this service; it must use focused journey services as specified in the opportunity-pipeline plan.

### `backend/services/services/api/src/scraper/scraper.service.ts`

Previous ceiling: `3984`  
Exact current count: `4017`  
Net increase after the previous refresh: `33` lines

Relevant merged work:

```text
481b9d6091d6dd0493fba721fb1365d6fb12b96e
feat(api): deduplicate stored images and plan cleanup

eef1bdc8fe280cf603a0aa2d03164b3140f2ae5f
feat(api): add guarded Supabase storage cleanup

7a83692cd8f9b1751ef872f35d07eb0d5190dacb
style(api): format storage maintenance code
```

The storage cleanup implementation also introduced focused planning and cleanup modules. The reconciled ceiling contains no discretionary growth allowance.

## Decision

Update the three ceilings to their exact current `main` counts:

```text
admin/src/pages/Opportunities.tsx: 5317
backend/services/services/api/src/opportunities/opportunities.service.ts: 3777
backend/services/services/api/src/scraper/scraper.service.ts: 4017
```

All other ceilings remain unchanged. This is a baseline reconciliation, not approval for future growth.

## Follow-up architecture rule

Any subsequent change that increases one of these files must either:

1. extract a cohesive responsibility and lower or preserve the ceiling; or
2. include an explicit reviewed ceiling change with commit-level provenance and no unexplained headroom.

The intentional opportunity-pipeline implementation must place new state, recommendation, and lifecycle orchestration in dedicated modules rather than these existing large files.

## Verification

```bash
node scripts/check-large-file-budgets.mjs
```

Expected result:

```text
Architecture budgets passed for 7 critical files.
```
