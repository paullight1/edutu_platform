import { Controller, Get, Param, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import { BlogService } from "../blog/blog.service";
import { EventsService } from "../events/events.service";
import {
  clean,
  renderOgPage,
  toPlainText,
  truncate,
  type OgPageMeta,
} from "./og-page.render";
import { injectIntoShell } from "./og-shell-inject";
import { SpaShellService } from "./spa-shell.service";

/**
 * Crawler-time Open Graph for content routes whose metadata lives in the DB.
 *
 * The web app is a static Vite SPA, so social crawlers (WhatsApp, Facebook,
 * Slack, LinkedIn, iMessage) never see the tags `Seo.tsx` injects at runtime.
 * Static marketing pages solve this at build time with a prerendered hero
 * capture per route; blog posts and events can't, because a new post ships
 * without a rebuild. Those two routes are rewritten here from the ROOT
 * `vercel.json` — path-param rewrites declared in the per-app vercel.json are
 * silently dropped by the platform's services router.
 *
 * Image precedence is the same idea as the opportunity card: the item's own
 * artwork first, then the section's prerendered hero, and only then the logo.
 */
@Controller("og")
export class PageOgController {
  constructor(
    private readonly blog: BlogService,
    private readonly events: EventsService,
    private readonly shell: SpaShellService,
  ) {}

  private get base(): string {
    const configured = (
      process.env.EDUTU_PUBLIC_APP_URL ||
      process.env.PUBLIC_WEB_APP_URL ||
      process.env.WEB_APP_URL ||
      process.env.FRONTEND_URL ||
      "https://www.edutu.org"
    ).replace(/\/+$/, "");

    return configured.replace(
      /^https?:\/\/edutu\.org(?=\/|$)/i,
      "https://www.edutu.org",
    );
  }

  /** Absolute URL of a build-time hero capture (see scripts/page-seo.mjs). */
  private heroImage(slug: string): string {
    return `${this.base}/og/${slug}.jpg`;
  }

  /**
   * Serve the real SPA shell with `meta` injected.
   *
   * These rewrites are unconditional (the services router drops `has`
   * user-agent gates), so this response reaches real users too — hence the
   * shell rather than a standalone page. The mini page is a last resort for
   * when the shell can't be fetched at all; it still unfurls correctly, it
   * just isn't the app.
   */
  private async respond(
    res: Response,
    meta: OgPageMeta,
    cacheControl: string,
  ): Promise<string> {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl);

    const shell = await this.shell.get(this.base);
    const injected = shell ? injectIntoShell(shell, meta) : null;

    if (injected) {
      res.setHeader("X-Og-Source", "backend/og-shell");
      return injected;
    }

    res.setHeader("X-Og-Source", "backend/og-fallback");
    return renderOgPage(meta);
  }

  /** Only absolute http(s) artwork is usable — crawlers won't resolve paths. */
  private absoluteImage(value: unknown): string | null {
    const url = clean(value);
    return /^https?:\/\//i.test(url) ? url : null;
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("blog/:slug")
  async blogPost(
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const pageUrl = `${this.base}/blog/${encodeURIComponent(slug)}`;

    let post: Record<string, any> | null = null;
    try {
      post = await this.blog.peekBySlug(slug);
    } catch {
      post = null;
    }

    // An unpublished or missing post still has to unfurl as something sane —
    // a bare link with no card reads as broken and kills the share.
    if (!post || post.status !== "published") {
      return this.respond(
        res,
        {
          title: "Blog — Edutu",
          description:
            "Founder notes, success stories, and guides to help every young African discover and win life-changing opportunities.",
          image: this.heroImage("blog"),
          imageAlt: "The Edutu blog",
          url: `${this.base}/blog`,
          ogType: "website",
          ctaLabel: "Read the Edutu blog →",
        },
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      );
    }

    const title = clean(post.title) || "Edutu Blog";
    const fullTitle = `${title} — Edutu Blog`;
    const description =
      truncate(
        clean(post.excerpt) || toPlainText(post.content ?? post.body),
        160,
      ) || `${title} — insights from the Edutu team.`;
    const articleBody = toPlainText(post.content ?? post.body);

    const image =
      this.absoluteImage(post.coverImage ?? post.cover_image) ??
      this.heroImage("blog");

    const publishedAt =
      post.publishedAt ?? post.published_at ?? post.createdAt ?? null;

    return this.respond(
      res,
      {
        title: fullTitle,
        description,
        image,
        imageAlt: title,
        url: pageUrl,
        ogType: "article",
        ctaLabel: "Read this post on Edutu →",
        articleBody,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: title,
          description,
          url: pageUrl,
          image: [image],
          ...(publishedAt
            ? { datePublished: new Date(publishedAt).toISOString() }
            : {}),
          author: {
            "@type": "Person",
            name: clean(post.authorName ?? post.author_name) || "Edutu",
          },
          publisher: {
            "@type": "Organization",
            name: "Edutu",
            url: `${this.base}/blog`,
            logo: {
              "@type": "ImageObject",
              url: `${this.base}/icons/icon-512x512.png`,
            },
          },
        },
      },
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
  }

  @Public()
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("event/:slugOrId")
  async event(
    @Param("slugOrId") slugOrId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const pageUrl = `${this.base}/events/${encodeURIComponent(slugOrId)}`;

    let event: Record<string, any> | null = null;
    try {
      event = await this.events.findOne(slugOrId);
    } catch {
      event = null;
    }

    if (!event || event.status !== "published") {
      return this.respond(
        res,
        {
          title:
            "Edutu events | Scholarships, mentorship and application support",
          description:
            "Live sessions, workshops and office hours from the Edutu team and our mentors — application clinics, scholarship walkthroughs, and Q&As you can join for free.",
          image: this.heroImage("events"),
          imageAlt: "Edutu events",
          url: `${this.base}/events`,
          ogType: "website",
          ctaLabel: "See upcoming Edutu events →",
        },
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      );
    }

    const title = clean(event.title) || "Edutu event";
    const fullTitle = `${title} | Edutu`;
    const description =
      truncate(clean(event.summary) || toPlainText(event.description), 200) ||
      "Join this live session from the Edutu team and our mentors.";

    const image =
      this.absoluteImage(event.imageUrl ?? event.image_url) ??
      this.heroImage("events");

    const startsAt = event.startsAt ?? event.starts_at ?? null;
    const endsAt = event.endsAt ?? event.ends_at ?? null;

    return this.respond(
      res,
      {
        title: fullTitle,
        description,
        image,
        imageAlt: title,
        url: pageUrl,
        ogType: "article",
        ctaLabel: "View this event on Edutu →",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Event",
          name: title,
          description,
          url: pageUrl,
          image: [image],
          eventAttendanceMode:
            (event.isOnline ?? event.is_online)
              ? "https://schema.org/OnlineEventAttendanceMode"
              : "https://schema.org/OfflineEventAttendanceMode",
          ...(startsAt ? { startDate: new Date(startsAt).toISOString() } : {}),
          ...(endsAt ? { endDate: new Date(endsAt).toISOString() } : {}),
          ...(clean(event.location)
            ? { location: { "@type": "Place", name: clean(event.location) } }
            : {}),
          organizer: {
            "@type": "Organization",
            name: "Edutu",
            url: `${this.base}/events`,
          },
        },
      },
      "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    );
  }
}
