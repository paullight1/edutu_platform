import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import { OpportunitiesService } from "./opportunities.service";
import { buildOpportunityPublicShareUrl } from "./opportunity-share-text";
import { resolveShareImage } from "./opportunity-share-image";

/**
 * Crawler-time Open Graph / SEO endpoints (server-rendered).
 *
 * The web app is a Vite SPA served statically on Vercel, and that project does
 * not run Vercel functions/middleware — so `vercel.json` rewrites crawler
 * requests for `/opportunity/:id` and `/opportunities` (gated on a crawler
 * `user-agent` header) to these public backend routes via an EXTERNAL rewrite
 * (the same proxy mechanism the sitemap uses). Real users never hit these — they
 * fall through to the static SPA.
 *
 * The response is a tiny self-contained HTML document carrying the real title,
 * description, canonical URL, OG/Twitter tags and JSON-LD, with the
 * opportunity's source flyer as the image, so shared links unfurl richly.
 */

type OpportunityRecord = Record<string, any>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** Escape for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape for HTML text content. */
function textContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface PageMeta {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  url: string;
  ogType: "article" | "website";
  imageDims?: string;
  jsonLd?: Record<string, unknown>;
}

function renderPage(meta: PageMeta): string {
  const jsonLdTag = meta.jsonLd
    ? `\n  <script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`
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
  <meta property="og:image:alt" content="${attr(meta.imageAlt)}">
  <meta property="og:url" content="${attr(meta.url)}">${meta.imageDims ? `\n  ${meta.imageDims}` : ""}
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
    <p><a href="${attr(meta.url)}">View this opportunity on Edutu →</a></p>
  </main>
</body>
</html>`;
}

@Controller("og")
export class OgController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  private get base(): string {
    return this.opportunities.getPublicAppBaseUrl();
  }

  private get defaultImage(): string {
    return `${this.base}/icons/icon-512x512.png`;
  }

  private categoryMeta(): Record<
    string,
    { title: string; description: string }
  > {
    return {
      scholarships: {
        title: "Scholarships for Students | Edutu",
        description:
          "Browse active scholarships worldwide — funding for undergraduate, graduate and doctoral study, with deadlines, eligibility and AI-guided application roadmaps on Edutu.",
      },
      internships: {
        title: "Internships & Graduate Trainee Roles | Edutu",
        description:
          "Discover internships and trainee opportunities from global organizations. See eligibility, deadlines and apply links, with AI-guided application help on Edutu.",
      },
      fellowships: {
        title: "Fellowships & Residencies | Edutu",
        description:
          "Explore fellowships and residencies to advance your research, leadership and career — deadlines, eligibility and AI-guided roadmaps on Edutu.",
      },
      programs: {
        title: "Programs, Bootcamps & Accelerators | Edutu",
        description:
          "Find training programs, bootcamps, accelerators and academies worldwide, with deadlines, eligibility and AI-guided application roadmaps on Edutu.",
      },
    };
  }

  private html(res: Response, body: string, cacheControl: string): string {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("X-Og-Source", "backend/og");
    return body;
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("opportunity/:id")
  async opportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const pageUrl = buildOpportunityPublicShareUrl(id, this.base);

    let opp: OpportunityRecord | null = null;
    try {
      opp = await this.opportunities.findOne(id);
    } catch {
      opp = null;
    }

    if (!opp || !opp.id) {
      return this.html(
        res,
        renderPage({
          title: "Opportunity on Edutu",
          description:
            "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.",
          image: this.defaultImage,
          imageAlt: "Edutu",
          url: pageUrl,
          ogType: "article",
        }),
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      );
    }

    const title = clean(opp.title) || "Opportunity on Edutu";
    const fullTitle = `${title} | Edutu`;
    const description =
      truncate(
        clean(
          opp.aiSummary ||
            opp.ai_summary ||
            opp.refined_summary ||
            opp.summary ||
            opp.description,
        ),
        200,
      ) ||
      "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.";

    // A shared link must never unfurl with the generic Edutu icon. Prefer the
    // scraped source flyer / opportunity image; otherwise ensure a branded card
    // exists (generating it on demand for never-shared opportunities).
    let resolved = resolveShareImage(opp, { defaultImage: this.defaultImage });
    if (resolved.needsCard) {
      try {
        const ensured = await this.opportunities.ensureShareCard(id);
        resolved = resolveShareImage(opp, {
          cardUrl: ensured?.shareCard?.url,
          defaultImage: this.defaultImage,
        });
      } catch {
        // keep the default-icon last resort
      }
    }
    const image = resolved.url;
    const usingBrandedCard = resolved.usingBrandedCard;

    const deadlineRaw = clean(
      opp.deadline || opp.close_date || opp.deadline_date,
    );
    const deadlineIso = /^\d{4}-\d{2}-\d{2}/.test(deadlineRaw)
      ? deadlineRaw
      : "";
    const organization =
      clean(opp.organization || opp.provider || opp.company) || "Edutu";
    const category = clean(opp.category) || "Opportunity";

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "EducationalOccupationalProgram",
      name: fullTitle,
      description,
      url: pageUrl,
      image,
      category,
      provider: { "@type": "Organization", name: organization },
      ...(deadlineIso
        ? { applicationDeadline: deadlineIso, validThrough: deadlineIso }
        : {}),
      publisher: {
        "@type": "Organization",
        name: "Edutu",
        url: `${this.base}/opportunities`,
        logo: { "@type": "ImageObject", url: this.defaultImage },
      },
    };

    return this.html(
      res,
      renderPage({
        title: fullTitle,
        description,
        image,
        imageAlt: title,
        url: pageUrl,
        ogType: "article",
        imageDims: usingBrandedCard
          ? `<meta property="og:image:width" content="1080">\n  <meta property="og:image:height" content="1350">`
          : undefined,
        jsonLd,
      }),
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("opportunities")
  list(
    @Query("category") categoryRaw: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const category = (categoryRaw || "").toLowerCase();
    const map = this.categoryMeta();
    const meta = map[category] || {
      title: "Browse Opportunities — Scholarships, Fellowships & More | Edutu",
      description:
        "Explore live scholarships, fellowships, internships and programs curated daily. Filter by category, check deadlines and get AI-guided application roadmaps on Edutu.",
    };
    const pageUrl = map[category]
      ? `${this.base}/opportunities?category=${encodeURIComponent(category)}`
      : `${this.base}/opportunities`;

    return this.html(
      res,
      renderPage({
        title: meta.title,
        description: meta.description,
        image: this.defaultImage,
        imageAlt: "Edutu",
        url: pageUrl,
        ogType: "website",
      }),
      "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    );
  }
}
