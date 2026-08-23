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
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { normalizeCategory } from "../opportunities/opportunity-categorization";
import {
  cleanText,
  escapeAttribute,
  escapeHtml,
  injectSeoIntoShell,
  renderSeoDocument,
  safeHttpUrl,
  truncateText,
  type SeoJsonLd,
  type SeoPageDocument,
} from "./seo-render";

type AnyRecord = Record<string, any>;

type CategoryConfig = {
  slug: string;
  canonicalCategory: string;
  label: string;
  title: string;
  description: string;
  introduction: string;
  aliases: string[];
  keywords?: RegExp;
  faqs: Array<{ question: string; answer: string }>;
};

const OPPORTUNITY_PAGE_SIZE = 12;
const BLOG_PAGE_SIZE = 12;
const SITEMAP_BATCH_SIZE = 100;
const MAX_BLOG_SITEMAP_POSTS = 1000;
const MAX_EVENT_SITEMAP_EVENTS = 5000;

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    slug: "scholarships",
    canonicalCategory: "scholarships",
    label: "Scholarships",
    title: "Scholarships for African and global students | Edutu",
    description:
      "Browse verified undergraduate, postgraduate and fully funded scholarships with deadlines, eligibility, benefits and official application sources.",
    introduction:
      "Discover scholarship opportunities for undergraduate, postgraduate and doctoral study. Edutu organises the important facts so you can check eligibility and prepare before the deadline.",
    aliases: ["scholarship", "scholarships", "bursaries", "studentships"],
    faqs: [
      {
        question: "How often are Edutu scholarship listings checked?",
        answer:
          "Edutu records source and update information when it is available and links applicants to the official provider for the final eligibility and deadline confirmation.",
      },
      {
        question: "Does Edutu award the scholarships?",
        answer:
          "No. Edutu helps people discover and understand opportunities. The named provider controls the award and the official application process.",
      },
    ],
  },
  {
    slug: "internships",
    canonicalCategory: "internships",
    label: "Internships",
    title: "Internships and graduate trainee opportunities | Edutu",
    description:
      "Find verified internships, apprenticeships and graduate trainee roles with locations, deadlines, requirements and official application links.",
    introduction:
      "Explore practical work-experience opportunities for students, recent graduates and early-career professionals, including internships, trainee roles and apprenticeships.",
    aliases: ["internship", "internships", "trainee", "apprenticeships"],
    faqs: [
      {
        question: "Are all internships on Edutu paid?",
        answer:
          "Not necessarily. Funding or stipend information is shown only when the source provides it. Always confirm compensation on the official application page.",
      },
      {
        question: "Can international applicants use these listings?",
        answer:
          "Eligibility differs by provider. Review the country, location and eligibility information on each listing before applying.",
      },
    ],
  },
  {
    slug: "fellowships",
    canonicalCategory: "fellowships",
    label: "Fellowships",
    title: "Fellowships, residencies and leadership cohorts | Edutu",
    description:
      "Explore verified fellowships, residencies and leadership cohorts with benefits, selection requirements, deadlines and source links.",
    introduction:
      "Find fellowships and residencies that support leadership, research, public service, creative work and professional development.",
    aliases: ["fellowship", "fellowships", "residency", "residencies"],
    faqs: [
      {
        question: "What is the difference between a fellowship and a scholarship?",
        answer:
          "Scholarships usually fund formal study, while fellowships often support research, leadership, professional development or a time-bound project. Providers may use the terms differently.",
      },
      {
        question: "What should I prepare for a fellowship application?",
        answer:
          "Common requirements include a CV, personal statement, project proposal, references and evidence of impact, but the official provider requirements always take priority.",
      },
    ],
  },
  {
    slug: "grants",
    canonicalCategory: "grants",
    label: "Grants",
    title: "Grants and funding opportunities | Edutu",
    description:
      "Discover verified grants, seed funding and project support with funding details, eligibility, deadlines and official source links.",
    introduction:
      "Explore grants for research, community projects, startups, creative work and social impact. Review the permitted use of funds and selection requirements before applying.",
    aliases: ["grant", "grants", "microgrants", "funding"],
    faqs: [
      {
        question: "Does a grant have to be repaid?",
        answer:
          "Most grants are non-repayable when recipients follow the provider terms, but every programme has its own conditions and reporting requirements.",
      },
      {
        question: "How can I assess whether a grant is legitimate?",
        answer:
          "Check the official provider domain, programme history, published terms and contact details. Edutu links to the recorded source so applicants can verify the opportunity directly.",
      },
    ],
  },
  {
    slug: "graduate-programs",
    canonicalCategory: "graduate_programs",
    label: "Graduate programs",
    title: "Graduate programs, master's and PhD opportunities | Edutu",
    description:
      "Find graduate degree, master's, MBA and PhD opportunities with admission requirements, funding information, deadlines and official sources.",
    introduction:
      "Browse postgraduate study and graduate-school opportunities, including master's, doctoral and professional degree programmes.",
    aliases: [
      "graduate-programs",
      "graduate_programs",
      "graduate-program",
      "postgraduate",
      "masters",
      "phd",
    ],
    faqs: [
      {
        question: "Are graduate programmes on Edutu fully funded?",
        answer:
          "Some are fully funded, some provide partial support and others are admission opportunities only. Funding is shown only when it is present in the source information.",
      },
      {
        question: "Should I contact a supervisor before applying?",
        answer:
          "That depends on the institution and programme. Follow the official department guidance and do not assume supervisor contact is required unless it is stated.",
      },
    ],
  },
  {
    slug: "bootcamps",
    canonicalCategory: "bootcamps",
    label: "Bootcamps",
    title: "Bootcamps, accelerators and intensive training | Edutu",
    description:
      "Explore verified bootcamps, accelerators and cohort-based training with skills, eligibility, costs or funding, deadlines and application links.",
    introduction:
      "Find intensive learning and acceleration programmes designed to build practical skills, launch projects or support early-stage ventures.",
    aliases: ["bootcamp", "bootcamps", "accelerator", "accelerators"],
    faqs: [
      {
        question: "Are Edutu bootcamp listings free?",
        answer:
          "Some programmes are free or funded and others charge fees. Cost information is shown when available, and applicants should confirm it on the official provider page.",
      },
      {
        question: "How do I choose a credible bootcamp?",
        answer:
          "Review the curriculum, instructors, delivery format, alumni outcomes, total cost and refund terms rather than relying only on promotional claims.",
      },
    ],
  },
  {
    slug: "programs",
    canonicalCategory: "programs",
    label: "Programs",
    title: "Leadership, exchange and development programs | Edutu",
    description:
      "Browse verified leadership, exchange, mentorship and professional development programs with eligibility, benefits and deadlines.",
    introduction:
      "Explore structured programmes that provide training, mentorship, networks, exchange experiences and professional development.",
    aliases: ["program", "programs", "programme", "programmes"],
    faqs: [
      {
        question: "What kinds of programmes appear here?",
        answer:
          "This collection includes leadership, mentorship, exchange, professional development and other structured cohort opportunities that do not fit a more specific Edutu category.",
      },
      {
        question: "How do I confirm programme dates?",
        answer:
          "Use the official source linked from the listing because providers may update deadlines, cohort dates or delivery arrangements after publication.",
      },
    ],
  },
  {
    slug: "competitions",
    canonicalCategory: "programs",
    label: "Competitions",
    title: "Competitions, challenges and innovation awards | Edutu",
    description:
      "Find verified competitions, innovation challenges, contests and hackathons with prizes, eligibility, deadlines and official entry links.",
    introduction:
      "Discover competitions and challenges for ideas, research, entrepreneurship, technology, writing, design and social impact.",
    aliases: ["competition", "competitions", "challenge", "challenges", "contest", "hackathon"],
    keywords: /\b(competition|contest|challenge|hackathon|prize|award)\b/i,
    faqs: [
      {
        question: "Are all competitions on Edutu free to enter?",
        answer:
          "No. Entry conditions vary. Check the official terms for fees, intellectual-property rules, judging criteria and prize restrictions.",
      },
      {
        question: "What should I check before entering a competition?",
        answer:
          "Confirm eligibility, submission format, judging criteria, ownership terms, deadline timezone and whether the provider requires public voting or promotional activity.",
      },
    ],
  },
  {
    slug: "events",
    canonicalCategory: "events",
    label: "Opportunity events",
    title: "Conferences, summits, workshops and opportunity events | Edutu",
    description:
      "Discover verified conferences, summits, workshops and webinars with audience details, dates, locations and registration sources.",
    introduction:
      "Explore conferences, workshops, webinars, summits and forums that offer learning, networking or application opportunities.",
    aliases: ["event", "events", "conference", "summit", "workshop", "webinar"],
    faqs: [
      {
        question: "Are these the same as Edutu-hosted events?",
        answer:
          "Not always. This opportunity category may include third-party events. Edutu-hosted sessions are also available from the main Edutu events page.",
      },
      {
        question: "How do I confirm whether an event is online?",
        answer:
          "Review the location and delivery information on the listing, then confirm the current format on the official registration page.",
      },
    ],
  },
];

const STATIC_INDEXABLE_PATHS = [
  "/",
  "/opportunities",
  "/blog",
  "/events",
  "/about",
  "/impact",
  "/community",
  "/what-we-believe",
  "/edutuforyou",
  "/whats-new",
  "/careers",
  "/help",
  "/privacy",
  "/terms",
  "/download",
  "/developers",
  "/scholarship-engine",
];

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function firstText(record: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = cleanText(record[key]);
    if (value) return value;
  }
  return "";
}

function firstValue(record: AnyRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== null && record[key] !== undefined && record[key] !== "") {
      return record[key];
    }
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).slice(0, 20);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        return stringList(JSON.parse(trimmed));
      } catch {
        // Continue with readable-delimiter parsing.
      }
    }
    return trimmed
      .split(/\r?\n|\s*[;•]\s*/)
      .map(cleanText)
      .filter(Boolean)
      .slice(0, 20);
  }
  if (value && typeof value === "object") {
    return Object.values(value as AnyRecord)
      .map(cleanText)
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), 500)
    : 1;
}

function xml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLastmod(value: unknown): string {
  const date = value ? new Date(value as string | number | Date) : new Date();
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return cleanText(value);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function renderUrlSet(
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
    ...entries.flatMap((entry) => [
      "  <url>",
      `    <loc>${xml(entry.loc)}</loc>`,
      `    <lastmod>${xml(toLastmod(entry.lastmod))}</lastmod>`,
      `    <changefreq>${xml(entry.changefreq)}</changefreq>`,
      `    <priority>${xml(entry.priority)}</priority>`,
      "  </url>",
    ]),
    "</urlset>",
    "",
  ].join("\n");
}

function categoryFor(value: string | undefined): CategoryConfig | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!normalized) return null;
  return (
    CATEGORY_CONFIGS.find(
      (category) =>
        category.slug === normalized ||
        category.aliases.some(
          (alias) => alias.toLowerCase().replace(/_/g, "-") === normalized,
        ),
    ) ?? null
  );
}

function opportunitySearchText(opportunity: AnyRecord): string {
  return cleanText(
    [
      opportunity.title,
      opportunity.category,
      opportunity.canonical_category,
      opportunity.summary,
      opportunity.description,
      opportunity.tags,
    ].join(" "),
  );
}

function renderListSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `<section class="seo-panel"><h2>${escapeHtml(title)}</h2><ul class="seo-list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></section>`;
}

function renderParagraphs(value: string): string {
  const text = cleanText(value);
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const groups: string[] = [];
  for (let index = 0; index < sentences.length; index += 4) {
    groups.push(sentences.slice(index, index + 4).join(" ").trim());
  }
  return groups
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

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
    const configured = this.opportunities.getPublicAppBaseUrl();
    return configured
      .replace(/\/+$/, "")
      .replace(/^https?:\/\/edutu\.org(?=\/|$)/i, "https://www.edutu.org");
  }

  private absolute(pathname: string): string {
    return new URL(pathname, `${this.base}/`).toString();
  }

  private defaultImage(section: "blog" | "events" | "opportunities" = "opportunities") {
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
      const shell = await this.shell.get(this.base);
      const injected = shell ? injectSeoIntoShell(shell, page) : null;
      if (injected) {
        res.setHeader("X-Seo-Source", "backend/seo-shell");
        return injected;
      }
    }

    res.setHeader("X-Seo-Source", "backend/seo-document");
    return renderSeoDocument(page);
  }

  private notFoundPage(resource: string, canonicalUrl: string): SeoPageDocument {
    return {
      title: `${resource} not found | Edutu`,
      description:
        "This Edutu page is unavailable. Browse current verified opportunities and application guides instead.",
      canonicalUrl,
      imageUrl: this.defaultImage(),
      imageAlt: "Edutu opportunities",
      ogType: "website",
      robots: "noindex, follow",
      bodyHtml: `<main id="seo-content"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/opportunities">Opportunities</a></nav><p class="seo-kicker">Edutu</p><h1>${escapeHtml(resource)} not found</h1><p class="seo-lead">The page may have been removed, unpublished or entered incorrectly.</p><section class="seo-panel seo-trust"><h2>Continue discovering</h2><p>Browse current scholarships, internships, fellowships, grants and application guides.</p><p><a href="/opportunities">Browse opportunities</a> · <a href="/blog">Read application guides</a></p></section></main>`,
    };
  }

  sitemapIndex(@Res({ passthrough: true }) res: Response): string {
    this.xmlResponse(res);
    const today = new Date().toISOString().slice(0, 10);
    const children = ["pages", "blog", "opportunities", "events"];
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...children.flatMap((name) => [
        "  <sitemap>",
        `    <loc>${xml(this.absolute(`/sitemaps/${name}.xml`))}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        "  </sitemap>",
      ]),
      "</sitemapindex>",
      "",
    ].join("\n");
  }

  @Get("sitemap.xml")
  getSitemapIndex(@Res({ passthrough: true }) res: Response): string {
    return this.sitemapIndex(res);
  }

  pagesSitemap(@Res({ passthrough: true }) res: Response): string {
    this.xmlResponse(res);
    const today = new Date();
    const entries = [
      ...STATIC_INDEXABLE_PATHS.map((pathname) => ({
        loc: this.absolute(pathname),
        lastmod: today,
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
      ...CATEGORY_CONFIGS.map((category) => ({
        loc: this.absolute(`/opportunities/${category.slug}`),
        lastmod: today,
        changefreq: "daily",
        priority: "0.9",
      })),
    ];
    return renderUrlSet(entries);
  }

  @Get("sitemaps/pages.xml")
  getPagesSitemap(@Res({ passthrough: true }) res: Response): string {
    return this.pagesSitemap(res);
  }

  async blogSitemap(@Res({ passthrough: true }) res: Response): Promise<string> {
    this.xmlResponse(res);
    const posts = await this.loadAllBlogPosts();
    this.assertMinimum("blog", posts.length, 1);
    return renderUrlSet(
      posts.map((post) => ({
        loc: this.absolute(`/blog/${encodeURIComponent(String(post.slug))}`),
        lastmod:
          post.updatedAt ?? post.updated_at ?? post.publishedAt ?? post.published_at,
        changefreq: "monthly",
        priority: "0.7",
      })),
    );
  }

  @Get("sitemaps/blog.xml")
  getBlogSitemap(@Res({ passthrough: true }) res: Response): Promise<string> {
    return this.blogSitemap(res);
  }

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

  @Get("sitemaps/opportunities.xml")
  getOpportunitiesSitemap(
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.opportunitiesSitemap(res);
  }

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
        lastmod: event.updatedAt ?? event.updated_at ?? event.startsAt ?? event.starts_at,
        changefreq: "weekly",
        priority: "0.7",
      })),
    );
  }

  @Get("sitemaps/events.xml")
  getEventsSitemap(@Res({ passthrough: true }) res: Response): Promise<string> {
    return this.eventsSitemap(res);
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
    let posts: AnyRecord[];
    try {
      posts = await this.blog.findAll({
        status: "published",
        limit: BLOG_PAGE_SIZE + 1,
        offset: (page - 1) * BLOG_PAGE_SIZE,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Blog archive unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const hasNext = posts.length > BLOG_PAGE_SIZE;
    const visible = posts.slice(0, BLOG_PAGE_SIZE);
    const canonicalPath = page > 1 ? `/blog?page=${page}` : "/blog";
    const canonicalUrl = this.absolute(canonicalPath);
    const description =
      "Practical scholarship, career and application guides from Edutu, with founder notes, opportunity explainers and evidence-based advice.";
    const bodyHtml = this.renderBlogArchiveBody(visible, page, hasNext);
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
            url: this.absolute(`/blog/${encodeURIComponent(String(post.slug))}`),
          })),
        },
      },
      this.breadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: "Blog", path: canonicalPath },
      ]),
    ];
    return this.respond(res, {
      title: page > 1 ? `Edutu blog — Page ${page}` : "Edutu blog | Opportunity and application guides",
      description,
      canonicalUrl,
      imageUrl: this.defaultImage("blog"),
      imageAlt: "Edutu opportunity and application guides",
      ogType: "website",
      robots: "index, follow, max-image-preview:large",
      bodyHtml,
      jsonLd,
    });
  }

  @Get("blog/:slug")
  async blogPost(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const canonicalUrl = this.absolute(`/blog/${encodeURIComponent(slug)}`);
    let post: AnyRecord | null = null;
    try {
      post = await this.blog.peekBySlug(slug);
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
    const articleBody = cleanText(firstValue(post, ["content", "body"]));
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
    const bodyHtml = `<main id="seo-content" class="seo-detail"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/blog">Blog</a></nav><p class="seo-kicker">Edutu guide</p><h1>${escapeHtml(title)}</h1><p class="seo-lead">${escapeHtml(description)}</p><p class="seo-muted">By ${escapeHtml(author)}${publishedAt ? ` · Published ${escapeHtml(formatDate(publishedAt))}` : ""}${updatedAt ? ` · Updated ${escapeHtml(formatDate(updatedAt))}` : ""}</p><article class="seo-panel">${renderParagraphs(articleBody || description)}</article><aside class="seo-panel seo-trust"><h2>Editorial note</h2><p>Edutu publishes practical guidance to help applicants understand opportunities. Always confirm programme-specific rules and deadlines with the official provider.</p><p><a href="/opportunities">Browse current opportunities</a></p></aside></main>`;
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        url: canonicalUrl,
        image: [image],
        ...(publishedAt
          ? { datePublished: new Date(publishedAt as any).toISOString() }
          : {}),
        ...(updatedAt
          ? { dateModified: new Date(updatedAt as any).toISOString() }
          : {}),
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
    const category = categoryRaw ? categoryFor(categoryRaw) : null;
    if (categoryRaw && !category) {
      return this.respond(
        res,
        this.notFoundPage(
          "Opportunity category",
          this.absolute(`/opportunities?category=${encodeURIComponent(categoryRaw)}`),
        ),
        { status: 404, useShell: false },
      );
    }
    return this.renderOpportunityArchive(category, parsePage(pageRaw), res, true);
  }

  @Get("opportunities/:category")
  async opportunityCategory(
    @Param("category") categoryRaw: string,
    @Query("page") pageRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const category = categoryFor(categoryRaw);
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
    return this.renderOpportunityArchive(category, parsePage(pageRaw), res, false);
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
    let event: AnyRecord | null = null;
    try {
      event = await this.events.findOne(slugOrId);
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
      truncateText(
        firstText(event, ["summary", "description"]),
        180,
      ) || "Join this opportunity session from Edutu.";
    const startsAt = firstValue(event, ["startsAt", "starts_at"]);
    const endsAt = firstValue(event, ["endsAt", "ends_at"]);
    const location = firstText(event, ["location"]);
    const image =
      safeHttpUrl(firstValue(event, ["imageUrl", "image_url"])) ||
      this.defaultImage("events");
    const bodyHtml = `<main id="seo-content" class="seo-detail"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/events">Events</a></nav><p class="seo-kicker">Edutu event</p><h1>${escapeHtml(title)}</h1><p class="seo-lead">${escapeHtml(description)}</p><section class="seo-panel"><h2>Event details</h2><p>${startsAt ? `<strong>Date:</strong> ${escapeHtml(formatDate(startsAt))}<br>` : ""}${location ? `<strong>Location:</strong> ${escapeHtml(location)}<br>` : ""}${event.isOnline ?? event.is_online ? "<strong>Format:</strong> Online" : ""}</p>${renderParagraphs(firstText(event, ["description"]))}</section><aside class="seo-panel seo-trust"><h2>Before registering</h2><p>Confirm the current schedule, access requirements and registration terms with the event organiser.</p><p><a href="/events">See more Edutu events</a></p></aside></main>`;
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "Event",
        name: title,
        description,
        url: canonicalUrl,
        image: [image],
        ...(startsAt
          ? { startDate: new Date(startsAt as any).toISOString() }
          : {}),
        ...(endsAt ? { endDate: new Date(endsAt as any).toISOString() } : {}),
        eventAttendanceMode:
          event.isOnline ?? event.is_online
            ? "https://schema.org/OnlineEventAttendanceMode"
            : "https://schema.org/OfflineEventAttendanceMode",
        ...(location
          ? { location: { "@type": "Place", name: location } }
          : {}),
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
    category: CategoryConfig | null,
    page: number,
    res: Response,
    useShell: boolean,
  ): Promise<string> {
    const loaded = await this.loadOpportunityArchivePage(category, page);
    const canonicalPath = category
      ? `/opportunities/${category.slug}${page > 1 ? `?page=${page}` : ""}`
      : `/opportunities${page > 1 ? `?page=${page}` : ""}`;
    const canonicalUrl = this.absolute(canonicalPath);
    const title = category
      ? category.title
      : page > 1
        ? `Updated opportunities — Page ${page} | Edutu`
        : "Updated scholarships, internships, grants and fellowships | Edutu";
    const description = category
      ? category.description
      : "Explore verified scholarships, internships, fellowships, grants, graduate programs and application opportunities with deadlines and official sources.";
    const bodyHtml = this.renderOpportunityArchiveBody(
      loaded.items,
      category,
      page,
      loaded.hasNext,
    );
    const faqJsonLd = category
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: category.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null;
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
    if (faqJsonLd) jsonLd.push(faqJsonLd);
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
        bodyHtml,
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
    let opportunity: AnyRecord | null = null;
    try {
      opportunity = await this.opportunities.findOne(id);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Opportunity source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!opportunity || !opportunity.id) {
      return this.respond(
        res,
        this.notFoundPage("Opportunity", canonicalUrl),
        { status: 404, useShell: false },
      );
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
      CATEGORY_CONFIGS.find(
        (item) => item.canonicalCategory === categoryName && !item.keywords,
      ) || CATEGORY_CONFIGS.find((item) => item.slug === "programs")!;
    const deadline = firstValue(opportunity, [
      "deadline",
      "close_date",
      "deadline_date",
    ]);
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
    const bodyHtml = `<main id="seo-content" class="seo-detail"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/opportunities">Opportunities</a><span aria-hidden="true">/</span><a href="/opportunities/${escapeAttribute(category.slug)}">${escapeHtml(category.label)}</a></nav><p class="seo-kicker">${escapeHtml(category.label)}</p><h1>${escapeHtml(title)}</h1><p class="seo-lead">${escapeHtml(description)}</p><section class="seo-panel"><h2>Opportunity overview</h2><p><strong>Provider:</strong> ${escapeHtml(organization)}${deadline ? `<br><strong>Deadline:</strong> ${escapeHtml(formatDate(deadline))}` : ""}${location ? `<br><strong>Location or eligibility region:</strong> ${escapeHtml(location)}` : ""}${funding ? `<br><strong>Funding:</strong> ${escapeHtml(funding)}` : ""}</p>${renderParagraphs(detailCopy)}</section>${eligibility ? `<section class="seo-panel"><h2>Eligibility</h2><p>${escapeHtml(eligibility)}</p></section>` : ""}${renderListSection("Benefits", benefits)}${renderListSection("Requirements", requirements)}${renderListSection("Application process", applicationSteps)}<section class="seo-panel seo-trust"><h2>Source and verification</h2><p>Edutu organises opportunity information to make it easier to understand. The provider's official page remains the final authority for eligibility, funding, deadlines and selection decisions.</p>${updatedAt ? `<p><strong>Last checked or updated:</strong> ${escapeHtml(formatDate(updatedAt))}</p>` : ""}${sourceUrl ? `<p><a href="${escapeAttribute(sourceUrl)}" rel="nofollow noopener noreferrer">Review the official source</a></p>` : "<p class="seo-muted">An official source link was not available in this record. Confirm the opportunity independently before sharing personal information.</p>"}${applyUrl ? `<p><a href="${escapeAttribute(applyUrl)}" rel="nofollow noopener noreferrer">Open the official application page</a></p>` : ""}</section><aside class="seo-panel"><h2>Continue your search</h2><p><a href="/opportunities/${escapeAttribute(category.slug)}">See more ${escapeHtml(category.label.toLowerCase())}</a> · <a href="/blog">Read Edutu application guides</a></p></aside></main>`;
    const deadlineIso = deadline ? new Date(deadline as any) : null;
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
        ...(deadlineIso && !Number.isNaN(deadlineIso.getTime())
          ? {
              applicationDeadline: deadlineIso.toISOString(),
              validThrough: deadlineIso.toISOString(),
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
    category: CategoryConfig | null,
    page: number,
  ): Promise<{ items: AnyRecord[]; hasNext: boolean }> {
    const offset = (page - 1) * OPPORTUNITY_PAGE_SIZE;
    try {
      if (category?.keywords) {
        const candidates = await this.opportunities.findAll(
          100,
          0,
          "active",
          category.canonicalCategory,
        );
        const filtered = (candidates as AnyRecord[]).filter((item) =>
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
      )) as AnyRecord[];
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

  private renderOpportunityArchiveBody(
    items: AnyRecord[],
    category: CategoryConfig | null,
    page: number,
    hasNext: boolean,
  ): string {
    const title = category?.label || "Explore opportunities";
    const introduction =
      category?.introduction ||
      "Search verified scholarships, internships, fellowships, grants, graduate programs and other opportunities. Each listing links back to its recorded source for final confirmation.";
    const categoryNav = CATEGORY_CONFIGS.map(
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
            const organization = firstText(item, [
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
            return `<article class="seo-card"><h2><a href="/opportunity/${encodeURIComponent(String(item.id))}">${escapeHtml(itemTitle)}</a></h2>${organization ? `<p><strong>${escapeHtml(organization)}</strong></p>` : ""}${summary ? `<p>${escapeHtml(summary)}</p>` : ""}<p class="seo-meta">${deadline ? `Deadline: ${escapeHtml(formatDate(deadline))}` : "Deadline: confirm with provider"}${location ? ` · ${escapeHtml(location)}` : ""}</p></article>`;
          })
          .join("")
      : '<section class="seo-panel"><h2>No active listings on this page</h2><p>Try another category or return to the first page. Edutu does not keep expired or unverified opportunities in the active archive.</p></section>';
    const path = category
      ? `/opportunities/${category.slug}`
      : "/opportunities";
    const pagination = this.renderPagination(path, page, hasNext);
    const faq = category
      ? `<section class="seo-panel"><h2>Frequently asked questions</h2>${category.faqs
          .map(
            (item) =>
              `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`,
          )
          .join("")}</section>`
      : "";
    return `<main id="seo-content"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span>${category ? '<a href="/opportunities">Opportunities</a><span aria-hidden="true">/</span>' : ""}<span>${escapeHtml(title)}</span></nav><p class="seo-kicker">Opportunity discovery</p><h1>${escapeHtml(title)}${page > 1 ? ` — Page ${page}` : ""}</h1><p class="seo-lead">${escapeHtml(introduction)}</p><nav class="seo-category-nav" aria-label="Opportunity categories">${categoryNav}</nav><section class="seo-grid" aria-label="Opportunity results">${cards}</section>${pagination}<aside class="seo-panel seo-trust"><h2>How Edutu handles opportunity information</h2><p>Edutu helps people discover and understand opportunities. We show source and update information when available, avoid inventing missing facts, and direct applicants to the official provider for final confirmation.</p><p><a href="/blog">Read application guides</a></p></aside>${faq}</main>`;
  }

  private renderBlogArchiveBody(
    posts: AnyRecord[],
    page: number,
    hasNext: boolean,
  ): string {
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
            return `<article class="seo-card"><h2><a href="/blog/${encodeURIComponent(String(post.slug))}">${escapeHtml(title)}</a></h2>${excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ""}<p class="seo-meta">${escapeHtml(author)}${published ? ` · ${escapeHtml(formatDate(published))}` : ""}</p></article>`;
          })
          .join("")
      : '<section class="seo-panel"><h2>No published guides on this page</h2><p>Return to the first page or browse current opportunities.</p></section>';
    return `<main id="seo-content"><nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>Blog</span></nav><p class="seo-kicker">Edutu editorial</p><h1>Opportunity and application guides${page > 1 ? ` — Page ${page}` : ""}</h1><p class="seo-lead">Practical guidance for finding opportunities, preparing stronger applications and making informed career and education decisions.</p><section class="seo-grid" aria-label="Published guides">${cards}</section>${this.renderPagination("/blog", page, hasNext)}<aside class="seo-panel seo-trust"><h2>Useful guidance, not guaranteed outcomes</h2><p>Edutu articles explain common application principles. Always apply the current rules published by the relevant scholarship, employer, institution or programme provider.</p><p><a href="/opportunities">Browse verified opportunities</a></p></aside></main>`;
  }

  private renderPagination(
    pathname: string,
    page: number,
    hasNext: boolean,
  ): string {
    if (page === 1 && !hasNext) return "";
    const previous =
      page > 1
        ? `<a rel="prev" href="${escapeAttribute(page === 2 ? pathname : `${pathname}?page=${page - 1}`)}">Previous</a>`
        : "";
    const next = hasNext
      ? `<a rel="next" href="${escapeAttribute(`${pathname}?page=${page + 1}`)}">Next</a>`
      : "";
    return `<nav class="seo-pagination" aria-label="Pagination">${previous}<span aria-current="page">Page ${page}</span>${next}</nav>`;
  }

  private async loadAllBlogPosts(): Promise<AnyRecord[]> {
    const all: AnyRecord[] = [];
    try {
      for (
        let offset = 0;
        offset < MAX_BLOG_SITEMAP_POSTS;
        offset += SITEMAP_BATCH_SIZE
      ) {
        const batch = await this.blog.findAll({
          status: "published",
          limit: SITEMAP_BATCH_SIZE,
          offset,
        });
        all.push(...(batch as AnyRecord[]).filter((post) => post.slug));
        if (batch.length < SITEMAP_BATCH_SIZE) break;
      }
      return all.slice(0, MAX_BLOG_SITEMAP_POSTS);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Blog sitemap source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async loadAllEvents(): Promise<AnyRecord[]> {
    const all: AnyRecord[] = [];
    try {
      for (
        let offset = 0;
        offset < MAX_EVENT_SITEMAP_EVENTS;
        offset += SITEMAP_BATCH_SIZE
      ) {
        const batch = await this.events.findAll({
          status: "published",
          limit: SITEMAP_BATCH_SIZE,
          offset,
        });
        all.push(
          ...(batch as AnyRecord[]).filter((event) => event.slug || event.id),
        );
        if (batch.length < SITEMAP_BATCH_SIZE) break;
      }
      return all.slice(0, MAX_EVENT_SITEMAP_EVENTS);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Event sitemap source unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private assertMinimum(
    source: "blog" | "opportunities",
    count: number,
    productionDefault: number,
  ): void {
    const envName =
      source === "blog" ? "SEO_MIN_BLOG_URLS" : "SEO_MIN_OPPORTUNITY_URLS";
    const configured = Number(process.env[envName]);
    const minimum = Number.isFinite(configured)
      ? Math.max(0, Math.floor(configured))
      : process.env.NODE_ENV === "production"
        ? productionDefault
        : 0;
    if (count < minimum) {
      throw new ServiceUnavailableException(
        `${source} sitemap contained ${count} URLs; minimum required is ${minimum}`,
      );
    }
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
}
