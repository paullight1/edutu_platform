import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const BUCKET =
  process.env.OPPORTUNITY_SHARE_CARD_BUCKET || "opportunity-share-cards";
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350; // Instagram feed portrait (4:5)

// Font stack limited to what the render container (librsvg via sharp) can
// resolve — no exotic webfonts. We win on layout, colour and hierarchy.
const FONT = "'Inter', 'Helvetica Neue', 'Segoe UI', Arial, sans-serif";

// Bump when the card layout changes so cached cards regenerate on next fetch.
const DESIGN_VERSION = "v5-brief-ig45";

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

  async ensureShareCardForOpportunity(
    opportunity: OpportunityRecord,
    options: { force?: boolean } = {},
  ): Promise<ShareCardResult | null> {
    if (!this.supabase || !opportunity?.id) return null;

    const metadata = this.asRecord(opportunity.metadata);
    const fingerprint = this.createFingerprint(opportunity);
    const existing = this.asRecord(metadata.share_card);

    if (
      !options.force &&
      existing?.url &&
      existing?.fingerprint === fingerprint
    ) {
      return existing as ShareCardResult;
    }

    try {
      await this.ensureBucket();
      const svg = this.renderSvg(opportunity);
      const rendered = await this.renderImage(svg);
      const path = `${this.storageFolder(opportunity)}/${opportunity.id}-${fingerprint}.${rendered.format}`;

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
        .select("metadata")
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

      await this.supabase
        .from("opportunities")
        .update({
          metadata: {
            ...latestMetadata,
            share_card: shareCard,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", opportunity.id);

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

  private renderSvg(opportunity: OpportunityRecord): string {
    const metadata = this.asRecord(opportunity.metadata);
    const title = this.clean(opportunity.title, "Opportunity");
    const provider = this.clean(
      opportunity.organization || opportunity.source,
      "Opportunity provider",
    );
    const category = this.clean(opportunity.category, "Opportunity");
    const summary = this.clean(
      opportunity.summary || opportunity.description,
      "A curated opportunity from Edutu. Review the full details and apply through the official source.",
    );
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
    const H = CARD_HEIGHT; // 1680
    const M = 72; // page margin
    const CW = W - M * 2; // content width
    const FOOTER_H = 124;
    const footerTop = H - FOOTER_H;

    // Header height flexes with the title so long titles never clip.
    // Compact scale for the 4:5 feed portrait — leaves the body room to breathe.
    const titleLines = this.wrap(title, 27, 3);
    const titleStart = 232;
    const titleLH = 60;
    const titleBottom = titleStart + (titleLines.length - 1) * titleLH;
    const providerY = titleBottom + 70;
    const headerH = providerY + 74;

    const layers: string[] = [];

    // Page + header band
    layers.push(`<rect width="${W}" height="${H}" fill="#FFFFFF"/>`);
    layers.push(`<rect width="${W}" height="${headerH}" fill="url(#brand)"/>`);
    layers.push(
      `<circle cx="${W - 40}" cy="40" r="230" fill="#FFFFFF" fill-opacity="0.06"/>`,
    );
    layers.push(
      `<circle cx="130" cy="${headerH - 20}" r="180" fill="#38BDF8" fill-opacity="0.12"/>`,
    );

    // Brand mark + live status
    layers.push(this.brandMark(M, 58));
    layers.push(this.statusPill(W - M, 70, status));

    // Category chip
    layers.push(
      this.chip(M, 144, category.toUpperCase(), {
        bg: "#FFFFFF",
        bgOpacity: 0.14,
        fg: "#DBEAFE",
        size: 19,
        tracking: 2.5,
      }),
    );

    // Title (hero, on the gradient)
    titleLines.forEach((line, i) => {
      layers.push(
        `<text x="${M}" y="${titleStart + i * titleLH}" font-family="${FONT}" font-size="50" font-weight="800" letter-spacing="-0.5" fill="#FFFFFF">${this.escape(line)}</text>`,
      );
    });

    // Provider row
    layers.push(this.providerRow(M, providerY, provider, opportunity));

    // ---- Body (flowing cursor, budget-aware) ----
    let y = headerH + 44;
    const bodyBottom = footerTop - 36; // hard floor above footer

    // Summary (wrap kept conservative so it survives wider fallback fonts)
    const summaryLines = this.wrap(summary, 58, 2);
    summaryLines.forEach((line, i) => {
      layers.push(
        `<text x="${M}" y="${y + i * 37}" font-family="${FONT}" font-size="26" font-weight="500" fill="#475569">${this.escape(line)}</text>`,
      );
    });
    y += summaryLines.length * 37 + 26;

    // Fact tiles (2 x 2)
    const facts: Array<[string, string, string]> = [
      ["Reward", this.funding(opportunity, benefits), "#0F172A"],
      ["Deadline", this.deadline(deadlineRaw), status.valueColor],
      ["Eligibility", this.eligibility(opportunity), "#0F172A"],
      [
        "Location",
        this.clean(
          opportunity.location || opportunity.target_region,
          "Worldwide",
        ),
        "#0F172A",
      ],
    ];
    const tileW = (CW - 24) / 2;
    const tileH = 98;
    facts.forEach(([label, value, color], i) => {
      const tx = M + (i % 2) * (tileW + 24);
      const ty = y + Math.floor(i / 2) * (tileH + 18);
      layers.push(this.factTile(tx, ty, tileW, tileH, label, value, color));
    });
    y += 2 * (tileH + 18) + 22;

    // How-to-apply is measured FIRST and the band is anchored just above the
    // footer, so it always renders. The benefit/requirement columns then fill
    // the space above it — no fragile "is there room?" guard that could drop it.
    const applyItems = application.length
      ? application
      : applyUrl
        ? [applyUrl]
        : [
            "Open this opportunity in Edutu and follow the official application link.",
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

    // Benefits + Requirements. On the wide 4:5 canvas they sit in two columns
    // so BOTH show (fuller detail). A single list spans the full width.
    if (benefits.length && requirements.length) {
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
    } else if (benefits.length) {
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
    } else if (requirements.length) {
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

    // Quiet closing mark if the lists leave a big gap above the apply band.
    if (applyTop - y > 190) {
      const mid = Math.round((y + applyTop) / 2);
      layers.push(
        `<circle cx="${W / 2}" cy="${mid - 30}" r="5" fill="#C7D6F5"/>`,
      );
      layers.push(
        `<text x="${W / 2}" y="${mid + 8}" text-anchor="middle" font-family="${FONT}" font-size="20" font-weight="700" letter-spacing="0.4" fill="#94A3B8">Shared via Edutu — your AI opportunity coach</text>`,
      );
    }

    // Apply band (anchored above footer) + footer
    layers.push(this.renderApplyBand(M, applyTop, CW, applyLines));
    layers.push(this.footer(footerTop, W, FOOTER_H));

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B1E45"/>
      <stop offset="0.55" stop-color="#173C82"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
    <linearGradient id="footer" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0B1E45"/>
      <stop offset="1" stop-color="#1D4ED8"/>
    </linearGradient>
  </defs>
  ${layers.join("\n  ")}
</svg>`;
  }

  private brandMark(x: number, y: number): string {
    return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="54" height="54" rx="16" fill="#FFFFFF"/>
    <text x="27" y="40" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="900" fill="#123C82">E</text>
    <text x="70" y="26" font-family="${FONT}" font-size="30" font-weight="800" letter-spacing="-0.3" fill="#FFFFFF">Edutu</text>
    <text x="70" y="49" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="3.5" fill="#8FB4FF">OPPORTUNITY BRIEF</text>
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
    const w = Math.round(
      text.length * (opts.size * 0.66 + opts.tracking) + 40,
    );
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
    <text x="${x + 88}" y="${y - 10}" font-family="${FONT}" font-size="27" font-weight="800" fill="#FFFFFF">${this.escape(this.truncate(provider, 34))}</text>
    <text x="${x + 88}" y="${y + 18}" font-family="${FONT}" font-size="20" font-weight="600" fill="#AFC7FF">${this.escape(this.truncate(sub, 42))}</text>
  </g>`;
  }

  private factTile(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    color: string,
  ): string {
    return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="#F4F8FF" stroke="#E1EAFF" stroke-width="1.5"/>
    <text x="${x + 28}" y="${y + 40}" font-family="${FONT}" font-size="16" font-weight="800" letter-spacing="1.8" fill="#2563EB">${this.escape(label.toUpperCase())}</text>
    <text x="${x + 28}" y="${y + 76}" font-family="${FONT}" font-size="26" font-weight="800" fill="${color}">${this.escape(this.truncate(value, 24))}</text>
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
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="#EEF4FF" stroke="#D6E4FF" stroke-width="1.5"/>`,
      `<text x="${x + 34}" y="${y + 52}" font-family="${FONT}" font-size="22" font-weight="900" letter-spacing="2" fill="#2563EB">HOW TO APPLY</text>`,
    ];
    let cy = y + 88;
    lines.forEach((line) => {
      parts.push(
        `<text x="${x + 34}" y="${cy}" font-family="${FONT}" font-size="22" font-weight="600" fill="#1E293B">${this.escape(line)}</text>`,
      );
      cy += 32;
    });
    return parts.join("\n  ");
  }

  private footer(top: number, w: number, h: number): string {
    const cy = top + h / 2;
    return `<g>
    <rect x="0" y="${top}" width="${w}" height="${h}" fill="url(#footer)"/>
    <text x="72" y="${cy - 4}" font-family="${FONT}" font-size="24" font-weight="800" fill="#FFFFFF">Discover more opportunities</text>
    <text x="72" y="${cy + 26}" font-family="${FONT}" font-size="19" font-weight="600" fill="#AFC7FF">Personalized matches, roadmaps &amp; deadline reminders</text>
    <g transform="translate(${w - 72 - 168} ${cy - 26})">
      <rect x="0" y="0" width="168" height="52" rx="26" fill="#FFFFFF"/>
      <text x="84" y="34" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="900" fill="#123C82">edutu.ai</text>
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

  private createFingerprint(opportunity: OpportunityRecord): string {
    const metadata = this.asRecord(opportunity.metadata);
    return createHash("sha1")
      .update(
        JSON.stringify({
          design: DESIGN_VERSION,
          title: opportunity.title,
          summary: opportunity.summary,
          description: opportunity.description,
          organization: opportunity.organization,
          category: opportunity.category,
          location: opportunity.location || opportunity.target_region,
          deadline: opportunity.close_date || opportunity.deadline,
          requirements: metadata.requirements,
          benefits: metadata.benefits,
          application_process: metadata.application_process,
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
      "Open opportunity"
    );
  }

  private eligibility(opportunity: OpportunityRecord): string {
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
    return (
      opportunity.target_region ||
      opportunity.location ||
      "Open to eligible applicants"
    );
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
      lines[maxLines - 1] = this.truncate(lines[maxLines - 1], maxChars);
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
}
