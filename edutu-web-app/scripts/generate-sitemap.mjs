import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicDir = path.join(appRoot, "public");
const sitemapDir = path.join(publicDir, "sitemaps");

export const CATEGORY_PATHS = [
  "scholarships",
  "internships",
  "fellowships",
  "grants",
  "graduate-programs",
  "bootcamps",
  "programs",
  "competitions",
  "events",
];

export const STATIC_PATHS = [
  "/",
  "/opportunities",
  "/blog",
  "/events",
  "/about",
  "/impact",
  "/community",
  "/what-we-believe",
  "/edutuforyou",
  "/whats-new",
  "/careers",
  "/help",
  "/privacy",
  "/terms",
  "/download",
  "/developers",
  "/scholarship-engine",
];

function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadLocalEnvironment() {
  for (const name of [".env", ".env.local", ".env.production"]) {
    try {
      const values = parseEnvFile(
        await readFile(path.join(appRoot, name), "utf8"),
      );
      for (const [key, value] of Object.entries(values)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // Environment files are optional in CI and production builders.
    }
  }
}

export function normalizeSiteUrl(value) {
  const candidate = String(value || "https://www.edutu.org").trim();
  const parsed = new URL(candidate);
  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  if (parsed.hostname.toLowerCase() === "edutu.org") {
    parsed.hostname = "www.edutu.org";
  }
  return parsed.toString().replace(/\/$/, "");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function asDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function lastmod(value, fallback) {
  return asDate(value, fallback).toISOString().slice(0, 10);
}

function absolute(siteUrl, pathname) {
  return new URL(pathname, `${siteUrl}/`).toString();
}

function renderUrlSet(entries, fallbackDate) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.flatMap((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${escapeXml(lastmod(entry.lastmod, fallbackDate))}</lastmod>`,
      `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>`,
      `    <priority>${escapeXml(entry.priority)}</priority>`,
      "  </url>",
    ]),
    "</urlset>",
    "",
  ].join("\n");
}

function renderSitemapIndex(siteUrl, fallbackDate) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...["pages", "blog", "opportunities", "events"].flatMap((name) => [
      "  <sitemap>",
      `    <loc>${escapeXml(absolute(siteUrl, `/sitemaps/${name}.xml`))}</loc>`,
      `    <lastmod>${fallbackDate.toISOString().slice(0, 10)}</lastmod>`,
      "  </sitemap>",
    ]),
    "</sitemapindex>",
    "",
  ].join("\n");
}

function arrayFromPayload(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

function dedupe(items, keyFor) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keyFor(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function isPublicSnapshotOpportunity(row) {
  const status = String(row?.status || "active").toLowerCase();
  const verification = String(
    row?.verification_status || row?.verificationStatus || "verified",
  ).toLowerCase();
  return (
    Boolean(row?.id) &&
    status === "active" &&
    (verification === "verified" || verification === "approved")
  );
}

export function assertMinimumCount(name, count, minimum) {
  if (count < minimum) {
    throw new Error(
      `${name} sitemap contains ${count} URLs; minimum required is ${minimum}`,
    );
  }
}

export function createSitemapArtifacts({
  siteUrl,
  blogPosts = [],
  opportunities = [],
  events = [],
  generatedAt = new Date(),
}) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const pages = [
    ...STATIC_PATHS.map((pathname) => ({
      loc: absolute(normalizedSiteUrl, pathname),
      lastmod: generatedAt,
      changefreq:
        pathname === "/opportunities" || pathname === "/blog"
          ? "daily"
          : "monthly",
      priority:
        pathname === "/opportunities"
          ? "1.0"
          : pathname === "/blog"
            ? "0.9"
            : pathname === "/"
              ? "0.8"
              : "0.6",
    })),
    ...CATEGORY_PATHS.map((category) => ({
      loc: absolute(normalizedSiteUrl, `/opportunities/${category}`),
      lastmod: generatedAt,
      changefreq: "daily",
      priority: "0.9",
    })),
  ];

  const blogEntries = dedupe(blogPosts, (post) => String(post?.slug || ""))
    .filter((post) => post?.slug)
    .map((post) => ({
      loc: absolute(
        normalizedSiteUrl,
        `/blog/${encodeURIComponent(String(post.slug))}`,
      ),
      lastmod:
        post.updatedAt ||
        post.updated_at ||
        post.publishedAt ||
        post.published_at ||
        post.createdAt ||
        post.created_at,
      changefreq: "monthly",
      priority: "0.7",
    }));

  const opportunityEntries = dedupe(
    opportunities,
    (opportunity) => String(opportunity?.id || ""),
  )
    .filter((opportunity) => opportunity?.id)
    .map((opportunity) => ({
      loc: absolute(
        normalizedSiteUrl,
        `/opportunity/${encodeURIComponent(String(opportunity.id))}`,
      ),
      lastmod:
        opportunity.updatedAt ||
        opportunity.updated_at ||
        opportunity.createdAt ||
        opportunity.created_at,
      changefreq: "weekly",
      priority: "0.8",
    }));

  const eventEntries = dedupe(
    events,
    (event) => String(event?.slug || event?.id || ""),
  )
    .filter((event) => event?.slug || event?.id)
    .map((event) => ({
      loc: absolute(
        normalizedSiteUrl,
        `/events/${encodeURIComponent(String(event.slug || event.id))}`,
      ),
      lastmod:
        event.updatedAt ||
        event.updated_at ||
        event.startsAt ||
        event.starts_at,
      changefreq: "weekly",
      priority: "0.7",
    }));

  return {
    index: renderSitemapIndex(normalizedSiteUrl, generatedAt),
    pages: renderUrlSet(pages, generatedAt),
    blog: renderUrlSet(blogEntries, generatedAt),
    opportunities: renderUrlSet(opportunityEntries, generatedAt),
    events: renderUrlSet(eventEntries, generatedAt),
    robots: [
      "User-agent: *",
      "Allow: /",
      "Disallow: /app/",
      "Disallow: /admin/",
      "Disallow: /auth",
      "Disallow: /auth/callback",
      "",
      `Sitemap: ${absolute(normalizedSiteUrl, "/sitemap.xml")}`,
      "",
    ].join("\n"),
    counts: {
      pages: pages.length,
      blog: blogEntries.length,
      opportunities: opportunityEntries.length,
      events: eventEntries.length,
    },
  };
}

function apiBaseUrl() {
  const value =
    process.env.VITE_BACKEND_URL ||
    process.env.VITE_API_URL ||
    process.env.BACKEND_URL ||
    "";
  if (!value) return "";
  return `${value.replace(/\/+$/, "")}/`;
}

async function fetchJson(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPagedCollection({
  apiBase,
  route,
  pageSize,
  maximum,
  payloadKeys,
}) {
  const rows = [];
  for (let offset = 0; offset < maximum; offset += pageSize) {
    const url = new URL(route, apiBase);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("offset", String(offset));
    const payload = await fetchJson(url);
    const batch = arrayFromPayload(payload, payloadKeys);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.slice(0, maximum);
}

async function loadSnapshotOpportunities() {
  try {
    const payload = JSON.parse(
      await readFile(path.join(publicDir, "data", "opportunities.json"), "utf8"),
    );
    return arrayFromPayload(payload, ["data", "opportunities"]).filter(
      isPublicSnapshotOpportunity,
    );
  } catch {
    return [];
  }
}

function integerEnvironment(name, fallback) {
  if (process.env[name] === undefined || process.env[name] === "") {
    return fallback;
  }
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Math.floor(parsed);
}

async function generate() {
  await loadLocalEnvironment();
  const siteUrl = normalizeSiteUrl(
    process.env.VITE_PUBLIC_APP_URL ||
      process.env.PUBLIC_WEB_APP_URL ||
      process.env.SITE_URL,
  );
  const apiBase = apiBaseUrl();
  const strictRemote =
    process.env.SEO_STRICT_REMOTE === "1" ||
    (process.env.SEO_STRICT_REMOTE !== "0" &&
      Boolean(apiBase) &&
      (process.env.NODE_ENV === "production" || process.env.VERCEL === "1"));

  let remoteOpportunities = [];
  let blogPosts = [];
  let events = [];

  if (apiBase) {
    try {
      [remoteOpportunities, blogPosts, events] = await Promise.all([
        fetchPagedCollection({
          apiBase,
          route: "opportunities",
          pageSize: 60,
          maximum: 50_000,
          payloadKeys: ["data", "opportunities"],
        }),
        fetchPagedCollection({
          apiBase,
          route: "blog?status=published",
          pageSize: 100,
          maximum: 1000,
          payloadKeys: ["data", "posts"],
        }),
        fetchPagedCollection({
          apiBase,
          route: "events?status=published",
          pageSize: 100,
          maximum: 5000,
          payloadKeys: ["data", "events"],
        }),
      ]);
    } catch (error) {
      if (strictRemote) {
        throw new Error(
          `Configured SEO API could not be read: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      console.warn(
        `SEO API unavailable; generating an offline fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const snapshotOpportunities = await loadSnapshotOpportunities();
  const opportunities = dedupe(
    [...remoteOpportunities, ...snapshotOpportunities],
    (opportunity) => String(opportunity?.id || ""),
  );

  const artifacts = createSitemapArtifacts({
    siteUrl,
    blogPosts,
    opportunities,
    events,
    generatedAt: new Date(),
  });

  const defaultMinimum = strictRemote ? 1 : 0;
  assertMinimumCount(
    "blog",
    artifacts.counts.blog,
    integerEnvironment("SEO_MIN_BLOG_URLS", defaultMinimum),
  );
  assertMinimumCount(
    "opportunities",
    artifacts.counts.opportunities,
    integerEnvironment("SEO_MIN_OPPORTUNITY_URLS", defaultMinimum),
  );
  assertMinimumCount(
    "events",
    artifacts.counts.events,
    integerEnvironment("SEO_MIN_EVENT_URLS", 0),
  );

  await mkdir(sitemapDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "sitemap.xml"), artifacts.index, "utf8"),
    writeFile(path.join(sitemapDir, "pages.xml"), artifacts.pages, "utf8"),
    writeFile(path.join(sitemapDir, "blog.xml"), artifacts.blog, "utf8"),
    writeFile(
      path.join(sitemapDir, "opportunities.xml"),
      artifacts.opportunities,
      "utf8",
    ),
    writeFile(path.join(sitemapDir, "events.xml"), artifacts.events, "utf8"),
    writeFile(path.join(publicDir, "robots.txt"), artifacts.robots, "utf8"),
  ]);

  console.log(
    `Generated SEO fallback: ${artifacts.counts.pages} pages, ${artifacts.counts.blog} posts, ${artifacts.counts.opportunities} opportunities, ${artifacts.counts.events} events.`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  generate().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
