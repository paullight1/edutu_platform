import assert from "node:assert/strict";
import test from "node:test";
import { inspectAdminRuntimeConfigSources } from "./check-admin-runtime-config.mjs";

test("rejects hardcoded browser production fallbacks", () => {
  const failures = inspectAdminRuntimeConfigSources({
    "admin/src/lib/backend.ts":
      "const DEFAULT_BACKEND_URL = 'https://edutu-platform.onrender.com'",
    "admin/vite.config.ts":
      "const BACKEND_URL = process.env.VITE_BACKEND_URL",
  });

  assert.deepEqual(failures, [
    "admin/src/lib/backend.ts contains a forbidden hardcoded production API fallback",
  ]);
});

test("allows an explicit development proxy target", () => {
  assert.deepEqual(
    inspectAdminRuntimeConfigSources({
      "admin/vite.config.ts":
        "const DEV_PROXY_TARGET = process.env.VITE_BACKEND_URL || 'https://edutu-api.onrender.com'",
    }),
    [],
  );
});

test("rejects a second hardcoded production fallback outside Vite development proxy configuration", () => {
  assert.deepEqual(
    inspectAdminRuntimeConfigSources({
      "admin/src/lib/runtimeConfig.ts":
        "const fallback = 'https://another-service.onrender.com'",
    }),
    [
      "admin/src/lib/runtimeConfig.ts contains a forbidden hardcoded production API fallback",
    ],
  );
});
