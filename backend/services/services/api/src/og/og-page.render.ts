/**
 * Crawler-time HTML renderer for content pages (blog posts, events).
 *
 * Static marketing routes (`/`, `/blog`, `/community`, …) are handled entirely
 * at build time — `edutu-web-app/scripts/inject-route-meta.mjs` bakes their
 * hero Open Graph image into a prerendered `dist/<path>/index.html`, so they
 * never touch the backend. Only routes whose metadata depends on a database row
 * come here.
 *
 * NOTE: `opportunities/og.controller.ts` carries its own near-identical
 * renderer. They are kept separate deliberately for now — that file is on a
 * different deploy cadence — but they should be folded together the next time
 * either one is touched substantially.
 */

/** Escape for a double-quoted HTML attribute. */
export function attr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape for HTML text content. */
export function textContent(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Collapse whitespace; returns "" for anything non-string. */
export function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Strip HTML/markdown down to a plain-text description candidate. */
export function toPlainText(value: unknown): string {
  return clean(
    String(value ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/[#*_`>]/g, " "),
  );
}

export interface OgPageMeta {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  ogType: "article" | "website";
  /** Link label in the fallback body. */
  ctaLabel: string;
  imageWidth?: number;
  imageHeight?: number;
  jsonLd?: Record<string, unknown>;
  /** Plain-text article copy exposed before the SPA boots for non-JS crawlers. */
  articleBody?: string;
}

export function renderOgPage(meta: OgPageMeta): string {
  const jsonLdTag = meta.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  const dims =
    meta.imageWidth && meta.imageHeight
      ? `\n  <meta property="og:image:width" content="${meta.imageWidth}">\n  <meta property="og:image:height" content="${meta.imageHeight}">`
      : "";

  const articleBody = meta.articleBody
    ? `\n    <p>${textContent(meta.articleBody)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${attr(meta.title)}</title>
  <meta name="description" content="${attr(meta.description)}">
  <link rel="canonical" href="${attr(meta.url)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:site_name" content="Edutu">
  <meta property="og:type" content="${meta.ogType}">
  <meta property="og:title" content="${attr(meta.title)}">
  <meta property="og:description" content="${attr(meta.description)}">
  <meta property="og:image" content="${attr(meta.image)}">
  <meta property="og:image:secure_url" content="${attr(meta.image)}">
  <meta property="og:image:alt" content="${attr(meta.imageAlt)}">
  <meta property="og:url" content="${attr(meta.url)}">${dims}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(meta.title)}">
  <meta name="twitter:description" content="${attr(meta.description)}">
  <meta name="twitter:image" content="${attr(meta.image)}">
  <meta name="twitter:image:alt" content="${attr(meta.imageAlt)}">${jsonLdTag}
</head>
<body>
  <main style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5">
    <h1>${textContent(meta.title)}</h1>
    <p>${textContent(meta.description)}</p>
${articleBody}
    <p><a href="${attr(meta.url)}">${textContent(meta.ctaLabel)}</a></p>
  </main>
</body>
</html>`;
}
