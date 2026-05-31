import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { db } from "../db";
import { opportunities } from "../db/schema";
import axios from "axios";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, or, and, sql } from "drizzle-orm";
import { z } from "zod";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from "./dto/personalization.dto";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import {
  categorizeOpportunity,
  classifyOpportunity,
} from "./opportunity-categorization";
// Note: Apify scraper disabled - using crawl4ai instead
// import {
//     runEdutuScraper,
//     runIntelScraper,
//     checkAllActors,
//     ACTOR_IDS
// } from '../../../../admin/backend/apify-client';

const CHUNKS_TO_FETCH = 10;

const OpportunityDtoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending"),
  tags: z.array(z.string()).optional(),
});

const ProcessedItemSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending"),
  tags: z.array(z.string()).optional().default([]),
});

type ProcessedItem = z.infer<typeof ProcessedItemSchema>;

export type CreateOpportunityDto = z.infer<typeof OpportunityDtoSchema>;

export interface AdminOpportunityListQuery {
  limit?: number;
  page?: number;
  cursor?: string;
  search?: string;
  status?: string;
  category?: string;
  sortBy?: string;
}

const ADMIN_OPPORTUNITY_COLUMNS = [
  "id",
  "title",
  "summary",
  "description",
  "category",
  "canonical_category",
  "organization",
  "location",
  "is_remote",
  "application_url",
  "source_url",
  "canonical_url",
  "tags",
  "close_date",
  "source",
  "status",
  "is_featured",
  "quality_score",
  "validation_status",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly supabase: SupabaseClient | null = null;

  constructor(
    private readonly opportunityRankingService: OpportunityRankingService,
    private readonly aiService: AiService,
    private readonly opportunityShareCardService: OpportunityShareCardService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }

  async findAll(
    limit: number = 20,
    offset: number = 0,
    status?: string,
    category?: string,
  ) {
    const statusFilter = status || "active";
    const cappedLimit = Math.min(Number(limit) || 20, 100);
    const normalizedOffset = Number(offset) || 0;

    if (this.supabase) {
      let request = this.supabase
        .from("opportunities")
        .select("*")
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .range(normalizedOffset, normalizedOffset + cappedLimit - 1);

      if (category) {
        request = request.eq("category", category);
      }

      const { data, error } = await request;
      if (!error) {
        return data ?? [];
      }

      this.logger.warn(
        `Canonical opportunity list query failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    if (category) {
      return db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.status, statusFilter),
            eq(opportunities.category, category),
          ),
        )
        .limit(cappedLimit)
        .offset(normalizedOffset)
        .orderBy(opportunities.createdAt)
        .execute();
    }

    return db
      .select()
      .from(opportunities)
      .where(eq(opportunities.status, statusFilter))
      .limit(cappedLimit)
      .offset(normalizedOffset)
      .orderBy(opportunities.createdAt)
      .execute();
  }

  async findOne(id: string) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!error) {
        return data ?? null;
      }

      this.logger.warn(
        `Canonical opportunity detail query failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const res = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .execute();
    return res[0] ?? null;
  }

  async ensureShareCard(id: string) {
    const opportunity = await this.findOne(id);
    if (!opportunity) {
      return null;
    }

    const shareCard =
      await this.opportunityShareCardService.ensureShareCardForOpportunity(
        opportunity,
      );

    return {
      opportunityId: id,
      shareCard,
    };
  }

  async findAdminList(query: AdminOpportunityListQuery) {
    if (!this.supabase) {
      throw new Error("Supabase is not configured");
    }

    const limit = Math.min(Math.max(Number(query.limit) || 50, 10), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const sortMap: Record<string, { column: string; ascending: boolean }> = {
      newest: { column: "created_at", ascending: false },
      oldest: { column: "created_at", ascending: true },
      deadline: { column: "close_date", ascending: true },
      featured: { column: "is_featured", ascending: false },
      quality: { column: "quality_score", ascending: true },
    };
    const sort = sortMap[query.sortBy || "newest"] ?? sortMap.newest;

    let request = this.supabase
      .from("opportunities")
      .select(ADMIN_OPPORTUNITY_COLUMNS, { count: "planned" })
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .order("id", { ascending: sort.ascending });

    if (query.status && query.status !== "all") {
      request = request.eq("status", query.status);
    }

    if (query.category && query.category !== "all") {
      request = request.eq("category", query.category);
    }

    const search = query.search?.trim();
    if (search) {
      const escaped = search.replaceAll("%", "\\%").replaceAll(",", " ");
      request = request.or(
        `title.ilike.%${escaped}%,organization.ilike.%${escaped}%,category.ilike.%${escaped}%,source.ilike.%${escaped}%`,
      );
    }

    const cursor = this.parseAdminCursor(query.cursor);
    if (cursor?.value) {
      const operator = sort.ascending ? "gt" : "lt";
      request = request
        .or(
          `${sort.column}.${operator}.${cursor.value},and(${sort.column}.eq.${cursor.value},id.${operator}.${cursor.id})`,
        )
        .limit(limit);
    } else {
      request = request.range(from, to);
    }

    const { data, error, count } = await request;
    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const nextCursor =
      rows.length === limit
        ? this.buildAdminCursor(rows[rows.length - 1], sort.column)
        : null;

    return {
      data: rows,
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.max(Math.ceil((count ?? 0) / limit), 1),
      hasMore: Boolean(nextCursor) || to + 1 < (count ?? 0),
      nextCursor,
    };
  }

  async getAdminStats() {
    if (!this.supabase) {
      throw new Error("Supabase is not configured");
    }

    const rpcResult = await this.supabase.rpc("opportunity_admin_stats");
    if (!rpcResult.error && rpcResult.data) {
      return rpcResult.data;
    }

    this.logger.warn(
      `opportunity_admin_stats RPC unavailable, using local aggregate fallback: ${
        rpcResult.error?.message ?? "no data returned"
      }`,
    );

    const result = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'active')::int as active,
        count(*) filter (where is_featured = true)::int as featured,
        count(*) filter (
          where status = 'pending_review'
             or coalesce(metadata->>'needs_review', 'false') = 'true'
        )::int as "needsReview",
        count(*) filter (
          where close_date is not null
            and close_date >= current_date
            and close_date <= current_date + interval '7 days'
        )::int as "expiringSoon"
      from opportunities
    `);

    return (
      result[0] || {
        total: 0,
        active: 0,
        featured: 0,
        needsReview: 0,
        expiringSoon: 0,
      }
    );
  }

  async reclassifyExistingOpportunities(options: {
    limit?: number;
    dryRun?: boolean;
  }) {
    if (!this.supabase) {
      throw new Error("Supabase is not configured");
    }

    const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 1000);
    const dryRun = Boolean(options.dryRun);
    const { data, error } = await this.supabase
      .from("opportunities")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<Record<string, any>>;
    const updates = rows.map((row) => {
      const input = {
        ...row,
        canonical_category: undefined,
        canonicalCategory: undefined,
      };
      const classification = classifyOpportunity(input);
      const metadata = {
        ...((row.metadata as Record<string, unknown>) || {}),
        canonical_category: classification.canonicalCategory,
        classification_confidence: classification.confidence,
        classification_reason: classification.reason,
        classification_source: classification.source,
        classification_signals: classification.matchedSignals,
        classification_needs_review: classification.needsReview,
        classification_updated_at: new Date().toISOString(),
      };

      return {
        id: row.id,
        title: row.title,
        previousCategory: row.canonical_category ?? row.canonicalCategory,
        nextCategory: classification.canonicalCategory,
        confidence: classification.confidence,
        reason: classification.reason,
        needsReview: classification.needsReview,
        metadata,
      };
    });

    if (!dryRun) {
      for (const update of updates) {
        const { error: updateError } = await this.supabase
          .from("opportunities")
          .update({
            canonical_category: update.nextCategory,
            metadata: update.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.id);

        if (updateError) {
          this.logger.warn(
            `Opportunity reclassification failed for ${update.id}: ${updateError.message}`,
          );
        }
      }
    }

    return {
      success: true,
      dryRun,
      inspected: rows.length,
      changed: updates.filter(
        (item) => item.previousCategory !== item.nextCategory,
      ).length,
      needsReview: updates.filter((item) => item.needsReview).length,
      updates: updates.map(({ metadata, ...item }) => item),
    };
  }

  async create(dto: CreateOpportunityDto) {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .insert(this.toCanonicalOpportunityPayload(dto, "pending"))
        .select()
        .single();

      if (!error) {
        return data;
      }

      this.logger.warn(
        `Canonical opportunity create failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const result = await db
      .insert(opportunities)
      .values({
        title: dto.title,
        description: dto.description,
        category: dto.category,
        type: dto.type || "scholarship",
        eligibilityCriteria: dto.eligibilityCriteria,
        fundingType: dto.fundingType,
        targetRegion: dto.targetRegion,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        sourceUrl: dto.sourceUrl,
        applyUrl: dto.applyUrl || dto.sourceUrl,
        imageUrl: dto.imageUrl,
        isRemote: dto.isRemote ?? true,
        status: dto.status || "pending",
        originalJson: JSON.stringify(dto),
      })
      .returning()
      .execute();

    return result[0];
  }

  async update(id: string, data: Partial<CreateOpportunityDto>) {
    if (this.supabase) {
      const { data: updated, error } = await this.supabase
        .from("opportunities")
        .update({
          ...this.toCanonicalOpportunityPayload(data),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (!error) {
        return updated;
      }

      this.logger.warn(
        `Canonical opportunity update failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const updateData: Partial<typeof opportunities.$inferInsert> = {
      ...data,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      updatedAt: new Date(),
    };

    const result = await db
      .update(opportunities)
      .set(updateData)
      .where(eq(opportunities.id, id))
      .returning()
      .execute();

    return result[0];
  }

  async updateStatus(id: string, status: string) {
    if (this.supabase) {
      const { error } = await this.supabase
        .from("opportunities")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (!error) {
        return this.findOne(id);
      }

      this.logger.warn(
        `Canonical opportunity status update failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    await db
      .update(opportunities)
      .set({ status, updatedAt: new Date() })
      .where(eq(opportunities.id, id))
      .execute();
    return this.findOne(id);
  }

  async enhanceOpportunity(id: string) {
    const opportunity = await this.findOne(id);
    if (!opportunity) return null;

    const metadata = (opportunity.metadata || {}) as Record<string, any>;
    const prompt = `You are Edutu's opportunity completion assistant. Improve this saved opportunity using only the facts provided. Do not invent deadlines, countries, funding amounts, eligibility, or application links.

Return ONLY JSON:
{
  "summary": "35-55 word concise summary",
  "description": "4-6 sentence complete description",
  "requirements": ["requirement"],
  "benefits": ["benefit"],
  "application_process": ["step"],
  "funding_type": "string or null",
  "target_region": "string or null",
  "deadline": "YYYY-MM-DD, readable deadline, or null",
  "tags": ["tag"],
  "confidence": 0.0
}

Input:
Title: ${opportunity.title || ""}
Summary: ${opportunity.summary || ""}
Description: ${opportunity.description || ""}
Category: ${opportunity.category || opportunity.canonical_category || ""}
Organization: ${opportunity.organization || ""}
Location: ${opportunity.location || ""}
Deadline: ${opportunity.close_date || opportunity.deadline || ""}
Application URL: ${opportunity.application_url || opportunity.apply_url || ""}
Source URL: ${opportunity.source_url || opportunity.canonical_url || ""}
Existing metadata: ${JSON.stringify(metadata).slice(0, 4000)}`;

    const aiData = await this.aiService.generateJson<Record<string, any>>({
      feature: "opportunities.enhance",
      prompt,
      responseMimeType: "application/json",
      metadata: { id, title: opportunity.title },
    });

    const requirements = Array.isArray(aiData?.requirements)
      ? aiData.requirements.filter(Boolean)
      : metadata.requirements || [];
    const benefits = Array.isArray(aiData?.benefits)
      ? aiData.benefits.filter(Boolean)
      : metadata.benefits || [];
    const applicationProcess = Array.isArray(aiData?.application_process)
      ? aiData.application_process.filter(Boolean)
      : metadata.application_process || [];
    const description = aiData?.description || opportunity.description || "";
    const summary = aiData?.summary || opportunity.summary || "";
    const qualityScore = this.scoreCanonicalOpportunity({
      ...opportunity,
      summary,
      description,
      requirements,
      benefits,
      deadline: aiData?.deadline || opportunity.close_date || opportunity.deadline,
    });

    const updatePayload = {
      summary,
      description,
      close_date: aiData?.deadline || opportunity.close_date || undefined,
      funding_type: aiData?.funding_type || opportunity.funding_type || undefined,
      target_region: aiData?.target_region || opportunity.target_region || undefined,
      tags: Array.isArray(aiData?.tags) ? aiData.tags : opportunity.tags,
      validation_status: qualityScore.score >= 70 ? "complete" : "not_complete",
      quality_score: qualityScore.score,
      metadata: {
        ...metadata,
        requirements,
        benefits,
        application_process: applicationProcess,
        funding_type: aiData?.funding_type || metadata.funding_type || null,
        target_region: aiData?.target_region || metadata.target_region || null,
        ai_improved_at: new Date().toISOString(),
        ai_improvement_confidence: Number(aiData?.confidence ?? 0),
        extraction_quality_score: qualityScore.score,
        extraction_missing_fields: qualityScore.missingFields,
        needs_review: qualityScore.score < 70,
      },
      updated_at: new Date().toISOString(),
    };

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (!error) {
        return {
          success: true,
          opportunity: data,
          completeness: {
            status: qualityScore.score >= 70 ? "complete" : "not_complete",
            score: qualityScore.score,
            missingFields: qualityScore.missingFields,
            checkedAt: new Date().toISOString(),
          },
        };
      }

      this.logger.warn(`AI enhancement update failed: ${error.message}`);
    }

    return {
      success: false,
      error: "Could not update opportunity",
      completeness: {
        status: qualityScore.score >= 70 ? "complete" : "not_complete",
        score: qualityScore.score,
        missingFields: qualityScore.missingFields,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  async remove(id: string) {
    if (this.supabase) {
      const { error } = await this.supabase
        .from("opportunities")
        .delete()
        .eq("id", id);

      if (!error) {
        return { success: true, id };
      }

      this.logger.warn(
        `Canonical opportunity delete failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    await db.delete(opportunities).where(eq(opportunities.id, id)).execute();
    return { success: true, id };
  }

  private toCanonicalOpportunityPayload(
    input: Partial<CreateOpportunityDto>,
    defaultStatus?: string,
  ) {
    const metadata: Record<string, unknown> = {};
    if (input.eligibilityCriteria !== undefined) {
      metadata.eligibility_criteria = input.eligibilityCriteria;
      metadata.requirements = input.eligibilityCriteria
        ? [input.eligibilityCriteria]
        : [];
    }
    if (input.fundingType !== undefined) {
      metadata.funding_type = input.fundingType;
      metadata.benefits = input.fundingType ? [input.fundingType] : [];
    }
    if (input.targetRegion !== undefined) {
      metadata.target_region = input.targetRegion;
    }
    const classification = classifyOpportunity(
      input as Record<string, unknown>,
    );
    metadata.canonical_category = classification.canonicalCategory;
    metadata.classification_confidence = classification.confidence;
    metadata.classification_reason = classification.reason;
    metadata.classification_source = classification.source;
    metadata.classification_signals = classification.matchedSignals;
    metadata.classification_needs_review = classification.needsReview;

    const applicationUrl = input.applyUrl || input.sourceUrl || undefined;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: input.title,
      description: input.description,
      category: input.category,
      canonical_category: classification.canonicalCategory,
      location: input.targetRegion,
      is_remote: input.isRemote,
      close_date: input.deadline || undefined,
      source_url: input.sourceUrl,
      application_url: applicationUrl,
      canonical_url: applicationUrl
        ? this.normalizeUrlForStorage(applicationUrl)
        : undefined,
      image_url: input.imageUrl,
      tags: input.tags,
      status: input.status || defaultStatus,
      last_seen_at: now,
      verification_next_check_at: now,
      metadata,
    };

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private normalizeUrlForStorage(url: string) {
    return url
      .trim()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  private scoreCanonicalOpportunity(input: Record<string, any>): {
    score: number;
    missingFields: string[];
  } {
    let score = 0;
    const missingFields: string[] = [];

    if (String(input.title || "").trim().length >= 8) score += 15;
    else missingFields.push("title");

    if (String(input.summary || "").trim().length >= 50) score += 10;
    else missingFields.push("summary");

    if (String(input.description || "").trim().length >= 240) score += 25;
    else missingFields.push("description");

    if (String(input.application_url || input.apply_url || "").startsWith("http")) {
      score += 15;
    } else {
      missingFields.push("application_url");
    }

    if (Array.isArray(input.requirements) && input.requirements.length > 0) score += 10;
    else missingFields.push("requirements");

    if (Array.isArray(input.benefits) && input.benefits.length > 0) score += 10;
    else missingFields.push("benefits");

    if (input.deadline || input.close_date) score += 10;
    else missingFields.push("deadline");

    if (input.image_url) score += 5;
    else missingFields.push("image");

    return { score: Math.min(100, score), missingFields };
  }

  private parseAdminCursor(cursor: string | undefined) {
    if (!cursor) return null;

    try {
      const [value, id] = Buffer.from(cursor, "base64url")
        .toString("utf8")
        .split("|");

      if (!value || !id) return null;
      return { value, id };
    } catch {
      return null;
    }
  }

  private buildAdminCursor(row: Record<string, unknown>, column: string) {
    const value = row[column];
    if (!value || !row.id) return null;
    return Buffer.from(`${String(value)}|${String(row.id)}`).toString(
      "base64url",
    );
  }

  async getUserOpportunityPreferences(userId: string) {
    return this.opportunityRankingService.getUserPreferences(userId);
  }

  async updateUserOpportunityPreferences(
    userId: string,
    input: OpportunityPreferenceDto,
  ) {
    return this.opportunityRankingService.upsertUserPreferences(userId, input);
  }

  async recordUserOpportunitySignal(
    userId: string,
    input: OpportunitySignalDto,
  ) {
    return this.opportunityRankingService.recordSignal(userId, input);
  }

  async getPersonalizedRecommendations(
    userId: string,
    input: UserRecommendationRequestDto,
  ) {
    return this.opportunityRankingService.getRecommendationsForUser(
      userId,
      input,
    );
  }

  async queryRecommendations(input: RecommendationQueryDto) {
    return this.opportunityRankingService.queryRecommendations(input);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCronSync() {
    this.logger.log(
      "Starting scheduled Opportunities Sync via Serper API + DeepSeek",
    );
    await this.syncOpportunities();
  }

  async syncOpportunities() {
    try {
      const aiData = await this.fetchFromSerper();
      if (!aiData || aiData.length === 0) {
        this.logger.warn("No data found from Serper API");
        return;
      }

      const parsedData = await this.extractWithDeepSeek(aiData);

      if (parsedData && parsedData.length > 0) {
        const result = await this.bulkImport(parsedData);
        this.logger.log(
          `Successfully synced opportunities. Inserted: ${(result as any).inserted ?? 0}, skipped: ${(result as any).skipped ?? 0}`,
        );
        return result;
      }
      return { success: false, reason: "Failed to extract data" };
    } catch (error) {
      this.logger.error("Error syncing opportunities", error);
      throw error;
    }
  }

  // Main sync method that handles multiple sources
  async syncFromApify(sources?: string) {
    try {
      const sourceList = sources ? sources.split(",") : ["edutu", "intel"];
      const results: any = { edutu: null, intel: null };
      const allOpportunities: any[] = [];

      this.logger.log("Apify sync disabled - using crawl4ai scraper instead");
      return {
        success: false,
        error: "Apify sync disabled. Use /api/scraper/run endpoint instead.",
        sources: results,
      };
    } catch (error) {
      this.logger.error("Error in syncFromApify", error);
      return { success: false, error: error.message };
    }
  }

  // Process items with AI to fill missing fields and generate tags
  async processWithAI(items: any[]) {
    const processedItems: ProcessedItem[] = [];

    for (const item of items) {
      try {
        // Skip if already has good data
        if (item.description && item.eligibilityCriteria && item.fundingType) {
          processedItems.push(item as ProcessedItem);
          continue;
        }

        const prompt = `You are a scholarship data enhancement AI. Given the following scholarship data, fill in missing fields and generate relevant tags.

Input Data:
Title: ${item.title}
Description: ${item.description || "N/A"}
URL: ${item.sourceUrl}
Category: ${item.category}

Please provide:
1. A detailed description (if missing)
2. Eligibility criteria (if missing)
3. Funding type/amount (if missing)
4. Target region/countries (if missing)
5. 3-5 relevant tags (e.g., "STEM", "Women", "Africa", "Graduate", "Full-Ride")
6. Deadline date in ISO format if mentioned (if missing)

Output ONLY a JSON object with these fields:
{
  "description": "detailed description",
  "eligibilityCriteria": "who can apply",
  "fundingType": "amount or type",
  "targetRegion": "target countries/regions",
  "deadline": "YYYY-MM-DD or null",
  "tags": ["tag1", "tag2", "tag3"]
}`;

        const aiData = await this.aiService.generateJson<Record<string, any>>({
          feature: "opportunities.enhance",
          prompt,
          responseMimeType: "application/json",
          metadata: { title: item.title, sourceUrl: item.sourceUrl },
        });

        // Merge AI data with original item
        processedItems.push({
          ...item,
          description: item.description || aiData?.description || "",
          eligibilityCriteria:
            item.eligibilityCriteria || aiData?.eligibilityCriteria || "",
          fundingType: item.fundingType || aiData?.fundingType || "",
          targetRegion: item.targetRegion || aiData?.targetRegion || "",
          deadline: item.deadline || aiData?.deadline || null,
          tags: aiData?.tags || [],
        } as ProcessedItem);
      } catch (err) {
        this.logger.warn(
          `AI processing failed for item: ${item.title}`,
          err.message,
        );
        processedItems.push(item as ProcessedItem); // Keep original if AI fails
      }
    }

    return processedItems;
  }

  // Save opportunities to database
  async saveOpportunities(items: any[]) {
    let inserted = 0;
    let skipped = 0;

    const validItems = items.filter((item) => item.title && item.sourceUrl);
    skipped = items.length - validItems.length;

    if (validItems.length === 0) {
      this.logger.log("No valid opportunities to save");
      return { inserted: 0, skipped, opportunities: [] };
    }

    if (this.supabase) {
      const records: Record<string, any>[] = validItems.map((item) => {
        const base = this.toCanonicalOpportunityPayload(
          {
            title: item.title,
            description: item.description || null,
            category: item.category || "scholarship",
            type: item.type || "scholarship",
            eligibilityCriteria: item.eligibilityCriteria || null,
            fundingType: item.fundingType || null,
            targetRegion: item.targetRegion || null,
            deadline: item.deadline || null,
            sourceUrl: item.sourceUrl,
            applyUrl: item.applyUrl || item.sourceUrl,
            imageUrl: item.imageUrl || null,
            isRemote: item.isRemote ?? true,
            status: "pending",
            tags: item.tags || [],
          },
          "pending",
        );

        return {
          ...base,
          metadata: {
            ...((base.metadata as Record<string, unknown>) || {}),
            ...(item.tags?.length ? { tags: item.tags } : {}),
            original: item,
          },
        };
      });

      const uniqueRecords = Array.from(
        new Map(
          records.map((record) => [
            String(record.canonical_url ?? record.source_url ?? record.title),
            record,
          ]),
        ).values(),
      );
      const saved: Record<string, unknown>[] = [];
      for (const record of uniqueRecords) {
        const { data, error } = await this.supabase
          .from("opportunities")
          .insert(record)
          .select()
          .single();

        if (!error && data) {
          saved.push(data);
          continue;
        }

        if (error?.code === "23505") {
          skipped++;
          continue;
        }

        if (error) {
          this.logger.warn(
            `Canonical opportunity insert failed for ${record.title}: ${error.message}`,
          );
          skipped++;
        }
      }

      inserted = saved.length;
      skipped += validItems.length - uniqueRecords.length;
      return { inserted, skipped, opportunities: saved };
    }

    const values = validItems.map((item) => ({
      title: item.title,
      description: item.description || null,
      category: item.category || "scholarship",
      canonicalCategory: categorizeOpportunity(item),
      type: item.type || "scholarship",
      eligibilityCriteria: item.eligibilityCriteria || null,
      fundingType: item.fundingType || null,
      targetRegion: item.targetRegion || null,
      deadline: item.deadline ? new Date(item.deadline) : null,
      sourceUrl: item.sourceUrl,
      applyUrl: item.applyUrl || item.sourceUrl,
      imageUrl: item.imageUrl || null,
      isRemote: true,
      status: "pending",
      originalJson: JSON.stringify(item),
    }));

    try {
      const result = await db
        .insert(opportunities)
        .values(values)
        .onConflictDoNothing({ target: opportunities.sourceUrl })
        .returning()
        .execute();

      inserted = result.length;
      skipped += validItems.length - result.length;

      this.logger.log(
        `Saved ${inserted} opportunities, skipped ${skipped} duplicates (batch insert)`,
      );
      return { inserted, skipped, opportunities: result };
    } catch (dbErr) {
      this.logger.error(
        `Batch insert failed, falling back to sequential`,
        dbErr.message,
      );
      // Fallback to sequential if batch fails
      const savedOpportunities: any[] = [];
      for (const item of validItems) {
        try {
          const result = await db
            .insert(opportunities)
            .values({
              title: item.title,
              description: item.description || null,
              category: item.category || "scholarship",
              canonicalCategory: categorizeOpportunity(item),
              type: item.type || "scholarship",
              eligibilityCriteria: item.eligibilityCriteria || null,
              fundingType: item.fundingType || null,
              targetRegion: item.targetRegion || null,
              deadline: item.deadline ? new Date(item.deadline) : null,
              sourceUrl: item.sourceUrl,
              applyUrl: item.applyUrl || item.sourceUrl,
              imageUrl: item.imageUrl || null,
              isRemote: true,
              status: "pending",
              originalJson: JSON.stringify(item),
            })
            .onConflictDoNothing({ target: opportunities.sourceUrl })
            .returning()
            .execute();

          if (result[0]) {
            inserted++;
            savedOpportunities.push(result[0]);
          } else {
            skipped++;
          }
        } catch (innerErr) {
          this.logger.warn(`Failed to insert: ${item.title}`, innerErr.message);
          skipped++;
        }
      }

      this.logger.log(
        `Saved ${inserted} opportunities, skipped ${skipped} duplicates (sequential fallback)`,
      );
      return { inserted, skipped, opportunities: savedOpportunities };
    }
  }

  async bulkImport(items: any[]) {
    try {
      this.logger.log(
        "Starting bulk import of " + items.length + " opportunities",
      );

      // Process with AI first
      const processedItems = await this.processWithAI(items);

      const result = await this.saveOpportunities(processedItems);

      return { success: true, ...result };
    } catch (error) {
      this.logger.error("Error in bulk import", error);
      return { success: false, error: error.message };
    }
  }

  private async fetchFromSerper() {
    const searchQueries = [
      "latest scholarships for african students 2026",
      "fully funded scholarships for international students from africa",
      "master degree scholarships for african youth",
      "undergraduate scholarships abroad for africans",
      "global grants and fellowships for young africans",
      "top international study opportunities for african citizens",
    ];

    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) /
        86400000,
    );
    const query = searchQueries[dayOfYear % searchQueries.length];

    const hourRotation = new Date().getHours();
    const scrapeStart = (hourRotation % 5) * 10;

    this.logger.log(
      "Using Serper search query: " + query + " (Offset: " + scrapeStart + ")",
    );

    const data = JSON.stringify({
      q: query,
      num: CHUNKS_TO_FETCH,
      page: scrapeStart / 10 + 1,
    });

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://google.serper.dev/search",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      data: data,
    };

    const response = await axios.request(config);
    return response.data.organic;
  }

  private async extractWithDeepSeek(searchResults: any[]) {
    const prompt =
      "You are an expert scholarship data extractor. I have obtained the following Google Search results. Extract the opportunities into an array of JSON objects with: title, description, eligibilityCriteria, fundingType, targetRegion, sourceUrl, applyUrl, imageUrl. Output ONLY a valid JSON array. Data: " +
      JSON.stringify(searchResults);

    try {
      const parsedJson = await this.aiService.generateJson({
        feature: "opportunities.extract",
        prompt,
        responseMimeType: "application/json",
        metadata: { resultCount: searchResults.length },
      });

      if (!parsedJson) {
        this.logger.error("DeepSeek returned empty response");
        return [];
      }

      const DeepSeekOpportunitySchema = z.object({
        title: z.string(),
        description: z.string().optional().nullable(),
        eligibilityCriteria: z.string().optional().nullable(),
        fundingType: z.string().optional().nullable(),
        targetRegion: z.string().optional().nullable(),
        sourceUrl: z.string().url(),
        applyUrl: z.string().url().optional().nullable(),
        imageUrl: z.string().url().optional().nullable(),
      });

      const DeepSeekResponseSchema = z.array(DeepSeekOpportunitySchema);
      const result = DeepSeekResponseSchema.safeParse(parsedJson);
      if (!result.success) {
        this.logger.error("DeepSeek extraction failed Zod validation");
        return [];
      }

      return result.data;
    } catch (err) {
      this.logger.error("DeepSeek extraction failed", err);
      return [];
    }
  }
}
