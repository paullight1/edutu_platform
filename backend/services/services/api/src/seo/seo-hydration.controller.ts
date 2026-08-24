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
import { SpaShellService } from "../og/spa-shell.service";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import {
  firstText,
  opportunitySearchText,
  parsePage,
  renderOpportunityArchiveBody,
  type SeoRecord,
} from "./seo-content";
import {
  findSeoCategory,
  type SeoCategory,
} from "./seo-data";
import {
  escapeHtml,
  injectSeoIntoShell,
  renderSeoDocument,
  type SeoJsonLd,
  type SeoPageDocument,
} from "./seo-render";

const PAGE_SIZE = 12;

@Public()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller("seo-hydration")
export class SeoHydrationController {
  constructor(
    private readonly opportunities: OpportunitiesService,
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

  private prepareResponse(
    res: Response,
    status: number,
    robots: string,
  ): void {
    res.status(status);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Language", "en");
    res.setHeader(
      "Cache-Control",
      status >= 400
        ? "public, max-age=0, s-maxage=60"
        : "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
    );
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
    status = 200,
  ): Promise<string> {
    this.prepareResponse(res, status, page.robots);

    if (status < 400) {
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
      imageUrl: `${this.base}/og/opportunities.jpg`,
      imageAlt: "Edutu opportunities",
      ogType: "website",
      robots: "noindex, follow",
      bodyHtml: [
        '<main id="seo-content">',
        '<nav class="seo-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/opportunities">Opportunities</a></nav>',
        '<p class="seo-kicker">Edutu</p>',
        `<h1>${escapeHtml(resource)} not found</h1>`,
        '<p class="seo-lead">The page may have been removed, renamed or entered incorrectly.</p>',
        '<section class="seo-panel seo-trust"><h2>Continue discovering</h2><p>Browse current scholarships, internships, fellowships, grants and application guides.</p><p><a href="/opportunities">Browse opportunities</a> · <a href="/blog">Read application guides</a></p></section>',
        "</main>",
      ].join(""),
    };
  }

  private breadcrumbJsonLd(
    category: SeoCategory,
    canonicalPath: string,
  ): Record<string, unknown> {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: this.absolute("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Opportunities",
          item: this.absolute("/opportunities"),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: category.label,
          item: this.absolute(canonicalPath),
        },
      ],
    };
  }

  private async loadPage(
    category: SeoCategory,
    page: number,
  ): Promise<{ items: SeoRecord[]; hasNext: boolean }> {
    const offset = (page - 1) * PAGE_SIZE;

    try {
      if (category.keywords) {
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
          items: filtered.slice(offset, offset + PAGE_SIZE),
          hasNext: filtered.length > offset + PAGE_SIZE,
        };
      }

      const rows = (await this.opportunities.findAll(
        PAGE_SIZE + 1,
        offset,
        "active",
        category.canonicalCategory,
      )) as unknown as SeoRecord[];
      return {
        items: rows.slice(0, PAGE_SIZE),
        hasNext: rows.length > PAGE_SIZE,
      };
    } catch (error) {
      throw new ServiceUnavailableException(
        `Opportunity archive unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Get("opportunities/:category")
  async opportunityCategory(
    @Param("category") categoryRaw: string,
    @Query("page") pageRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const category = findSeoCategory(categoryRaw);
    const requestedPath = `/opportunities/${encodeURIComponent(categoryRaw)}`;
    if (!category) {
      return this.respond(
        res,
        this.notFoundPage(
          "Opportunity category",
          this.absolute(requestedPath),
        ),
        404,
      );
    }

    const page = parsePage(pageRaw);
    const loaded = await this.loadPage(category, page);
    const canonicalPath = `/opportunities/${category.slug}${
      page > 1 ? `?page=${page}` : ""
    }`;
    const canonicalUrl = this.absolute(canonicalPath);

    if (page > 1 && loaded.items.length === 0) {
      return this.respond(
        res,
        this.notFoundPage("Opportunity page", canonicalUrl),
        404,
      );
    }

    const baseTitle = category.title
      .replace(/\s*\|\s*Edutu\s*$/i, "")
      .trim();
    const title = `${baseTitle}${
      page > 1 ? ` — Page ${page}` : ""
    } | Edutu`;
    const jsonLd: SeoJsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: category.label,
        description: category.description,
        url: canonicalUrl,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: loaded.items.length,
          itemListElement: loaded.items.map((item, index) => ({
            "@type": "ListItem",
            position: (page - 1) * PAGE_SIZE + index + 1,
            name: firstText(item, ["title"]),
            url: this.absolute(
              `/opportunity/${encodeURIComponent(String(item.id))}`,
            ),
          })),
        },
      },
      this.breadcrumbJsonLd(category, canonicalPath),
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: category.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ];

    return this.respond(res, {
      title,
      description: category.description,
      canonicalUrl,
      imageUrl: `${this.base}/og/opportunities.jpg`,
      imageAlt: `${category.label} on Edutu`,
      ogType: "website",
      robots: "index, follow, max-image-preview:large",
      bodyHtml: renderOpportunityArchiveBody({
        items: loaded.items,
        category,
        page,
        hasNext: loaded.hasNext,
      }),
      jsonLd,
    });
  }
}
