# Database Migrations — Discipline & Layout

The production-hardening review found three migration hazards: duplicate timestamp prefixes, a `schema.sql` snapshot that can diverge from applied migrations, and multiple migration trees. This document fixes the discipline going forward without renaming already-applied migrations.

## The one authoritative tree

```text
backend/services/services/api/supabase/migrations/
```

All new backend/database migrations go here. The root `supabase/migrations/` and any per-app migration trees are legacy/parallel records and must not receive new migrations. Existing files remain in place because moving or renaming an applied migration can make a migration tracker treat it as new.

## Apply order

A schema migration required by a new backend release must be applied **before** that backend release. Code must not deploy first and assume a missing column/table will appear later.

Migrations should be idempotent wherever practical (`if not exists`, safe `drop ... if exists`, conflict-safe backfills) so controlled re-application does not corrupt state.

## Naming

Use a unique 14-digit UTC timestamp:

```text
YYYYMMDDHHMMSS_snake_case_description.sql
```

Never reuse an existing timestamp prefix.

## Schema snapshots are non-authoritative

`schema.sql`, `admin_schema.sql`, and similar dumps are reading/reference snapshots. They are not the source of truth for production changes. If a snapshot disagrees with the migration history, the migration history wins.

## CI guard

Repository Governance applies complementary checks:

- `scripts/check-migration-ownership.mjs` freezes each historical migration
  directory by its Git tree SHA, so additions, edits, renames, and deletions
  fail CI.
- The workflow's legacy-tree diff guard rejects changes relative to the pull
  request or push base.
- `scripts/check-migration-timestamps.mjs` validates the authoritative tree.
  Five timestamp collisions predate this rule and are already applied; they
  remain explicitly grandfathered. Any new collision fails CI.

Run locally with:

```bash
node scripts/check-migration-timestamps.mjs
node --test scripts/migration-ownership.test.mjs
node scripts/check-migration-ownership.mjs
```

Do not add a new collision to the grandfather list to make CI pass. Pick a fresh timestamp instead.
