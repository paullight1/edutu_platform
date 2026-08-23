export type SeoJsonLd =
  | Record<string, unknown>
  | Array<Record<string, unknown>>;

export interface SeoPageDocument {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  imageAlt: string;
  ogType: "article" | "website";
  robots: string;
  bodyHtml: string;
  jsonLd?: SeoJsonLd;
  lang?: string;
}

const SEO_MARKER = "edutu-server-seo";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/(?:advertisement|cookie preferences|accept all cookies|share this post|apply now)\s*/gi, " ")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  return `${value.slice(0, Math.max(maximum - 1, 0)).trimEnd()}…`;
}

export function safeHttpUrl(value: unknown): string | null {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function jsonLdTag(jsonLd?: SeoJsonLd): string {
  if (!jsonLd) return "";
  const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  return `<script type="application/ld+json" data-edutu-seo-jsonld="true">${json}</script>`;
}

function upsertMeta(
  html: string,
  attribute: "name" | "property",
  key: string,
  value: string,
): string {
  const tag = `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(value)}" />`;
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "i",
  );

  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function upsertCanonical(html: string, value: string): string {
  const tag = `<link rel="canonical" href="${escapeAttribute(value)}" />`;
  const pattern = /<link\s+[^>]*rel=["']canonical["'][^>]*>/i;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function replaceTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, tag)
    : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

function replaceJsonLd(html: string, jsonLd?: SeoJsonLd): string {
  let next = html.replace(
    /<script[^>]*(?:data-edutu-seo-jsonld|data-route-json-ld)[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  const tag = jsonLdTag(jsonLd);
  if (tag) {
    next = next.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }
  return next;
}

function seoStyles(): string {
  return `<style data-edutu-seo-styles="true">
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #0f172a; }
    #seo-content { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 40px 0 72px; line-height: 1.65; }
    #seo-content a { color: #5b21b6; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
    #seo-content .seo-kicker { color: #6d28d9; font-size: .76rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    #seo-content h1 { max-width: 20ch; margin: 10px 0 12px; font-size: clamp(2rem, 5vw, 4rem); line-height: 1.02; letter-spacing: -.045em; }
    #seo-content h2 { margin: 0; font-size: 1.12rem; line-height: 1.35; }
    #seo-content h3 { margin: 28px 0 8px; font-size: 1.05rem; }
    #seo-content .seo-lead { max-width: 760px; margin: 0; color: #475569; font-size: 1.06rem; }
    #seo-content .seo-breadcrumbs, #seo-content .seo-pagination, #seo-content .seo-category-nav { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    #seo-content .seo-breadcrumbs { margin-bottom: 24px; color: #64748b; font-size: .9rem; }
    #seo-content .seo-category-nav { margin: 28px 0; }
    #seo-content .seo-category-nav a, #seo-content .seo-pagination a { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; border: 1px solid #ddd6fe; border-radius: 999px; background: #fff; padding: 8px 14px; font-weight: 700; text-decoration: none; }
    #seo-content .seo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 28px; }
    #seo-content .seo-card, #seo-content .seo-panel { border: 1px solid #e2e8f0; border-radius: 22px; background: #fff; padding: 20px; box-shadow: 0 14px 40px -34px rgba(15, 23, 42, .55); }
    #seo-content .seo-card { display: flex; min-height: 220px; flex-direction: column; }
    #seo-content .seo-card p { color: #475569; }
    #seo-content .seo-card .seo-meta { margin-top: auto; border-top: 1px solid #e2e8f0; padding-top: 12px; color: #64748b; font-size: .88rem; }
    #seo-content .seo-detail { max-width: 820px; }
    #seo-content .seo-detail .seo-panel { margin-top: 18px; }
    #seo-content .seo-list { padding-left: 1.25rem; }
    #seo-content .seo-trust { margin-top: 30px; border-left: 4px solid #7c3aed; }
    #seo-content .seo-pagination { margin-top: 30px; justify-content: center; }
    #seo-content .seo-muted { color: #64748b; }
    @media (max-width: 900px) { #seo-content .seo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 640px) {
      #seo-content { width: min(100% - 24px, 1120px); padding: 24px 0 52px; }
      #seo-content h1 { font-size: clamp(2rem, 11vw, 3rem); }
      #seo-content .seo-grid { grid-template-columns: 1fr; gap: 14px; }
      #seo-content .seo-card, #seo-content .seo-panel { border-radius: 18px; padding: 17px; }
      #seo-content .seo-category-nav { gap: 8px; }
      #seo-content .seo-category-nav a, #seo-content .seo-pagination a { min-height: 44px; }
    }
  </style>`;
}

export function injectSeoIntoShell(
  shell: string,
  page: SeoPageDocument,
): string | null {
  if (!/<\/head>/i.test(shell) || !/<\/body>/i.test(shell)) return null;
  if (shell.includes(`name="${SEO_MARKER}"`)) return null;

  let html = replaceTitle(shell, page.title);
  html = upsertMeta(html, "name", "description", page.description);
  html = upsertMeta(html, "name", "robots", page.robots);
  html = upsertMeta(html, "property", "og:site_name", "Edutu");
  html = upsertMeta(html, "property", "og:type", page.ogType);
  html = upsertMeta(html, "property", "og:title", page.title);
  html = upsertMeta(html, "property", "og:description", page.description);
  html = upsertMeta(html, "property", "og:url", page.canonicalUrl);
  html = upsertMeta(html, "property", "og:image", page.imageUrl);
  html = upsertMeta(html, "property", "og:image:secure_url", page.imageUrl);
  html = upsertMeta(html, "property", "og:image:alt", page.imageAlt);
  html = upsertMeta(html, "name", "twitter:card", "summary_large_image");
  html = upsertMeta(html, "name", "twitter:title", page.title);
  html = upsertMeta(html, "name", "twitter:description", page.description);
  html = upsertMeta(html, "name", "twitter:image", page.imageUrl);
  html = upsertMeta(html, "name", "twitter:image:alt", page.imageAlt);
  html = upsertCanonical(html, page.canonicalUrl);
  html = replaceJsonLd(html, page.jsonLd);

  html = html.replace(/<style[^>]*data-edutu-seo-styles[^>]*>[\s\S]*?<\/style>/gi, "");
  html = html.replace(/<\/head>/i, `  ${seoStyles()}\n  <meta name="${SEO_MARKER}" content="1" />\n</head>`);

  const rootPattern = /<div\s+id=["']root["'][^>]*>[\s\S]*?<\/div>/i;
  if (!rootPattern.test(html)) return null;

  return html.replace(rootPattern, `<div id="root">${page.bodyHtml}</div>`);
}

export function renderSeoDocument(page: SeoPageDocument): string {
  const jsonLd = jsonLdTag(page.jsonLd);
  return `<!doctype html>
<html lang="${escapeAttribute(page.lang || "en")}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeAttribute(page.description)}" />
  <meta name="robots" content="${escapeAttribute(page.robots)}" />
  <link rel="canonical" href="${escapeAttribute(page.canonicalUrl)}" />
  <meta property="og:site_name" content="Edutu" />
  <meta property="og:type" content="${escapeAttribute(page.ogType)}" />
  <meta property="og:title" content="${escapeAttribute(page.title)}" />
  <meta property="og:description" content="${escapeAttribute(page.description)}" />
  <meta property="og:url" content="${escapeAttribute(page.canonicalUrl)}" />
  <meta property="og:image" content="${escapeAttribute(page.imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeAttribute(page.imageUrl)}" />
  <meta property="og:image:alt" content="${escapeAttribute(page.imageAlt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttribute(page.title)}" />
  <meta name="twitter:description" content="${escapeAttribute(page.description)}" />
  <meta name="twitter:image" content="${escapeAttribute(page.imageUrl)}" />
  ${jsonLd}
  ${seoStyles()}
</head>
<body>
  ${page.bodyHtml}
</body>
</html>`;
}
