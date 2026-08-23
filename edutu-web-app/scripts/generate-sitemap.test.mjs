import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInventory,
  buildSitemapEntries,
  normaliseSiteUrl,
  renderSitemapXml,
} from "./generate-sitemap.mjs";

test("strict sitemap inventory rejects empty dynamic content", () => {
  assert.throws(
    () =>
      assertInventory(
        { opportunities: [], blogPosts: [] },
        { strict: true, minOpportunities: 1, minBlogPosts: 1 },
      ),
    /SEO sitemap inventory is incomplete/,
  );
});

test("non-strict local generation permits a static fallback", () => {
  assert.doesNotThrow(() =>
    assertInventory(
      { opportunities: [], blogPosts: [] },
      { strict: false, minOpportunities: 1, minBlogPosts: 1 },
    ),
  );
});

test("site origins are normalized to the canonical www host", () => {
  assert.equal(normaliseSiteUrl("https://edutu.org///"), "https://www.edutu.org");
  assert.equal(
    normaliseSiteUrl("https://www.edutu.org/"),
    "https://www.edutu.org",
  );
});

test("sitemap entries use first-class category paths and remove duplicates", () => {
  const entries = buildSitemapEntries({
    siteUrl: "https://www.edutu.org",
    today: "2026-08-23",
    opportunities: [
      { id: "opp-1", updatedAt: "2026-08-20" },
      { id: "opp-1", updatedAt: "2026-08-21" },
    ],
    events: [],
    blogPosts: [
      { slug: "guide-one", updatedAt: "2026-08-22" },
      { slug: "guide-one", updatedAt: "2026-08-22" },
    ],
  });

  assert.ok(
    entries.some(
      (entry) =>
        entry.loc ===
        "https://www.edutu.org/opportunities/scholarships",
    ),
  );
  assert.ok(
    !entries.some((entry) => entry.loc.includes("?category=scholarships")),
  );
  assert.equal(
    entries.filter(
      (entry) => entry.loc === "https://www.edutu.org/opportunity/opp-1",
    ).length,
    1,
  );
  assert.equal(
    entries.filter(
      (entry) => entry.loc === "https://www.edutu.org/blog/guide-one",
    ).length,
    1,
  );
});

test("rendered sitemap XML escapes query separators", () => {
  const xml = renderSitemapXml([
    {
      loc: "https://www.edutu.org/blog?topic=ai&level=beginner",
      lastmod: "2026-08-23",
      changefreq: "weekly",
      priority: "0.7",
    },
  ]);

  assert.match(
    xml,
    /https:\/\/www\.edutu\.org\/blog\?topic=ai&amp;level=beginner/,
  );
});
