# Legacy Migration Ownership Reconciliation — 2026-09-02

## Decision

Restore the frozen `supabase/migrations` tree and preserve the two community migration versions and SQL bodies under the canonical migration owner:

```text
backend/services/services/api/supabase/migrations
```

No migration version is renamed and no SQL statement is altered as part of the ownership repair.

## Provenance

The repository froze the legacy migration trees in commit:

```text
4cbe0a88562ee845b8d9e4a71c4236ab20ba75ef
ci(architecture): freeze legacy migration trees
```

At that point, the expected Git tree for `supabase/migrations` was:

```text
13bd685c014b28950bf953f24729a5090494cfc2
```

Commit:

```text
a300606c29adc1b7bc83893e1d16825521b50a49
feat(api): expand community engagement and moderation
```

later added these files to the frozen legacy path:

```text
supabase/migrations/20260827070117_seed_community_first_impression_groups.sql
supabase/migrations/20260828153000_community_admin_management.sql
```

The same feature already placed its community post-engagement migration in the canonical backend path. The two files above were therefore ownership-placement drift, not a decision to reopen the legacy root.

## Repair

The repair performs four operations:

1. Copy `20260827070117_seed_community_first_impression_groups.sql` unchanged into the canonical backend migration directory.
2. Copy `20260828153000_community_admin_management.sql` unchanged into the canonical backend migration directory.
3. Update the two PGLite migration tests to read those canonical files.
4. Delete only the two post-freeze copies from `supabase/migrations`.

After deletion, the legacy directory Git tree returns to the original frozen SHA:

```text
13bd685c014b28950bf953f24729a5090494cfc2
```

The ownership manifest is intentionally not changed.

## Deployment uncertainty

The repository records Supabase project ref `sioxocmrjmdevsdlzjns`, but the currently connected Supabase account cannot inspect that project. The only accessible connected project does not contain the Edutu opportunity or community tables. Consequently, this repair does not claim whether either migration version has already been applied in production.

Preserving the exact migration version and SQL content is the least-destructive response to that uncertainty:

- an environment that already records the version will not receive a new version under another timestamp;
- an environment that has not applied the version can discover it through the canonical migration path;
- the repository regains one authoritative migration owner without rewriting migration history.

Production migration status must be checked against the actual Edutu Supabase project before a future database release. This ownership-only PR does not run a migration, modify a remote database, or change production data.

## Verification

The repair is accepted only when all of the following pass:

```bash
node --test scripts/migration-ownership.test.mjs
node scripts/check-migration-ownership.mjs

cd backend/services/services/api
npm test -- --runInBand \
  communities/community-admin-management.migration.spec.ts \
  communities/community-first-impression-seed.spec.ts
```

The PR diff must also show the two files as moves in substance: identical SQL removed from the frozen root and added to the canonical root.
