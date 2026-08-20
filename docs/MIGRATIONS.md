# Database Migrations — Discipline & Layout

The engine review found three migration hazards: duplicate timestamp prefixes
(nondeterministic apply order), a `schema.sql` that diverges from the migrations,
and two migration trees. This document fixes the *discipline* going forward. It
deliberately does **not** rename or re-home already-applied migrations —
renaming an applied migration makes the migration tracker treat it as new and
try to re-run it, which can break a deploy. We fix forward, not backward.

## The one authoritative tree

```
backend/services/services/api/supabase/migrations/
```

This is colocated with the backend service that owns the schema. **All new
migrations go here.** The root `supabase/migrations/` and any per-app
`*/supabase/migrations/` trees are legacy/parallel and must not receive new
migrations. (They are left in place because their files correspond to already-
applied migrations; consolidating them physically is a separate, staged task
that needs a throwaway Supabase project to test `db push` against.)

## How migrations are applied here

Migrations in this repo are applied to the live project via the Supabase MCP
`apply_migration` tool (or the dashboard SQL editor), **not** `supabase db push`
from a developer machine. That means:

- The **migration file is the record**, not the trigger. Write the file, then
  apply the identical SQL via `apply_migration`.
- A migration must be **idempotent** (`if not exists`, `on conflict do nothing`,
  coalescing updates) so a re-apply is a no-op.
- **Migration precedes deploy.** A migration that adds a column the new code
  writes must be applied *before* the backend deploy, or the first write 500s on
  a missing column.

## Naming

`YYYYMMDDHHMMSS_snake_case_description.sql` — a full 14-digit UTC timestamp.
Never reuse a timestamp already present in the tree. The guard below enforces
this.

## `schema.sql` / `admin_schema.sql` are NON-authoritative snapshots

`backend/services/services/api/supabase/schema.sql` (and the `admin_schema.sql`
copies) are point-in-time snapshots for reading, **not** the source of truth and
**not** applied by anything. When they disagree with the migrations, the
migrations win. Do not hand-edit them to change behavior; regenerate them from
the live schema if you need a fresh snapshot.

## Guard

`scripts/check-migration-timestamps.mjs` fails if two migrations in the
authoritative tree share a timestamp prefix (excluding the five grandfathered
collisions that predate this rule and are already applied). Wire it into CI or
run it locally:

```bash
node scripts/check-migration-timestamps.mjs
```
