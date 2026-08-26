import assert from "node:assert/strict";
import test from "node:test";
import {
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
