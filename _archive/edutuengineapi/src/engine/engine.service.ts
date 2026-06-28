import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import type {
  DiscoveredItem,
  ExtractedOpportunity,
  ScrapeRunResult,
} from "./engine.types.js";
import { buildEngineShareText } from "./share-text.js";
import { assertSafeHttpUrl, resolvePublicAddress } from "./url-safety.js";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

const APPLY_TEXT_RE =
  /\b(apply|application|register|registration|official\s+(link|website|portal)|programme?\s+portal|submit|start\s+application|get\s+started)\b/i;
const GENERIC_TITLE_RE =
  /^(read\s+more|learn\s+more|continue\s+reading|view\s+(details|more)|more|click\s+here|visit\s+site)$/i;
const ROUNDUP_RE = /^(top|best)\s+\d+\b|\b(list|collection|roundup)\s+of\b/i;
const NON_APPLY_URL_RE =
  /(facebook|twitter|x\.com|linkedin|instagram|youtube|tiktok|whatsapp|telegram|mailto:|tel:|\/feed\/|\/comments?\/|#respond)/i;

@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  async runScrape(
    sourceUrl: string,
    options: { maxPages: number; limit: number },
  ): Promise<ScrapeRunResult> {
    const errors: string[] = [];
    const discovered: DiscoveredItem[] = [];

    for (let page = 1; page <= options.maxPages; page += 1) {
      try {
        const pageUrl = this.buildPageUrl(sourceUrl, page);
        const pageItems = await this.discoverItems(pageUrl, sourceUrl);
        discovered.push(...pageItems);
        if (pageItems.length === 0) break;
      } catch (error: any) {
        errors.push(error.message || `Discovery failed on page ${page}`);
        break;
      }
    }

    const uniqueItems = Array.from(
      new Map(
        discovered.map((item) => [this.normalizeUrl(item.detailUrl), item]),
      ).values(),
    ).slice(0, options.limit);

    const opportunities: ExtractedOpportunity[] = [];
    for (const item of uniqueItems) {
      try {
        opportunities.push(
          await this.extractOpportunityUrl(
            item.detailUrl,
            item.sourceUrl,
            item,
          ),
        );
      } catch (error: any) {
        errors.push(
          `${item.detailUrl}: ${error.message || "extraction failed"}`,
        );
      }
    }

    return {
      success: errors.length === 0 || opportunities.length > 0,
      sourceUrl,
      discovered: uniqueItems.length,
      extracted: opportunities.length,
      opportunities,
      errors,
    };
  }

  async extractOpportunityUrl(
    detailUrl: string,
    sourceUrl: string,
    seed?: Partial<DiscoveredItem>,
  ): Promise<ExtractedOpportunity> {
    assertSafeHttpUrl(detailUrl);
    assertSafeHttpUrl(sourceUrl);
    const html = await this.fetchHtml(detailUrl);
    const $ = cheerio.load(html);
    const title =
      this.cleanText(
        seed?.title || this.meta($, "og:title") || $("h1").first().text(),
        220,
      ) || "Untitled Opportunity";
    const text = this.extractMainText($);
    const summary =
      this.cleanText(
        seed?.description ||
          this.meta($, "description") ||
          this.meta($, "og:description"),
        420,
      ) || this.createBriefDescription(text);
    const description = this.createDescription(summary, text);
    const imageUrl = seed?.imageUrl || this.extractImage($, detailUrl);
    const applicationUrl = this.extractApplyLink($, detailUrl);
    const category = this.classify(title, description || summary || "");
    const deadline = this.extractDeadline(text);
    const location = this.extractLocation(text);
    const missingFields = this.missingFields({
      title,
      description,
      applicationUrl,
      imageUrl,
    });
    const qualityScore = this.qualityScore(
      missingFields,
      description,
      imageUrl,
    );

    const baseOpportunity = {
      title,
      summary,
      description,
      category,
      organization: this.extractOrganization(title),
      location,
      deadline,
      imageUrl,
      detailUrl,
      applicationUrl,
      sourceUrl,
    };
    const shareText = buildEngineShareText(baseOpportunity);

    return {
      ...baseOpportunity,
      shareText,
      status: missingFields.length === 0 ? "complete" : "needs_review",
      qualityScore,
      missingFields,
      metadata: {
        extractedAt: new Date().toISOString(),
        engine: "edutuengineapi",
        sourceHost: this.hostname(sourceUrl),
        detailHost: this.hostname(detailUrl),
        hasDirectApplicationUrl: Boolean(applicationUrl),
        shareText,
      },
    };
  }

  private async discoverItems(
    pageUrl: string,
    sourceUrl: string,
  ): Promise<DiscoveredItem[]> {
    assertSafeHttpUrl(pageUrl);
    assertSafeHttpUrl(sourceUrl);
    const wordpressItems = await this.discoverWordPressItems(
      pageUrl,
      sourceUrl,
    ).catch((error) => {
      this.logger.warn(`WordPress discovery failed: ${error.message}`);
      return [];
    });
    if (wordpressItems.length > 0) return wordpressItems;

    const html = await this.fetchHtml(pageUrl);
    const isFeed = /^\s*(?:<\?xml|<rss|<feed)/i.test(html);
    return isFeed
      ? this.discoverFeedItems(html, sourceUrl)
      : this.discoverHtmlItems(html, pageUrl, sourceUrl);
  }

  private async discoverWordPressItems(
    pageUrl: string,
    sourceUrl: string,
  ): Promise<DiscoveredItem[]> {
    const parsed = new URL(pageUrl);
    const categorySlug = parsed.pathname.match(/\/category\/([^/]+)/i)?.[1];
    if (!categorySlug) return [];

    const categoryUrl = `${parsed.origin}/wp-json/wp/v2/categories?slug=${encodeURIComponent(
      decodeURIComponent(categorySlug),
    )}`;
    const category = await axios.get(
      categoryUrl,
      this.createRequestConfig(15_000, "json"),
    );
    const categoryId = Number(category.data?.[0]?.id);
    if (!categoryId) return [];

    const pageNumber = Number(
      parsed.pathname.match(/\/page\/(\d+)/i)?.[1] || 1,
    );
    const postsUrl = `${parsed.origin}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=20&page=${pageNumber}&_embed=1`;
    const posts = await axios.get(
      postsUrl,
      this.createRequestConfig(20_000, "json"),
    );

    if (posts.status >= 400) return [];
    const rows = Array.isArray(posts.data) ? posts.data : [];
    return rows
      .map((post: any) => {
        const detailUrl = this.resolveUrl(post?.link || "", sourceUrl);
        const contentHtml = post?.content?.rendered || "";
        return {
          title: this.cleanHtmlText(post?.title?.rendered || "", 220),
          detailUrl,
          description:
            this.cleanHtmlText(post?.excerpt?.rendered || "", 420) ||
            this.createBriefDescription(this.cleanHtmlText(contentHtml, 1200)),
          imageUrl:
            post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
            this.extractImage(cheerio.load(contentHtml), detailUrl),
          sourceUrl,
        };
      })
      .filter((item: DiscoveredItem) => this.isValidItem(item));
  }

  private discoverFeedItems(html: string, sourceUrl: string): DiscoveredItem[] {
    const $ = cheerio.load(html, { xmlMode: true });
    const items: DiscoveredItem[] = [];
    $("item").each((_, el) => {
      const $item = $(el);
      const item: DiscoveredItem = {
        title: this.cleanText($item.find("title").first().text(), 220),
        detailUrl: this.resolveUrl(
          $item.find("link").first().text(),
          sourceUrl,
        ),
        description: this.cleanHtmlText(
          $item.find("description").first().text(),
          420,
        ),
        imageUrl: this.extractImage(
          cheerio.load($item.find("content\\:encoded").first().text()),
          sourceUrl,
        ),
        sourceUrl,
      };
      if (this.isValidItem(item)) items.push(item);
    });
    return items;
  }

  private discoverHtmlItems(
    html: string,
    pageUrl: string,
    sourceUrl: string,
  ): DiscoveredItem[] {
    const $ = cheerio.load(html);
    const cards = $(
      "article, .elementor-post, .post, .post-item, .listing-item, .program-card, .opportunity-card",
    );
    const items: DiscoveredItem[] = [];

    cards.each((_, el) => {
      const $card = $(el);
      const title = this.cleanText(
        $card
          .find("h1, h2, h3, h4, .entry-title, .elementor-post__title, .title")
          .first()
          .text() || $card.find("a").first().text(),
        220,
      );
      const href =
        $card
          .find(
            ".elementor-post__title a, a.elementor-post__thumbnail__link, a[href]",
          )
          .first()
          .attr("href") || "";
      const detailUrl = this.resolveUrl(href, pageUrl);
      const item: DiscoveredItem = {
        title,
        detailUrl,
        description: this.cleanText(
          $card
            .find("p, .entry-summary, .excerpt, .elementor-post__excerpt")
            .first()
            .text(),
          420,
        ),
        imageUrl: this.extractImage($card, pageUrl),
        sourceUrl,
      };
      if (this.isValidItem(item)) items.push(item);
    });

    if (items.length > 0) return items;

    $(
      'a[href*="scholarship"], a[href*="program"], a[href*="fellowship"], a[href*="internship"]',
    ).each((_, el) => {
      const $link = $(el);
      const item: DiscoveredItem = {
        title: this.cleanText($link.text(), 220),
        detailUrl: this.resolveUrl($link.attr("href") || "", pageUrl),
        sourceUrl,
      };
      if (this.isValidItem(item)) items.push(item);
    });

    return items;
  }

  private extractApplyLink(
    $: cheerio.CheerioAPI,
    detailUrl: string,
  ): string | null {
    const detailHost = this.hostname(detailUrl);
    const candidates: Array<{ url: string; score: number }> = [];

    $("a[href]").each((_, el) => {
      const $link = $(el);
      const url = this.cleanApplyUrl($link.attr("href") || "", detailUrl);

      const context = [
        $link.text(),
        $link.attr("aria-label"),
        $link.attr("title"),
        $link.attr("class"),
      ]
        .filter(Boolean)
        .join(" ");

      const sameHost = this.hostname(url) === detailHost;
      if (sameHost && !this.isLikelyApplicationLink(url, context)) return;

      let score = 0;
      if (APPLY_TEXT_RE.test(context)) score += 80;
      if (this.isLikelyApplicationLink(url, context)) score += 25;
      if (
        /forms\.|form\.|application|apply|career|recruit|jobs|portal|smartsheet|typeform|google\.com\/forms|forms\.office|forms\.cloud\.microsoft/i.test(
          url,
        )
      ) {
        score += 45;
      }
      if (/button|btn|apply|elementor-button/i.test(context)) score += 20;
      if (/share|comment|reply|print|download/i.test(context)) score -= 60;
      if (sameHost) score -= 15;
      if (score > 0) candidates.push({ url, score });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || null;
  }

  private extractImage(
    $: cheerio.CheerioAPI | cheerio.Cheerio<any>,
    baseUrl: string,
  ): string | null {
    const root: any = $;
    const meta =
      typeof root === "function"
        ? root('meta[property="og:image"]').attr("content") ||
          root('meta[property="og:image:secure_url"]').attr("content") ||
          root('meta[name="twitter:image"]').attr("content")
        : null;
    const metaImage = this.resolveImage(meta, baseUrl);
    if (metaImage) return metaImage;

    let imageUrl: string | null = null;
    root(
      "article img, .entry-content img, .post-content img, main img, img",
    ).each((_: number, el: any) => {
      if (imageUrl) return;
      const attrs = el.attribs || {};
      imageUrl =
        this.resolveImage(attrs.src, baseUrl) ||
        this.resolveImage(attrs["data-src"], baseUrl) ||
        this.resolveImage(attrs.srcset, baseUrl) ||
        this.resolveImage(attrs["data-srcset"], baseUrl);
    });
    return imageUrl;
  }

  private extractMainText($: cheerio.CheerioAPI): string {
    $(
      "script, style, noscript, nav, footer, header, aside, form, iframe",
    ).remove();
    const candidates: string[] = [];
    $(
      "article, .entry-content, .post-content, main, [class*=content], [class*=article]",
    ).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length >= 120) candidates.push(text);
    });
    const text = candidates.length
      ? candidates
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join("\n\n")
      : $("body").text();
    return this.cleanText(text, 12_000);
  }

  private meta($: cheerio.CheerioAPI, name: string): string {
    return (
      $(`meta[property="${name}"]`).attr("content") ||
      $(`meta[name="${name}"]`).attr("content") ||
      ""
    );
  }

  private missingFields(input: {
    title: string;
    description: string | null;
    applicationUrl: string | null;
    imageUrl: string | null;
  }): string[] {
    const missing: string[] = [];
    if (!input.title || input.title.length < 8) missing.push("title");
    if (!input.description || input.description.length < 120)
      missing.push("description");
    if (!input.applicationUrl) missing.push("applicationUrl");
    if (!input.imageUrl) missing.push("imageUrl");
    return missing;
  }

  private qualityScore(
    missing: string[],
    description: string | null,
    imageUrl: string | null,
  ): number {
    let score = 100 - missing.length * 18;
    if (description && description.length >= 240) score += 8;
    if (imageUrl) score += 4;
    return Math.max(0, Math.min(100, score));
  }

  private classify(
    title: string,
    description: string,
  ): ExtractedOpportunity["category"] {
    const text = `${title} ${description}`.toLowerCase();
    if (/\bintern(ship)?\b/.test(text)) return "internship";
    if (/\bfellow(ship)?\b/.test(text)) return "fellowship";
    if (/\bscholar(ship)?\b|tuition|fully funded|grant\b/.test(text))
      return "scholarship";
    if (
      /\bprogram(me)?\b|bootcamp|accelerator|conference|summit|training\b/.test(
        text,
      )
    )
      return "program";
    return "other";
  }

  private extractOrganization(title: string): string | null {
    const titleOrg = title.match(
      /^(.+?)\s+(scholarship|fellowship|internship|program|programme)\b/i,
    )?.[1];
    return this.cleanText(titleOrg || "", 120) || null;
  }

  private extractDeadline(text: string): string | null {
    const month =
      "January|February|March|April|May|June|July|August|September|October|November|December";
    const patterns = [
      /deadline[:\s]*([^\n.]{5,80})/i,
      /closes?\s+(?:on\s+)?([^\n.]{5,80})/i,
      new RegExp(`(${month})\\s+\\d{1,2},?\\s+\\d{4}`, "i"),
      new RegExp(`\\d{1,2}(st|nd|rd|th)?\\s+(${month}),?\\s+\\d{4}`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return this.cleanText(match[0], 90);
    }
    return null;
  }

  private extractLocation(text: string): string | null {
    const match =
      text.match(/location[:\s]*([^\n.]{3,60})/i) ||
      text.match(/host country[:\s]*([^\n.]{3,60})/i);
    return match ? this.cleanText(match[1], 80) || null : null;
  }

  private createDescription(
    summary: string | null,
    text: string,
  ): string | null {
    if (summary && summary.length >= 120) return summary;
    const brief = this.createBriefDescription(text);
    return brief || summary || null;
  }

  private createBriefDescription(text: string): string | null {
    const cleaned = this.cleanText(text, 900);
    if (cleaned.length < 80) return null;
    const sentence = cleaned.match(/^(.{120,420}?[.!?])\s/);
    return sentence?.[1]?.trim() || cleaned.substring(0, 420).trim();
  }

  private isValidItem(item: DiscoveredItem): boolean {
    if (!item.title || item.title.length < 8) return false;
    if (GENERIC_TITLE_RE.test(item.title)) return false;
    if (ROUNDUP_RE.test(item.title)) return false;
    if (!item.detailUrl.startsWith("http")) return false;
    try {
      const parsed = new URL(item.detailUrl);
      if (
        /\/(category|tag|author|page|search|privacy|terms|about|contact)\/?$/i.test(
          parsed.pathname,
        )
      ) {
        return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  private cleanApplyUrl(rawHref: string, baseUrl: string): string {
    const resolved = this.resolveUrl(rawHref, baseUrl);
    if (!resolved || NON_APPLY_URL_RE.test(resolved)) return "";
    try {
      const parsed = new URL(resolved);
      const redirectTarget =
        parsed.searchParams.get("url") ||
        parsed.searchParams.get("u") ||
        parsed.searchParams.get("target") ||
        parsed.searchParams.get("redirect_to");
      if (redirectTarget?.startsWith("http")) return redirectTarget;
    } catch {
      return resolved;
    }
    return resolved;
  }

  private resolveImage(
    rawValue: string | undefined | null,
    baseUrl: string,
  ): string | null {
    if (!rawValue) return null;
    const firstSrc = rawValue.split(",")[0]?.trim().split(/\s+/)[0];
    const resolved = this.resolveUrl(firstSrc || rawValue, baseUrl);
    if (!resolved || !resolved.startsWith("http")) return null;
    if (/logo|icon|avatar|profile|placeholder|spinner|loading/i.test(resolved))
      return null;
    return resolved;
  }

  private async fetchHtml(url: string): Promise<string> {
    assertSafeHttpUrl(url);
    const response = await axios.get(url, this.createRequestConfig(30_000));
    if (response.status >= 400)
      throw new Error(`HTTP ${response.status} for ${url}`);
    if (typeof response.data !== "string") {
      throw new Error(`Unexpected non-text response from ${url}`);
    }
    return response.data;
  }

  private createRequestConfig(
    timeout: number,
    responseType: "text" | "json" = "text",
  ) {
    return {
      timeout,
      headers: BROWSER_HEADERS,
      validateStatus: (status: number) => status < 500,
      maxRedirects: 5,
      responseType,
      lookup: (
        hostname: string,
        _options: object,
        callback: (error: Error | null, address: any, family?: any) => void,
      ) => {
        void resolvePublicAddress(hostname)
          .then(({ address, family }) => callback(null, address, family))
          .catch((error: Error) => callback(error, undefined, undefined));
      },
      beforeRedirect: (options: Record<string, unknown>) => {
        const protocol =
          typeof options.protocol === "string" ? options.protocol : "";
        const hostname =
          typeof options.hostname === "string" ? options.hostname : "";
        if (!protocol || !hostname) {
          throw new Error("Blocked unsafe redirect target");
        }
        const redirectHost =
          hostname.includes(":") && !hostname.startsWith("[")
            ? `[${hostname}]`
            : hostname;
        assertSafeHttpUrl(`${protocol}//${redirectHost}`);
      },
    };
  }

  private buildPageUrl(baseUrl: string, page: number): string {
    if (page === 1) return baseUrl;
    return baseUrl.includes("?")
      ? `${baseUrl}&page=${page}`
      : `${baseUrl.replace(/\/$/, "")}/page/${page}/`;
  }

  private resolveUrl(href: string, baseUrl: string): string {
    if (!href) return "";
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href.startsWith("http") ? href : "";
    }
  }

  private hostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  private normalizeUrl(url: string): string {
    return url
      .trim()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  private cleanHtmlText(text: string, maxChars = 500): string {
    if (!text) return "";
    const withoutTags = /<[^>]+>/.test(text)
      ? cheerio.load(`<body>${text}</body>`)("body").text()
      : text;
    return this.cleanText(withoutTags, maxChars);
  }

  private cleanText(text: string, maxChars = 500): string {
    return (text || "").replace(/\s+/g, " ").trim().substring(0, maxChars);
  }

  private isLikelyApplicationLink(url: string, context: string): boolean {
    const normalizedContext = context.toLowerCase();
    const normalizedUrl = url.toLowerCase();
    return /(?:apply|application|register|registration|enroll|enrol|admission|portal|form|submit|start\s+application|get\s+started)/i.test(
      `${normalizedContext} ${normalizedUrl}`,
    );
  }
}
