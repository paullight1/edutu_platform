import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = fileURLToPath(
  new URL("./check-architecture-boundaries.mjs", import.meta.url),
);

async function createFixture(paths) {
  const root = await mkdtemp(join(tmpdir(), "edutu-architecture-"));
  for (const path of paths) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, "fixture\n", "utf8");
  }
  return root;
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker, "--root", root], {
    encoding: "utf8",
  });
}

test("accepts the currently grandfathered architecture roots", async () => {
  const root = await createFixture([
    "backend/server.js",
    "backend/scraper.js",
    "backend/database.js",
    "backend/package.json",
    "backend/package-lock.json",
    "backend/services/services/api/package.json",
    "backend/services/services/voice/package.json",
    "backend/services/services/api/supabase/migrations/20260821000000_example.sql",
    "supabase/migrations/20260101000000_historical.sql",
    "edutu-web-app/supabase/migrations/20260101000001_historical.sql",
    "edutumobile/supabase/migrations/20260101000002_historical.sql",
    "packages/ux-state/package.json",
    "edutumobile/packages/core/package.json",
  ]);

  try {
    const result = runChecker(root);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a new shared migration root", async () => {
  const root = await createFixture([
    "backend/services/services/api/package.json",
    "new-client/supabase/migrations/20260821000000_bad.sql",
  ]);

  try {
    const result = runChecker(root);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /unexpected Supabase migration root: new-client\/supabase\/migrations/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects deeper services/services nesting", async () => {
  const root = await createFixture([
    "backend/services/services/api/package.json",
    "backend/services/services/services/accidental/package.json",
  ]);

  try {
    const result = runChecker(root);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /unexpected repeated services nesting/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an additional app-local package root", async () => {
  const root = await createFixture([
    "backend/services/services/api/package.json",
    "packages/ux-state/package.json",
    "edutumobile/packages/core/package.json",
    "admin/packages/local-core/package.json",
  ]);

  try {
    const result = runChecker(root);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /unexpected package root: admin\/packages/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
