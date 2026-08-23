import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMinimumCount,
  createSitemapArtifacts,
  normalizeSiteUrl,
} from "./generate-sitemap.mjs";

test("normalizes the public hostname to the canonical www host", () => {
  assert.equal(normalizeSiteUrl("https://edutu.org/anything"), "https://www.edutu.org");
});

test("creates a sitemap index and canonical child inventories", () => {
  const artifacts = createSitemapArtifacts({
    siteUrl: "https://edutu.org",
    generatedAt: new Date("2026-08-23T00:00:00.000Z"),
    blogPosts: [
      {
        slug: "scholarship-guide",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    ],
    opportunities: [
      {
        id: "opp-1",
        updated_at: "2026-08-21T00:00:00.000Z",
      },
    ],
    events: [
      {
        slug: "application-clinic",
        startsAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });

  assert.match(artifacts.index, /<sitemapindex/);
  assert.match(artifacts.index, /\/sitemaps\/pages\.xml/);
  assert.match(artifacts.index, /\/sitemaps\/blog\.xml/);
  assert.match(artifacts.index, /\/sitemaps\/opportunities\.xml/);
  assert.match(artifacts.index, /\/sitemaps\/events\.xml/);
  assert.match(
    artifacts.pages,
    /https:\/\/www\.edutu\.org\/opportunities\/scholarships/,
  );
  assert.match(
    artifacts.pages,
    /https:\/\/www\.edutu\.org\/opportunities\/graduate-programs/,
  );
  assert.doesNotMatch(artifacts.pages, /opportunities\?category=/);
  assert.match(
    artifacts.blog,
    /https:\/\/www\.edutu\.org\/blog\/scholarship-guide/,
  );
  assert.match(
    artifacts.opportunities,
    /https:\/\/www\.edutu\.org\/opportunity\/opp-1/,
  );
  assert.match(
    artifacts.events,
    /https:\/\/www\.edutu\.org\/events\/application-clinic/,
  );
  assert.equal(artifacts.counts.blog, 1);
  assert.equal(artifacts.counts.opportunities, 1);
});

test("deduplicates dynamic URLs", () => {
  const artifacts = createSitemapArtifacts({
    siteUrl: "https://www.edutu.org",
    blogPosts: [{ slug: "same" }, { slug: "same" }],
    opportunities: [{ id: "same" }, { id: "same" }],
    events: [{ slug: "same" }, { slug: "same" }],
  });

  assert.equal(artifacts.counts.blog, 1);
  assert.equal(artifacts.counts.opportunities, 1);
  assert.equal(artifacts.counts.events, 1);
});

test("fails closed when a required source count is below its release gate", () => {
  assert.throws(
    () => assertMinimumCount("opportunities", 0, 1),
    /minimum required is 1/,
  );
  assert.doesNotThrow(() => assertMinimumCount("events", 0, 0));
});
