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
import { BlogService } from "../blog/blog.service";
import { EventsService } from "../events/events.service";
import { SpaShellService } from "../og/spa-shell.service";
import { normalizeCategory } from "../opportunities/opportunity-categorization";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import {
  firstText,
  firstValue,
  formatDate,
  isoDate,
  opportunitySearchText,
  parsePage,
  renderBlogArchiveBody,
  renderListSection,
  renderOpportunityArchiveBody,
  renderParagraphs,
  renderUrlSet,
  stringList,
  type SeoRecord,
} from "./seo-content";
import {
  findSeoCategory,
  SEO_CATEGORIES,
  STATIC_INDEXABLE_PATHS,
  type SeoCategory,
} from "./seo-data";
import {
  escapeAttribute,
  escapeHtml,
  injectSeoIntoShell,
  renderSeoDocument,
  safeHttpUrl,
  truncateText,
  type SeoJsonLd,
  type SeoPageDocument,
} from "./seo-render";

const OPPORTUNITY_PAGE_SIZE = 12;
const BLOG_PAGE_SIZE = 12;
const SITEMAP_BATCH_SIZE = 100;
const MAX_BLOG_SITEMAP_POSTS = 1000;
const MAX_EVENT_SITEMAP_EVENTS = 5000;

@Public()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller("seo")
export class SeoController {
  constructor(
    private readonly opportunities: OpportunitiesService,
    private readonly blog: BlogService,
    private readonly events: EventsService,
    private readonly shell: SpaShellService,
  ) {}

  private get base(): string {
    return this.opportunities
      .getPublicAppBaseUrl()
      .replace(/\/+$/, "")
      .replace(/^https?:\/\/edutu\.org(?=\/|$)/i, "https://www.edutu.org");
  }

  private absolute(pathname: string): string {
    return new URL(pathname, `${this.base}/`).toString();
  }

  private defaultImage(
    section: "blog" | "events" | "opportunities" = "opportunities",
  ): string {
    return `${this.base}/og/${section}.jpg`;
  }

  private xmlResponse(res: Response): void {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, max-age=900, s-maxage=3600, stale-while-revalidate=3600",
    );
  }

  private prepareHtmlResponse(
    res: Response,
    status: number,
    robots: string,
    cacheControl: string,
  ): void {
    res.status(status);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Language", "en");
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("Vary", "Accept-Encoding");
    if (robots.toLowerCase().includes("noindex")) {
      res.setHeader("X-Robots-Tag", robots);
    }
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Origin-Agent-Cluster");
  }

  private async respond(
    res: Response,
    page: SeoPageDocument,
    options: {
      status?: number;
      useShell?: boolean;
      cacheControl?: string;
    } = {},
  ): Promise<string> {
    const status = options.status ?? 200;
    const useShell = options.useShell !== false && status < 400;
    this.prepareHtmlResponse(
      res,
      status,
      page.robots,
      options.cacheControl ??
        (status >= 400
          ? "public, max-age=0, s-maxage=60"
          : "public, max-age=0, s-maxage=300, stale-while-revalidate=600"),
    );

    if (useShell) {
      const appShell = await this.shell.get(this.base);
      const injected = appShell ? injectSeoIntoShell(appShell, page) : null;
      if (injected) {
        res.setHeader("X-Seo-Source", "backend/seo-shell");
        return injected;
      }
    }

    res.setHeader("X-Seo-Source", "backend/seo-document");
    return renderSeoDocument(page);
  }

  private notFoundPage(
    resource: string,
    canonicalUrl: string,
  ): SeoPageDocument {
    return {
      title: `${resource} not found | Edutu`,
      description:
        "This Edutu page is unavailable. Browse current verified opportunities and application guides instead.",
      canonicalUrl,
      imageUrl: this.defaultImage(),
      imageAlt: "Edutu opportunities",
      ogType: "website",
      robots: "noindex, follow",
      bodyHtml: [
        '<main id="seo-content">',
        '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/opportunities">Opportunities</a></nav>',
        '<p class="seo-kicker">Edutu</p>',
        `<h1>${escapeHtml(resource)} not found</h1>`,
        '<p class="seo-lead">The page may have been removed, unpublished or entered incorrectly.</p>',
        '<section class="seo-panel seo-trust"><h2>Continue discovering</h2><p>Browse current scholarships, internships, fellowships, grants and application guides.</p><p><a href="/opportunities">Browse opportunities</a> · <a href="/blog">Read application guides</a></p></section>',
        "</main>",
      ].join(""),
    };
  }

  private breadcrumbJsonLd(
    items: Array<{ name: string; path: string }>,
  ): Record<string, unknown> {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: this.absolute(item.path),
      })),
    };
  }

  private publisherJsonLd(): Record<string, unknown> {
    return {
      "@type": "Organization",
      name: "Edutu",
      url: this.base,
      logo: {
        "@type": "ImageObject",
        url: `${this.base}/icons/icon-512x512.png`,
      },
    };
  }

  private assertMinimum(
    source: "blog" | "opportunities",
    count: number,
    productionDefault: number,
  ): void {
    const envName =
      source === "blog" ? "SEO_MIN_BLOG_URLS" : "SEO_MIN_OPPORTUNITY_URLS";
    const configured = process.env[envName];
    const parsed = configured === undefined ? Number.NaN : Number(configured);
    const minimum = Number.isFinite(parsed)
      ? Math.max(0, Math.floor(parsed))
      : process.env.NODE_ENV === "production"
        ? productionDefault
        : 0;
    if (count < minimum) {
      throw new ServiceUnavailableException(
        `${source} sitemap contained ${count} URLs; minimum required is ${minimum}`,
      );
    }
  }

  @Get("sitemap.xml")
  sitemapIndex(@Res({ passthrough: true }) res: Response): string {
    this.xmlResponse(res);
    const today = new Date().toISOString().slice(0, 10);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...["pages", "blog", "opportunities", "events"].flatMap((name) => [
        "  <sitemap>",
        `    <loc>${this.absolute(`/sitemaps/${name}.xml`)}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "  </sitemap>",
      ]),
      "</sitemapindex>",
      "",
    ].join("\n");
  }

  @Get("sitemaps/pages.xml")
  pagesSitemap(@Res({ passthrough: true }) res: Response): string {
    this.xmlResponse(res);
    const generatedAt = new Date();
    return renderUrlSet([
      ...STATIC_INDEXABLE_PATHS.map((pathname) => ({
        loc: this.absolute(pathname),
        lastmod: generatedAt,
        changefreq:
          pathname === "/opportunities" || pathname === "/blog"
            ? "daily"
            : "monthly",
        priority:
          pathname === "/opportunities"
            ? "1.0"
            : pathname === "/blog"
              ? "0.9"
              : pathname === "/"
                ? "0.8"
                : "0.6",
      })),
      ...SEO_CATEGORIES.map((category) => ({
        loc: this.absolute(`/opportunities/${category.slug}`),
        lastmod: generatedAt,
        changefreq: "daily",
        priority: "0.9",
      })),
    ]);
  }

  @Get("sitemaps/blog.xml")
  async blogSitemap(
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    this.xmlResponse(res);
    const posts = await this.loadAllBlogPosts();
    this.assertMinimum("blog", posts.length, 1);
    return renderUrlSet(
      posts.map((post) => ({
        loc: this.absolute(`/blog/${encodeURIComponent(String(post.slug))}`),
        lastmod:
          post.updatedAt ??
          post.updated_at ??
          post.publishedAt ??
          post.published_at,
        changefreq: "monthly",
        priority: "0.7",
      })),
    );
  }

  @Get("sitemaps/opportunities.xml")
  async opportunitiesSitemap(
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    this.xmlResponse(res);
    let rows: Array<{
      id: string;
      updatedAt: Date | string | null;
      createdAt: Date | string | null;
    }>;
    try {
      rows = await this.opportunities.listSitemapOpportunities(50_000);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Opportunity sitemap source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.assertMinimum("opportunities", rows.length, 1);
    return renderUrlSet(
      rows.map((row) => ({
        loc: this.absolute(`/opportunity/${encodeURIComponent(row.id)}`),
        lastmod: row.updatedAt ?? row.createdAt,
        changefreq: "weekly",
        priority: "0.8",
      })),
    );
  }

  @Get("sitemaps/events.xml")
  async eventsSitemap(
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    this.xmlResponse(res);
    const events = await this.loadAllEvents();
    return renderUrlSet(
      events.map((event) => ({
        loc: this.absolute(
          `/events/${encodeURIComponent(String(event.slug || event.id))}`,
        ),
        lastmod:
          event.updatedAt ??
          event.updated_at ??
          event.startsAt ??
          event.starts_at,
        changefreq: "weekly",
        priority: "0.7",
      })),
    );
  }

  @Get("robots.txt")
  robots(@Res({ passthrough: true }) res: Response): string {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900, s-maxage=3600");
    return [
      "User-agent: *",
      "Allow: /",
      "Disallow: /app/",
      "Disallow: /admin/",
      "Disallow: /auth",
      "Disallow: /auth/callback",
      "",
      `Sitemap: ${this.absolute("/sitemap.xml")}`,
      "",
    ].join("\n");
  }

  @Get("blog")
  async blogArchive(
    @Query("page") pageRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const page = parsePage(pageRaw);
    let posts: SeoRecord[];
    try {
      posts = (await this.blog.findAll({
        status: "published",
        limit: BLOG_PAGE_SIZE + 1,
        offset: (page - 1) * BLOG_PAGE_SIZE,
      })) as unknown as SeoRecord[];
    } catch (error) {
      throw new ServiceUnavailableException(
        `Blog archive unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const hasNext = posts.length > BLOG_PAGE_SIZE;
    const visible = posts.slice(0, BLOG_PAGE_SIZE);
    const canonicalPath = page > 1 ? `/blog?page=${page}` : "/blog";
    const canonicalUrl = this.absolute(canonicalPath);
    if (page > 1 && visible.length === 0) {
      return this.respond(res, this.notFoundPage("Blog page", canonicalUrl), {
        status: 404,
        useShell: false,
      });
    }
    const description =
      "Practical scholarship, career and application guides from Edutu, with opportunity explainers and evidence-based advice.";
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Edutu opportunity and application guides",
        description,
        url: canonicalUrl,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: visible.map((post, index) => ({
            "@type": "ListItem",
            position: (page - 1) * BLOG_PAGE_SIZE + index + 1,
            name: firstText(post, ["title"]),
            url: this.absolute(
              `/blog/${encodeURIComponent(String(post.slug))}`,
            ),
          })),
        },
      },
      this.breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Blog", path: canonicalPath },
      ]),
    ];

    return this.respond(res, {
      title:
        page > 1
          ? `Edutu blog — Page ${page}`
          : "Edutu blog | Opportunity and application guides",
      description,
      canonicalUrl,
      imageUrl: this.defaultImage("blog"),
      imageAlt: "Edutu opportunity and application guides",
      ogType: "website",
      robots: "index, follow, max-image-preview:large",
      bodyHtml: renderBlogArchiveBody({ posts: visible, page, hasNext }),
      jsonLd,
    });
  }

  @Get("blog/:slug")
  async blogPost(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const canonicalUrl = this.absolute(`/blog/${encodeURIComponent(slug)}`);
    let post: SeoRecord | null;
    try {
      post = (await this.blog.peekBySlug(slug)) as unknown as SeoRecord | null;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Blog post source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!post || post.status !== "published") {
      return this.respond(res, this.notFoundPage("Blog post", canonicalUrl), {
        status: 404,
        useShell: false,
      });
    }

    const title = firstText(post, ["title"]) || "Edutu guide";
    const articleBody = firstText(post, ["content", "body"]);
    const description =
      truncateText(firstText(post, ["excerpt"]) || articleBody, 160) ||
      `${title} — guidance from Edutu.`;
    const author =
      firstText(post, ["authorName", "author_name"]) || "Edutu Editorial Team";
    const publishedAt = firstValue(post, [
      "publishedAt",
      "published_at",
      "createdAt",
      "created_at",
    ]);
    const updatedAt = firstValue(post, ["updatedAt", "updated_at"]);
    const image =
      safeHttpUrl(firstValue(post, ["coverImage", "cover_image"])) ||
      this.defaultImage("blog");
    const publishedIso = isoDate(publishedAt);
    const updatedIso = isoDate(updatedAt);
    const bodyHtml = [
      '<main id="seo-content" class="seo-detail">',
      '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/blog">Blog</a></nav>',
      '<p class="seo-kicker">Edutu guide</p>',
      `<h1>${escapeHtml(title)}</h1>`,
      `<p class="seo-lead">${escapeHtml(description)}</p>`,
      `<p class="seo-muted">By ${escapeHtml(author)}`,
      publishedAt ? ` · Published ${escapeHtml(formatDate(publishedAt))}` : "",
      updatedAt ? ` · Updated ${escapeHtml(formatDate(updatedAt))}` : "",
      "</p>",
      `<article class="seo-panel">${renderParagraphs(articleBody || description)}</article>`,
      '<aside class="seo-panel seo-trust"><h2>Editorial note</h2><p>Edutu publishes practical guidance to help applicants understand opportunities. Always confirm programme-specific rules and deadlines with the official provider.</p><p><a href="/opportunities">Browse current opportunities</a></p></aside>',
      "</main>",
    ].join("");
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        url: canonicalUrl,
        image: [image],
        ...(publishedIso ? { datePublished: publishedIso } : {}),
        ...(updatedIso ? { dateModified: updatedIso } : {}),
        author: { "@type": "Person", name: author },
        publisher: this.publisherJsonLd(),
      },
      this.breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blog" },
        { name: title, path: `/blog/${encodeURIComponent(slug)}` },
      ]),
    ];

    return this.respond(res, {
      title: `${title} — Edutu Blog`,
      description,
      canonicalUrl,
      imageUrl: image,
      imageAlt: title,
      ogType: "article",
      robots: "index, follow, max-image-preview:large",
      bodyHtml,
      jsonLd,
    });
  }

  @Get("opportunities")
  async opportunitiesArchive(
    @Query("category") categoryRaw: string | undefined,
    @Query("page") pageRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const category = categoryRaw ? findSeoCategory(categoryRaw) : null;
    if (categoryRaw && !category) {
      return this.respond(
        res,
        this.notFoundPage(
          "Opportunity category",
          this.absolute(
            `/opportunities?category=${encodeURIComponent(categoryRaw)}`,
          ),
        ),
        { status: 404, useShell: false },
      );
    }
    return this.renderOpportunityArchive(
      category,
      parsePage(pageRaw),
      res,
      true,
    );
  }

  @Get("opportunities/:category")
  async opportunityCategory(
    @Param("category") categoryRaw: string,
    @Query("page") pageRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const category = findSeoCategory(categoryRaw);
    if (!category) {
      return this.respond(
        res,
        this.notFoundPage(
          "Opportunity category",
          this.absolute(`/opportunities/${encodeURIComponent(categoryRaw)}`),
        ),
        { status: 404, useShell: false },
      );
    }
    return this.renderOpportunityArchive(
      category,
      parsePage(pageRaw),
      res,
      false,
    );
  }

  @Get("opportunity/:id")
  async opportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.renderOpportunityDetail(id, res, false);
  }

  @Get("share/opportunity/:id")
  async shareOpportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.renderOpportunityDetail(id, res, true);
  }

  @Get("event/:slugOrId")
  async event(
    @Param("slugOrId") slugOrId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const canonicalUrl = this.absolute(
      `/events/${encodeURIComponent(slugOrId)}`,
    );
    let event: SeoRecord | null;
    try {
      event = (await this.events.findOne(
        slugOrId,
      )) as unknown as SeoRecord | null;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Event source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!event || event.status !== "published") {
      return this.respond(res, this.notFoundPage("Event", canonicalUrl), {
        status: 404,
        useShell: false,
      });
    }

    const title = firstText(event, ["title"]) || "Edutu event";
    const description =
      truncateText(firstText(event, ["summary", "description"]), 180) ||
      "Join this opportunity session from Edutu.";
    const startsAt = firstValue(event, ["startsAt", "starts_at"]);
    const endsAt = firstValue(event, ["endsAt", "ends_at"]);
    const startsIso = isoDate(startsAt);
    const endsIso = isoDate(endsAt);
    const location = firstText(event, ["location"]);
    const isOnline = Boolean(event.isOnline ?? event.is_online);
    const image =
      safeHttpUrl(firstValue(event, ["imageUrl", "image_url"])) ||
      this.defaultImage("events");
    const bodyHtml = [
      '<main id="seo-content" class="seo-detail">',
      '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/events">Events</a></nav>',
      '<p class="seo-kicker">Edutu event</p>',
      `<h1>${escapeHtml(title)}</h1>`,
      `<p class="seo-lead">${escapeHtml(description)}</p>`,
      '<section class="seo-panel"><h2>Event details</h2><p>',
      startsAt
        ? `<strong>Date:</strong> ${escapeHtml(formatDate(startsAt))}<br>`
        : "",
      location ? `<strong>Location:</strong> ${escapeHtml(location)}<br>` : "",
      isOnline ? "<strong>Format:</strong> Online" : "",
      "</p>",
      renderParagraphs(firstText(event, ["description"])),
      "</section>",
      '<aside class="seo-panel seo-trust"><h2>Before registering</h2><p>Confirm the current schedule, access requirements and registration terms with the event organiser.</p><p><a href="/events">See more Edutu events</a></p></aside>',
      "</main>",
    ].join("");
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "Event",
        name: title,
        description,
        url: canonicalUrl,
        image: [image],
        ...(startsIso ? { startDate: startsIso } : {}),
        ...(endsIso ? { endDate: endsIso } : {}),
        eventAttendanceMode: isOnline
          ? "https://schema.org/OnlineEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
        ...(location ? { location: { "@type": "Place", name: location } } : {}),
        organizer: this.publisherJsonLd(),
      },
      this.breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Events", path: "/events" },
        { name: title, path: `/events/${encodeURIComponent(slugOrId)}` },
      ]),
    ];

    return this.respond(res, {
      title: `${title} | Edutu`,
      description,
      canonicalUrl,
      imageUrl: image,
      imageAlt: title,
      ogType: "article",
      robots: "index, follow, max-image-preview:large",
      bodyHtml,
      jsonLd,
    });
  }

  private async renderOpportunityArchive(
    category: SeoCategory | null,
    page: number,
    res: Response,
    useShell: boolean,
  ): Promise<string> {
    const loaded = await this.loadOpportunityArchivePage(category, page);
    const canonicalPath = category
      ? `/opportunities/${category.slug}${page > 1 ? `?page=${page}` : ""}`
      : `/opportunities${page > 1 ? `?page=${page}` : ""}`;
    const canonicalUrl = this.absolute(canonicalPath);
    if (page > 1 && loaded.items.length === 0) {
      return this.respond(
        res,
        this.notFoundPage("Opportunity page", canonicalUrl),
        { status: 404, useShell: false },
      );
    }
    const title = category
      ? category.title
      : page > 1
        ? `Updated opportunities — Page ${page} | Edutu`
        : "Updated scholarships, internships, grants and fellowships | Edutu";
    const description =
      category?.description ||
      "Explore verified scholarships, internships, fellowships, grants, graduate programs and application opportunities with deadlines and official sources.";
    const jsonLd: Array<Record<string, unknown>> = [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: category?.label || "Edutu opportunities",
        description,
        url: canonicalUrl,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: loaded.items.length,
          itemListElement: loaded.items.map((item, index) => ({
            "@type": "ListItem",
            position: (page - 1) * OPPORTUNITY_PAGE_SIZE + index + 1,
            name: firstText(item, ["title"]),
            url: this.absolute(
              `/opportunity/${encodeURIComponent(String(item.id))}`,
            ),
          })),
        },
      },
      this.breadcrumbJsonLd(
        category
          ? [
              { name: "Home", path: "/" },
              { name: "Opportunities", path: "/opportunities" },
              { name: category.label, path: canonicalPath },
            ]
          : [
              { name: "Home", path: "/" },
              { name: "Opportunities", path: canonicalPath },
            ],
      ),
    ];
    if (category) {
      jsonLd.push({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: category.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      });
    }

    return this.respond(
      res,
      {
        title,
        description,
        canonicalUrl,
        imageUrl: this.defaultImage("opportunities"),
        imageAlt: category
          ? `${category.label} on Edutu`
          : "Verified opportunities on Edutu",
        ogType: "website",
        robots: "index, follow, max-image-preview:large",
        bodyHtml: renderOpportunityArchiveBody({
          items: loaded.items,
          category,
          page,
          hasNext: loaded.hasNext,
        }),
        jsonLd,
      },
      {
        useShell,
        cacheControl:
          "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      },
    );
  }

  private async renderOpportunityDetail(
    id: string,
    res: Response,
    shareSurface: boolean,
  ): Promise<string> {
    const canonicalPath = `/opportunity/${encodeURIComponent(id)}`;
    const canonicalUrl = this.absolute(canonicalPath);
    let opportunity: SeoRecord | null;
    try {
      opportunity = (await this.opportunities.findOne(
        id,
      )) as unknown as SeoRecord | null;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Opportunity source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!opportunity || !opportunity.id) {
      return this.respond(res, this.notFoundPage("Opportunity", canonicalUrl), {
        status: 404,
        useShell: false,
      });
    }

    const title = firstText(opportunity, ["title"]) || "Opportunity on Edutu";
    const summary = firstText(opportunity, [
      "aiSummary",
      "ai_summary",
      "refined_summary",
      "summary",
    ]);
    const descriptionText = firstText(opportunity, ["description"]);
    const description =
      truncateText(summary || descriptionText, 190) ||
      "Review this verified opportunity, its eligibility, deadline and official application source on Edutu.";
    const organization =
      firstText(opportunity, ["organization", "provider", "company"]) ||
      "Opportunity provider";
    const categoryName =
      normalizeCategory(
        firstValue(opportunity, ["canonical_category", "category"]),
      ) || "programs";
    const category =
      SEO_CATEGORIES.find(
        (item) => item.canonicalCategory === categoryName && !item.keywords,
      ) || SEO_CATEGORIES.find((item) => item.slug === "programs")!;
    const deadline = firstValue(opportunity, [
      "deadline",
      "close_date",
      "deadline_date",
    ]);
    const deadlineIso = isoDate(deadline);
    const location = firstText(opportunity, [
      "location",
      "targetRegion",
      "target_region",
    ]);
    const funding = firstText(opportunity, [
      "fundingType",
      "funding_type",
      "funding",
      "stipend",
    ]);
    const eligibility = firstText(opportunity, [
      "eligibilityCriteria",
      "eligibility_criteria",
      "eligibility",
    ]);
    const benefits = stringList(firstValue(opportunity, ["benefits"]));
    const requirements = stringList(
      firstValue(opportunity, ["requirements", "required_documents"]),
    );
    const applicationSteps = stringList(
      firstValue(opportunity, [
        "applicationProcess",
        "application_process",
        "how_to_apply",
      ]),
    );
    const sourceUrl = safeHttpUrl(
      firstValue(opportunity, [
        "sourceUrl",
        "source_url",
        "canonical_url",
        "applicationUrl",
        "application_url",
        "applyUrl",
        "apply_url",
      ]),
    );
    const applyUrl = safeHttpUrl(
      firstValue(opportunity, [
        "applicationUrl",
        "application_url",
        "applyUrl",
        "apply_url",
        "sourceUrl",
        "source_url",
      ]),
    );
    const updatedAt = firstValue(opportunity, [
      "updatedAt",
      "updated_at",
      "lastUpdated",
      "last_updated",
      "createdAt",
      "created_at",
    ]);
    const image =
      safeHttpUrl(
        firstValue(opportunity, [
          "image_url",
          "imageUrl",
          "source_image_url",
          "share_image_url",
        ]),
      ) || this.defaultImage("opportunities");
    const detailCopy = descriptionText || summary || description;
    const bodyHtml = [
      '<main id="seo-content" class="seo-detail">',
      '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/opportunities">Opportunities</a><span aria-hidden="true">/</span>',
      `<a href="/opportunities/${escapeAttribute(category.slug)}">${escapeHtml(category.label)}</a></nav>`,
      `<p class="seo-kicker">${escapeHtml(category.label)}</p>`,
      `<h1>${escapeHtml(title)}</h1>`,
      `<p class="seo-lead">${escapeHtml(description)}</p>`,
      '<section class="seo-panel"><h2>Opportunity overview</h2><p>',
      `<strong>Provider:</strong> ${escapeHtml(organization)}`,
      deadline
        ? `<br><strong>Deadline:</strong> ${escapeHtml(formatDate(deadline))}`
        : "",
      location
        ? `<br><strong>Location or eligibility region:</strong> ${escapeHtml(location)}`
        : "",
      funding ? `<br><strong>Funding:</strong> ${escapeHtml(funding)}` : "",
      "</p>",
      renderParagraphs(detailCopy),
      "</section>",
      eligibility
        ? `<section class="seo-panel"><h2>Eligibility</h2><p>${escapeHtml(eligibility)}</p></section>`
        : "",
      renderListSection("Benefits", benefits),
      renderListSection("Requirements", requirements),
      renderListSection("Application process", applicationSteps),
      '<section class="seo-panel seo-trust"><h2>Source and verification</h2>',
      "<p>Edutu organises opportunity information to make it easier to understand. The provider's official page remains the final authority for eligibility, funding, deadlines and selection decisions.</p>",
      updatedAt
        ? `<p><strong>Last checked or updated:</strong> ${escapeHtml(formatDate(updatedAt))}</p>`
        : "",
      sourceUrl
        ? `<p><a href="${escapeAttribute(sourceUrl)}" rel="nofollow noopener noreferrer">Review the official source</a></p>`
        : '<p class="seo-muted">An official source link was not available in this record. Confirm the opportunity independently before sharing personal information.</p>',
      applyUrl
        ? `<p><a href="${escapeAttribute(applyUrl)}" rel="nofollow noopener noreferrer">Open the official application page</a></p>`
        : "",
      "</section>",
      '<aside class="seo-panel"><h2>Continue your search</h2><p>',
      `<a href="/opportunities/${escapeAttribute(category.slug)}">See more ${escapeHtml(category.label.toLowerCase())}</a> · `,
      '<a href="/blog">Read Edutu application guides</a></p></aside>',
      "</main>",
    ].join("");
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "EducationalOccupationalProgram",
        name: title,
        description,
        url: canonicalUrl,
        image,
        category: category.label,
        provider: { "@type": "Organization", name: organization },
        ...(deadlineIso
          ? {
              applicationDeadline: deadlineIso,
              validThrough: deadlineIso,
            }
          : {}),
        publisher: this.publisherJsonLd(),
      },
      this.breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Opportunities", path: "/opportunities" },
        {
          name: category.label,
          path: `/opportunities/${category.slug}`,
        },
        { name: title, path: canonicalPath },
      ]),
    ];

    return this.respond(
      res,
      {
        title: `${title} | Edutu`,
        description,
        canonicalUrl,
        imageUrl: image,
        imageAlt: title,
        ogType: "article",
        robots: shareSurface
          ? "noindex, follow, max-image-preview:large"
          : "index, follow, max-image-preview:large",
        bodyHtml,
        jsonLd,
      },
      {
        cacheControl:
          "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      },
    );
  }

  private async loadOpportunityArchivePage(
    category: SeoCategory | null,
    page: number,
  ): Promise<{ items: SeoRecord[]; hasNext: boolean }> {
    const offset = (page - 1) * OPPORTUNITY_PAGE_SIZE;
    try {
      if (category?.keywords) {
        const candidates = (await this.opportunities.findAll(
          100,
          0,
          "active",
          category.canonicalCategory,
        )) as unknown as SeoRecord[];
        const filtered = candidates.filter((item) =>
          category.keywords!.test(opportunitySearchText(item)),
        );
        return {
          items: filtered.slice(offset, offset + OPPORTUNITY_PAGE_SIZE),
          hasNext: filtered.length > offset + OPPORTUNITY_PAGE_SIZE,
        };
      }

      const rows = (await this.opportunities.findAll(
        OPPORTUNITY_PAGE_SIZE + 1,
        offset,
        "active",
        category?.canonicalCategory,
      )) as unknown as SeoRecord[];
      return {
        items: rows.slice(0, OPPORTUNITY_PAGE_SIZE),
        hasNext: rows.length > OPPORTUNITY_PAGE_SIZE,
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        `Opportunity archive unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadAllBlogPosts(): Promise<SeoRecord[]> {
    const all: SeoRecord[] = [];
    try {
      for (
        let offset = 0;
        offset < MAX_BLOG_SITEMAP_POSTS;
        offset += SITEMAP_BATCH_SIZE
      ) {
        const batch = (await this.blog.findAll({
          status: "published",
          limit: SITEMAP_BATCH_SIZE,
          offset,
        })) as unknown as SeoRecord[];
        all.push(...batch.filter((post) => post.slug));
        if (batch.length < SITEMAP_BATCH_SIZE) break;
      }
      return all.slice(0, MAX_BLOG_SITEMAP_POSTS);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Blog sitemap source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadAllEvents(): Promise<SeoRecord[]> {
    const all: SeoRecord[] = [];
    try {
      for (
        let offset = 0;
        offset < MAX_EVENT_SITEMAP_EVENTS;
        offset += SITEMAP_BATCH_SIZE
      ) {
        const batch = (await this.events.findAll({
          status: "published",
          limit: SITEMAP_BATCH_SIZE,
          offset,
        })) as unknown as SeoRecord[];
        all.push(...batch.filter((event) => event.slug || event.id));
        if (batch.length < SITEMAP_BATCH_SIZE) break;
      }
      return all.slice(0, MAX_EVENT_SITEMAP_EVENTS);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Event sitemap source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
