import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

function rewriteFor(source) {
  return config.rewrites.find((rewrite) => rewrite.source === source);
}

const requiredRoutes = new Map([
  ["/sitemap.xml", "/seo/sitemap.xml"],
  ["/sitemaps/:name.xml", "/seo/sitemaps/:name.xml"],
  ["/robots.txt", "/seo/robots.txt"],
  ["/blog", "/seo/blog"],
  ["/blog/:slug", "/seo/blog/:slug"],
  ["/opportunities", "/seo/opportunities"],
  [
    "/opportunities/:category",
    "/seo-hydration/opportunities/:category",
  ],
  ["/opportunity/:id", "/seo/opportunity/:id"],
  ["/share/opportunity/:id", "/seo/share/opportunity/:id"],
  ["/events/:slugOrId", "/seo/event/:slugOrId"],
]);

test("every public SEO route has an explicit backend owner", () => {
  for (const [source, expectedPath] of requiredRoutes) {
    const rewrite = rewriteFor(source);
    assert.ok(rewrite, `Missing rewrite for ${source}`);
    assert.equal(
      typeof rewrite.destination,
      "string",
      `${source} must use an explicit backend destination`,
    );
    const destination = new URL(rewrite.destination);
    assert.equal(destination.protocol, "https:");
    assert.equal(destination.pathname, expectedPath);
  }
});

test("SEO routes run before service and SPA catch-all rewrites", () => {
  const catchAllIndex = config.rewrites.findIndex(
    (rewrite) => rewrite.source === "/:path*",
  );
  const adminIndex = config.rewrites.findIndex(
    (rewrite) => rewrite.source === "/admin/:path*",
  );

  assert.ok(catchAllIndex >= 0, "Frontend catch-all rewrite is required");
  assert.ok(adminIndex >= 0, "Admin service rewrite is required");

  for (const source of requiredRoutes.keys()) {
    const index = config.rewrites.findIndex(
      (rewrite) => rewrite.source === source,
    );
    assert.ok(index < catchAllIndex, `${source} must precede the SPA catch-all`);
    assert.ok(index < adminIndex, `${source} must precede service routing`);
  }
});

test("legacy static blog and opportunity archive owners are not present", () => {
  const duplicateArchiveOwners = config.rewrites.filter(
    (rewrite) =>
      (rewrite.source === "/blog" || rewrite.source === "/opportunities") &&
      typeof rewrite.destination === "string" &&
      rewrite.destination.endsWith("/index.html"),
  );

  assert.deepEqual(duplicateArchiveOwners, []);
});
