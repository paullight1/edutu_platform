import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { AppService } from "./app.service";
import { Public } from "./auth";
import { OpportunitiesService } from "./opportunities/opportunities.service";
import { EventsService } from "./events/events.service";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toLastmod(value?: Date | string | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function renderUrl(input: {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}) {
  return [
    "  <url>",
    `    <loc>${escapeXml(input.loc)}</loc>`,
    `    <lastmod>${escapeXml(input.lastmod)}</lastmod>`,
    `    <changefreq>${escapeXml(input.changefreq)}</changefreq>`,
    `    <priority>${input.priority}</priority>`,
    "  </url>",
  ].join("\n");
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly opportunitiesService: OpportunitiesService,
    private readonly eventsService: EventsService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("ready")
  @Public()
  getReadiness() {
    return this.appService.getReadiness();
  }

  @Get("sitemap.xml")
  @Public()
  async getSitemap(@Res({ passthrough: true }) response: Response) {
    const baseUrl = this.opportunitiesService.getPublicAppBaseUrl();
    const toAbsoluteUrl = (pathname: string) =>
      new URL(pathname, `${baseUrl}/`).toString();
    const [opportunities, events] = await Promise.all([
      this.opportunitiesService.listSitemapOpportunities(),
      this.eventsService.listSitemapEvents(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      {
        loc: toAbsoluteUrl("/"),
        lastmod: today,
        changefreq: "daily",
        priority: "0.8",
      },
      {
        loc: toAbsoluteUrl("/opportunities"),
        lastmod: today,
        changefreq: "daily",
        priority: "1.0",
      },
      {
        loc: toAbsoluteUrl("/events"),
        lastmod: today,
        changefreq: "daily",
        priority: "0.9",
      },
      ...opportunities.map((opportunity) => ({
        loc: toAbsoluteUrl(
          `/opportunity/${encodeURIComponent(opportunity.id)}`,
        ),
        lastmod: toLastmod(opportunity.updatedAt ?? opportunity.createdAt),
        changefreq: "weekly",
        priority: "0.8",
      })),
      ...events.map((event) => ({
        loc: toAbsoluteUrl(`/events/${encodeURIComponent(event.slug)}`),
        lastmod: toLastmod(event.updatedAt ?? event.startsAt),
        changefreq: "weekly",
        priority: "0.7",
      })),
    ];
    const sitemap = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map(renderUrl),
      "</urlset>",
      "",
    ].join("\n");

    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=900, s-maxage=3600");

    return sitemap;
  }

  @Get("robots.txt")
  @Public()
  getRobots(@Res({ passthrough: true }) response: Response) {
    const baseUrl = this.opportunitiesService.getPublicAppBaseUrl();
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "public, max-age=900, s-maxage=3600");

    return [
      "User-agent: *",
      "Allow: /",
      "",
      `Sitemap: ${new URL("/sitemap.xml", `${baseUrl}/`).toString()}`,
      "",
    ].join("\n");
  }
}
