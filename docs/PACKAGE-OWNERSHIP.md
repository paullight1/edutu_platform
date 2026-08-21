# Package Ownership

Edutu is standardizing package ownership before any physical repository/layout migration.

## Rule

Cross-app reusable TypeScript packages belong under the repository root:

```text
packages/
```

The only current root shared package is `packages/ux-state`.

`edutumobile/packages/core` is a grandfathered historical mobile package. It remains in place during behavior-preserving refactoring because moving it now would combine package resolution, Expo/Metro, TypeScript aliases, Jest aliases, and dependency-version changes in one step. It will migrate only in the physical-layout/package-migration phase.

No additional app-local `packages/` roots may be introduced. Repository Governance enforces that rule.

## Dependency direction

```text
apps / runtime services
        ↓
shared packages
        ↓
framework-independent contracts/utilities
```

Shared packages must not import application route/page code. App-specific UI, navigation, environment wiring, and deployment logic stay in the owning app.

## Current ownership

| Path | Status | Owner |
| --- | --- | --- |
| `packages/ux-state` | canonical shared root | cross-app UX state/contracts |
| `edutumobile/packages/core` | grandfathered; future move | mobile domain/client core |
| any other `*/packages` root | forbidden | none |

## Version policy during refactor

Architecture simplification must not silently unify framework versions. In particular, the root tooling package and mobile Expo package currently have different Expo version lines. Dependency convergence requires its own tested migration; package ownership documentation alone does not authorize version upgrades/downgrades.

## Exit condition

When physical layout migration begins, move genuinely cross-app parts of mobile core into root packages behind stable imports, verify Metro/Jest/TypeScript resolution, then remove the grandfathered mobile package root from the architecture allowlist.
