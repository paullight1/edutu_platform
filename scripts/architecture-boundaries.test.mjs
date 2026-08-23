import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { inspectArchitecture } from "./check-architecture-boundaries.mjs";

async function write(root, path, content = "") {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
}

async function createBaseline(root) {
  await write(root, "backend/services/services/api/package.json", "{}\n");
  await write(root, "backend/services/services/api/src/main.ts", "export {};\n");
  await write(root, "backend/server.js", "// grandfathered and frozen\n");
  await write(root, "packages/ux-state/index.ts", "export {};\n");
  await write(root, "edutumobile/packages/core/index.ts", "export {};\n");
  await write(
    root,
    "backend/services/services/api/supabase/migrations/20260823000000_test.sql",
    "select 1;\n",
  );
  await write(root, "admin/src/example.ts", "export const api = '/v1';\n");
}

async function withRepository(run) {
  const root = await mkdtemp(join(tmpdir(), "edutu-architecture-"));
  try {
    await createBaseline(root);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts the documented canonical and grandfathered layout", async () => {
  await withRepository(async (root) => {
    assert.deepEqual(await inspectArchitecture(root), []);
  });
});

test("requires the canonical NestJS API entrypoints", async () => {
  await withRepository(async (root) => {
    await rm(join(root, "backend/services/services/api/src/main.ts"));

    assert.deepEqual(await inspectArchitecture(root), [
      "missing canonical API file: backend/services/services/api/src/main.ts",
    ]);
  });
});

test("blocks deeper service nesting and unowned package or migration roots", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "backend/services/services/services/api/index.ts",
      "export {};\n",
    );
    await write(root, "admin/packages/shared/index.ts", "export {};\n");
    await write(
      root,
      "admin/supabase/migrations/20260823000000_test.sql",
      "select 1;\n",
    );

    const violations = await inspectArchitecture(root);

    assert.ok(
      violations.some((value) =>
        value.startsWith("unexpected repeated services nesting:"),
      ),
    );
    assert.ok(
      violations.includes("unexpected package root: admin/packages"),
    );
    assert.ok(
      violations.includes(
        "unexpected Supabase migration root: admin/supabase/migrations",
      ),
    );
  });
});

test("keeps privileged credentials and API internals out of client code", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "edutu-web-app/src/unsafe.ts",
      [
        "const secret = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;",
        "const internal = 'backend/services/services/api/src/admin';",
      ].join("\n"),
    );

    assert.deepEqual(await inspectArchitecture(root), [
      "client source imports API internals instead of a contract: edutu-web-app/src/unsafe.ts",
      "client source references a Supabase service-role secret: edutu-web-app/src/unsafe.ts",
    ]);
  });
});

test("prevents another root-level backend runtime from being introduced", async () => {
  await withRepository(async (root) => {
    await write(root, "backend/another-server.js", "export {};\n");

    assert.deepEqual(await inspectArchitecture(root), [
      "unexpected duplicate backend runtime file: backend/another-server.js",
    ]);
  });
});
