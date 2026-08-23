import test from "node:test";
import assert from "node:assert/strict";
import { validateVercelConfig } from "./validate-vercel-config.mjs";

test("accepts supported services + service rewrites", () => {
  const errors = validateVercelConfig({
    services: {
      frontend: { root: "edutu-web-app", framework: "vite" },
      admin: { root: "admin", framework: "vite" },
    },
    rewrites: [
      { source: "/admin/:path*", destination: { service: "admin", path: "/:path*" } },
      { source: "/:path*", destination: { service: "frontend", path: "/:path*" } },
    ],
  });
  assert.deepEqual(errors, []);
});

test("rejects removed experimentalServices and legacy service fields", () => {
  const errors = validateVercelConfig({
    experimentalServices: {},
    services: {
      frontend: {
        entrypoint: "edutu-web-app",
        routePrefix: "/",
        framework: "vite",
      },
    },
  });
  assert.ok(errors.some((value) => value.includes("experimentalServices")));
  assert.ok(errors.some((value) => value.includes("root")));
  assert.ok(errors.some((value) => value.includes("entrypoint")));
  assert.ok(errors.some((value) => value.includes("routePrefix")));
});

test("rejects rewrites to undeclared services", () => {
  const errors = validateVercelConfig({
    services: { frontend: { root: "edutu-web-app", framework: "vite" } },
    rewrites: [
      { source: "/admin/:path*", destination: { service: "admin", path: "/:path*" } },
    ],
  });
  assert.ok(errors.some((value) => value.includes("unknown service admin")));
});
