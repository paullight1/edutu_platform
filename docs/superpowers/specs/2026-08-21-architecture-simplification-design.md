# Architecture Simplification Design

## Goal

Reduce Edutu's architecture debt without changing product behavior, public URLs, data contracts, authentication semantics, billing semantics, or deployment ownership. Each refactor phase must be independently testable and revertible.

## Why this work exists

The platform has grown through many fast feature waves. The resulting system works, but maintainability has degraded because several responsibilities accumulated in the same files and because older architecture generations remain beside newer ones.

Verified debt includes:

- duplicate backend generations: the legacy Express scraper API in `backend/` and the canonical NestJS API in `backend/services/services/api/`;
- confusing physical nesting at `backend/services/services/...`;
- very large UI and service files, including 5k-line admin pages and 3k-4k-line backend/mobile modules;
- mixed package ownership (`packages/ux-state` at the repo root and `edutumobile/packages/core` inside the mobile app);
- multiple migration streams for shared tables;
- overlapping direct-Supabase and backend-API access paths;
- architecture documentation that describes a multi-repo boundary while mobile source is physically present in this repository.

## Non-negotiable constraints

1. No rewrite.
2. No product redesign in this stream.
3. No intentional API behavior changes.
4. No schema change unless a phase explicitly requires it and has migration tests.
5. No path flattening before callers, CI, deployment config, and documentation are ready.
6. Every phase starts from green CI and must return to green before the next phase.
7. Existing production-hardening/security controls stay intact.
8. A failed phase is fixed or reverted before later work continues.
9. Giant files are decomposed by cohesive responsibility, not arbitrary line count.
10. Shared contracts get one canonical owner.

## Target architecture

The long-term physical shape is:

```text
edutu_platform/
├── apps/
│   ├── web/        # current edutu-web-app
│   ├── admin/      # current admin
│   ├── mobile/     # current edutumobile
│   └── api/        # current Nest API
├── services/
│   ├── voice/
│   └── scraper/
├── packages/
│   ├── core/
│   ├── contracts/
│   ├── ux-state/
│   └── config/
├── database/
│   ├── schema/
│   ├── migrations/
│   └── functions/
├── docs/
└── tooling/
```

This is a destination, not a single migration. Physical moves happen only after logical ownership is clear.

## Dependency direction

The desired dependency rule is:

```text
UI routes/pages
  -> feature controllers/hooks
  -> domain/application services
  -> shared contracts
  -> API clients/adapters

API controllers
  -> domain/application services
  -> repositories/adapters
  -> database/external providers
```

UI route files must not become business-logic integration hubs. Infrastructure must not import UI. Shared contracts must not depend on app-specific code.

## Data access rule

For each domain there should be one preferred path and explicitly documented fallbacks.

- Privileged mutations: backend API only.
- User-owned direct Supabase access: only when RLS is intentional and tested.
- Offline caches: adapters beneath feature/domain APIs, not route-level ad hoc logic.
- Recommendation/scoring semantics: canonical backend ownership; local scoring is an explicit offline fallback only.

## Refactor phases

### Phase 0 — Safety rails and architecture contract

Create this design, the executable implementation plan, and automated architecture checks. Freeze known debt so it cannot grow while refactoring proceeds.

Exit gate:
- existing CI green;
- architecture checks run in Repository Governance;
- no product source changed.

### Phase 1 — Remove duplicate runtime ownership

Determine whether the legacy Express scraper API under `backend/` has any live CI/deployment/runtime consumer. If none exists, remove it and guard against its accidental return. The NestJS API remains the canonical backend.

Exit gate:
- no deployment/CI references legacy Express entrypoints;
- full CI green;
- no active endpoint removed from the canonical Nest API.

### Phase 2 — Canonical package and data ownership

Document and enforce one package boundary model and one canonical migration stream for shared production tables. Stop creating new shared migrations in app-local folders. Create/centralize shared TypeScript contracts incrementally where duplication is proven.

Exit gate:
- migration ownership guard green;
- package ownership documented;
- no schema drift introduced.

### Phase 3 — Admin decomposition

Decompose the largest admin pages, starting with `Opportunities.tsx` and `Scraper.tsx`, into feature-scoped types, API/adapters, hooks/controllers, and presentational components.

Target per page after extraction:
- route/page orchestration generally <= 500 lines;
- extracted modules each have one cohesive responsibility;
- behavior and routes unchanged.

Exit gate per page:
- admin tests, lint, build green;
- relevant behavior tests unchanged or stronger;
- no new cross-feature imports.

### Phase 4 — Mobile decomposition

Decompose mobile opportunity detail, home, chat, and the opportunity core service. Move pure normalization/scoring/cache logic behind focused domain/adapters. Keep Expo Router route files thin.

Target:
- route components generally <= 500 lines;
- direct data access moved below route level;
- local fallback behavior preserved exactly unless a dedicated behavior change is approved separately.

Exit gate per screen/service:
- mobile typecheck, tests, lint green;
- test network guard green;
- deep-link/offline/guest behavior preserved.

### Phase 5 — Backend service decomposition

Split `opportunities.service.ts` and `scraper.service.ts` by application responsibility: query/catalog, recommendation, enrichment, publication, run control, extraction, persistence, and orchestration. Controllers keep stable contracts.

Exit gate per service:
- backend unit + e2e + build + lint green;
- controller API contracts unchanged;
- no privilege widening.

### Phase 6 — Physical path flattening

Only after logical boundaries are stable, move apps/services/packages to the target physical layout. Use compatibility scripts/aliases during the transition, update CI/deployment paths atomically, then remove compatibility shims.

Exit gate:
- every CI job green on the moved tree;
- Vercel/Render/mobile build paths verified;
- docs and developer commands match physical layout;
- no compatibility shim remains without an explicit expiry condition.

## Rollback strategy

Each phase uses focused commits and does not combine unrelated subsystem moves. If a gate fails and the root cause is not local to the phase, revert that phase before continuing. Do not stack compensating hacks on top of a broken refactor.

## Success criteria

The refactor is complete when:

- there is one canonical backend runtime;
- there is one documented package ownership model;
- shared migrations have one canonical owner;
- giant route/page/service files are decomposed around domain responsibilities;
- direct data access is owned by adapters/services rather than screens;
- physical paths reflect ownership instead of historical nesting;
- the complete CI matrix remains green throughout;
- onboarding documentation can explain the system without exceptions such as `services/services` or competing runtime owners.
