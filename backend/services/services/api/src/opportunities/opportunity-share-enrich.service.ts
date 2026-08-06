import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AiService } from "../ai";
import {
  ShareEnrichmentSchema,
  buildShareEnrichPrompt,
  mergeShareEnrichment,
  missingShareFields,
  shareEnrichSourceHash,
} from "./opportunity-share-enrich";

type OpportunityRecord = Record<string, any>;

@Injectable()
export class OpportunityShareEnrichService {
  private readonly logger = new Logger(OpportunityShareEnrichService.name);
  private readonly supabase: SupabaseClient | null;

  constructor(private readonly aiService: AiService) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, { auth: { persistSession: false } })
        : null;
  }

  /**
   * Fills an opportunity's missing share fields (benefits / eligibility /
   * summary) with grounded AI output, once, cached. Best-effort: any failure
   * returns the opportunity unchanged so sharing never breaks.
   */
  async ensureEnriched(
    opportunity: OpportunityRecord,
  ): Promise<OpportunityRecord> {
    if (!opportunity?.id) return opportunity;

    const missing = missingShareFields(opportunity);
    if (missing.length === 0) return opportunity;

    const hash = shareEnrichSourceHash(opportunity);
    const metadata =
      opportunity.metadata && typeof opportunity.metadata === "object"
        ? opportunity.metadata
        : {};
    // Already attempted this exact content — don't re-spend on the same text.
    if (metadata.ai_enriched?.sourceHash === hash) return opportunity;

    let parsed;
    try {
      const raw = await this.aiService.generateJson<Record<string, unknown>>({
        feature: "opportunities.share_enrich",
        prompt: buildShareEnrichPrompt(opportunity, missing),
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { opportunityId: opportunity.id },
      });
      if (!raw) return opportunity;
      parsed = ShareEnrichmentSchema.parse(raw);
    } catch (error) {
      this.logger.warn(
        `Share enrichment skipped for ${opportunity.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return opportunity;
    }

    const { metadataPatch, filled } = mergeShareEnrichment(
      opportunity,
      parsed,
      hash,
      "deepseek-chat",
    );
    if (!metadataPatch) return opportunity;

    await this.persist(opportunity.id, metadataPatch);

    // Reflect the enrichment in the in-memory record so the very next
    // share-text/card build (same request) uses it without a re-read.
    const enriched: OpportunityRecord = {
      ...opportunity,
      metadata: metadataPatch,
    };
    if (filled.includes("summary") && metadataPatch.summary) {
      enriched.summary = enriched.summary || metadataPatch.summary;
    }
    return enriched;
  }

  private async persist(
    id: string,
    metadataPatch: Record<string, any>,
  ): Promise<void> {
    if (!this.supabase) return;
    try {
      // Re-read to avoid clobbering a concurrent metadata write (share_card).
      const { data: latest } = await this.supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      const latestMetadata =
        latest?.metadata && typeof latest.metadata === "object"
          ? latest.metadata
          : {};
      await this.supabase
        .from("opportunities")
        .update({
          metadata: { ...latestMetadata, ...metadataPatch },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (error) {
      this.logger.warn(
        `Could not persist enrichment for ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
