import { attr, textContent, type OgPageMeta } from "./og-page.render";

/**
 * Injects per-item Open Graph metadata into the deployed SPA shell.
 *
 * The rewrites that route `/blog/:slug` and `/events/:slug` here are
 * unconditional (the platform's services router drops `has` user-agent
 * conditions), so these responses are served to REAL USERS as well as
 * crawlers. Rewriting the shell rather than returning a standalone page is what
 * keeps the app working: the returned HTML still loads the same JS bundle and
 * boots React normally, it just carries the right <head>.
 */

/**
 * Replace a <meta> tag, or append one before </head>.
 *
 * The shell's tags are Prettier-wrapped across multiple lines, so the pattern
 * must span newlines — a single-line pattern appends a duplicate instead of
 * replacing, and crawlers then pick whichever they happen to see first.
 */
function upsertMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
  value: string,
): string {
  const tag = `<meta ${attribute}="${key}" content="${attr(value)}" />`;
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key}"[\\s\\S]*?/?>`,
    "i",
  );

  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

/** Marker proving a response came through injection. Also a loop guard. */
export const OG_INJECTED_MARKER = "edutu-og-injected";

/**
 * @returns the shell with `meta` applied, or null if the shell is unusable (no
 * </head>, or already injected — meaning the fetch looped back into this route).
 */
export function injectIntoShell(
  shell: string,
  meta: OgPageMeta,
): string | null {
  if (!shell.includes("</head>")) return null;
  if (shell.includes(OG_INJECTED_MARKER)) return null;

  let html = shell;

  const titleTag = `<title>${textContent(meta.title)}</title>`;
  html = /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, titleTag)
    : html.replace("</head>", `  ${titleTag}\n</head>`);

  html = upsertMeta(html, "name", "description", meta.description);
  html = upsertMeta(
    html,
    "name",
    "robots",
    "index, follow, max-image-preview:large",
  );
  html = upsertMeta(html, "property", "og:site_name", "Edutu");
  html = upsertMeta(html, "property", "og:type", meta.ogType);
  html = upsertMeta(html, "property", "og:title", meta.title);
  html = upsertMeta(html, "property", "og:description", meta.description);
  html = upsertMeta(html, "property", "og:image", meta.image);
  html = upsertMeta(html, "property", "og:image:secure_url", meta.image);
  html = upsertMeta(html, "property", "og:image:alt", meta.imageAlt);
  html = upsertMeta(html, "property", "og:url", meta.url);
  html = upsertMeta(html, "name", "twitter:card", "summary_large_image");
  html = upsertMeta(html, "name", "twitter:title", meta.title);
  html = upsertMeta(html, "name", "twitter:description", meta.description);
  html = upsertMeta(html, "name", "twitter:image", meta.image);
  html = upsertMeta(html, "name", "twitter:image:alt", meta.imageAlt);

  if (meta.imageWidth && meta.imageHeight) {
    html = upsertMeta(
      html,
      "property",
      "og:image:width",
      String(meta.imageWidth),
    );
    html = upsertMeta(
      html,
      "property",
      "og:image:height",
      String(meta.imageHeight),
    );
  } else {
    // The shell may carry dimensions from a prerendered page; stale numbers
    // make Twitter letterbox the card, so drop them when we don't know.
    html = html
      .replace(/<meta\s+property="og:image:width"[\s\S]*?\/?>/i, "")
      .replace(/<meta\s+property="og:image:height"[\s\S]*?\/?>/i, "");
  }

  // Canonical must name the item, not whatever path the shell was fetched from.
  const canonical = `<link rel="canonical" href="${attr(meta.url)}" />`;
  html = /<link\s+rel="canonical"[\s\S]*?\/?>/i.test(html)
    ? html.replace(/<link\s+rel="canonical"[\s\S]*?\/?>/i, canonical)
    : html.replace("</head>", `  ${canonical}\n</head>`);

  // Drop route JSON-LD baked into the shell before adding this item's.
  html = html.replace(
    /<script[^>]*data-route-json-ld[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );

  if (meta.jsonLd) {
    const json = JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c");
    html = html.replace(
      "</head>",
      `  <script type="application/ld+json" data-route-json-ld="true">${json}</script>\n</head>`,
    );
  }

  // The SPA replaces this fallback when it boots. Until then, search crawlers
  // and no-JS readers still receive the article's real copy instead of an
  // empty root node that depends on a second API request.
  if (meta.articleBody) {
    const fallback = `<article style="font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.7"><h1>${textContent(meta.title)}</h1><p>${textContent(meta.description)}</p><p>${textContent(meta.articleBody)}</p></article>`;
    html = html.replace(
      /<div\s+id=["']root["']\s*>\s*<\/div>/i,
      `<div id="root">${fallback}</div>`,
    );
  }

  return html.replace(
    "</head>",
    `  <meta name="${OG_INJECTED_MARKER}" content="1" />\n</head>`,
  );
}
