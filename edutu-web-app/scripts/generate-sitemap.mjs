import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const snapshotPath = path.join(publicDir, "data", "opportunities.json");

loadDotEnv(path.join(projectRoot, ".env"));

const siteUrl = normaliseSiteUrl(
  process.env.VITE_PUBLIC_SITE_URL ||
    process.env.VITE_WEB_APP_URL ||
    process.env.SITE_URL ||
    "https://edutu.ai",
);
const apiBaseUrl = normaliseSiteUrl(
  process.env.VITE_BACKEND_URL || process.env.VITE_API_URL || "",
);

function normaliseSiteUrl(value) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function loadDotEnv(filePath) {
  try {
    const contents = readFileSync(filePath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Production hosts usually provide real environment variables.
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
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  return (
    payload.data ||
    payload.opportunities ||
    payload.items ||
    payload.results ||
    []
  );
}

function normaliseOpportunity(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = row.id || row.opportunity_id || row.external_id;
  if (!id) {
    return null;
  }

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
  if (!row || typeof row !== "object") {
    return null;
  }

  const slug = row.slug || row.id;
  if (!slug) {
    return null;
  }

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

async function fetchBackendOpportunities() {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return [];
  }

  try {
    const url = new URL("/opportunities", apiBaseUrl);
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "active");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    return extractRows(await response.json())
      .map(normaliseOpportunity)
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchBackendEvents() {
  if (!apiBaseUrl || typeof fetch !== "function") {
    return [];
  }

  try {
    const url = new URL("/events", apiBaseUrl);
    url.searchParams.set("limit", "100");
    url.searchParams.set("status", "published");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    return extractRows(await response.json())
      .map(normaliseEvent)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function mergeOpportunities(...groups) {
  const merged = new Map();

  for (const group of groups) {
    for (const opportunity of group) {
      merged.set(opportunity.id, {
        ...merged.get(opportunity.id),
        ...opportunity,
      });
    }
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function toAbsoluteUrl(pathname) {
  return new URL(pathname, `${siteUrl}/`).toString();
}

function toLastmod(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function renderUrl({ loc, lastmod, changefreq, priority }) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${escapeXml(lastmod)}</lastmod>`,
    `    <changefreq>${escapeXml(changefreq)}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ].join("\n");
}

async function main() {
  const [snapshotOpportunities, backendOpportunities, backendEvents] =
    await Promise.all([
      readSnapshotOpportunities(),
      fetchBackendOpportunities(),
      fetchBackendEvents(),
    ]);
  const opportunities = mergeOpportunities(
    snapshotOpportunities,
    backendOpportunities,
  );
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    {
      loc: toAbsoluteUrl("/"),
      lastmod: today,
      changefreq: "daily",
      priority: "0.8",
    },
    {
      loc: toAbsoluteUrl("/opportunities"),
      lastmod: today,
      changefreq: "daily",
      priority: "1.0",
    },
    {
      loc: toAbsoluteUrl("/events"),
      lastmod: today,
      changefreq: "daily",
      priority: "0.9",
    },
    ...opportunities.map((opportunity) => ({
      loc: toAbsoluteUrl(`/opportunity/${encodeURIComponent(opportunity.id)}`),
      lastmod: toLastmod(opportunity.updatedAt),
      changefreq: "weekly",
      priority: "0.8",
    })),
    ...backendEvents.map((event) => ({
      loc: toAbsoluteUrl(`/events/${encodeURIComponent(event.slug)}`),
      lastmod: toLastmod(event.updatedAt),
      changefreq: "weekly",
      priority: "0.7",
    })),
  ];

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(renderUrl),
    "</urlset>",
    "",
  ].join("\n");
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${toAbsoluteUrl("/sitemap.xml")}`,
    "",
  ].join("\n");

  await mkdir(publicDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(publicDir, "sitemap.xml"), sitemap),
    writeFile(path.join(publicDir, "robots.txt"), robots),
  ]);

  console.log(`Generated sitemap with ${urls.length} URLs at ${siteUrl}.`);
}

await main();
