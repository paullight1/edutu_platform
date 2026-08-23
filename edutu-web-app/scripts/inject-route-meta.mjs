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
 * Most marketing routes are served from the generated static files. Blog and
 * opportunity archives are intentionally routed to the canonical API SEO
 * renderer so their initial HTML also contains live item links and body copy.
 * Both approaches boot the same SPA bundle and must be unconditional.
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
const SEO_API_ORIGIN = "https://edutu-platform.onrender.com";
const API_RENDERED_ROUTES = new Map([
  ["/blog", `${SEO_API_ORIGIN}/seo/blog`],
  ["/opportunities", `${SEO_API_ORIGIN}/seo/opportunities`],
]);

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
    entry.noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large",
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

function routeCoversEntry(rule, entryPath) {
  if (
    rule?.source !== entryPath ||
    Object.hasOwn(rule, "has") ||
    Object.hasOwn(rule, "missing") ||
    typeof rule.destination !== "string"
  ) {
    return false;
  }

  return (
    rule.destination.endsWith("/index.html") ||
    rule.destination === API_RENDERED_ROUTES.get(entryPath)
  );
}

export function findMissingRoutingCoverage(config, entries = PAGE_SEO) {
  const rewrites = Array.isArray(config?.rewrites) ? config.rewrites : [];
  return entries
    .filter(
      (entry) =>
        entry.path !== "/" &&
        !rewrites.some((rule) => routeCoversEntry(rule, entry.path)),
    )
    .map((entry) => entry.path);
}

/**
 * Generated metadata is dead weight if Vercel never routes a public path to
 * either its static HTML or the approved API SEO renderer. Fail loudly rather
 * than allowing the generic SPA shell to mask a routing regression.
 */
async function assertRoutingCoverage() {
  // The production app is mounted as the `frontend` Vercel service from the
  // repository root. Its root vercel.json controls public routing; the
  // service-local file is useful for standalone previews but cannot protect
  // the production deployment from silently falling through to index.html.
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

  const missing = findMissingRoutingCoverage(config);
  if (missing.length) {
    throw new Error(
      `${path.basename(configPath)} has no public render route for: ${missing.join(", ")}\n` +
        "Add an unconditional static prerender rewrite or the approved SEO API destination above the SPA catch-all.",
    );
  }
}

async function main() {
  await assertRoutingCoverage();

  const shell = await readFile(shellPath, "utf8");

  for (const entry of PAGE_SEO) {
    const html = buildHtml(shell, entry);

    if (entry.path === "/") {
      // The root shell itself becomes the homepage variant — no directory.
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

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await main();
