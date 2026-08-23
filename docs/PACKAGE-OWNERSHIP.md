# Package Ownership

## Canonical rule

Reusable cross-app TypeScript packages belong under:

```text
packages/
```

The current canonical shared package is `packages/ux-state`.

`edutumobile/packages/core` is a grandfathered mobile package. It remains in place until its Expo Metro, Jest, TypeScript aliases, native builds, and dependency graph can be migrated together. No additional app-local `packages/` roots may be introduced.

## Dependency direction

```text
runtime apps and services
          ↓
shared packages
          ↓
framework-independent contracts and utilities
```

Shared packages may expose types, validation, pure domain rules, and reusable state contracts. They must not import application pages, route definitions, navigation, environment wiring, deployment configuration, or server-only credentials.

## Ownership table

| Path | Owner | Policy |
| --- | --- | --- |
| `packages/ux-state` | cross-app UX state/contracts | canonical |
| `edutumobile/packages/core` | mobile domain/client core | grandfathered; no expansion into unrelated domains |
| any other `*/packages` root | none | forbidden by Architecture Governance |

## Version policy

Architecture simplification does not authorize silent framework convergence. Web, mobile, API, and voice dependencies may be upgraded only through their own tested migration. Moving code between package roots must not also change framework versions unless the migration explicitly owns and verifies both changes.

## Exit condition for mobile core

Move reusable portions of mobile core only after stable public imports are defined. Verify Metro resolution, Jest aliases, TypeScript paths, Expo native builds, web consumers, and CI at the exact branch head. Then remove the grandfathered package root from the architecture allowlist in the same change.
