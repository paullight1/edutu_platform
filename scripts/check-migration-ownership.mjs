import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_MIGRATION_TREE,
  FROZEN_MIGRATION_TREES,
  validateFrozenMigrationTrees,
} from "./migration-ownership.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function treeSha(path) {
  const result = spawnSync("git", ["rev-parse", `HEAD:${path}`], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

const actualTrees = Object.fromEntries(
  Object.keys(FROZEN_MIGRATION_TREES).map((path) => [path, treeSha(path)]),
);
const violations = validateFrozenMigrationTrees(actualTrees);

if (!treeSha(CANONICAL_MIGRATION_TREE)) {
  violations.push(`canonical migration tree missing: ${CANONICAL_MIGRATION_TREE}`);
}

if (violations.length > 0) {
  console.error("Migration ownership violations:\n");
  for (const violation of violations.sort()) {
    console.error(`- ${violation}`);
  }
  console.error(
    `\nCreate new shared production migrations only in ${CANONICAL_MIGRATION_TREE}.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Migration ownership passed: legacy trees frozen; canonical owner ${CANONICAL_MIGRATION_TREE}.`,
  );
}
