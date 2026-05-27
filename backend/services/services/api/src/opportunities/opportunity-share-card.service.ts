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

const BUCKET = process.env.OPPORTUNITY_SHARE_CARD_BUCKET || "opportunity-share-cards";
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1680;

@Injectable()
export class OpportunityShareCardService {
  private readonly logger = new Logger(OpportunityShareCardService.name);
  private readonly supabase: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  }

  async ensureShareCardForOpportunity(
    opportunity: OpportunityRecord,
    options: { force?: boolean } = {},
  ): Promise<ShareCardResult | null> {
    if (!this.supabase || !opportunity?.id) return null;

    const metadata = this.asRecord(opportunity.metadata);
    const fingerprint = this.createFingerprint(opportunity);
    const existing = this.asRecord(metadata.share_card);

    if (!options.force && existing?.url && existing?.fingerprint === fingerprint) {
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
            ...metadata,
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

  async ensureShareCardsForOpportunities(opportunities: OpportunityRecord[]): Promise<void> {
    const enabled = process.env.OPPORTUNITY_SHARE_CARD_GENERATION !== "false";
    if (!enabled || opportunities.length === 0) return;

    const limit = Math.max(1, Math.min(Number(process.env.OPPORTUNITY_SHARE_CARD_CONCURRENCY) || 2, 5));
    for (let index = 0; index < opportunities.length; index += limit) {
      const batch = opportunities.slice(index, index + limit);
      await Promise.all(batch.map((opportunity) => this.ensureShareCardForOpportunity(opportunity)));
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.supabase) return;
    const { data: buckets, error } = await this.supabase.storage.listBuckets();
    if (error) throw error;
    if (buckets?.some((bucket) => bucket.name === BUCKET)) return;
    const { error: createError } = await this.supabase.storage.createBucket(BUCKET, { public: true });
    if (createError) throw createError;
  }

  private async renderImage(svg: string): Promise<{
    body: Buffer;
    contentType: string;
    format: "png" | "svg";
  }> {
    try {
      // Optional dependency: production installs sharp for WhatsApp-friendly PNG cards.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  private renderSvg(opportunity: OpportunityRecord): string {
    const metadata = this.asRecord(opportunity.metadata);
    const requirements = this.arrayFrom(opportunity.requirements ?? metadata.requirements).slice(0, 5);
    const benefits = this.arrayFrom(opportunity.benefits ?? metadata.benefits).slice(0, 5);
    const application = this.arrayFrom(opportunity.application_process ?? metadata.application_process).slice(0, 3);
    const titleLines = this.wrap(this.clean(opportunity.title, "Opportunity"), 24, 4);
    const summaryLines = this.wrap(
      this.clean(opportunity.summary || opportunity.description, "A curated opportunity from Edutu. Review full details and apply through the official source."),
      62,
      5,
    );

    const facts = [
      ["Reward", this.funding(opportunity, benefits)],
      ["Category", this.clean(opportunity.category, "General")],
      ["Eligible Applicants", this.eligibility(opportunity)],
      ["Deadline", this.deadline(opportunity.close_date || opportunity.deadline)],
      ["Location", this.clean(opportunity.location || opportunity.target_region, "Worldwide")],
      ["Source", this.clean(opportunity.organization || opportunity.source, "Edutu")],
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F8FBFF"/>
      <stop offset="0.48" stop-color="#EEF6FF"/>
      <stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>
  <circle cx="-40" cy="330" r="210" fill="#3B82F6" opacity="0.08"/>
  <circle cx="1030" cy="1540" r="245" fill="#0EA5E9" opacity="0.10"/>
  <rect x="78" y="1620" width="924" height="18" rx="9" fill="#2F80ED"/>

  <g transform="translate(78 58)">
    <circle cx="18" cy="18" r="18" fill="#2563EB"/>
    <text x="48" y="24" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="900" fill="#0B2F6B">Edutu</text>
    <text x="48" y="47" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="800" letter-spacing="3" fill="#5B7CFA">OPPORTUNITY BRIEF</text>
  </g>
  <text x="870" y="86" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="21" font-weight="800" fill="#2563EB">Visit edutu.ai</text>

  ${this.textBlock(titleLines, 78, 225, 63, 75, "#0A1020", 900)}
  ${this.providerBlock(opportunity)}
  ${this.textBlock(summaryLines, 78, 565, 27, 37, "#172033", 500)}

  ${this.factGrid(facts)}
  ${this.section("Scholarship Reward / Benefits", benefits.length ? benefits : [this.funding(opportunity, benefits)], 78, 950)}
  ${this.section("Requirements", requirements.length ? requirements : ["Review the official eligibility criteria before applying."], 78, 1160)}
  ${this.applySection(application.length ? application : [opportunity.application_url || opportunity.apply_url || "Open this opportunity in Edutu and follow the application link."], 78, 1390)}
</svg>`;
  }

  private providerBlock(opportunity: OpportunityRecord): string {
    const provider = this.clean(opportunity.organization || opportunity.source, "Opportunity provider").toUpperCase();
    const lines = this.wrap(provider, 16, 4);
    return `
  <rect x="790" y="220" width="210" height="130" rx="28" fill="#FFFFFF" stroke="#D6E8FF"/>
  <text x="895" y="290" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="900" fill="#0B2F6B">${this.escape(provider.slice(0, 2))}</text>
  ${this.textBlock(lines, 770, 378, 24, 30, "#0B2F6B", 900, 260, "middle")}`;
  }

  private factGrid(facts: string[][]): string {
    return facts
      .map(([label, value], index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = 78 + column * 318;
        const y = 760 + row * 104;
        return `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="19" font-weight="900" fill="#2563EB">${this.escape(label)}:</text>
  <text x="${x}" y="${y + 35}" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="700" fill="#111827">${this.escape(this.truncate(value, 42))}</text>`;
      })
      .join("\n  ");
  }

  private section(title: string, items: string[], x: number, y: number): string {
    const bulletLines = items.flatMap((item) => this.wrap(`• ${this.clean(item)}`, 72, 2));
    return `<text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="900" fill="#2563EB">${this.escape(title)}</text>
  ${this.textBlock(bulletLines.slice(0, 10), x + 16, y + 40, 23, 31, "#0F172A", 500)}`;
  }

  private applySection(items: string[], x: number, y: number): string {
    const lines = items.flatMap((item, index) => this.wrap(`${index + 1}. ${this.clean(item)}`, 76, 2));
    return `<line x1="${x}" x2="1002" y1="${y - 28}" y2="${y - 28}" stroke="#2563EB" stroke-opacity="0.14" stroke-width="2"/>
  <text x="${x}" y="${y}" font-family="Inter, Arial, sans-serif" font-size="25" font-weight="900" fill="#2563EB">How To Apply</text>
  ${this.textBlock(lines.slice(0, 6), x, y + 40, 22, 30, "#0F172A", 600)}`;
  }

  private textBlock(
    lines: string[],
    x: number,
    y: number,
    size: number,
    lineHeight: number,
    fill: string,
    weight: number,
    width = 720,
    anchor: "start" | "middle" = "start",
  ): string {
    return lines
      .map(
        (line, index) =>
          `<text x="${anchor === "middle" ? x + width / 2 : x}" y="${y + index * lineHeight}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${this.escape(line)}</text>`,
      )
      .join("\n  ");
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
          title: opportunity.title,
          summary: opportunity.summary,
          description: opportunity.description,
          organization: opportunity.organization,
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
      benefits.find((benefit) => /fund|stipend|tuition|grant|award/i.test(benefit)) ||
      opportunity.funding_type ||
      "Open opportunity"
    );
  }

  private eligibility(opportunity: OpportunityRecord): string {
    const eligibility = this.asRecord(opportunity.eligibility ?? this.asRecord(opportunity.metadata).eligibility);
    const countries = eligibility.countries;
    if (Array.isArray(countries) && countries.length > 0) {
      return countries.length > 3 ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}` : countries.join(", ");
    }
    if (typeof countries === "string") return countries;
    return opportunity.target_region || opportunity.location || "Open to eligible applicants";
  }

  private deadline(value?: string | Date | null): string {
    if (!value) return "Rolling / Not specified";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
    if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
      lines[maxLines - 1] = this.truncate(lines[maxLines - 1], maxChars);
    }
    return lines;
  }

  private arrayFrom(value: unknown): string[] {
    return Array.isArray(value) ? value.map((item) => this.clean(String(item), "")).filter(Boolean) : [];
  }

  private clean(value?: string | null, fallback = "Not specified"): string {
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    return text || fallback;
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
  }
}
