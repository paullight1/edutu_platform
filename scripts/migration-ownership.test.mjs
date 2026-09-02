import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLegacyMigrationDiff,
  FROZEN_MIGRATION_TREES,
  validateFrozenMigrationTrees,
} from "./migration-ownership.mjs";

test("accepts unchanged historical migration trees", () => {
  assert.deepEqual(validateFrozenMigrationTrees(FROZEN_MIGRATION_TREES), []);
});

test("rejects any edit, addition, or deletion in a frozen legacy migration tree", () => {
  const changed = {
    ...FROZEN_MIGRATION_TREES,
    "supabase/migrations": "changed-tree-sha",
  };

  assert.deepEqual(validateFrozenMigrationTrees(changed), [
    "frozen migration tree changed: supabase/migrations",
  ]);
});

test("rejects a missing frozen legacy migration tree", () => {
  const missing = { ...FROZEN_MIGRATION_TREES };
  delete missing["edutumobile/supabase/migrations"];

  assert.deepEqual(validateFrozenMigrationTrees(missing), [
    "frozen migration tree missing: edutumobile/supabase/migrations",
  ]);
});

test("legacy migration diff passes when the final trees equal the frozen manifest", () => {
  assert.deepEqual(
    evaluateLegacyMigrationDiff({
      changedPaths: [
        "supabase/migrations/20260827070117_seed_community_first_impression_groups.sql",
      ],
      frozenTreeViolations: [],
    }),
    {
      ok: true,
      status: "restored",
      changedLegacyPaths: [
        "supabase/migrations/20260827070117_seed_community_first_impression_groups.sql",
      ],
      errors: [],
    },
  );
});

test("legacy migration diff remains blocked when the final frozen tree differs", () => {
  assert.deepEqual(
    evaluateLegacyMigrationDiff({
      changedPaths: [
        "supabase/migrations/20260827070117_seed_community_first_impression_groups.sql",
      ],
      frozenTreeViolations: [
        "frozen migration tree changed: supabase/migrations",
      ],
    }),
    {
      ok: false,
      status: "blocked",
      changedLegacyPaths: [
        "supabase/migrations/20260827070117_seed_community_first_impression_groups.sql",
      ],
      errors: ["frozen migration tree changed: supabase/migrations"],
    },
  );
});

test("standalone legacy schema files remain immutable", () => {
  assert.deepEqual(
    evaluateLegacyMigrationDiff({
      changedPaths: ["edutu-web-app/supabase/schema.sql"],
      frozenTreeViolations: [],
    }),
    {
      ok: false,
      status: "blocked",
      changedLegacyPaths: ["edutu-web-app/supabase/schema.sql"],
      errors: [
        "legacy schema file is frozen: edutu-web-app/supabase/schema.sql",
      ],
    },
  );
});

test("canonical migration changes are not treated as legacy-tree edits", () => {
  assert.deepEqual(
    evaluateLegacyMigrationDiff({
      changedPaths: [
        "backend/services/services/api/supabase/migrations/20260902090000_example.sql",
      ],
      frozenTreeViolations: [],
    }),
    {
      ok: true,
      status: "unchanged",
      changedLegacyPaths: [],
      errors: [],
    },
  );
});
