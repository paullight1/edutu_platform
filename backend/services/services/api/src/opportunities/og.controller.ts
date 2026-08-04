import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import { OpportunitiesService } from "./opportunities.service";
import { buildOpportunityPublicShareUrl } from "./opportunity-share-text";

/**
 * Server-rendered Open Graph / SEO endpoints for opportunity pages.
 *
 * The web app is a Vite SPA served statically on Vercel via the experimental
 * multi-service router, which does NOT run functions/middleware and silently
 * ignores `has` (user-agent) conditions on rewrites — so every crawler-gated
 * unfurl plan (Netlify edge fn, Vercel middleware, UA-gated rewrite) died on
 * the platform. `vercel.json` therefore rewrites `/opportunity/:id` and
 * `/share/opportunity/:id` here UNCONDITIONALLY.
 *
 * Because real users hit these routes too, the response is the FULL SPA shell
 * (fetched from the deployed site and cached in-memory) with the <head> meta
 * rewritten per-opportunity: crawlers read the real title/summary/flyer image,
 * while browsers boot the app exactly as before (same URL, same assets). If
 * the shell can't be fetched, a tiny self-contained OG page is served instead
 * so unfurls still work.
 */

type OpportunityRecord = Record<string, any>;

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function asRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
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

/** Marker stamped into every response we render, used to refuse a shell that
 * has somehow been proxied back through this controller (rewrite loop). */
const OG_MARKER = "<!--edutu-og-->";

/** Replace the `content`/`href` value of a specific tag, tolerating the
 * multi-line meta formatting Prettier uses in index.html. Injects the tag
 * before </head> when it isn't present at all. */
function setTagValue(
  html: string,
  matcher: RegExp,
  fallbackTag: string,
  value: string,
): string {
  const safe = attr(value);
  if (matcher.test(html)) {
    return html.replace(
      matcher,
      (_m, open: string, close: string) => `${open}${safe}${close}`,
    );
  }
  return html.replace(
    /<\/head>/i,
    `  ${fallbackTag.replace("__VALUE__", safe)}\n</head>`,
  );
}

function ogProperty(prop: string): RegExp {
  return new RegExp(
    `(<meta\\s+property="${prop}"\\s+content=")[\\s\\S]*?(")`,
    "i",
  );
}

function metaName(name: string): RegExp {
  return new RegExp(`(<meta\\s+name="${name}"\\s+content=")[\\s\\S]*?(")`, "i");
}

/** Rewrite the SPA shell's <head> with per-opportunity meta. The body (and the
 * app boot) is left untouched. */
function injectMeta(shell: string, meta: PageMeta): string {
  let html = shell.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${attr(meta.title)}</title>`,
  );
  html = setTagValue(
    html,
    metaName("description"),
    `<meta name="description" content="__VALUE__" />`,
    meta.description,
  );
  html = setTagValue(
    html,
    /(<link\s+rel="canonical"\s+href=")[\s\S]*?(")/i,
    `<link rel="canonical" href="__VALUE__" />`,
    meta.url,
  );
  html = setTagValue(
    html,
    metaName("robots"),
    `<meta name="robots" content="__VALUE__" />`,
    "index, follow, max-image-preview:large",
  );

  html = setTagValue(
    html,
    ogProperty("og:type"),
    `<meta property="og:type" content="__VALUE__" />`,
    meta.ogType,
  );
  html = setTagValue(
    html,
    ogProperty("og:url"),
    `<meta property="og:url" content="__VALUE__" />`,
    meta.url,
  );
  html = setTagValue(
    html,
    ogProperty("og:title"),
    `<meta property="og:title" content="__VALUE__" />`,
    meta.title,
  );
  html = setTagValue(
    html,
    ogProperty("og:description"),
    `<meta property="og:description" content="__VALUE__" />`,
    meta.description,
  );
  html = setTagValue(
    html,
    ogProperty("og:image"),
    `<meta property="og:image" content="__VALUE__" />`,
    meta.image,
  );
  html = setTagValue(
    html,
    ogProperty("og:image:alt"),
    `<meta property="og:image:alt" content="__VALUE__" />`,
    meta.imageAlt,
  );

  html = setTagValue(
    html,
    metaName("twitter:title"),
    `<meta name="twitter:title" content="__VALUE__" />`,
    meta.title,
  );
  html = setTagValue(
    html,
    metaName("twitter:description"),
    `<meta name="twitter:description" content="__VALUE__" />`,
    meta.description,
  );
  html = setTagValue(
    html,
    metaName("twitter:image"),
    `<meta name="twitter:image" content="__VALUE__" />`,
    meta.image,
  );
  html = setTagValue(
    html,
    metaName("twitter:image:alt"),
    `<meta name="twitter:image:alt" content="__VALUE__" />`,
    meta.imageAlt,
  );

  if (meta.imageDims) {
    html = html.replace(/<\/head>/i, `  ${meta.imageDims}\n</head>`);
  }
  if (meta.jsonLd) {
    const tag = `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>`;
    html = html.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }
  return html.replace(/<\/head>/i, `${OG_MARKER}</head>`);
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

  private html(
    res: Response,
    body: string,
    cacheControl: string,
    source = "backend/og",
  ): string {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("X-Og-Source", source);
    // This response IS the public web page (Vercel rewrites /opportunity/:id
    // here for everyone). Helmet's API defaults — CSP `script-src 'self'`,
    // COOP/CORP — would block the SPA's inline boot script, Google Fonts and
    // the cross-origin API calls, so drop them for these HTML pages.
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Origin-Agent-Cluster");
    return body;
  }

  /** In-memory cache of the deployed SPA shell (index.html). A stale copy is
   * kept forever as a fallback so one successful fetch is enough. */
  private shellHtml: string | null = null;
  private shellFetchedAt = 0;
  private static readonly SHELL_TTL_MS = 5 * 60_000;

  private async getSpaShell(): Promise<string | null> {
    const now = Date.now();
    if (
      this.shellHtml &&
      now - this.shellFetchedAt < OgController.SHELL_TTL_MS
    ) {
      return this.shellHtml;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      // The root path is never rewritten to this controller, so this cannot
      // loop; the OG_MARKER check is a belt-and-braces guard against a future
      // rewrite-config mistake.
      const response = await fetch(`${this.base}/`, {
        signal: controller.signal,
        headers: { accept: "text/html" },
      });
      clearTimeout(timer);
      if (response.ok) {
        const text = await response.text();
        if (/<\/head>/i.test(text) && !text.includes(OG_MARKER)) {
          this.shellHtml = text;
          this.shellFetchedAt = now;
        }
      }
    } catch {
      // Keep whatever shell we already have.
    }
    return this.shellHtml;
  }

  /** Serve the SPA shell with `meta` injected, or the self-contained OG page
   * when no shell is available. */
  private async renderWithShell(
    res: Response,
    meta: PageMeta,
    cacheControl: string,
  ): Promise<string> {
    const shell = await this.getSpaShell();
    if (shell) {
      return this.html(
        res,
        injectMeta(shell, meta),
        cacheControl,
        "backend/og-shell",
      );
    }
    return this.html(
      res,
      renderPage(meta),
      cacheControl,
      "backend/og-fallback",
    );
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("opportunity/:id")
  async opportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.opportunityPage(
      id,
      buildOpportunityPublicShareUrl(id, this.base),
      res,
    );
  }

  /** Same unfurl for the public share landing (`/share/opportunity/:id`) —
   * the path admin-composed shares and the landing page link to. */
  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("share/opportunity/:id")
  async shareOpportunity(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    return this.opportunityPage(
      id,
      `${this.base}/share/opportunity/${encodeURIComponent(id)}`,
      res,
    );
  }

  private async opportunityPage(
    id: string,
    pageUrl: string,
    res: Response,
  ): Promise<string> {
    let opp: OpportunityRecord | null = null;
    try {
      opp = await this.opportunities.findOne(id);
    } catch {
      opp = null;
    }

    if (!opp || !opp.id) {
      return this.renderWithShell(
        res,
        {
          title: "Opportunity on Edutu",
          description:
            "Discover scholarships, fellowships and programs with AI-guided roadmaps on Edutu.",
          image: this.defaultImage,
          imageAlt: "Edutu",
          url: pageUrl,
          ogType: "article",
        },
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      );
    }

    const metadata = asRecord(opp.metadata);
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

    // Image priority: hosted flyer copy → original source flyer → share image
    // → branded card → generic Edutu icon. `image_url` is the scraper's
    // Supabase-proxied copy of the source flyer, so it leads: source sites
    // take images down or block hotlinking, and a dead og:image kills the
    // unfurl. Rows whose image_url is a generated share-card fallback
    // (opportunity-share-cards bucket) are demoted to branded-card tier so a
    // real flyer still wins.
    const hostedImage = clean(opp.image_url || opp.imageUrl);
    const hostedIsShareCard = hostedImage.includes("opportunity-share-cards");
    const sourceImage =
      clean(metadata.source_image_url) ||
      clean(opp.source_image_url || opp.sourceImageUrl);
    const brandedCard =
      clean(asRecord(metadata.share_card).url) ||
      (hostedIsShareCard ? hostedImage : "");
    const image =
      (hostedIsShareCard ? "" : hostedImage) ||
      sourceImage ||
      clean(opp.share_image_url || opp.shareImageUrl) ||
      brandedCard ||
      this.defaultImage;
    const usingBrandedCard = Boolean(brandedCard) && image === brandedCard;

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

    return this.renderWithShell(
      res,
      {
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
      },
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
