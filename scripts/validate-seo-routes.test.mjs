import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SEO_ROUTE_CONTRACT,
  validateSeoRoutes,
} from "./validate-seo-routes.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validConfig() {
  return {
    rewrites: [
      ...SEO_ROUTE_CONTRACT.map(({ source, destination }) => ({
        source,
        destination,
      })),
      { source: "/:path*", destination: "/index.html" },
    ],
  };
}

test("the repository root and app Vercel configs share the SEO route contract", () => {
  assert.deepEqual(
    validateSeoRoutes(
      readJson("vercel.json"),
      readJson("edutu-web-app/vercel.json"),
    ),
    [],
  );
});

test("missing, divergent, conditional, or late SEO routes fail validation", () => {
  const root = validConfig();
  const app = validConfig();

  app.rewrites = app.rewrites.filter(
    (rewrite) => rewrite.source !== "/sitemap.xml",
  );
  root.rewrites.find(
    (rewrite) => rewrite.source === "/blog",
  ).destination = "/blog/index.html";
  root.rewrites.find((rewrite) => rewrite.source === "/opportunities").has = [
    { type: "header", key: "user-agent", value: "bot" },
  ];
  root.rewrites.unshift(root.rewrites.pop());

  const errors = validateSeoRoutes(root, app).join("\n");
  assert.match(errors, /app is missing SEO rewrite \/sitemap\.xml/);
  assert.match(errors, /root SEO rewrite \/blog must target/);
  assert.match(errors, /root SEO rewrite \/opportunities must be unconditional/);
  assert.match(errors, /root SEO rewrite \/sitemap\.xml must precede the catch-all/);
});

test("duplicate SEO sources fail validation", () => {
  const root = validConfig();
  const app = validConfig();
  root.rewrites.unshift({ ...root.rewrites[0] });

  assert.match(
    validateSeoRoutes(root, app).join("\n"),
    /root declares SEO rewrite \/sitemap\.xml 2 times/,
  );
});
