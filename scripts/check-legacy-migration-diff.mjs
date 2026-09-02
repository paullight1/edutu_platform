#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateLegacyMigrationDiff,
  FROZEN_MIGRATION_TREES,
  validateFrozenMigrationTrees,
} from "./migration-ownership.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [baseRef, headRef] = process.argv.slice(2);

if (!baseRef || !headRef) {
  console.error(
    "Usage: node scripts/check-legacy-migration-diff.mjs <base-ref> <head-ref>",
  );
  process.exit(2);
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `git ${args.join(" ")} failed with exit code ${result.status}${
        detail ? `\n${detail}` : ""
      }`,
    );
  }

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? "").trim(),
  };
}

function readTreeSha(ref, path) {
  const result = git(["rev-parse", "--verify", `${ref}:${path}`], {
    allowFailure: true,
  });
  return result.status === 0 ? result.stdout : undefined;
}

try {
  const changedPaths = git([
    "diff",
    "--name-only",
    baseRef,
    headRef,
    "--",
  ]).stdout
    .split(/\r?\n/u)
    .map((path) => path.trim())
    .filter(Boolean);

  const actualTrees = Object.fromEntries(
    Object.keys(FROZEN_MIGRATION_TREES).map((path) => [
      path,
      readTreeSha(headRef, path),
    ]),
  );
  const frozenTreeViolations = validateFrozenMigrationTrees(actualTrees);
  const result = evaluateLegacyMigrationDiff({
    changedPaths,
    frozenTreeViolations,
  });

  if (!result.ok) {
    console.error("Legacy migration/schema diff blocked:\n");
    for (const error of result.errors) console.error(`- ${error}`);
    if (result.changedLegacyPaths.length > 0) {
      console.error("\nChanged legacy paths:");
      for (const path of result.changedLegacyPaths) console.error(`- ${path}`);
    }
    process.exitCode = 1;
  } else if (result.status === "restored") {
    console.log(
      "Legacy migration-tree diff is an exact restoration to the frozen manifest.",
    );
    for (const path of result.changedLegacyPaths) console.log(`- ${path}`);
  } else {
    console.log("No legacy migration or schema paths changed.");
  }
} catch (error) {
  console.error(
    `Legacy migration diff check failed: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
