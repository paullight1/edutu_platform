# Edutu Architecture Baseline

Verified against the consolidated `main` branch on 23 August 2026.

## Repository model

Edutu is a monorepo-style platform workspace containing several independently deployed runtimes. It is not a single application and it is not safe to treat every top-level folder as a separate source of truth.

| Responsibility | Canonical path | Status |
| --- | --- | --- |
| Platform API and privileged business logic | `backend/services/services/api` | canonical |
| Voice gateway | `backend/services/services/voice` | canonical specialist service |
| User web/PWA | `edutu-web-app` | canonical web client |
| Operations/admin UI | `admin` | canonical standalone admin client |
| Expo mobile app | `edutumobile` | canonical mobile client |
| Cross-app shared packages | `packages` | canonical shared root |
| Canonical database migrations | `backend/services/services/api/supabase/migrations` | writable source of truth |

## Trust boundary

The NestJS API is the default trust boundary for:

- privileged database mutations and service-role access;
- billing, credits, entitlements, webhook verification, and reconciliation;
- admin-only changes and scraper controls;
- AI provider credentials, policy, routing, and usage accounting;
- business rules that must remain consistent across web, mobile, and admin.

Client-side Supabase access is permitted only for explicitly user-owned data protected by reviewed RLS policies. Public client code must never contain or reference a Supabase service-role credential.

## Dependency direction

```text
web / mobile / admin
        ↓
public API contracts and approved client adapters
        ↓
NestJS controllers
        ↓
application/domain services
        ↓
repositories and external-provider adapters
        ↓
Postgres / Supabase / third-party providers
```

Clients must not import API implementation files. Shared packages must not import application pages, routes, deployment configuration, or server-only credentials.

## Grandfathered structural debt

The following debt remains intentionally visible rather than being hidden by a risky mass move:

1. `backend/services/services/*` contains repeated naming. A physical rename affects deployment roots, lockfiles, build caches, docs, and external hosting configuration, so it requires a dedicated migration with production rollback evidence.
2. The legacy root `backend/server.js`, `backend/scraper.js`, and `backend/database.js` remain frozen until the external Render start command and any dependent automation are independently verified. No additional root-level backend runtime may be added.
3. `edutumobile/packages/core` is a grandfathered app-local package. Moving it requires coordinated Expo Metro, Jest, TypeScript-path, and package-resolution verification.
4. Historical migration folders remain readable for provenance but are frozen. New shared-table migrations belong only in the canonical API migration directory.

## Enforced invariants

The `Architecture Governance` workflow now fails when:

- the canonical API package or entrypoint disappears;
- another `services/services/services` nesting level is introduced;
- an unowned `packages` or Supabase migration root appears;
- a new duplicate root-level backend runtime appears;
- client code references a service-role secret or imports API internals.

These checks prevent further architecture drift while allowing each grandfathered item to be removed through a focused, testable migration.

## Migration rule

Architecture debt may be removed, but it must not merely move. A physical migration is complete only when the destination has an explicit owner, all imports and deployment roots are updated, the old path is removed, CI is green at the exact head, and the deployed runtime is verified with a rollback path.
