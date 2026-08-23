import {
  attr,
  clean,
  textContent,
  toPlainText,
  truncate,
  type OgPageMeta,
} from "../og/og-page.render";
import { injectIntoShell } from "../og/og-shell-inject";

export interface PublicBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt?: string | null;
  content?: string | null;
  authorName?: string | null;
  coverImage?: string | null;
  category?: string | null;
  tags?: string[] | null;
  publishedAt?: string | Date | null;
  updatedAt?: string | Date | null;
}

export interface PublicOpportunity {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  organization?: string | null;
  category?: string | null;
  location?: string | null;
  deadline?: string | Date | null;
  benefits?: unknown;
  eligibility?: unknown;
  requirements?: unknown;
  applicationProcess?: unknown;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface SeoPageInput {
  shell: string | null;
  meta: OgPageMeta;
  bodyHtml: string;
  robots?: "index, follow, max-image-preview:large" | "noindex, follow";
}

export interface PaginationInput {
  basePath: string;
  page: number;
  totalPages: number;
  searchParams?: URLSearchParams;
}

export interface BlogArchiveInput {
  posts: PublicBlogPost[];
  page: number;
  totalPages: number;
  basePath: string;
  heading?: string;
  introduction?: string;
}

export interface OpportunityArchiveInput {
  opportunities: PublicOpportunity[];
  page: number;
  totalPages: number;
  basePath: string;
  heading?: string;
  introduction?: string;
  category?: string | null;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string | Date | null;
}

const PAGE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { background: #f8fafc; }
  body { margin: 0; color: #0f172a; background: #f8fafc; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  a { color: #4338ca; text-underline-offset: 0.18em; }
  a:hover { color: #312e81; }
  img { display: block; max-width: 100%; height: auto; border-radius: 1rem; }
  .seo-shell { width: 100%; max-width: 100%; overflow-wrap: anywhere; }
  .seo-main { width: min(100% - 2rem, 70rem); margin: 0 auto; padding: 2rem 0 4rem; }
  .seo-eyebrow { margin: 0 0 0.65rem; color: #4338ca; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
  .seo-title { max-width: 22ch; margin: 0; font-size: clamp(2rem, 7vw, 4.5rem); line-height: 1.02; letter-spacing: -0.045em; }
  .seo-lead { max-width: 48rem; margin: 1rem 0 0; color: #475569; font-size: clamp(1rem, 2.8vw, 1.2rem); line-height: 1.75; }
  .seo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1rem; margin-top: 2rem; }
  .seo-card, .seo-panel { min-width: 0; border: 1px solid #e2e8f0; border-radius: 1.25rem; background: #fff; box-shadow: 0 14px 40px -34px rgba(15, 23, 42, 0.65); }
  .seo-card { display: flex; flex-direction: column; padding: 1.25rem; }
  .seo-card h2, .seo-card h3 { margin: 0; font-size: 1.18rem; line-height: 1.35; }
  .seo-card p { color: #475569; line-height: 1.7; }
  .seo-card-meta { display: flex; flex-wrap: wrap; gap: 0.5rem 0.9rem; margin-top: auto; padding-top: 0.9rem; color: #64748b; font-size: 0.86rem; }
  .seo-panel { margin-top: 1rem; padding: 1.25rem; }
  .seo-panel h2 { margin: 0 0 0.75rem; font-size: 1.25rem; }
  .seo-panel p, .seo-panel li { color: #334155; line-height: 1.75; }
  .seo-panel ul, .seo-panel ol { margin: 0; padding-left: 1.25rem; }
  .seo-detail-header { display: grid; gap: 1.25rem; align-items: start; }
  .seo-detail-header img { width: 100%; max-height: 28rem; object-fit: cover; }
  .seo-meta-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: 0.75rem; margin: 1.5rem 0 0; padding: 0; list-style: none; }
  .seo-meta-list li { border: 1px solid #e2e8f0; border-radius: 1rem; background: #fff; padding: 0.9rem; }
  .seo-meta-list strong { display: block; margin-bottom: 0.2rem; font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .seo-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0.45rem; margin-top: 2rem; }
  .seo-pagination a, .seo-pagination span { display: inline-flex; min-width: 2.6rem; min-height: 2.6rem; align-items: center; justify-content: center; border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.55rem 0.85rem; background: #fff; color: #334155; font-weight: 700; text-decoration: none; }
  .seo-pagination [aria-current="page"] { border-color: #4338ca; background: #4338ca; color: #fff; }
  .seo-pagination [aria-disabled="true"] { opacity: 0.48; }
  .seo-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
  .seo-actions a { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; border-radius: 0.85rem; padding: 0.7rem 1rem; background: #4338ca; color: #fff; font-weight: 800; text-decoration: none; }
  .seo-actions a + a { border: 1px solid #cbd5e1; background: #fff; color: #334155; }
  @media (min-width: 48rem) {
    .seo-main { width: min(100% - 3rem, 70rem); padding-top: 4rem; }
    .seo-detail-header:has(img) { grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr); }
    .seo-panel { padding: 1.6rem; }
  }
`;

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeHttpUrl(value: unknown): string | null {
  const candidate = clean(value);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(value: unknown): string | null {
  const date = safeDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function isoDateTime(value: unknown): string | null {
  const date = safeDate(value);
  return date ? date.toISOString() : null;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => toPlainText(item)).filter(Boolean);
  }

  const plain = toPlainText(value);
  if (!plain) return [];

  return plain
    .split(/\r?\n|\s*[;•]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderList(items: string[], ordered = false): string {
  if (items.length === 0) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items
    .map((item) => `<li>${textContent(item)}</li>`)
    .join("")}</${tag}>`;
}

function renderPanel(title: string, body: string): string {
  if (!body) return "";
  return `<section class="seo-panel"><h2>${textContent(title)}</h2>${body}</section>`;
}

function replaceRobots(html: string, robots: NonNullable<SeoPageInput["robots"]>): string {
  const tag = `<meta name="robots" content="${attr(robots)}" />`;
  const pattern = /<meta\s+name="robots"[\s\S]*?\/?>/i;
  return pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceRoot(html: string, bodyHtml: string): string {
  const emptyRoot = /<div\s+id=["']root["']\s*>\s*<\/div>/i;
  if (emptyRoot.test(html)) {
    return html.replace(
      emptyRoot,
      `<div id="root"><div class="seo-shell">${bodyHtml}</div></div>`,
    );
  }

  return html.replace(
    /<\/body>/i,
    `<div class="seo-shell">${bodyHtml}</div>\n</body>`,
  );
}

function renderStandaloneHead(
  meta: OgPageMeta,
  robots: NonNullable<SeoPageInput["robots"]>,
): string {
  const jsonLd = meta.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";

  return `<meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${textContent(meta.title)}</title>
  <meta name="description" content="${attr(meta.description)}" />
  <meta name="robots" content="${attr(robots)}" />
  <link rel="canonical" href="${attr(meta.url)}" />
  <meta property="og:site_name" content="Edutu" />
  <meta property="og:type" content="${attr(meta.ogType)}" />
  <meta property="og:title" content="${attr(meta.title)}" />
  <meta property="og:description" content="${attr(meta.description)}" />
  <meta property="og:image" content="${attr(meta.image)}" />
  <meta property="og:image:alt" content="${attr(meta.imageAlt)}" />
  <meta property="og:url" content="${attr(meta.url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${attr(meta.title)}" />
  <meta name="twitter:description" content="${attr(meta.description)}" />
  <meta name="twitter:image" content="${attr(meta.image)}" />${jsonLd}
  <style>${PAGE_CSS}</style>`;
}

export function renderSeoPage({
  shell,
  meta,
  bodyHtml,
  robots = "index, follow, max-image-preview:large",
}: SeoPageInput): string {
  if (shell) {
    const injected = injectIntoShell(shell, {
      ...meta,
      articleBody: undefined,
    });

    if (injected) {
      const withRobots = replaceRobots(injected, robots);
      const withStyles = withRobots.replace(
        "</head>",
        `  <style data-edutu-seo-fallback="true">${PAGE_CSS}</style>\n</head>`,
      );
      return replaceRoot(withStyles, bodyHtml);
    }
  }

  return `<!doctype html>
<html lang="en">
<head>
  ${renderStandaloneHead(meta, robots)}
</head>
<body>
  <div class="seo-shell">${bodyHtml}</div>
</body>
</html>`;
}

function pageHref(
  basePath: string,
  page: number,
  source?: URLSearchParams,
): string {
  const params = new URLSearchParams(source?.toString() ?? "");
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

function paginationItems(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("ellipsis");
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < totalPages - 1) items.push("ellipsis");
  items.push(totalPages);
  return items;
}

export function renderPagination({
  basePath,
  page,
  totalPages,
  searchParams,
}: PaginationInput): string {
  const boundedTotal = Math.max(1, Math.floor(totalPages));
  if (boundedTotal <= 1) return "";

  const current = Math.min(Math.max(1, Math.floor(page)), boundedTotal);
  const previous =
    current > 1
      ? `<a href="${attr(pageHref(basePath, current - 1, searchParams))}" aria-label="Previous page">Previous</a>`
      : '<span aria-disabled="true">Previous</span>';
  const next =
    current < boundedTotal
      ? `<a href="${attr(pageHref(basePath, current + 1, searchParams))}" aria-label="Next page">Next</a>`
      : '<span aria-disabled="true">Next</span>';

  const numbers = paginationItems(current, boundedTotal)
    .map((item, index) => {
      if (item === "ellipsis") {
        return `<span aria-hidden="true" data-index="${index}">…</span>`;
      }
      const currentAttribute = item === current ? ' aria-current="page"' : "";
      return `<a href="${attr(pageHref(basePath, item, searchParams))}" aria-label="Page ${item}"${currentAttribute}>${item}</a>`;
    })
    .join("");

  return `<nav class="seo-pagination" aria-label="Pagination">${previous}${numbers}${next}</nav>`;
}

export function renderBlogArchiveBody({
  posts,
  page,
  totalPages,
  basePath,
  heading = "Scholarship, career and opportunity guides",
  introduction =
    "Practical research and application guidance for African students and early-career professionals.",
}: BlogArchiveInput): string {
  const cards = posts
    .map((post) => {
      const published = isoDateTime(post.publishedAt);
      const publishedLabel = displayDate(post.publishedAt);
      const excerpt = truncate(
        toPlainText(post.excerpt) || toPlainText(post.content),
        220,
      );
      const category = clean(post.category);
      return `<article class="seo-card">
        <p class="seo-eyebrow">${textContent(category || "Edutu guide")}</p>
        <h2><a href="/blog/${attr(encodeURIComponent(post.slug))}">${textContent(post.title)}</a></h2>
        ${excerpt ? `<p>${textContent(excerpt)}</p>` : ""}
        <div class="seo-card-meta">
          ${published && publishedLabel ? `<time datetime="${attr(published)}">${textContent(publishedLabel)}</time>` : ""}
          ${clean(post.authorName) ? `<span>By ${textContent(clean(post.authorName))}</span>` : ""}
        </div>
      </article>`;
    })
    .join("");

  return `<main class="seo-main" id="main-content">
    <header>
      <p class="seo-eyebrow">Edutu editorial</p>
      <h1 class="seo-title">${textContent(heading)}</h1>
      <p class="seo-lead">${textContent(introduction)}</p>
    </header>
    ${cards ? `<section class="seo-grid" aria-label="Published guides">${cards}</section>` : '<section class="seo-panel"><h2>No published guides found</h2><p>Return to this page for new Edutu application and career guides.</p></section>'}
    ${renderPagination({ basePath, page, totalPages })}
  </main>`;
}

export function renderBlogPostBody(post: PublicBlogPost): string {
  const published = isoDateTime(post.publishedAt);
  const publishedLabel = displayDate(post.publishedAt);
  const updated = isoDateTime(post.updatedAt);
  const updatedLabel = displayDate(post.updatedAt);
  const image = safeHttpUrl(post.coverImage);
  const article = toPlainText(post.content);
  const excerpt = toPlainText(post.excerpt);

  return `<main class="seo-main" id="main-content">
    <article>
      <header class="seo-detail-header">
        <div>
          <p class="seo-eyebrow">${textContent(clean(post.category) || "Edutu guide")}</p>
          <h1 class="seo-title">${textContent(post.title)}</h1>
          ${excerpt ? `<p class="seo-lead">${textContent(excerpt)}</p>` : ""}
          <div class="seo-card-meta">
            ${published && publishedLabel ? `<time datetime="${attr(published)}">Published ${textContent(publishedLabel)}</time>` : ""}
            ${updated && updatedLabel ? `<time datetime="${attr(updated)}">Updated ${textContent(updatedLabel)}</time>` : ""}
            ${clean(post.authorName) ? `<span>By ${textContent(clean(post.authorName))}</span>` : ""}
          </div>
        </div>
        ${image ? `<img src="${attr(image)}" alt="${attr(post.title)}" loading="eager" />` : ""}
      </header>
      ${article ? renderPanel("Guide", `<p>${textContent(article)}</p>`) : ""}
      <nav class="seo-actions" aria-label="Article navigation"><a href="/blog">Browse more Edutu guides</a><a href="/opportunities">Find opportunities</a></nav>
    </article>
  </main>`;
}

function opportunityPath(opportunity: PublicOpportunity): string {
  return `/opportunity/${encodeURIComponent(opportunity.id)}`;
}

export function renderOpportunityArchiveBody({
  opportunities,
  page,
  totalPages,
  basePath,
  heading = "Find scholarships, internships, fellowships and programs",
  introduction =
    "Browse active opportunities with deadlines, eligibility information, and direct source links.",
  category,
}: OpportunityArchiveInput): string {
  const cards = opportunities
    .map((opportunity) => {
      const summary = truncate(
        toPlainText(opportunity.summary) || toPlainText(opportunity.description),
        220,
      );
      const deadline = displayDate(opportunity.deadline) || clean(opportunity.deadline);
      return `<article class="seo-card">
        <p class="seo-eyebrow">${textContent(clean(opportunity.category) || category || "Opportunity")}</p>
        <h2><a href="${attr(opportunityPath(opportunity))}">${textContent(opportunity.title)}</a></h2>
        ${summary ? `<p>${textContent(summary)}</p>` : ""}
        <div class="seo-card-meta">
          ${clean(opportunity.organization) ? `<span>${textContent(clean(opportunity.organization))}</span>` : ""}
          ${clean(opportunity.location) ? `<span>${textContent(clean(opportunity.location))}</span>` : ""}
          ${deadline ? `<span>Deadline: ${textContent(deadline)}</span>` : ""}
        </div>
      </article>`;
    })
    .join("");

  return `<main class="seo-main" id="main-content">
    <header>
      <p class="seo-eyebrow">Opportunity discovery</p>
      <h1 class="seo-title">${textContent(heading)}</h1>
      <p class="seo-lead">${textContent(introduction)}</p>
    </header>
    ${cards ? `<section class="seo-grid" aria-label="Active opportunities">${cards}</section>` : '<section class="seo-panel"><h2>No active opportunities found</h2><p>Explore another category or return soon for newly verified listings.</p></section>'}
    ${renderPagination({ basePath, page, totalPages })}
    <nav class="seo-actions" aria-label="Opportunity categories"><a href="/opportunities/scholarships">Scholarships</a><a href="/opportunities/internships">Internships</a><a href="/opportunities/fellowships">Fellowships</a><a href="/opportunities/programs">Programs</a></nav>
  </main>`;
}

export function renderOpportunityBody(
  opportunity: PublicOpportunity,
): string {
  const summary = toPlainText(opportunity.summary);
  const description = toPlainText(opportunity.description);
  const image = safeHttpUrl(opportunity.imageUrl);
  const deadline = displayDate(opportunity.deadline) || clean(opportunity.deadline);
  const reviewed = displayDate(opportunity.updatedAt || opportunity.createdAt);
  const benefits = toStringList(opportunity.benefits);
  const eligibility = [
    ...toStringList(opportunity.eligibility),
    ...toStringList(opportunity.requirements),
  ].filter((item, index, values) => values.indexOf(item) === index);
  const applicationProcess = toStringList(opportunity.applicationProcess);
  const applicationUrl = safeHttpUrl(opportunity.applicationUrl);
  const sourceUrl = safeHttpUrl(opportunity.sourceUrl);

  const metaItems = [
    clean(opportunity.organization)
      ? `<li><strong>Organization</strong>${textContent(clean(opportunity.organization))}</li>`
      : "",
    clean(opportunity.category)
      ? `<li><strong>Category</strong>${textContent(clean(opportunity.category))}</li>`
      : "",
    clean(opportunity.location)
      ? `<li><strong>Location</strong>${textContent(clean(opportunity.location))}</li>`
      : "",
    deadline
      ? `<li><strong>Deadline</strong>${textContent(deadline)}</li>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const actions = [
    applicationUrl
      ? `<a href="${attr(applicationUrl)}" rel="nofollow noopener noreferrer">Open application</a>`
      : "",
    sourceUrl
      ? `<a href="${attr(sourceUrl)}" rel="nofollow noopener noreferrer">Verify original source</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<main class="seo-main" id="main-content">
    <article>
      <header class="seo-detail-header">
        <div>
          <p class="seo-eyebrow">${textContent(clean(opportunity.category) || "Edutu opportunity")}</p>
          <h1 class="seo-title">${textContent(opportunity.title)}</h1>
          ${summary ? `<p class="seo-lead">${textContent(summary)}</p>` : ""}
          ${reviewed ? `<p class="seo-card-meta">Last reviewed ${textContent(reviewed)}</p>` : ""}
        </div>
        ${image ? `<img src="${attr(image)}" alt="${attr(opportunity.title)}" loading="eager" />` : ""}
      </header>
      ${metaItems ? `<ul class="seo-meta-list">${metaItems}</ul>` : ""}
      ${description && description !== summary ? renderPanel("About this opportunity", `<p>${textContent(description)}</p>`) : ""}
      ${renderPanel("Benefits", renderList(benefits))}
      ${renderPanel("Eligibility", renderList(eligibility))}
      ${renderPanel("How to apply", renderList(applicationProcess, true))}
      ${actions ? `<nav class="seo-actions" aria-label="Application links">${actions}</nav>` : ""}
      <nav class="seo-actions" aria-label="Opportunity navigation"><a href="/opportunities">Browse active opportunities</a><a href="/blog">Read application guides</a></nav>
    </article>
  </main>`;
}

export function renderSitemap(entries: SitemapEntry[]): string {
  const unique = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    const location = safeHttpUrl(entry.loc);
    if (!location) continue;
    unique.set(location, { ...entry, loc: location });
  }

  const rows = Array.from(unique.values())
    .map((entry) => {
      const date = safeDate(entry.lastmod);
      return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${date ? `\n    <lastmod>${date.toISOString().slice(0, 10)}</lastmod>` : ""}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

export function renderRobots(siteUrl: string): string {
  const base = safeHttpUrl(siteUrl) || "https://www.edutu.org/";
  const sitemap = new URL("/sitemap.xml", base).toString();
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app/",
    "Disallow: /admin/",
    "Disallow: /auth",
    "Disallow: /auth/callback",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");
}
