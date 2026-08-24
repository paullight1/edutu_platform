/**
 * Post-build prerender of per-route <head> metadata.
 *
 * Social crawlers (WhatsApp, Facebook, Slack, LinkedIn, iMessage, Twitter) do
 * not execute JavaScript, so the tags `src/components/Seo.tsx` injects at
 * runtime are invisible to them — every link previously unfurled with the
 * generic SPA shell's Edutu logo. This step clones `dist/index.html` into a
 * per-route `dist/<path>/index.html` with that route's real title, description
 * and hero OG image baked into the HTML.
 *
 * Most public marketing routes are served from these static files. Content
 * archives that need crawlable item links may instead be owned by the backend
 * SEO renderer. The routing assertion below accepts either explicit owner but
 * still fails when a public SEO route would fall through to the generic SPA.
 *
 * Runs automatically via `postbuild`.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OG_HEIGHT,
  OG_MIME,
  OG_WIDTH,
  PAGE_SEO,
  canonicalUrl,
  ogImageUrl,
} from "./page-seo.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(scriptDir, "..", "dist");
const shellPath = path.join(distDir, "index.html");

/** Escape a value for a double-quoted HTML attribute. */
function attr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Replace an existing <meta> tag or append one before </head>.
 *
 * The shell's tags are Prettier-wrapped across multiple lines, so the match has
 * to span newlines — a single-line pattern silently appends duplicates that
 * crawlers then resolve inconsistently.
 */
function upsertMeta(html, attribute, key, value) {
  const tag = `<meta ${attribute}="${key}" content="${attr(value)}" />`;
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key}"[\\s\\S]*?/>`,
    "i",
  );

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertTitle(html, title) {
  const tag = `<title>${escapeText(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function upsertCanonical(html, href) {
  const tag = `<link rel="canonical" href="${attr(href)}" />`;
  return /<link\s+rel="canonical"[\s\S]*?\/>/i.test(html)
    ? html.replace(/<link\s+rel="canonical"[\s\S]*?\/>/i, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function buildHtml(shell, entry) {
  const url = canonicalUrl(entry.path);
  const image = ogImageUrl(entry.slug);

  let html = upsertTitle(shell, entry.title);
  html = upsertMeta(html, "name", "description", entry.description);
  html = upsertMeta(
    html,
    "name",
    "robots",
    entry.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
  );

  html = upsertMeta(html, "property", "og:type", "website");
  html = upsertMeta(html, "property", "og:site_name", "Edutu");
  html = upsertMeta(html, "property", "og:url", url);
  html = upsertMeta(html, "property", "og:title", entry.title);
  html = upsertMeta(html, "property", "og:description", entry.description);
  html = upsertMeta(html, "property", "og:image", image);
  html = upsertMeta(html, "property", "og:image:secure_url", image);
  html = upsertMeta(html, "property", "og:image:type", OG_MIME);
  html = upsertMeta(html, "property", "og:image:width", String(OG_WIDTH));
  html = upsertMeta(html, "property", "og:image:height", String(OG_HEIGHT));
  html = upsertMeta(html, "property", "og:image:alt", entry.imageAlt);

  html = upsertMeta(html, "name", "twitter:card", "summary_large_image");
  html = upsertMeta(html, "name", "twitter:title", entry.title);
  html = upsertMeta(html, "name", "twitter:description", entry.description);
  html = upsertMeta(html, "name", "twitter:image", image);
  html = upsertMeta(html, "name", "twitter:image:alt", entry.imageAlt);

  html = upsertCanonical(html, url);

  // Health-check marker: `curl -s https://www.edutu.org/about | grep prerendered`
  return html.replace(
    "</head>",
    `  <meta name="edutu-prerendered" content="${attr(entry.slug)}" />\n</head>`,
  );
}

function hasExplicitSeoOwner(rule) {
  if (typeof rule.destination !== "string") return false;

  if (rule.destination.endsWith("/index.html")) return true;

  try {
    const destination = new URL(rule.destination);
    return destination.pathname === "/seo/blog" || destination.pathname === "/seo/opportunities";
  } catch {
    return false;
  }
}

/**
 * Generated route HTML is useful only when production routing has an explicit
 * owner for that public path. Static marketing pages use their generated
 * `index.html`; content archives use the backend SEO renderer so initial HTML
 * can include real item links and pagination.
 */
async function assertRoutingCoverage() {
  const configPaths = [
    path.resolve(scriptDir, "..", "..", "vercel.json"),
    path.resolve(scriptDir, "..", "vercel.json"),
  ];
  let config;
  let configPath;
  for (const candidate of configPaths) {
    try {
      config = JSON.parse(await readFile(candidate, "utf8"));
      configPath = candidate;
      break;
    } catch {
      // Try the standalone app config when this package is copied elsewhere.
    }
  }
  if (!config) {
    throw new Error("Could not find a Vercel routing configuration.");
  }

  const routed = new Set(
    (config.rewrites ?? [])
      .filter(hasExplicitSeoOwner)
      .map((rule) => rule.source),
  );

  const missing = PAGE_SEO.filter(
    (entry) => entry.path !== "/" && !routed.has(entry.path),
  ).map((entry) => entry.path);

  if (missing.length) {
    throw new Error(
      `${path.basename(configPath)} has no explicit SEO owner for: ${missing.join(", ")}\n` +
        "Add a static prerender rewrite or a tested backend SEO rewrite above the SPA catch-all.",
    );
  }
}

async function main() {
  await assertRoutingCoverage();

  const shell = await readFile(shellPath, "utf8");

  for (const entry of PAGE_SEO) {
    const html = buildHtml(shell, entry);

    if (entry.path === "/") {
      await writeFile(shellPath, html);
    } else {
      const dir = path.join(distDir, entry.path.replace(/^\//, ""));
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "index.html"), html);
    }

    console.log(`  ✓ ${entry.path.padEnd(22)} ${ogImageUrl(entry.slug)}`);
  }

  console.log(`\n[seo] prerendered ${PAGE_SEO.length} route(s) into dist/`);
}

await main();