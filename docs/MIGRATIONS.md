# Database Migrations — Discipline & Ownership

Edutu has one authoritative migration destination for shared production tables:

```text
backend/services/services/api/supabase/migrations/
```

## Canonical ownership

All new shared production migrations go to the canonical backend tree above. This includes schema, indexes, RLS/privileges, functions/triggers, data backfills required by shared runtime behavior, and changes consumed by web/admin/mobile together.

The following directories are historical migration records and are **frozen**:

```text
supabase/migrations/
edutu-web-app/supabase/migrations/
edutumobile/supabase/migrations/
```

Existing files stay in place because renaming or relocating already-applied migrations can confuse migration trackers. They are not valid destinations for new migrations and must not be edited merely to make them match newer schema state.

## CI enforcement

Repository Governance applies two complementary checks:

1. `scripts/check-migration-ownership.mjs` freezes each historical migration directory by its Git tree SHA. An addition, edit, rename, or deletion changes that SHA and fails CI.
2. `scripts/check-migration-timestamps.mjs` validates unique timestamp discipline in the canonical migration tree, with only explicitly documented historical collisions grandfathered.

This prevents a backdated filename or modification to an old migration from bypassing ownership policy.

## Apply order

A schema migration required by a backend release must be applied **before** that backend release. Code must not deploy first and assume a missing column/table will appear later.

Migrations should be idempotent wherever practical (`if not exists`, safe `drop ... if exists`, conflict-safe backfills) so controlled re-application does not corrupt state.

## Naming

Use a unique 14-digit UTC timestamp:

```text
YYYYMMDDHHMMSS_snake_case_description.sql
```

Never reuse an existing timestamp prefix.

## Schema snapshots are non-authoritative

`schema.sql`, `admin_schema.sql`, and similar dumps are reference snapshots. They are not the source of truth for production changes. If a snapshot disagrees with applied canonical migration history, migration history wins.

## Workflow

For a new shared database change:

1. identify the owning backend module/domain;
2. create the migration in the canonical tree;
3. add/adjust contract tests for affected privileges/schema behavior;
4. run Repository Governance and backend tests;
5. apply the migration before deploying code that requires it;
6. update data-model/operations docs when ownership or rollout behavior changes.

Do not add a new exception/frozen-tree SHA simply to make CI pass. A frozen-tree change requires an explicit migration-reconciliation project and review.
