import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const snapshotPath = path.join(publicDir, "data", "opportunities.json");
const DEFAULT_SITE_URL = "https://www.edutu.org";
const DEFAULT_API_URL = "https://edutu-platform.onrender.com";
const MAX_OPPORTUNITIES = 2100;
const OPPORTUNITY_PAGE_SIZE = 60;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_ATTEMPTS = 2;

export function normaliseSiteUrl(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\/+$/, "");

  if (!normalized) return "";
  return normalized.replace(
    /^https?:\/\/edutu\.org(?=\/|$)/i,
    "https://www.edutu.org",
  );
}

function loadDotEnv(filePath) {
  try {
    const contents = readFileSync(filePath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Production hosts normally provide real environment variables.
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const rows =
    payload.data ||
    payload.opportunities ||
    payload.items ||
    payload.results ||
    [];
  return Array.isArray(rows) ? rows : [];
}

function normaliseOpportunity(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.opportunity_id || row.external_id;
  if (!id) return null;

  return {
    id: String(id),
    updatedAt:
      row.updated_at ||
      row.updatedAt ||
      row.updated ||
      row.lastUpdated ||
      row.created_at ||
      row.createdAt ||
      null,
  };
}

function normaliseEvent(row) {
  if (!row || typeof row !== "object") return null;
  const slug = row.slug || row.id;
  if (!slug) return null;

  return {
    slug: String(slug),
    updatedAt:
      row.updated_at ||
      row.updatedAt ||
      row.updated ||
      row.starts_at ||
      row.startsAt ||
      row.created_at ||
      row.createdAt ||
      null,
  };
}

function normaliseBlogPost(row) {
  if (!row || typeof row !== "object" || !row.slug) return null;

  return {
    slug: String(row.slug),
    updatedAt:
      row.updated_at ||
      row.updatedAt ||
      row.published_at ||
      row.publishedAt ||
      row.created_at ||
      row.createdAt ||
      null,
  };
}

function mergeByKey(key, ...groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const item of group) {
      if (!item?.[key]) continue;
      merged.set(item[key], { ...merged.get(item[key]), ...item });
    }
  }
  return Array.from(merged.values()).sort((left, right) =>
    String(left[key]).localeCompare(String(right[key])),
  );
}

function toLastmod(value, fallback) {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime())
    ? fallback
    : date.toISOString().slice(0, 10);
}

async function fetchJson(url) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to fetch ${url}`);
}

async function readSnapshotOpportunities() {
  try {
    const contents = await readFile(snapshotPath, "utf8");
    return extractRows(JSON.parse(contents))
      .map(normaliseOpportunity)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchBackendOpportunities(apiBaseUrl) {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return { rows: [], complete: false };
  }

  const all = [];
  try {
    for (
      let offset = 0;
      offset < MAX_OPPORTUNITIES;
      offset += OPPORTUNITY_PAGE_SIZE
    ) {
      const url = new URL("/opportunities", apiBaseUrl);
      url.searchParams.set("limit", String(OPPORTUNITY_PAGE_SIZE));
      url.searchParams.set("offset", String(offset));
      const rows = extractRows(await fetchJson(url));
      all.push(...rows.map(normaliseOpportunity).filter(Boolean));

      if (rows.length < OPPORTUNITY_PAGE_SIZE) {
        return { rows: all, complete: true };
      }
    }

    return { rows: all.slice(0, MAX_OPPORTUNITIES), complete: false };
  } catch (error) {
    console.warn(
      `Sitemap opportunity inventory fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { rows: all, complete: false };
  }
}

async function fetchBackendEvents(apiBaseUrl) {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return { rows: [], complete: false };
  }

  try {
    const url = new URL("/events", apiBaseUrl);
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "published");
    return {
      rows: extractRows(await fetchJson(url))
        .map(normaliseEvent)
        .filter(Boolean),
      complete: true,
    };
  } catch (error) {
    console.warn(
      `Sitemap event inventory fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { rows: [], complete: false };
  }
}

async function fetchBackendBlogPosts(apiBaseUrl) {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return { rows: [], complete: false };
  }

  try {
    const url = new URL("/blog", apiBaseUrl);
    url.searchParams.set("status", "published");
    url.searchParams.set("limit", "100");
    return {
      rows: extractRows(await fetchJson(url))
        .map(normaliseBlogPost)
        .filter(Boolean),
      complete: true,
    };
  } catch (error) {
    console.warn(
      `Sitemap blog inventory fetch failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { rows: [], complete: false };
  }
}

export function assertInventory(
  inventory,
  {
    strict = false,
    minOpportunities = 0,
    minBlogPosts = 0,
  } = {},
) {
  if (!strict) return;

  const opportunityCount = Array.isArray(inventory?.opportunities)
    ? inventory.opportunities.length
    : 0;
  const blogCount = Array.isArray(inventory?.blogPosts)
    ? inventory.blogPosts.length
    : 0;
  const complete = inventory?.complete || {};
  const incompleteSources = [
    complete.opportunities === false ? "opportunities" : null,
    complete.blogPosts === false ? "blog" : null,
  ].filter(Boolean);

  if (
    opportunityCount < Math.max(0, Number(minOpportunities) || 0) ||
    blogCount < Math.max(0, Number(minBlogPosts) || 0) ||
    incompleteSources.length > 0
  ) {
    throw new Error(
      `SEO sitemap inventory is incomplete: ${opportunityCount} opportunities, ${blogCount} blog posts${
        incompleteSources.length > 0
          ? `; incomplete sources: ${incompleteSources.join(", ")}`
          : ""
      }`,
    );
  }
}

function absoluteUrl(siteUrl, pathname) {
  return new URL(pathname, `${normaliseSiteUrl(siteUrl)}/`).toString();
}

export function buildSitemapEntries({
  siteUrl,
  opportunities = [],
  events = [],
  blogPosts = [],
  today = new Date().toISOString().slice(0, 10),
}) {
  const base = normaliseSiteUrl(siteUrl) || DEFAULT_SITE_URL;
  const entries = [
    {
      loc: absoluteUrl(base, "/"),
      lastmod: today,
      changefreq: "daily",
      priority: "0.8",
    },
    {
      loc: absoluteUrl(base, "/opportunities"),
      lastmod: today,
      changefreq: "daily",
      priority: "1.0",
    },
    {
      loc: absoluteUrl(base, "/events"),
      lastmod: today,
      changefreq: "daily",
      priority: "0.9",
    },
    {
      loc: absoluteUrl(base, "/blog"),
      lastmod: toLastmod(blogPosts[0]?.updatedAt, today),
      changefreq: "weekly",
      priority: "0.8",
    },
    {
      loc: absoluteUrl(base, "/edutuforyou"),
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    {
      loc: absoluteUrl(base, "/whats-new"),
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    },
    ...["scholarships", "internships", "fellowships", "programs"].map(
      (category) => ({
        loc: absoluteUrl(base, `/opportunities/${category}`),
        lastmod: today,
        changefreq: "daily",
        priority: "0.9",
      }),
    ),
    ...opportunities.map((opportunity) => ({
      loc: absoluteUrl(
        base,
        `/opportunity/${encodeURIComponent(opportunity.id)}`,
      ),
      lastmod: toLastmod(opportunity.updatedAt, today),
      changefreq: "daily",
      priority: "0.8",
    })),
    ...events.map((event) => ({
      loc: absoluteUrl(base, `/events/${encodeURIComponent(event.slug)}`),
      lastmod: toLastmod(event.updatedAt, today),
      changefreq: "weekly",
      priority: "0.7",
    })),
    ...blogPosts.map((post) => ({
      loc: absoluteUrl(base, `/blog/${encodeURIComponent(post.slug)}`),
      lastmod: toLastmod(post.updatedAt, today),
      changefreq: "monthly",
      priority: "0.7",
    })),
  ];

  const unique = new Map();
  for (const entry of entries) unique.set(entry.loc, entry);
  return Array.from(unique.values());
}

function renderUrl({ loc, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
    `    <priority>${escapeXml(priority)}</priority>`,
    "  </url>",
  ].join("\n");
}

export function renderSitemapXml(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(renderUrl),
    "</urlset>",
    "",
  ].join("\n");
}

function renderRobots(siteUrl) {
  return [
    "User-agent: *",
    "Allow: /",
    "# Authenticated app shell and auth flows — no crawlable content.",
    "Disallow: /app/",
    "Disallow: /admin/",
    "Disallow: /auth",
    "Disallow: /auth/callback",
    "",
    `Sitemap: ${absoluteUrl(siteUrl, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

function strictModeFromEnvironment() {
  if (process.env.SEO_SITEMAP_STRICT !== undefined) {
    return process.env.SEO_SITEMAP_STRICT === "true";
  }
  return process.env.VERCEL === "1";
}

function nonNegativeEnvironmentNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function main() {
  loadDotEnv(path.join(projectRoot, ".env"));
  const siteUrl = normaliseSiteUrl(
    process.env.VITE_PUBLIC_SITE_URL ||
      process.env.VITE_WEB_APP_URL ||
      process.env.SITE_URL ||
      DEFAULT_SITE_URL,
  );
  const apiBaseUrl = normaliseSiteUrl(
    process.env.VITE_BACKEND_URL ||
      process.env.VITE_API_URL ||
      DEFAULT_API_URL,
  );
  const strict = strictModeFromEnvironment();

  const [snapshot, opportunityResult, eventResult, blogResult] =
    await Promise.all([
      readSnapshotOpportunities(),
      fetchBackendOpportunities(apiBaseUrl),
      fetchBackendEvents(apiBaseUrl),
      fetchBackendBlogPosts(apiBaseUrl),
    ]);

  const opportunities = mergeByKey(
    "id",
    snapshot,
    opportunityResult.rows,
  );
  const events = mergeByKey("slug", eventResult.rows);
  const blogPosts = mergeByKey("slug", blogResult.rows);

  assertInventory(
    {
      opportunities,
      blogPosts,
      complete: {
        opportunities: opportunityResult.complete,
        blogPosts: blogResult.complete,
      },
    },
    {
      strict,
      minOpportunities: nonNegativeEnvironmentNumber(
        "SEO_MIN_OPPORTUNITY_URLS",
        strict ? 1 : 0,
      ),
      minBlogPosts: nonNegativeEnvironmentNumber(
        "SEO_MIN_BLOG_URLS",
        strict ? 1 : 0,
      ),
    },
  );

  const entries = buildSitemapEntries({
    siteUrl,
    opportunities,
    events,
    blogPosts,
  });
  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "sitemap.xml"), renderSitemapXml(entries)),
    writeFile(path.join(publicDir, "robots.txt"), renderRobots(siteUrl)),
  ]);

  console.log(
    `Generated sitemap with ${entries.length} URLs at ${siteUrl} (${opportunities.length} opportunities, ${blogPosts.length} blog posts; strict=${strict}).`,
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
