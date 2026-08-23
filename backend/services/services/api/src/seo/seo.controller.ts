import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import {
  clean,
  toPlainText,
  truncate,
  type OgPageMeta,
} from "../og/og-page.render";
import { SpaShellService } from "../og/spa-shell.service";
import {
  SEO_CATEGORIES,
  SeoCatalogService,
  type SeoCategory,
  type SeoInventory,
} from "./seo-catalog.service";
import {
  renderBlogArchiveBody,
  renderBlogPostBody,
  renderOpportunityArchiveBody,
  renderOpportunityBody,
  renderRobots,
  renderSeoPage,
  renderSitemap,
  type PublicBlogPost,
  type PublicOpportunity,
  type SitemapEntry,
} from "./seo-page.render";

const HTML_CACHE =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=900";
const DISCOVERY_CACHE =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=1800";
const ERROR_CACHE = "no-store";
const RETRY_AFTER_SECONDS = 300;

interface CategoryCopy {
  title: string;
  heading: string;
  description: string;
}

const CATEGORY_COPY: Record<SeoCategory, CategoryCopy> = {
  scholarships: {
    title: "Scholarships for African students | Edutu",
    heading: "Scholarships for African students",
    description:
      "Browse active undergraduate, postgraduate, doctoral, research and leadership scholarships with deadlines, eligibility information and direct source links.",
  },
  internships: {
    title: "Internships and graduate roles | Edutu",
    heading: "Internships and graduate roles for African talent",
    description:
      "Discover active internships, trainee roles and early-career programs with application deadlines, locations, eligibility and official source links.",
  },
  fellowships: {
    title: "Fellowships and residencies | Edutu",
    heading: "Fellowships and residencies for African changemakers",
    description:
      "Explore active fellowships, residencies, research placements and leadership programs with clear deadlines and application information.",
  },
  programs: {
    title: "Bootcamps, accelerators and programs | Edutu",
    heading: "Bootcamps, accelerators and learning programs",
    description:
      "Find active academies, accelerators, bootcamps and professional development programs with eligibility, deadlines and direct source links.",
  },
};

function parsePage(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function pageUrl(base: string, path: string, page: number): string {
  return `${base}${path}${page > 1 ? `?page=${page}` : ""}`;
}

function safeAbsoluteImage(value: unknown, fallback: string): string {
  const candidate = clean(value);
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : fallback;
  } catch {
    return fallback;
  }
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function breadcrumbList(
  base: string,
  items: Array<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${base}${item.path}`,
    })),
  };
}

function itemList(
  base: string,
  items: Array<{ title: string; path: string }>,
): Record<string, unknown> {
  return {
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.title,
      url: `${base}${item.path}`,
    })),
  };
}

@Controller("seo")
export class SeoController {
  constructor(
    private readonly catalog: SeoCatalogService,
    private readonly shell: SpaShellService,
  ) {}

  private get base(): string {
    return this.catalog.getSiteUrl();
  }

  private removeHtmlBlockingHeaders(res: Response): void {
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Origin-Agent-Cluster");
  }

  private setHtmlHeaders(
    res: Response,
    statusCode: number,
    cacheControl: string,
    noindex = false,
  ): void {
    res.status(statusCode);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("X-Edutu-Seo-Route", "api/seo");
    if (noindex) res.setHeader("X-Robots-Tag", "noindex, follow");
    this.removeHtmlBlockingHeaders(res);
  }

  private async page(
    res: Response,
    meta: OgPageMeta,
    bodyHtml: string,
    options: {
      statusCode?: number;
      noindex?: boolean;
      useShell?: boolean;
      cacheControl?: string;
    } = {},
  ): Promise<string> {
    const statusCode = options.statusCode ?? 200;
    const noindex = options.noindex ?? false;
    const cacheControl = options.cacheControl ?? HTML_CACHE;
    this.setHtmlHeaders(res, statusCode, cacheControl, noindex);
    const shell =
      options.useShell === false ? null : await this.shell.get(this.base);
    return renderSeoPage({
      shell,
      meta,
      bodyHtml,
      robots: noindex
        ? "noindex, follow"
        : "index, follow, max-image-preview:large",
    });
  }

  private async notFound(
    res: Response,
    kind: "blog" | "opportunity" | "category",
  ): Promise<string> {
    const isBlog = kind === "blog";
    const collectionPath = isBlog ? "/blog" : "/opportunities";
    const title = isBlog ? "Blog post not found" : "Opportunity not found";
    const body = `<main class="seo-main" id="main-content"><section class="seo-panel"><p class="seo-eyebrow">404</p><h1 class="seo-title">${title}</h1><p class="seo-lead">This public page is unavailable or is no longer published.</p><nav class="seo-actions" aria-label="Return to public content"><a href="${collectionPath}">${isBlog ? "Browse Edutu guides" : "Browse active opportunities"}</a></nav></section></main>`;
    return this.page(
      res,
      {
        title: `${title} | Edutu`,
        description:
          "The requested Edutu page is unavailable. Browse current public content instead.",
        image: `${this.base}/icons/icon-512x512.png`,
        imageAlt: "Edutu",
        url: `${this.base}${collectionPath}`,
        ogType: "website",
        ctaLabel: "Browse Edutu",
      },
      body,
      {
        statusCode: 404,
        noindex: true,
        useShell: kind !== "category",
        cacheControl: ERROR_CACHE,
      },
    );
  }

  private async unavailable(
    res: Response,
    collectionPath: "/blog" | "/opportunities",
  ): Promise<string> {
    res.setHeader("Retry-After", String(RETRY_AFTER_SECONDS));
    const body = `<main class="seo-main" id="main-content"><section class="seo-panel"><p class="seo-eyebrow">Temporary service interruption</p><h1 class="seo-title">Content temporarily unavailable</h1><p class="seo-lead">Edutu could not load this public content safely. Please retry shortly rather than relying on an incomplete page.</p><nav class="seo-actions"><a href="${collectionPath}">Retry this collection</a></nav></section></main>`;
    return this.page(
      res,
      {
        title: "Content temporarily unavailable | Edutu",
        description:
          "Edutu could not load this public content safely. Please retry shortly.",
        image: `${this.base}/icons/icon-512x512.png`,
        imageAlt: "Edutu",
        url: `${this.base}${collectionPath}`,
        ogType: "website",
        ctaLabel: "Retry Edutu",
      },
      body,
      {
        statusCode: 503,
        noindex: true,
        cacheControl: ERROR_CACHE,
      },
    );
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("sitemap.xml")
  async sitemap(@Res({ passthrough: true }) res: Response): Promise<string> {
    try {
      const inventory = await this.catalog.getSitemapInventory();
      this.assertInventory(inventory);
      const entries = this.sitemapEntries(inventory);

      res.status(200);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", DISCOVERY_CACHE);
      res.setHeader(
        "X-Edutu-Seo-Inventory",
        `blog=${inventory.blogPosts.length};opportunities=${inventory.opportunities.length}`,
      );
      return renderSitemap(entries);
    } catch {
      res.status(503);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", ERROR_CACHE);
      res.setHeader("Retry-After", String(RETRY_AFTER_SECONDS));
      res.setHeader("X-Robots-Tag", "noindex, follow");
      return renderSitemap([]);
    }
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("robots.txt")
  robots(@Res({ passthrough: true }) res: Response): string {
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", DISCOVERY_CACHE);
    return renderRobots(this.base);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get("inventory")
  async inventory(@Res({ passthrough: true }) res: Response): Promise<{
    blogPosts: number;
    opportunities: number;
    generatedAt: string;
  }> {
    const inventory = await this.catalog.getSitemapInventory();
    res.status(200);
    res.setHeader("Cache-Control", "no-store");
    return {
      blogPosts: inventory.blogPosts.length,
      opportunities: inventory.opportunities.length,
      generatedAt: inventory.generatedAt.toISOString(),
    };
  }

  @Public()
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  @Get("blog")
  async blogArchive(
    @Query("page") pageInput: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const requestedPage = parsePage(pageInput);
    try {
      const result = await this.catalog.getBlogPage(requestedPage, 12);
      const canonical = pageUrl(this.base, "/blog", result.page);
      const meta: OgPageMeta = {
        title:
          result.page > 1
            ? `Edutu opportunity guides — Page ${result.page}`
            : "Edutu opportunity guides | Scholarships, careers and applications",
        description:
          "Practical scholarship, career and opportunity application guides for African students and early-career professionals.",
        image: `${this.base}/og/blog.jpg`,
        imageAlt: "Edutu opportunity guides",
        url: canonical,
        ogType: "website",
        ctaLabel: "Read Edutu guides",
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: "Edutu opportunity guides",
              description:
                "Practical scholarship, career and opportunity application guides.",
              url: canonical,
            },
            itemList(
              this.base,
              result.items.map((post) => ({
                title: post.title,
                path: `/blog/${encodeURIComponent(post.slug)}`,
              })),
            ),
            breadcrumbList(this.base, [{ name: "Blog", path: "/blog" }]),
          ],
        },
      };
      return this.page(
        res,
        meta,
        renderBlogArchiveBody({
          posts: result.items,
          page: result.page,
          totalPages: result.totalPages,
          basePath: "/blog",
        }),
      );
    } catch {
      return this.unavailable(res, "/blog");
    }
  }

  @Public()
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  @Get("blog/:slug")
  async blogPost(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    try {
      const post = await this.catalog.getBlogPost(slug);
      if (!post) return this.notFound(res, "blog");
      return this.renderBlogPost(res, post);
    } catch {
      return this.unavailable(res, "/blog");
    }
  }

  private async renderBlogPost(
    res: Response,
    post: PublicBlogPost,
  ): Promise<string> {
    const url = `${this.base}/blog/${encodeURIComponent(post.slug)}`;
    const description =
      truncate(toPlainText(post.excerpt) || toPlainText(post.content), 160) ||
      `${post.title} — an Edutu opportunity guide.`;
    const image = safeAbsoluteImage(
      post.coverImage,
      `${this.base}/og/blog.jpg`,
    );
    const published = iso(post.publishedAt);
    const updated = iso(post.updatedAt);

    return this.page(
      res,
      {
        title: `${post.title} — Edutu Blog`,
        description,
        image,
        imageAlt: post.title,
        url,
        ogType: "article",
        ctaLabel: "Read this Edutu guide",
        jsonLd: {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BlogPosting",
              headline: post.title,
              description,
              url,
              mainEntityOfPage: url,
              image: [image],
              ...(published ? { datePublished: published } : {}),
              ...(updated ? { dateModified: updated } : {}),
              author: {
                "@type": "Person",
                name: clean(post.authorName) || "Edutu Editorial",
              },
              publisher: {
                "@type": "Organization",
                name: "Edutu",
                url: this.base,
                logo: {
                  "@type": "ImageObject",
                  url: `${this.base}/icons/icon-512x512.png`,
                },
              },
            },
            breadcrumbList(this.base, [
              { name: "Blog", path: "/blog" },
              {
                name: post.title,
                path: `/blog/${encodeURIComponent(post.slug)}`,
              },
            ]),
          ],
        },
      },
      renderBlogPostBody(post),
    );
  }

  @Public()
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  @Get("opportunities")
  async opportunityArchive(
    @Query("page") pageInput: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const requestedPage = parsePage(pageInput);
    try {
      const result = await this.catalog.getOpportunityPage(requestedPage, 24);
      const canonical = pageUrl(this.base, "/opportunities", result.page);
      const meta: OgPageMeta = {
        title:
          result.page > 1
            ? `Scholarships and opportunities — Page ${result.page} | Edutu`
            : "Scholarships, internships and fellowships | Edutu",
        description:
          "Browse active scholarships, internships, fellowships and learning programs with deadlines, eligibility information and official source links.",
        image: `${this.base}/og/opportunities.jpg`,
        imageAlt: "Edutu opportunities",
        url: canonical,
        ogType: "website",
        ctaLabel: "Browse Edutu opportunities",
        jsonLd: this.archiveJsonLd(
          canonical,
          "Edutu opportunities",
          result.items,
          "/opportunities",
        ),
      };
      return this.page(
        res,
        meta,
        renderOpportunityArchiveBody({
          opportunities: result.items,
          page: result.page,
          totalPages: result.totalPages,
          basePath: "/opportunities",
        }),
      );
    } catch {
      return this.unavailable(res, "/opportunities");
    }
  }

  @Public()
  @Throttle({ default: { limit: 180, ttl: 60000 } })
  @Get("opportunities/:category")
  async opportunityCategory(
    @Param("category") categoryInput: string,
    @Query("page") pageInput: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (!this.catalog.isCategory(categoryInput)) {
      return this.notFound(res, "category");
    }
    const category = categoryInput;
    const requestedPage = parsePage(pageInput);
    try {
      const result = await this.catalog.getOpportunityPage(
        requestedPage,
        24,
        category,
      );
      const path = `/opportunities/${category}`;
      const canonical = pageUrl(this.base, path, result.page);
      const copy = CATEGORY_COPY[category];
      const title =
        result.page > 1 ? `${copy.title} — Page ${result.page}` : copy.title;
      return this.page(
        res,
        {
          title,
          description: copy.description,
          image: `${this.base}/og/opportunities.jpg`,
          imageAlt: copy.heading,
          url: canonical,
          ogType: "website",
          ctaLabel: `Browse ${category}`,
          jsonLd: this.archiveJsonLd(
            canonical,
            copy.heading,
            result.items,
            path,
          ),
        },
        renderOpportunityArchiveBody({
          opportunities: result.items,
          page: result.page,
          totalPages: result.totalPages,
          basePath: path,
          heading: copy.heading,
          introduction: copy.description,
          category,
        }),
        { useShell: false },
      );
    } catch {
      return this.unavailable(res, "/opportunities");
    }
  }

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Get("opportunity/:id")
  async opportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.renderOpportunityPage(id, res, false);
  }

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60000 } })
  @Get("share/opportunity/:id")
  async shareOpportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.renderOpportunityPage(id, res, true);
  }

  private async renderOpportunityPage(
    id: string,
    res: Response,
    shareRoute: boolean,
  ): Promise<string> {
    try {
      const opportunity = await this.catalog.getOpportunity(id);
      if (!opportunity) return this.notFound(res, "opportunity");

      const primaryPath = `/opportunity/${encodeURIComponent(opportunity.id)}`;
      const url = `${this.base}${primaryPath}`;
      const description =
        truncate(
          toPlainText(opportunity.summary) ||
            toPlainText(opportunity.description),
          180,
        ) || `${opportunity.title} on Edutu.`;
      const image = safeAbsoluteImage(
        opportunity.imageUrl,
        `${this.base}/og/opportunities.jpg`,
      );
      const modified = iso(opportunity.updatedAt || opportunity.createdAt);
      const about = [
        clean(opportunity.organization)
          ? {
              "@type": "Organization",
              name: clean(opportunity.organization),
            }
          : null,
        clean(opportunity.category)
          ? { "@type": "Thing", name: clean(opportunity.category) }
          : null,
      ].filter(Boolean);

      return this.page(
        res,
        {
          title: `${opportunity.title} | Edutu`,
          description,
          image,
          imageAlt: opportunity.title,
          url,
          ogType: "article",
          ctaLabel: "View this opportunity on Edutu",
          jsonLd: {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                name: opportunity.title,
                description,
                url,
                primaryImageOfPage: {
                  "@type": "ImageObject",
                  url: image,
                },
                ...(modified ? { dateModified: modified } : {}),
                ...(about.length > 0 ? { about } : {}),
                isPartOf: {
                  "@type": "WebSite",
                  name: "Edutu",
                  url: this.base,
                },
              },
              breadcrumbList(this.base, [
                { name: "Opportunities", path: "/opportunities" },
                { name: opportunity.title, path: primaryPath },
              ]),
            ],
          },
        },
        renderOpportunityBody(opportunity),
        { noindex: shareRoute },
      );
    } catch {
      return this.unavailable(res, "/opportunities");
    }
  }

  private archiveJsonLd(
    canonical: string,
    name: string,
    opportunities: PublicOpportunity[],
    path: string,
  ): Record<string, unknown> {
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          name,
          url: canonical,
        },
        itemList(
          this.base,
          opportunities.map((opportunity) => ({
            title: opportunity.title,
            path: `/opportunity/${encodeURIComponent(opportunity.id)}`,
          })),
        ),
        breadcrumbList(this.base, [
          { name: "Opportunities", path: "/opportunities" },
          ...(path === "/opportunities" ? [] : [{ name, path }]),
        ]),
      ],
    };
  }

  private sitemapEntries(inventory: SeoInventory): SitemapEntry[] {
    const generated = inventory.generatedAt;
    const staticEntries: SitemapEntry[] = [
      { loc: `${this.base}/`, lastmod: generated },
      { loc: `${this.base}/blog`, lastmod: generated },
      { loc: `${this.base}/opportunities`, lastmod: generated },
      ...SEO_CATEGORIES.map((category) => ({
        loc: `${this.base}/opportunities/${category}`,
        lastmod: generated,
      })),
    ];
    const blogEntries = inventory.blogPosts.map((post) => ({
      loc: `${this.base}/blog/${encodeURIComponent(post.slug)}`,
      lastmod: post.updatedAt || post.publishedAt || generated,
    }));
    const opportunityEntries = inventory.opportunities.map((opportunity) => ({
      loc: `${this.base}/opportunity/${encodeURIComponent(opportunity.id)}`,
      lastmod: opportunity.updatedAt || opportunity.createdAt || generated,
    }));
    return [...staticEntries, ...blogEntries, ...opportunityEntries];
  }

  private assertInventory(inventory: SeoInventory): void {
    const production = process.env.NODE_ENV === "production";
    const minimumBlog = Number(
      process.env.SEO_MIN_BLOG_URLS ?? (production ? "1" : "0"),
    );
    const minimumOpportunities = Number(
      process.env.SEO_MIN_OPPORTUNITY_URLS ?? (production ? "1" : "0"),
    );
    if (
      inventory.blogPosts.length < Math.max(0, minimumBlog) ||
      inventory.opportunities.length < Math.max(0, minimumOpportunities)
    ) {
      throw new ServiceUnavailableException(
        "SEO sitemap inventory is below the configured release minimum",
      );
    }
  }
}
