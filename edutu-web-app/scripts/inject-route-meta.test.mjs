import assert from "node:assert/strict";
import test from "node:test";
import { findMissingRoutingCoverage } from "./inject-route-meta.mjs";

const entries = [
  { path: "/" },
  { path: "/blog" },
  { path: "/opportunities" },
  { path: "/about" },
];

function validConfig() {
  return {
    rewrites: [
      {
        source: "/blog",
        destination: "https://edutu-platform.onrender.com/seo/blog",
      },
      {
        source: "/opportunities",
        destination: "https://edutu-platform.onrender.com/seo/opportunities",
      },
      { source: "/about", destination: "/about/index.html" },
      { source: "/:path*", destination: "/index.html" },
    ],
  };
}

test("accepts exact static or API-rendered public routes", () => {
  assert.deepEqual(findMissingRoutingCoverage(validConfig(), entries), []);
});

test("rejects wrong, conditional, or absent render destinations", () => {
  const config = validConfig();
  config.rewrites.find((rule) => rule.source === "/blog").destination =
    "https://edutu-platform.onrender.com/og/blog";
  config.rewrites.find((rule) => rule.source === "/opportunities").has = [
    { type: "header", key: "user-agent", value: "Googlebot" },
  ];
  config.rewrites = config.rewrites.filter((rule) => rule.source !== "/about");

  assert.deepEqual(findMissingRoutingCoverage(config, entries), [
    "/blog",
    "/opportunities",
    "/about",
  ]);
});
