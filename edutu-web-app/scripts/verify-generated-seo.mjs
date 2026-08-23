import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_PATHS } from "./generate-sitemap.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(scriptDir, "..", "public");

async function read(relativePath) {
  return readFile(path.join(publicDir, relativePath), "utf8");
}

function locations(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) =>
    match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

function environmentMinimum(name, fallback = 0) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  assert.ok(Number.isFinite(value) && value >= 0, `${name} must be non-negative`);
  return Math.floor(value);
}

const [index, pages, blog, opportunities, events, robots] = await Promise.all([
  read("sitemap.xml"),
  read("sitemaps/pages.xml"),
  read("sitemaps/blog.xml"),
  read("sitemaps/opportunities.xml"),
  read("sitemaps/events.xml"),
  read("robots.txt"),
]);

assert.match(index, /<sitemapindex\b/);
assert.doesNotMatch(index, /<urlset\b/);
const childSitemaps = locations(index);
for (const name of ["pages", "blog", "opportunities", "events"]) {
  assert.ok(
    childSitemaps.some((location) => location.endsWith(`/sitemaps/${name}.xml`)),
    `sitemap index is missing ${name}.xml`,
  );
}

const pageLocations = locations(pages);
assert.ok(pageLocations.includes("https://www.edutu.org/opportunities"));
assert.ok(pageLocations.includes("https://www.edutu.org/blog"));
for (const category of CATEGORY_PATHS) {
  assert.ok(
    pageLocations.includes(`https://www.edutu.org/opportunities/${category}`),
    `page sitemap is missing the ${category} category hub`,
  );
}
assert.ok(
  pageLocations.every((location) => !location.includes("?category=")),
  "category query URLs must not be published as canonical sitemap entries",
);

const blogLocations = locations(blog);
const opportunityLocations = locations(opportunities);
const eventLocations = locations(events);
assert.ok(
  blogLocations.length >= environmentMinimum("SEO_MIN_BLOG_URLS", 0),
  "blog sitemap is below the configured minimum",
);
assert.ok(
  opportunityLocations.length >=
    environmentMinimum("SEO_MIN_OPPORTUNITY_URLS", 0),
  "opportunity sitemap is below the configured minimum",
);
assert.ok(
  eventLocations.length >= environmentMinimum("SEO_MIN_EVENT_URLS", 0),
  "event sitemap is below the configured minimum",
);
assert.ok(
  new Set([...pageLocations, ...blogLocations, ...opportunityLocations, ...eventLocations])
    .size ===
    pageLocations.length +
      blogLocations.length +
      opportunityLocations.length +
      eventLocations.length,
  "duplicate URLs were found across child sitemaps",
);

assert.match(robots, /Sitemap: https:\/\/www\.edutu\.org\/sitemap\.xml/);
assert.match(robots, /Disallow: \/app\//);
assert.match(robots, /Disallow: \/admin\//);

console.log(
  `SEO inventory verified: ${pageLocations.length} pages, ${blogLocations.length} posts, ${opportunityLocations.length} opportunities, ${eventLocations.length} events.`,
);
