import {
  cleanText,
  escapeAttribute,
  escapeHtml,
  truncateText,
} from "./seo-render";
import { SEO_CATEGORIES, type SeoCategory } from "./seo-data";

export type SeoRecord = Record<string, any>;

export function firstValue(record: SeoRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function flattenText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value))
    return value.map(flattenText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value as SeoRecord)
      .map(flattenText)
      .filter(Boolean)
      .join(" ");
  }
  return cleanText(value);
}

export function firstText(record: SeoRecord, keys: string[]): string {
  for (const key of keys) {
    const value = flattenText(record[key]);
    if (value) return value;
  }
  return "";
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).slice(0, 20);
  }
  if (value && typeof value === "object") {
    return Object.values(value as SeoRecord)
      .map(flattenText)
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      return stringList(JSON.parse(trimmed));
    } catch {
      // Continue with human-readable delimiter parsing.
    }
  }

  return trimmed
    .split(/\r?\n|\s*[;•]\s*/)
    .map(flattenText)
    .filter(Boolean)
    .slice(0, 20);
}

export function parsePage(value?: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), 500)
    : 1;
}

export function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return flattenText(value);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function lastmod(value: unknown): string | null {
  const iso = isoDate(value);
  return iso ? iso.slice(0, 10) : null;
}

export function renderUrlSet(
  entries: Array<{
    loc: string;
    lastmod?: unknown;
    changefreq: string;
    priority: string;
  }>,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.flatMap((entry) => {
      const modified = lastmod(entry.lastmod);
      return [
        "  <url>",
        `    <loc>${xml(entry.loc)}</loc>`,
        ...(modified ? [`    <lastmod>${xml(modified)}</lastmod>`] : []),
        `    <changefreq>${xml(entry.changefreq)}</changefreq>`,
        `    <priority>${xml(entry.priority)}</priority>`,
        "  </url>",
      ];
    }),
    "</urlset>",
    "",
  ].join("\n");
}

export function renderParagraphs(value: string): string {
  const text = flattenText(value);
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 4) {
    paragraphs.push(
      sentences
        .slice(index, index + 4)
        .join(" ")
        .trim(),
    );
  }
  return paragraphs
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

export function renderListSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return [
    '<section class="seo-panel">',
    `<h2>${escapeHtml(title)}</h2>`,
    '<ul class="seo-list">',
    ...items.map((item) => `<li>${escapeHtml(item)}</li>`),
    "</ul>",
    "</section>",
  ].join("");
}

export function renderPagination(
  pathname: string,
  page: number,
  hasNext: boolean,
): string {
  if (page === 1 && !hasNext) return "";
  const previousPath = page === 2 ? pathname : `${pathname}?page=${page - 1}`;
  return [
    '<nav class="seo-pagination" aria-label="Pagination">',
    page > 1
      ? `<a rel="prev" href="${escapeAttribute(previousPath)}">Previous</a>`
      : "",
    `<span aria-current="page">Page ${page}</span>`,
    hasNext
      ? `<a rel="next" href="${escapeAttribute(`${pathname}?page=${page + 1}`)}">Next</a>`
      : "",
    "</nav>",
  ].join("");
}

export function opportunitySearchText(opportunity: SeoRecord): string {
  return flattenText([
    opportunity.title,
    opportunity.category,
    opportunity.canonical_category,
    opportunity.summary,
    opportunity.description,
    opportunity.tags,
  ]);
}

export function renderOpportunityArchiveBody(options: {
  items: SeoRecord[];
  category: SeoCategory | null;
  page: number;
  hasNext: boolean;
}): string {
  const { items, category, page, hasNext } = options;
  const title = category?.label || "Explore opportunities";
  const introduction =
    category?.introduction ||
    "Search verified scholarships, internships, fellowships, grants, graduate programs and other opportunities. Each listing links to its recorded source for final confirmation.";
  const pathname = category
    ? `/opportunities/${category.slug}`
    : "/opportunities";
  const categoryNav = SEO_CATEGORIES.map(
    (item) =>
      `<a href="/opportunities/${escapeAttribute(item.slug)}">${escapeHtml(item.label)}</a>`,
  ).join("");
  const cards = items.length
    ? items
        .map((item) => {
          const itemTitle = firstText(item, ["title"]) || "Opportunity";
          const summary = truncateText(
            firstText(item, ["summary", "description"]),
            190,
          );
          const organisation = firstText(item, [
            "organization",
            "provider",
            "company",
          ]);
          const deadline = firstValue(item, [
            "deadline",
            "close_date",
            "deadline_date",
          ]);
          const location = firstText(item, [
            "location",
            "target_region",
            "targetRegion",
          ]);
          return [
            '<article class="seo-card">',
            `<h2><a href="/opportunity/${encodeURIComponent(String(item.id))}">${escapeHtml(itemTitle)}</a></h2>`,
            organisation
              ? `<p><strong>${escapeHtml(organisation)}</strong></p>`
              : "",
            summary ? `<p>${escapeHtml(summary)}</p>` : "",
            '<p class="seo-meta">',
            deadline
              ? `Deadline: ${escapeHtml(formatDate(deadline))}`
              : "Deadline: confirm with provider",
            location ? ` · ${escapeHtml(location)}` : "",
            "</p>",
            "</article>",
          ].join("");
        })
        .join("")
    : '<section class="seo-panel"><h2>No active listings on this page</h2><p>Try another category or return to the first page.</p></section>';
  const faq = category
    ? [
        '<section class="seo-panel"><h2>Frequently asked questions</h2>',
        ...category.faqs.map(
          (item) =>
            `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`,
        ),
        "</section>",
      ].join("")
    : "";

  return [
    '<main id="seo-content">',
    '<nav class="seo-breadcrumbs" aria-label="Breadcrumb">',
    '<a href="/">Home</a><span aria-hidden="true">/</span>',
    category
      ? '<a href="/opportunities">Opportunities</a><span aria-hidden="true">/</span>'
      : "",
    `<span>${escapeHtml(title)}</span></nav>`,
    '<p class="seo-kicker">Opportunity discovery</p>',
    `<h1>${escapeHtml(title)}${page > 1 ? ` — Page ${page}` : ""}</h1>`,
    `<p class="seo-lead">${escapeHtml(introduction)}</p>`,
    `<nav class="seo-category-nav" aria-label="Opportunity categories">${categoryNav}</nav>`,
    `<section class="seo-grid" aria-label="Opportunity results">${cards}</section>`,
    renderPagination(pathname, page, hasNext),
    '<aside class="seo-panel seo-trust"><h2>How Edutu handles opportunity information</h2><p>Edutu helps people discover and understand opportunities. We show source and update information when available, avoid inventing missing facts, and direct applicants to the official provider for final confirmation.</p><p><a href="/blog">Read application guides</a></p></aside>',
    faq,
    "</main>",
  ].join("");
}

export function renderBlogArchiveBody(options: {
  posts: SeoRecord[];
  page: number;
  hasNext: boolean;
}): string {
  const { posts, page, hasNext } = options;
  const cards = posts.length
    ? posts
        .map((post) => {
          const title = firstText(post, ["title"]) || "Edutu guide";
          const excerpt = truncateText(
            firstText(post, ["excerpt", "content", "body"]),
            200,
          );
          const author =
            firstText(post, ["authorName", "author_name"]) ||
            "Edutu Editorial Team";
          const published = firstValue(post, [
            "publishedAt",
            "published_at",
            "createdAt",
            "created_at",
          ]);
          return [
            '<article class="seo-card">',
            `<h2><a href="/blog/${encodeURIComponent(String(post.slug))}">${escapeHtml(title)}</a></h2>`,
            excerpt ? `<p>${escapeHtml(excerpt)}</p>` : "",
            `<p class="seo-meta">${escapeHtml(author)}${published ? ` · ${escapeHtml(formatDate(published))}` : ""}</p>`,
            "</article>",
          ].join("");
        })
        .join("")
    : '<section class="seo-panel"><h2>No published guides on this page</h2><p>Return to the first page or browse current opportunities.</p></section>';

  return [
    '<main id="seo-content">',
    '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>Blog</span></nav>',
    '<p class="seo-kicker">Edutu editorial</p>',
    `<h1>Opportunity and application guides${page > 1 ? ` — Page ${page}` : ""}</h1>`,
    '<p class="seo-lead">Practical guidance for finding opportunities, preparing stronger applications and making informed career and education decisions.</p>',
    `<section class="seo-grid" aria-label="Published guides">${cards}</section>`,
    renderPagination("/blog", page, hasNext),
    '<aside class="seo-panel seo-trust"><h2>Useful guidance, not guaranteed outcomes</h2><p>Edutu articles explain common application principles. Always apply the current rules published by the relevant provider.</p><p><a href="/opportunities">Browse verified opportunities</a></p></aside>',
    "</main>",
  ].join("");
}
