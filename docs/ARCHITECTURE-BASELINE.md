# Architecture Simplification Baseline

Baseline captured before behavior-preserving architecture refactoring.

## Known structural debt

- Canonical NestJS API currently lives at `backend/services/services/api`.
- Voice gateway currently lives at `backend/services/services/voice`.
- Shared package roots are split between `packages/ux-state` and `edutumobile/packages/core`.
- Shared-table migrations exist in multiple historical Supabase migration directories.

## Eliminated debt

### Phase 1 — duplicate backend runtime

The legacy Express scraper API directly under `backend/` was removed after confirming that current CI, the production Render manifest, and the admin scraper all use the canonical NestJS backend. Architecture governance now prevents the retired root runtime/package from being reintroduced.

## Large-file debt ceilings

The existing governance check records these maximums; they are ceilings to reduce, not targets:

| File | Baseline lines |
| --- | ---: |
| `admin/src/pages/Opportunities.tsx` | 5175 |
| `admin/src/pages/Scraper.tsx` | 4653 |
| `backend/services/services/api/src/opportunities/opportunities.service.ts` | 3622 |
| `backend/services/services/api/src/scraper/scraper.service.ts` | 3962 |
| `edutu-web-app/src/components/Dashboard.tsx` | 2005 |
| `edutumobile/app/(app)/chat.tsx` | 2245 |
| `edutumobile/app/(app)/index.tsx` | 3113 |
| `edutumobile/app/(app)/opportunities/[id].tsx` | 4446 |

## Verification baseline

The refactor branch starts from the exact PR #51 hardening head that passed the full CI matrix before architecture work began. Every architecture phase must return the same matrix to green before the next phase proceeds.

## Reduction rule

When a phase successfully removes architecture debt, its grandfathered allowance or large-file ceiling must be reduced in the same phase. Debt may move only when the destination has an explicit owner and the old path is retired; it must not simply be duplicated under a cleaner name.
