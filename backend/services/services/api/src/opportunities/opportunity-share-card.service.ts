import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EDUTU_LOGO_DATA_URI } from "./opportunity-share-logo";

type OpportunityRecord = Record<string, any>;

export interface ShareCardResult {
  url: string;
  path: string;
  format: "png" | "svg";
  generatedAt: string;
  fingerprint: string;
  expiresAt: string | null;
}

export interface SharePdfResult {
  url: string;
  path: string;
  format: "pdf";
  generatedAt: string;
  fingerprint: string;
  expiresAt: string | null;
}

interface SharePdfPreparationResult {
  sharePdf: SharePdfResult | null;
  buffer?: Buffer;
}

export interface ShareCardArtwork {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

const BUCKET =
  process.env.OPPORTUNITY_SHARE_CARD_BUCKET || "opportunity-share-cards";
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1080; // Square feed and share image (1:1)

// The API rasterizes SVGs with librsvg via sharp. Use the font installed by
// the API image instead of relying on fonts from the host container.
const FONT = "'DejaVu Sans', sans-serif";

// Template and AI artwork have separate cache versions. A template redesign
// must not invalidate an already generated AI flyer.
const DESIGN_VERSION = "v14-editorial-template";
const CREATIVE_DESIGN_VERSION = "v13-creative-flyers";

// Public marketing site — shown on the card CTA and used as the share landing.
const BRAND_DOMAIN = "www.edutu.org";

interface ShareStatus {
  label: string;
  dot: string;
  valueColor: string;
}

@Injectable()
export class OpportunityShareCardService {
  private readonly logger = new Logger(OpportunityShareCardService.name);
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  getCreativeShareCard(opportunity: OpportunityRecord): ShareCardResult | null {
    const card = this.asRecord(
      this.asRecord(opportunity.metadata).creative_share_card,
    );
    return card.url &&
      card.fingerprint ===
        this.createFingerprint(opportunity, CREATIVE_DESIGN_VERSION)
      ? (card as ShareCardResult)
      : null;
  }

  async ensureShareCardForOpportunity(
    opportunity: OpportunityRecord,
    options: {
      force?: boolean;
      artwork?: ShareCardArtwork;
      design?: "branded";
    } = {},
  ): Promise<ShareCardResult | null> {
    if (!this.supabase || !opportunity?.id) return null;

    const metadata = this.asRecord(opportunity.metadata);
    const fingerprint = this.createFingerprint(
      opportunity,
      options.artwork ? CREATIVE_DESIGN_VERSION : DESIGN_VERSION,
    );
    const variantKey = options.artwork
      ? "creative_share_card"
      : "branded_share_card";
    const existing = this.asRecord(
      options.design ? metadata.branded_share_card : metadata.share_card,
    );

    if (
      !options.force &&
      !options.artwork &&
      existing?.url &&
      existing?.fingerprint === fingerprint
    ) {
      if (!options.design)
        await this.ensureImageFallback(
          opportunity.id,
          opportunity.image_url,
          String(existing.url),
        );
      return existing as ShareCardResult;
    }

    try {
      await this.ensureBucket();
      const svg = this.renderSvg(opportunity, options.artwork);
      const rendered = await this.renderImage(svg);
      const artworkVersion = options.artwork
        ? `-${createHash("sha256").update(options.artwork.data).digest("hex").slice(0, 12)}`
        : "";
      const path = `${this.storageFolder(opportunity)}/${opportunity.id}-${fingerprint}${artworkVersion}.${rendered.format}`;

      const { error: uploadError } = await this.supabase.storage
        .from(BUCKET)
        .upload(path, rendered.body, {
          contentType: rendered.contentType,
          upsert: true,
          cacheControl: "31536000",
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data: latestOpportunity } = await this.supabase
        .from("opportunities")
        .select("metadata, image_url")
        .eq("id", opportunity.id)
        .maybeSingle();
      const latestMetadata = this.asRecord(
        latestOpportunity?.metadata ?? metadata,
      );
      const shareCard: ShareCardResult = {
        url: data.publicUrl,
        path,
        format: rendered.format,
        generatedAt: new Date().toISOString(),
        fingerprint,
        expiresAt: this.computeExpiry(opportunity),
      };

      const { error: saveError } = await this.supabase
        .from("opportunities")
        .update({
          metadata: {
            ...latestMetadata,
            share_card: options.design
              ? latestMetadata.share_card || shareCard
              : shareCard,
            [variantKey]: shareCard,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);
      if (saveError) throw saveError;
      if (!options.design)
        await this.ensureImageFallback(
          opportunity.id,
          latestOpportunity?.image_url ?? opportunity.image_url,
          shareCard.url,
        );

      return shareCard;
    } catch (error) {
      this.logger.warn(
        `Could not generate share card for opportunity ${opportunity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async buildSharePdfForOpportunity(
    opportunity: OpportunityRecord,
    options: { force?: boolean } = {},
  ): Promise<{ sharePdf: SharePdfResult | null; buffer: Buffer } | null> {
    if (!opportunity?.id) return null;

    const prepared = await this.ensureSharePdfForOpportunity(
      opportunity,
      options,
    );
    if (prepared?.buffer) {
      return { sharePdf: prepared.sharePdf, buffer: prepared.buffer };
    }

    if (prepared?.sharePdf?.url) {
      const cachedBuffer = await this.downloadBufferFromUrl(
        prepared.sharePdf.url,
      );
      if (cachedBuffer) {
        return { sharePdf: prepared.sharePdf, buffer: cachedBuffer };
      }
    }

    const fallbackBuffer = await this.renderSharePdfBuffer(opportunity);
    if (!fallbackBuffer) {
      return null;
    }

    return {
      sharePdf: prepared?.sharePdf ?? null,
      buffer: fallbackBuffer,
    };
  }

  async ensureShareCardsForOpportunities(
    opportunities: OpportunityRecord[],
  ): Promise<void> {
    const enabled = process.env.OPPORTUNITY_SHARE_CARD_GENERATION !== "false";
    if (!enabled || opportunities.length === 0) return;

    const limit = Math.max(
      1,
      Math.min(Number(process.env.OPPORTUNITY_SHARE_CARD_CONCURRENCY) || 2, 5),
    );
    for (let index = 0; index < opportunities.length; index += limit) {
      const batch = opportunities.slice(index, index + limit);
      await Promise.all(
        batch.map((opportunity) =>
          this.ensureShareCardForOpportunity(opportunity),
        ),
      );
    }
  }

  async ensureSharePdfsForOpportunities(
    opportunities: OpportunityRecord[],
  ): Promise<void> {
    const enabled = process.env.OPPORTUNITY_SHARE_PDF_GENERATION !== "false";
    if (!enabled || !this.supabase || opportunities.length === 0) return;

    const limit = Math.max(
      1,
      Math.min(Number(process.env.OPPORTUNITY_SHARE_PDF_CONCURRENCY) || 2, 5),
    );

    for (let index = 0; index < opportunities.length; index += limit) {
      const batch = opportunities.slice(index, index + limit);
      await Promise.all(
        batch.map(async (opportunity) => {
          await this.ensureSharePdfForOpportunity(opportunity);
        }),
      );
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.supabase) return;
    const { data: buckets, error } = await this.supabase.storage.listBuckets();
    if (error) throw error;
    if (buckets?.some((bucket) => bucket.name === BUCKET)) return;
    const { error: createError } = await this.supabase.storage.createBucket(
      BUCKET,
      { public: true },
    );
    if (createError) throw createError;
  }

  private async renderImage(svg: string): Promise<{
    body: Buffer;
    contentType: string;
    format: "png" | "svg";
  }> {
    try {
      // Optional dependency: production installs sharp for WhatsApp-friendly PNG cards.

      const sharp = require("sharp");
      const png = await sharp(Buffer.from(svg)).png({ quality: 92 }).toBuffer();
      return { body: png, contentType: "image/png", format: "png" };
    } catch {
      return {
        body: Buffer.from(svg),
        contentType: "image/svg+xml; charset=utf-8",
        format: "svg",
      };
    }
  }

  private async renderPdf(svg: string): Promise<Buffer | null> {
    try {
      // Optional dependency: production installs sharp for PDF share cards.
      const sharp = require("sharp");
      const jpeg = await sharp(Buffer.from(svg))
        .jpeg({ quality: 92 })
        .toBuffer();
      return this.buildSingleImagePdf(jpeg, CARD_WIDTH, CARD_HEIGHT);
    } catch {
      return null;
    }
  }

  private async renderSharePdfBuffer(
    opportunity: OpportunityRecord,
  ): Promise<Buffer | null> {
    const svg = this.renderSvg(opportunity);
    return this.renderPdf(svg);
  }

  private renderSvg(
    opportunity: OpportunityRecord,
    artwork?: ShareCardArtwork,
  ): string {
    if (artwork?.data?.length) {
      return this.renderCreativePosterSvg(opportunity, artwork);
    }

    const metadata = this.asRecord(opportunity.metadata);
    const title = this.clean(opportunity.title, "Opportunity");
    const provider = this.clean(opportunity.organization, "");
    const category = this.clean(opportunity.category, "Opportunity");
    const rawSummary = this.clean(
      opportunity.summary || opportunity.description,
      "A promising opportunity to explore. Review the provider’s official listing for complete application details.",
    );
    const summary = rawSummary.toLowerCase().startsWith(title.toLowerCase())
      ? rawSummary.slice(title.length).replace(/^[\s:–—-]+/, "") || rawSummary
      : rawSummary;
    const benefits = this.arrayFrom(opportunity.benefits ?? metadata.benefits);
    const requirements = this.arrayFrom(
      opportunity.requirements ?? metadata.requirements,
    );
    const application = this.arrayFrom(
      opportunity.application_process ?? metadata.application_process,
    );
    const applyUrl = this.clean(
      opportunity.application_url ||
        opportunity.apply_url ||
        opportunity.link ||
        "",
      "",
    );
    const deadlineRaw = opportunity.close_date || opportunity.deadline;
    const status = this.statusInfo(deadlineRaw);

    // ---- Layout frame ----
    const W = CARD_WIDTH; // 1080
    const H = CARD_HEIGHT; // 1080
    const M = 72; // page margin
    const CW = W - M * 2; // content width
    const FOOTER_H = 124;
    const footerTop = H - FOOTER_H;

    // Header height flexes with the title so long titles never clip.
    // Compact scale for the square feed image — leaves the body room to breathe.
    const longTitle = title.length > 65;
    const titleLines = this.wrap(title, longTitle ? 32 : 26, 3);
    const titleStart = 224;
    const titleLH = longTitle ? 57 : 62;
    const titleBottom = titleStart + (titleLines.length - 1) * titleLH;
    const providerY = titleBottom + 70;
    const headerH = provider ? providerY + 74 : titleBottom + 72;

    const layers: string[] = [];

    // Editorial cover: a strong title plane with restrained brand geometry.
    layers.push(`<rect width="${W}" height="${H}" fill="#F6F5F1"/>`);
    layers.push(`<rect width="${W}" height="${headerH}" fill="url(#brand)"/>`);
    layers.push(
      `<rect x="0" y="${headerH}" width="${W}" height="${H - headerH - FOOTER_H}" fill="#F6F5F1"/>`,
    );
    layers.push(
      `<path d="M 630 0 H ${W} V ${headerH} H 955 Z" fill="#FFFFFF" fill-opacity="0.035"/>`,
    );
    layers.push(
      `<path d="M 775 0 H ${W} V ${headerH} H 1030 Z" fill="#4C9AFF" fill-opacity="0.065"/>`,
    );
    layers.push(
      `<path d="M ${M} 129 H ${W - M}" stroke="#FFFFFF" stroke-opacity="0.2" stroke-width="2"/>`,
    );

    // Brand mark + live status
    layers.push(this.brandMark(M, 58));
    layers.push(this.statusPill(W - M, 70, status));

    // Category is an editorial kicker, not a second button.
    layers.push(
      `<rect x="${M}" y="160" width="10" height="10" fill="#67E8F9"/>`,
    );
    layers.push(
      `<text x="${M + 26}" y="171" font-family="${FONT}" font-size="20" font-weight="800" letter-spacing="3" fill="#BEE9FF">${this.escape(this.truncate(category.toUpperCase(), 32))}</text>`,
    );

    // Title (hero, on the gradient)
    titleLines.forEach((line, i) => {
      layers.push(
        `<text x="${M}" y="${titleStart + i * titleLH}" font-family="${FONT}" font-size="${longTitle ? 46 : 53}" font-weight="800" letter-spacing="-0.9" fill="#FFFFFF">${this.escape(line)}</text>`,
      );
    });

    // Provider row
    if (provider)
      layers.push(this.providerRow(M, providerY, provider, opportunity));

    // ---- Body (flowing cursor, budget-aware) ----
    let y = headerH + 38;
    const bodyBottom = footerTop - 36; // hard floor above footer

    // Reserve application instructions first so long source text cannot crowd
    // the deadline or run into the footer.
    const applyItems = application.length
      ? application
      : [
          applyUrl
            ? `Visit ${this.urlHost(applyUrl) || "the official listing"} to apply.`
            : "Open the official listing for current application instructions.",
        ];
    const applyLinesAll = applyItems
      .slice(0, 2)
      .flatMap((step, i) => this.wrap(`${i + 1}.  ${this.clean(step)}`, 58, 2));
    const applyLines = applyLinesAll.slice(0, 3);
    if (applyLines.length > 0 && applyLines.length < applyLinesAll.length) {
      const last = applyLines[applyLines.length - 1].replace(/[\s.,;:]+$/, "");
      applyLines[applyLines.length - 1] = `${last}…`;
    }
    const applyH = 78 + applyLines.length * 32 + 18;
    const applyTop = bodyBottom - applyH;
    const listBottom = applyTop - 28;

    const summaryLines = this.wrap(summary, 58, applyTop - y > 340 ? 2 : 1);
    layers.push(
      `<text x="${M}" y="${y + 15}" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="3" fill="#2057A0">THE OPPORTUNITY</text>`,
    );
    summaryLines.forEach((line, i) => {
      layers.push(
        `<text x="${M}" y="${y + 56 + i * 38}" font-family="${FONT}" font-size="26" font-weight="500" fill="#34445C">${this.escape(line)}</text>`,
      );
    });
    y += 82 + (summaryLines.length - 1) * 38;

    const hasDetailLists = benefits.length > 0 || requirements.length > 0;
    const deadlineH = hasDetailLists
      ? Math.max(84, Math.min(100, applyTop - y - 118))
      : Math.max(92, Math.min(152, applyTop - y - 26));
    const deadlineLabel = deadlineRaw
      ? this.deadline(deadlineRaw)
      : "Not listed";
    const sourceHost = this.urlHost(applyUrl);
    layers.push(
      this.deadlineFeature(
        M,
        y,
        CW,
        deadlineH,
        deadlineLabel,
        sourceHost || "",
        status,
      ),
    );
    y += deadlineH + (hasDetailLists ? 24 : 18);

    const reward = this.funding(opportunity, benefits);
    const location = this.clean(
      opportunity.location || opportunity.target_region,
      "",
    );
    const detail = reward || location || this.eligibility(opportunity);
    if (detail && !hasDetailLists && listBottom - y > 40) {
      layers.push(
        `<text x="${M}" y="${y + 22}" font-family="${FONT}" font-size="21" font-weight="700" fill="#34445C">${this.escape(this.truncate(detail, 76))}</text>`,
      );
      y += 42;
    }

    // Benefits and requirements are optional; never invent details to fill space.
    if (listBottom - y > 78 && benefits.length && requirements.length) {
      const block = this.dualLists(
        { title: "Benefits", items: benefits, marker: "check", max: 3 },
        { title: "Requirements", items: requirements, marker: "dot", max: 3 },
        M,
        y,
        CW,
        listBottom,
      );
      layers.push(block.svg);
      y = block.y;
    } else if (listBottom - y > 78 && benefits.length) {
      const block = this.listSection(
        "Benefits",
        benefits,
        M,
        y,
        CW,
        listBottom,
        "check",
        3,
      );
      layers.push(block.svg);
      y = block.y;
    } else if (listBottom - y > 78 && requirements.length) {
      const block = this.listSection(
        "Requirements",
        requirements,
        M,
        y,
        CW,
        listBottom,
        "dot",
        3,
      );
      layers.push(block.svg);
      y = block.y;
    }

    // Give listings with sparse source data useful, honest content instead of
    // leaving a large white gap or inventing benefits and eligibility.
    if (!benefits.length && !requirements.length && applyTop - y > 48) {
      layers.push(this.renderNextSteps(M, y, CW, applyTop - y - 8));
    }

    // Apply band (anchored above footer) + footer
    layers.push(this.renderApplyBand(M, applyTop, CW, applyLines));
    layers.push(this.footer(footerTop, W, FOOTER_H));

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#091A37"/>
      <stop offset="0.62" stop-color="#123876"/>
      <stop offset="1" stop-color="#1D58B3"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0B1E45"/>
      <stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  ${layers.join("\n  ")}
</svg>`;
  }

  private renderCreativePosterSvg(
    opportunity: OpportunityRecord,
    artwork: ShareCardArtwork,
  ): string {
    const metadata = this.asRecord(opportunity.metadata);
    const title = this.clean(opportunity.title, "Opportunity");
    const provider = this.clean(opportunity.organization, "");
    const category = this.clean(opportunity.category, "Opportunity");
    const summary = this.clean(
      opportunity.summary || opportunity.description,
      "Explore the opportunity and confirm application details with the official provider.",
    );
    const deadlineRaw = opportunity.close_date || opportunity.deadline;
    const status = this.statusInfo(deadlineRaw);
    const dataUri = `data:${artwork.mimeType};base64,${artwork.data.toString("base64")}`;
    const layers: string[] = [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#08142C"/>`,
      `<image x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice" href="${dataUri}" xlink:href="${dataUri}"/>`,
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#creativeShade)"/>`,
      this.brandMark(72, 58),
      this.statusPill(CARD_WIDTH - 72, 68, status),
      this.chip(72, 156, category.toUpperCase(), {
        bg: "#FFFFFF",
        bgOpacity: 0.18,
        fg: "#FFFFFF",
        size: 19,
        tracking: 2.3,
      }),
    ];

    const badges: string[] = [];
    if (deadlineRaw) badges.push(`DEADLINE  ·  ${this.deadline(deadlineRaw)}`);
    const funding = this.funding(
      opportunity,
      this.arrayFrom(opportunity.benefits ?? metadata.benefits),
    );
    if (funding) badges.push(`AWARD  ·  ${funding}`);
    const location = this.clean(
      opportunity.location || opportunity.target_region,
      "",
    );
    if (location) badges.push(location);
    const titleLines = this.wrap(title, 29, 3);
    const summaryLines = this.wrap(summary, 62, 2);
    const titleLineHeight = 62;
    const detailHeight =
      (titleLines.length - 1) * titleLineHeight +
      (provider ? 92 : 48) +
      (summaryLines.length - 1) * 32 +
      (badges.length ? 86 : 0);
    const titleTop = CARD_HEIGHT - 124 - detailHeight;
    titleLines.forEach((line, index) => {
      layers.push(
        `<text x="72" y="${titleTop + index * titleLineHeight}" font-family="${FONT}" font-size="54" font-weight="850" letter-spacing="-0.6" fill="#FFFFFF">${this.escape(line)}</text>`,
      );
    });
    const titleBottom = titleTop + (titleLines.length - 1) * titleLineHeight;
    if (provider)
      layers.push(
        `<text x="76" y="${titleBottom + 44}" font-family="${FONT}" font-size="26" font-weight="700" fill="#DCE9FF">${this.escape(this.truncate(provider, 60))}</text>`,
      );
    const summaryTop = titleBottom + (provider ? 92 : 48);
    summaryLines.forEach((line, index) => {
      layers.push(
        `<text x="76" y="${summaryTop + index * 32}" font-family="${FONT}" font-size="25" font-weight="500" fill="#F1F5F9">${this.escape(line)}</text>`,
      );
    });
    const badgeY = summaryTop + (summaryLines.length - 1) * 32 + 24;
    badges.slice(0, 2).forEach((label, index) => {
      const x = 76 + index * 454;
      layers.push(
        `<rect x="${x}" y="${badgeY}" width="430" height="62" rx="20" fill="#FFFFFF" fill-opacity="0.16" stroke="#FFFFFF" stroke-opacity="0.24"/>`,
        `<text x="${x + 22}" y="${badgeY + 39}" font-family="${FONT}" font-size="22" font-weight="750" fill="#FFFFFF">${this.escape(this.truncate(label, 34))}</text>`,
      );
    });

    layers.push(
      `<rect x="72" y="${CARD_HEIGHT - 92}" width="936" height="3" rx="1.5" fill="#FFFFFF" fill-opacity="0.38"/>`,
      `<text x="76" y="${CARD_HEIGHT - 40}" font-family="${FONT}" font-size="22" font-weight="800" letter-spacing="1.2" fill="#FFFFFF">VIEW DETAILS &amp; APPLY</text>`,
      `<text x="1008" y="${CARD_HEIGHT - 40}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="700" fill="#DCE9FF">${BRAND_DOMAIN}</text>`,
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="creativeShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071329" stop-opacity="0.46"/>
      <stop offset="0.35" stop-color="#071329" stop-opacity="0.1"/>
      <stop offset="0.52" stop-color="#071329" stop-opacity="0.18"/>
      <stop offset="0.7" stop-color="#071329" stop-opacity="0.86"/>
      <stop offset="1" stop-color="#071329" stop-opacity="0.98"/>
    </linearGradient>
  </defs>
  ${layers.join("\n  ")}
</svg>`;
  }

  private renderNextSteps(x: number, y: number, w: number, h: number): string {
    return `<g>
      <path d="M ${x} ${y + 4} H ${x + w}" stroke="#C9D5E7" stroke-width="2"/>
      <text x="${x}" y="${y + 32}" font-family="${FONT}" font-size="17" font-weight="800" letter-spacing="2.2" fill="#2057A0">A GOOD PLACE TO START</text>
      <text x="${x + w}" y="${y + 32}" text-anchor="end" font-family="${FONT}" font-size="20" font-weight="600" fill="#34445C">Check your eligibility.</text>
      ${h > 88 ? `<text x="${x}" y="${y + 68}" font-family="${FONT}" font-size="21" font-weight="500" fill="#52627A">Confirm requirements and documents on the official listing.</text>` : ""}
    </g>`;
  }

  private deadlineFeature(
    x: number,
    y: number,
    w: number,
    h: number,
    deadline: string,
    sourceHost: string,
    status: ShareStatus,
  ): string {
    const dateSize = h < 120 || deadline.length > 21 ? 33 : 42;
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#E9EFF9"/>
      <path d="M ${x + 5} ${y + 18} V ${y + h - 18}" stroke="#2366C7" stroke-width="8" stroke-linecap="round"/>
      <text x="${x + 34}" y="${y + 38}" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="2.1" fill="#2057A0">APPLICATION DEADLINE</text>
      <text x="${x + 34}" y="${y + Math.min(h - 17, 100)}" font-family="${FONT}" font-size="${dateSize}" font-weight="800" letter-spacing="-1" fill="${status.valueColor === "#DC2626" ? "#B42318" : "#112B53"}">${this.escape(deadline)}</text>
      ${sourceHost && h >= 126 ? `<text x="${x + w - 30}" y="${y + 39}" text-anchor="end" font-family="${FONT}" font-size="18" font-weight="600" fill="#516682">${this.escape(this.truncate(sourceHost, 25))}</text>` : ""}
    </g>`;
  }

  private brandMark(x: number, y: number): string {
    // Real Edutu logo mark on a white chip (was a plain "E" placeholder).
    return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="58" height="58" rx="17" fill="#FFFFFF"/>
    <image x="7" y="7" width="44" height="44" xlink:href="${EDUTU_LOGO_DATA_URI}" href="${EDUTU_LOGO_DATA_URI}" preserveAspectRatio="xMidYMid meet"/>
    <text x="74" y="27" font-family="${FONT}" font-size="30" font-weight="800" letter-spacing="-0.3" fill="#FFFFFF">Edutu</text>
    <text x="74" y="50" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="3.5" fill="#8FB4FF">OPPORTUNITY BRIEF</text>
  </g>`;
  }

  private statusPill(rightX: number, y: number, status: ShareStatus): string {
    const w = Math.round(58 + status.label.length * 11.5);
    const x = rightX - w;
    return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="46" rx="23" fill="#FFFFFF" fill-opacity="0.14" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="1.5"/>
    <circle cx="${x + 27}" cy="${y + 23}" r="7" fill="${status.dot}"/>
    <text x="${x + 44}" y="${y + 30}" font-family="${FONT}" font-size="18" font-weight="800" letter-spacing="1.4" fill="#FFFFFF">${this.escape(status.label)}</text>
  </g>`;
  }

  private chip(
    x: number,
    y: number,
    text: string,
    opts: {
      bg: string;
      bgOpacity?: number;
      fg: string;
      size: number;
      tracking: number;
    },
  ): string {
    const w = Math.round(text.length * (opts.size * 0.66 + opts.tracking) + 40);
    return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="42" rx="21" fill="${opts.bg}" fill-opacity="${opts.bgOpacity ?? 1}"/>
    <text x="${x + 22}" y="${y + 28}" font-family="${FONT}" font-size="${opts.size}" font-weight="800" letter-spacing="${opts.tracking}" fill="${opts.fg}">${this.escape(text)}</text>
  </g>`;
  }

  private providerRow(
    x: number,
    y: number,
    provider: string,
    opportunity: OpportunityRecord,
  ): string {
    const initials =
      provider
        .replace(/[^A-Za-z0-9 ]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase() || "ED";
    const sub = this.clean(
      opportunity.location || opportunity.target_region,
      "Global opportunity",
    );
    return `<g>
    <circle cx="${x + 34}" cy="${y - 6}" r="34" fill="#FFFFFF"/>
    <text x="${x + 34}" y="${y + 4}" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="900" fill="#123C82">${this.escape(initials)}</text>
    <text x="${x + 88}" y="${y - 10}" font-family="${FONT}" font-size="23" font-weight="800" fill="#FFFFFF">${this.escape(this.truncate(provider, 48))}</text>
    <text x="${x + 88}" y="${y + 18}" font-family="${FONT}" font-size="20" font-weight="600" fill="#AFC7FF">${this.escape(this.truncate(sub, 42))}</text>
  </g>`;
  }

  private listSection(
    title: string,
    items: string[],
    x: number,
    y: number,
    w: number,
    bottom: number,
    marker: "check" | "dot",
    maxItems = 3,
  ): { svg: string; y: number } {
    const parts: string[] = [
      `<text x="${x}" y="${y + 8}" font-family="${FONT}" font-size="24" font-weight="900" letter-spacing="0.3" fill="#0B1E45">${this.escape(title)}</text>`,
    ];
    let cy = y + 48;
    const lh = 33;
    // Characters-per-line derived from the column width so it works both
    // full-width and in a narrow two-column layout (safe for wide fallback fonts).
    const cpl = Math.max(18, Math.floor((w - 44) / 13.5));
    for (const item of items.slice(0, maxItems)) {
      const wrapped = this.wrap(this.clean(item), cpl, 2);
      let stop = false;
      wrapped.forEach((line, li) => {
        if (cy > bottom) {
          stop = true;
          return;
        }
        if (li === 0) {
          if (marker === "check") {
            parts.push(
              `<circle cx="${x + 10}" cy="${cy - 8}" r="11" fill="#DCFCE7"/>`,
            );
            parts.push(
              `<path d="M ${x + 5} ${cy - 8} L ${x + 9} ${cy - 4} L ${x + 16} ${cy - 13}" fill="none" stroke="#16A34A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
            );
          } else {
            parts.push(
              `<circle cx="${x + 10}" cy="${cy - 8}" r="4.5" fill="#2563EB"/>`,
            );
          }
        }
        parts.push(
          `<text x="${x + 36}" y="${cy}" font-family="${FONT}" font-size="23" font-weight="500" fill="#1E293B">${this.escape(line)}</text>`,
        );
        cy += lh;
      });
      if (stop) break;
    }
    return { svg: parts.join("\n  "), y: cy };
  }

  private dualLists(
    left: {
      title: string;
      items: string[];
      marker: "check" | "dot";
      max: number;
    },
    right: {
      title: string;
      items: string[];
      marker: "check" | "dot";
      max: number;
    },
    x: number,
    y: number,
    w: number,
    bottom: number,
  ): { svg: string; y: number } {
    const gap = 28;
    const colW = (w - gap) / 2;
    const a = this.listSection(
      left.title,
      left.items,
      x,
      y,
      colW,
      bottom,
      left.marker,
      left.max,
    );
    const b = this.listSection(
      right.title,
      right.items,
      x + colW + gap,
      y,
      colW,
      bottom,
      right.marker,
      right.max,
    );
    return { svg: `${a.svg}\n  ${b.svg}`, y: Math.max(a.y, b.y) };
  }

  private renderApplyBand(
    x: number,
    y: number,
    w: number,
    lines: string[],
  ): string {
    const h = 78 + lines.length * 32 + 18;
    const parts: string[] = [
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#FFFFFF" stroke="#DCE4F0" stroke-width="2"/>`,
      `<path d="M ${x + 30} ${y + 24} H ${x + w - 30}" stroke="#2366C7" stroke-width="4"/>`,
      `<text x="${x + 34}" y="${y + 62}" font-family="${FONT}" font-size="20" font-weight="800" letter-spacing="2.1" fill="#2057A0">HOW TO APPLY</text>`,
    ];
    let cy = y + 94;
    lines.forEach((line) => {
      parts.push(
        `<text x="${x + 34}" y="${cy}" font-family="${FONT}" font-size="22" font-weight="600" fill="#1D314F">${this.escape(line)}</text>`,
      );
      cy += 32;
    });
    return parts.join("\n  ");
  }

  private footer(top: number, w: number, h: number): string {
    const cy = top + h / 2;
    return `<g>
    <rect x="0" y="${top}" width="${w}" height="${h}" fill="url(#footer)"/>
    <text x="72" y="${cy - 5}" font-family="${FONT}" font-size="25" font-weight="800" fill="#FFFFFF">Find your next opportunity.</text>
    <text x="72" y="${cy + 27}" font-family="${FONT}" font-size="19" font-weight="600" fill="#B7D0F2">Explore more at ${BRAND_DOMAIN}</text>
    <g transform="translate(${w - 72 - 196} ${cy - 26})">
      <rect x="0" y="0" width="196" height="52" rx="26" fill="#FFFFFF"/>
      <image x="16" y="9" width="34" height="34" xlink:href="${EDUTU_LOGO_DATA_URI}" href="${EDUTU_LOGO_DATA_URI}" preserveAspectRatio="xMidYMid meet"/>
      <text x="124" y="34" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="900" fill="#123C82">edutu.org</text>
    </g>
  </g>`;
  }

  private statusInfo(value?: string | Date | null): ShareStatus {
    const days = this.daysLeft(value);
    if (days !== null && days < 0) {
      return { label: "CLOSED", dot: "#F87171", valueColor: "#DC2626" };
    }
    if (days !== null && days <= 7) {
      return {
        label: `${days}D LEFT`,
        dot: "#FBBF24",
        valueColor: "#D97706",
      };
    }
    return { label: "ACTIVE", dot: "#34D399", valueColor: "#0F172A" };
  }

  private daysLeft(value?: string | Date | null): number | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  }

  private buildSingleImagePdf(
    imageBytes: Buffer,
    width: number,
    height: number,
  ): Buffer {
    const parts: Buffer[] = [];
    const offsets: number[] = [];
    let byteLength = 0;

    const add = (chunk: Buffer) => {
      parts.push(chunk);
      byteLength += chunk.length;
    };

    const addText = (value: string) => add(Buffer.from(value, "utf8"));

    const addObject = (objectNumber: number, body: Buffer) => {
      offsets[objectNumber] = byteLength;
      addText(`${objectNumber} 0 obj\n`);
      add(body);
      addText("\nendobj\n");
    };

    addText("%PDF-1.4\n");

    addObject(1, Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "utf8"));
    addObject(
      2,
      Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "utf8"),
    );
    addObject(
      3,
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
        "utf8",
      ),
    );

    const imageHeader = Buffer.from(
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
      "utf8",
    );
    const imageFooter = Buffer.from("\nendstream", "utf8");
    addObject(4, Buffer.concat([imageHeader, imageBytes, imageFooter]));

    const contentStream = Buffer.from(
      `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`,
      "utf8",
    );
    const contentHeader = Buffer.from(
      `<< /Length ${contentStream.length} >>\nstream\n`,
      "utf8",
    );
    const contentFooter = Buffer.from("\nendstream", "utf8");
    addObject(5, Buffer.concat([contentHeader, contentStream, contentFooter]));

    const xrefOffset = byteLength;
    let xref = "xref\n0 6\n0000000000 65535 f \n";
    for (let index = 1; index <= 5; index += 1) {
      xref += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    addText(xref);

    return Buffer.concat(parts);
  }

  private async ensureSharePdfForOpportunity(
    opportunity: OpportunityRecord,
    options: { force?: boolean } = {},
  ): Promise<SharePdfPreparationResult | null> {
    if (!this.supabase || !opportunity?.id) return null;

    const metadata = this.asRecord(opportunity.metadata);
    const fingerprint = this.createFingerprint(opportunity);
    const existing = this.asRecord(metadata.share_pdf);

    if (
      !options.force &&
      existing?.url &&
      existing?.fingerprint === fingerprint
    ) {
      return { sharePdf: existing as SharePdfResult };
    }

    const buffer = await this.renderSharePdfBuffer(opportunity);
    if (!buffer) {
      return null;
    }

    try {
      await this.ensureBucket();
      const path = `${this.storageFolder(opportunity)}/${opportunity.id}-${fingerprint}.pdf`;

      const { error: uploadError } = await this.supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: "application/pdf",
          upsert: true,
          cacheControl: "31536000",
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data: latestOpportunity } = await this.supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", opportunity.id)
        .maybeSingle();
      const latestMetadata = this.asRecord(
        latestOpportunity?.metadata ?? metadata,
      );
      const sharePdf: SharePdfResult = {
        url: data.publicUrl,
        path,
        format: "pdf",
        generatedAt: new Date().toISOString(),
        fingerprint,
        expiresAt: this.computeExpiry(opportunity),
      };

      await this.supabase
        .from("opportunities")
        .update({
          metadata: {
            ...latestMetadata,
            share_pdf: sharePdf,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);

      return { sharePdf, buffer };
    } catch (error) {
      this.logger.warn(
        `Could not generate share PDF for opportunity ${opportunity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { sharePdf: null, buffer };
    }
  }

  private async downloadBufferFromUrl(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  private storageFolder(opportunity: OpportunityRecord): string {
    const expiresAt = this.computeExpiry(opportunity);
    return expiresAt ? "expiring" : "active";
  }

  private computeExpiry(opportunity: OpportunityRecord): string | null {
    const raw = opportunity.close_date || opportunity.deadline;
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + 30);
    return date.toISOString();
  }

  private createFingerprint(
    opportunity: OpportunityRecord,
    designVersion = DESIGN_VERSION,
  ): string {
    const metadata = this.asRecord(opportunity.metadata);
    return createHash("sha1")
      .update(
        JSON.stringify({
          design: designVersion,
          title: opportunity.title,
          summary: opportunity.summary,
          description: opportunity.description,
          organization: opportunity.organization,
          category: opportunity.category,
          location: opportunity.location || opportunity.target_region,
          deadline: opportunity.close_date || opportunity.deadline,
          requirements: opportunity.requirements ?? metadata.requirements,
          eligibility:
            opportunity.eligibility_criteria ||
            opportunity.eligibilityCriteria ||
            opportunity.eligibility ||
            metadata.eligibility,
          stipend: opportunity.stipend,
          currency: opportunity.currency,
          funding: opportunity.funding_type,
          applyUrl:
            opportunity.application_url ||
            opportunity.apply_url ||
            opportunity.link,
          benefits: opportunity.benefits ?? metadata.benefits,
          application_process:
            opportunity.application_process ?? metadata.application_process,
        }),
      )
      .digest("hex")
      .slice(0, 16);
  }

  private funding(opportunity: OpportunityRecord, benefits: string[]): string {
    if (opportunity.stipend) {
      const amount = Number(opportunity.stipend);
      return Number.isFinite(amount)
        ? `${opportunity.currency || ""} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`.trim()
        : String(opportunity.stipend);
    }
    return (
      benefits.find((benefit) =>
        /fund|stipend|tuition|grant|award/i.test(benefit),
      ) ||
      opportunity.funding_type ||
      ""
    );
  }

  private eligibility(opportunity: OpportunityRecord): string {
    const criteria = this.clean(
      opportunity.eligibility_criteria || opportunity.eligibilityCriteria,
      "",
    );
    if (criteria) return criteria;
    const eligibility = this.asRecord(
      opportunity.eligibility ??
        this.asRecord(opportunity.metadata).eligibility,
    );
    const countries = eligibility.countries;
    if (Array.isArray(countries) && countries.length > 0) {
      return countries.length > 3
        ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`
        : countries.join(", ");
    }
    if (typeof countries === "string") return countries;
    return "";
  }

  private urlHost(value: string): string | null {
    try {
      return new URL(value).hostname.replace(/^www\./i, "");
    } catch {
      return null;
    }
  }

  private deadline(value?: string | Date | null): string {
    if (!value) return "Rolling / Not specified";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
  }

  private wrap(value: string, maxChars: number, maxLines: number): string[] {
    const words = this.clean(value).split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
      if (lines.length === maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (
      lines.length === maxLines &&
      words.join(" ").length > lines.join(" ").length
    ) {
      const last = lines[maxLines - 1].replace(/[\s.,;:]+$/, "");
      lines[maxLines - 1] =
        last.length >= maxChars ? this.truncate(last, maxChars) : `${last}…`;
    }
    return lines;
  }

  private arrayFrom(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.clean(String(item), "")).filter(Boolean)
      : [];
  }

  private clean(value?: string | null, fallback = "Not specified"): string {
    const text =
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    return text || fallback;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength
      ? value
      : `${value.slice(0, maxLength - 1).trim()}…`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  /**
   * An opportunity the scraper couldn't find a unique image for uses its
   * generated branded card as the feed/hero image. Generated images are
   * recognizable by the bucket in their URL, so a later scrape that finds a
   * real image can still replace them — a real image is never overwritten.
   */
  private async ensureImageFallback(
    opportunityId: string,
    currentImageUrl: unknown,
    cardUrl: string,
  ): Promise<void> {
    if (!this.supabase || !cardUrl) return;
    const current =
      typeof currentImageUrl === "string" ? currentImageUrl.trim() : "";
    if (current && !current.includes(`/${BUCKET}/`)) return;
    if (current === cardUrl) return;
    const { error } = await this.supabase
      .from("opportunities")
      .update({ image_url: cardUrl })
      .eq("id", opportunityId);
    if (error) {
      this.logger.warn(
        `Could not set generated image fallback for ${opportunityId}: ${error.message}`,
      );
    }
  }
}
