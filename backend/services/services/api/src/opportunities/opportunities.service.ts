import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { db } from "../db";
import { opportunities } from "../db/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, or, and, sql, lt, isNull, desc } from "drizzle-orm";
import * as path from "path";
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
  buildOpportunityPublicShareUrl,
  buildOpportunityShareText,
} from "./opportunity-share-text";
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
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional(),
  isFeatured: z.boolean().optional().default(false),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending"),
  tags: z.array(z.string()).optional(),
});

const ProcessedItemSchema = z.object({
  title: z.string(),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional().default({}),
  requirements: z.array(z.string()).optional().default([]),
  benefits: z.array(z.string()).optional().default([]),
  applicationProcess: z.array(z.string()).optional().default([]),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  confidence: z.number().optional().default(0),
  notes: z.array(z.string()).optional().default([]),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending"),
  tags: z.array(z.string()).optional().default([]),
});

type ProcessedItem = z.infer<typeof ProcessedItemSchema>;

const OpportunityEnhancementSchema = z.object({
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  requirements: z.array(z.string()).optional().default([]),
  benefits: z.array(z.string()).optional().default([]),
  applicationProcess: z.array(z.string()).optional().default([]),
  application_process: z.array(z.string()).optional().default([]),
  eligibility: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0),
  notes: z.array(z.string()).optional().default([]),
});

type OpportunityEnhancement = z.infer<typeof OpportunityEnhancementSchema>;

const AI_SOURCE_TEXT_MAX_CHARS = 8_000;
const AI_SOURCE_FETCH_TIMEOUT_MS = 12_000;
const AI_ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    organization: { type: ["string", "null"] },
    eligibilityCriteria: { type: ["string", "null"] },
    fundingType: { type: ["string", "null"] },
    targetRegion: { type: ["string", "null"] },
    deadline: { type: ["string", "null"] },
    requirements: { type: "array", items: { type: "string" } },
    benefits: { type: "array", items: { type: "string" } },
    applicationProcess: { type: "array", items: { type: "string" } },
    eligibility: { type: "object" },
    tags: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "description",
    "organization",
    "eligibilityCriteria",
    "fundingType",
    "targetRegion",
    "deadline",
    "requirements",
    "benefits",
    "applicationProcess",
    "eligibility",
    "tags",
    "confidence",
    "notes",
  ],
  additionalProperties: false,
};

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

export interface SitemapOpportunityEntry {
  id: string;
  updatedAt: Date | string | null;
  createdAt: Date | string | null;
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
  "image_url",
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

const STATIC_OPPORTUNITY_SNAPSHOT_FILENAME = path.join(
  "edutu-web-app",
  "public",
  "data",
  "opportunities.json",
);

const STATIC_OPPORTUNITY_LOADED_AT = new Date().toISOString();

type StaticOpportunityRow = Record<string, unknown>;

let cachedStaticOpportunityRows: StaticOpportunityRow[] | null = null;

function resolveStaticOpportunitySnapshotPath(): string | null {
  const roots = new Set<string>([
    process.cwd(),
    __dirname,
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
    path.resolve(process.cwd(), "../../../.."),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "../.."),
    path.resolve(__dirname, "../../.."),
    path.resolve(__dirname, "../../../.."),
  ]);

  for (const root of roots) {
    let current = root;

    while (true) {
      const candidate = path.join(
        current,
        STATIC_OPPORTUNITY_SNAPSHOT_FILENAME,
      );
      if (existsSync(candidate)) {
        return candidate;
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }

      current = parent;
    }
  }

  return null;
}

function normaliseStaticOpportunityRow(
  row: Record<string, any>,
): StaticOpportunityRow {
  const deadline =
    row.deadline ?? row.close_date ?? row.application_deadline ?? null;
  const imageUrl = row.image_url ?? row.imageUrl ?? row.image ?? null;
  const applicationUrl =
    row.application_url ?? row.apply_url ?? row.applyUrl ?? row.url ?? null;
  const lastUpdated =
    row.updated_at ??
    row.updatedAt ??
    row.updated ??
    row.lastUpdated ??
    STATIC_OPPORTUNITY_LOADED_AT;
  const createdAt = row.created_at ?? row.createdAt ?? lastUpdated;
  const isRemote =
    typeof row.is_remote === "boolean"
      ? row.is_remote
      : typeof row.isRemote === "boolean"
        ? row.isRemote
        : String(row.location ?? "")
            .toLowerCase()
            .includes("remote");

  return {
    ...row,
    deadline,
    close_date: row.close_date ?? deadline,
    image_url: imageUrl,
    application_url: applicationUrl,
    updated_at: lastUpdated,
    created_at: createdAt,
    is_remote: isRemote,
    status: row.status ?? "active",
    source: row.source ?? "static-snapshot",
  };
}

function filterStaticOpportunityRows(
  rows: StaticOpportunityRow[],
  limit: number,
  offset: number,
  status?: string,
  category?: string,
): StaticOpportunityRow[] {
  const normalizedStatus = (status || "active").trim().toLowerCase();
  const normalizedCategory = category?.trim().toLowerCase();

  if (normalizedStatus !== "active" && normalizedStatus !== "all") {
    return [];
  }

  const filtered = rows.filter((row) => {
    const rowCategory = String(row.category ?? row.canonical_category ?? "")
      .trim()
      .toLowerCase();
    const rowStatus = String(row.status ?? "active")
      .trim()
      .toLowerCase();

    if (normalizedStatus !== "all" && rowStatus !== normalizedStatus) {
      return false;
    }

    if (normalizedCategory && rowCategory !== normalizedCategory) {
      return false;
    }

    return true;
  });

  return filtered.slice(offset, offset + limit);
}

async function loadStaticOpportunitySnapshot(): Promise<
  StaticOpportunityRow[]
> {
  if (cachedStaticOpportunityRows) {
    return cachedStaticOpportunityRows;
  }

  const snapshotPath = resolveStaticOpportunitySnapshotPath();
  if (!snapshotPath) {
    return [];
  }

  try {
    const raw = await readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown }).data)
        ? ((parsed as { data: unknown[] }).data as Record<string, unknown>[])
        : [];

    cachedStaticOpportunityRows = rows.map((row) =>
      normaliseStaticOpportunityRow(row as Record<string, any>),
    );
    return cachedStaticOpportunityRows;
  } catch (error: any) {
    console.warn(
      `Could not load static opportunity snapshot from ${snapshotPath}: ${error?.message ?? String(error)}`,
    );
    return [];
  }
}

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

    try {
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
          const rows = data ?? [];
          if (rows.length > 0) {
            return rows;
          }
        } else {
          this.logger.warn(
            `Canonical opportunity list query failed, falling back to Drizzle schema: ${error.message}`,
          );
        }
      }

      const query = category
        ? db
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
        : db
            .select()
            .from(opportunities)
            .where(eq(opportunities.status, statusFilter))
            .limit(cappedLimit)
            .offset(normalizedOffset)
            .orderBy(opportunities.createdAt);

      const rows = await query.execute();
      if (rows.length > 0) {
        return rows;
      }
    } catch (error: any) {
      this.logger.warn(
        `Canonical opportunity list unavailable, falling back to static snapshot: ${error?.message ?? String(error)}`,
      );
    }

    const snapshotRows = await loadStaticOpportunitySnapshot();
    return filterStaticOpportunityRows(
      snapshotRows,
      cappedLimit,
      normalizedOffset,
      statusFilter,
      category,
    );
  }

  async listSitemapOpportunities(
    max = 50000,
  ): Promise<SitemapOpportunityEntry[]> {
    const cappedMax = Math.min(Math.max(Number(max) || 50000, 1), 50000);
    const rows: SitemapOpportunityEntry[] = [];

    try {
      if (this.supabase) {
        const pageSize = 1000;
        let offset = 0;

        while (rows.length < cappedMax) {
          const to = Math.min(offset + pageSize - 1, cappedMax - 1);
          const { data, error } = await this.supabase
            .from("opportunities")
            .select("id,updated_at,created_at")
            .eq("status", "active")
            .order("updated_at", { ascending: false, nullsFirst: false })
            .range(offset, to);

          if (error) {
            throw new Error(error.message);
          }

          const batch = data ?? [];
          rows.push(
            ...batch
              .filter((row) => row.id)
              .map((row) => ({
                id: String(row.id),
                updatedAt: row.updated_at ?? null,
                createdAt: row.created_at ?? null,
              })),
          );

          if (batch.length < pageSize) {
            break;
          }

          offset += pageSize;
        }

        return rows.slice(0, cappedMax);
      }

      const drizzleRows = await db
        .select({
          id: opportunities.id,
          updatedAt: opportunities.updatedAt,
          createdAt: opportunities.createdAt,
        })
        .from(opportunities)
        .where(eq(opportunities.status, "active"))
        .orderBy(desc(opportunities.updatedAt))
        .limit(cappedMax)
        .execute();

      if (drizzleRows.length > 0) {
        return drizzleRows;
      }
    } catch (error) {
      this.logger.warn(
        `Sitemap opportunity query unavailable, falling back to static snapshot: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const snapshotRows = await loadStaticOpportunitySnapshot();
    return snapshotRows
      .filter((row) => String(row.status ?? "active") === "active")
      .map((row) => ({
        id: String(row.id),
        updatedAt:
          (row.updated_at as string | undefined) ??
          (row.updatedAt as string | undefined) ??
          null,
        createdAt:
          (row.created_at as string | undefined) ??
          (row.createdAt as string | undefined) ??
          null,
      }))
      .filter((row) => row.id)
      .slice(0, cappedMax);
  }

  async findOne(id: string) {
    try {
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from("opportunities")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (!error) {
          if (data) {
            return data;
          }
        } else {
          this.logger.warn(
            `Canonical opportunity detail query failed, falling back to Drizzle schema: ${error.message}`,
          );
        }
      }

      const res = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, id))
        .execute();
      if (res[0]) {
        return res[0];
      }
    } catch (error: any) {
      this.logger.warn(
        `Canonical opportunity detail unavailable, falling back to static snapshot: ${error?.message ?? String(error)}`,
      );
    }

    const snapshotRows = await loadStaticOpportunitySnapshot();
    return snapshotRows.find((row) => String(row.id) === String(id)) ?? null;
  }

  async ensureShareCard(id: string) {
    const opportunity = await this.findOne(id);
    if (!opportunity) {
      return null;
    }

    const shareUrl = buildOpportunityPublicShareUrl(
      id,
      this.getPublicAppBaseUrl(),
    );
    const shareText = buildOpportunityShareText(opportunity, shareUrl);
    const shareCard =
      await this.opportunityShareCardService.ensureShareCardForOpportunity(
        opportunity,
      );

    return {
      opportunityId: id,
      shareCard,
      shareUrl,
      shareText,
    };
  }

  async getSharePdf(id: string) {
    const opportunity = await this.findOne(id);
    if (!opportunity) {
      return null;
    }

    const sharePdfResult =
      await this.opportunityShareCardService.buildSharePdfForOpportunity(
        opportunity,
      );

    if (!sharePdfResult?.buffer) {
      throw new Error("Share PDF unavailable");
    }

    return {
      buffer: sharePdfResult.buffer,
      fileName: this.buildSharePdfFileName(opportunity),
    };
  }

  async findAdminList(query: AdminOpportunityListQuery) {
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

    try {
      if (!this.supabase) {
        throw new Error("Supabase is not configured");
      }

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
    } catch (error) {
      this.logger.warn(
        `Admin opportunity list unavailable, returning empty fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        data: [],
        page,
        limit,
        total: 0,
        totalPages: 1,
        hasMore: false,
        nextCursor: null,
      };
    }
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

  async getJobOpportunities(jobId: string, limit = 200) {
    const cappedLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);

    const rows = await db
      .select()
      .from(opportunities)
      .where(sql`metadata->>'scrape_job_id' = ${jobId}`)
      .orderBy(desc(opportunities.createdAt))
      .limit(cappedLimit)
      .execute();

    return rows;
  }

  async purgeOpportunities(options: {
    olderThanDays?: number | null;
    missingImagesOnly?: boolean;
  }) {
    const hasMissingImagesFilter = Boolean(options.missingImagesOnly);
    const hasAgeFilter =
      typeof options.olderThanDays === "number" &&
      Number.isFinite(options.olderThanDays) &&
      options.olderThanDays > 0;

    if (!hasMissingImagesFilter && !hasAgeFilter) {
      return { success: true, deletedCount: 0 };
    }

    let deleteCondition = hasMissingImagesFilter
      ? isNull(opportunities.imageUrl)
      : undefined;

    if (hasAgeFilter) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(options.olderThanDays));
      const ageCondition = lt(opportunities.createdAt, cutoff);
      deleteCondition = deleteCondition
        ? and(deleteCondition, ageCondition)
        : ageCondition;
    }

    const deleted = await db
      .delete(opportunities)
      .where(deleteCondition!)
      .returning({ id: opportunities.id })
      .execute();

    return { success: true, deletedCount: deleted.length };
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
        summary: dto.summary,
        description: dto.description,
        category: dto.category,
        organization: dto.organization,
        location: dto.location || dto.targetRegion || undefined,
        type: dto.type || "scholarship",
        eligibilityCriteria: dto.eligibilityCriteria,
        fundingType: dto.fundingType,
        targetRegion: dto.targetRegion,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        sourceUrl: dto.sourceUrl,
        applyUrl: dto.applyUrl || dto.sourceUrl,
        imageUrl: dto.imageUrl,
        eligibility: dto.eligibility,
        isFeatured: dto.isFeatured ?? false,
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
    const sourceUrl =
      opportunity.source_url ||
      opportunity.application_url ||
      opportunity.apply_url ||
      opportunity.canonical_url ||
      "";
    const sourceText = await this.resolveOpportunitySourceText({
      ...opportunity,
      sourceUrl,
      source_url: sourceUrl,
    });
    const prompt = this.buildOpportunityEnhancementPrompt(
      {
        title: opportunity.title,
        summary: opportunity.summary,
        description: opportunity.description,
        organization: opportunity.organization,
        category: opportunity.category || opportunity.canonical_category,
        location: opportunity.location,
        deadline: opportunity.close_date || opportunity.deadline,
        sourceUrl,
        applyUrl: opportunity.application_url || opportunity.apply_url,
        requirements: metadata.requirements,
        benefits: metadata.benefits,
        applicationProcess: metadata.application_process,
        eligibilityCriteria: metadata.eligibility_criteria,
        fundingType: opportunity.funding_type || metadata.funding_type,
        targetRegion: opportunity.target_region || metadata.target_region,
        tags: opportunity.tags || metadata.tags,
        metadata,
      },
      sourceText,
    );

    const aiData = await this.generateOpportunityEnhancement(prompt, {
      id,
      title: opportunity.title,
      sourceUrl,
      sourceTextLength: sourceText.length,
    });

    const requirements = Array.isArray(aiData?.requirements)
      ? aiData.requirements.filter(Boolean)
      : metadata.requirements || [];
    const benefits = Array.isArray(aiData?.benefits)
      ? aiData.benefits.filter(Boolean)
      : metadata.benefits || [];
    const applicationProcess = Array.isArray(aiData?.applicationProcess)
      ? aiData.applicationProcess.filter(Boolean)
      : Array.isArray(aiData?.application_process)
        ? aiData.application_process.filter(Boolean)
        : metadata.application_process || [];
    const organization = this.cleanOptionalText(
      aiData?.organization || opportunity.organization || "",
      200,
    );
    const description = this.normalizeDescription(
      aiData?.description || opportunity.description || "",
    );
    const summary = this.normalizeSummary(
      aiData?.summary || opportunity.summary || "",
      description,
      opportunity.title || "",
    );
    const closeDate =
      aiData?.deadline || opportunity.close_date || opportunity.deadline;
    const qualityScore = this.scoreCanonicalOpportunity({
      ...opportunity,
      summary,
      description,
      requirements,
      benefits,
      deadline: closeDate,
    });

    const updatePayload = {
      summary,
      description,
      organization: organization || undefined,
      close_date: closeDate || undefined,
      funding_type:
        aiData?.fundingType || opportunity.funding_type || undefined,
      target_region:
        aiData?.targetRegion || opportunity.target_region || undefined,
      tags: Array.isArray(aiData?.tags) ? aiData.tags : opportunity.tags,
      validation_status: qualityScore.score >= 70 ? "complete" : "not_complete",
      quality_score: qualityScore.score,
      metadata: {
        ...metadata,
        requirements,
        benefits,
        application_process: applicationProcess,
        organization: organization || metadata.organization || null,
        funding_type: aiData?.fundingType || metadata.funding_type || null,
        target_region: aiData?.targetRegion || metadata.target_region || null,
        ai_improved_at: new Date().toISOString(),
        ai_improvement_confidence: Number(aiData?.confidence ?? 0),
        ai_improvement_notes: aiData?.notes || [],
        ai_source_text_used: sourceText.length > 0,
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
        await this.opportunityShareCardService.ensureShareCardForOpportunity(
          data,
          { force: true },
        );
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

  private async generateOpportunityEnhancement(
    prompt: string,
    metadata: Record<string, unknown>,
  ): Promise<OpportunityEnhancement | null> {
    try {
      const aiData = await this.aiService.generateJson<Record<string, any>>({
        feature: "opportunities.enhance",
        prompt,
        responseMimeType: "application/json",
        responseJsonSchema: AI_ENRICHMENT_SCHEMA,
        temperature: 0.05,
        maxOutputTokens: 2200,
        metadata,
      });

      const parsed = OpportunityEnhancementSchema.safeParse(aiData || {});
      if (!parsed.success) {
        this.logger.warn(
          `Opportunity enhancement response failed validation: ${parsed.error.message}`,
        );
        return null;
      }

      return parsed.data;
    } catch (error) {
      this.logger.warn(
        `Opportunity enhancement failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
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
    input: Partial<CreateOpportunityDto> & Record<string, any>,
    defaultStatus?: string,
  ) {
    const record = input as Record<string, any>;
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

    const summary = this.normalizeSummary(
      record.summary ?? record.description ?? "",
      record.description ?? "",
      String(input.title ?? ""),
    );
    const organization = this.cleanOptionalText(record.organization ?? "", 200);
    const eligibility =
      (record.eligibility as Record<string, unknown> | undefined) || undefined;
    const requirements = this.normalizeStringList(
      record.requirements || metadata.requirements,
    );
    const benefits = this.normalizeStringList(
      record.benefits || metadata.benefits,
    );
    const applicationProcess = this.normalizeStringList(
      record.applicationProcess ||
        record.application_process ||
        metadata.application_process,
    );

    const applicationUrl = input.applyUrl || input.sourceUrl || undefined;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      title: input.title,
      summary: summary || undefined,
      description: input.description,
      category: input.category,
      canonical_category: classification.canonicalCategory,
      organization: organization || undefined,
      location: input.location || input.targetRegion,
      is_remote: input.isRemote,
      close_date: input.deadline || undefined,
      eligibility,
      funding_type: input.fundingType,
      target_region: input.targetRegion || input.location,
      source_url: input.sourceUrl,
      application_url: applicationUrl,
      canonical_url: applicationUrl
        ? this.normalizeUrlForStorage(applicationUrl)
        : undefined,
      image_url: input.imageUrl,
      is_featured: input.isFeatured ?? false,
      tags: input.tags,
      status: input.status || defaultStatus,
      quality_score: record.qualityScore ?? record.quality_score,
      validation_status:
        record.validationStatus ?? record.validation_status ?? undefined,
      last_seen_at: now,
      verification_next_check_at: now,
      metadata: {
        ...metadata,
        summary: summary || null,
        organization: organization || null,
        requirements,
        benefits,
        application_process: applicationProcess,
        eligibility: eligibility || {},
        quality_score: record.qualityScore ?? record.quality_score ?? null,
        validation_status:
          record.validationStatus ?? record.validation_status ?? null,
      },
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

    if (
      String(
        input.application_url ||
          input.apply_url ||
          input.applicationUrl ||
          input.applyUrl ||
          input.sourceUrl ||
          input.source_url ||
          "",
      ).startsWith("http")
    ) {
      score += 15;
    } else {
      missingFields.push("application_url");
    }

    if (Array.isArray(input.requirements) && input.requirements.length > 0)
      score += 10;
    else missingFields.push("requirements");

    if (Array.isArray(input.benefits) && input.benefits.length > 0) score += 10;
    else missingFields.push("benefits");

    if (input.deadline || input.close_date) score += 10;
    else missingFields.push("deadline");

    if (input.image_url || input.imageUrl) score += 5;
    else missingFields.push("image");

    return { score: Math.min(100, score), missingFields };
  }

  private shouldEnhanceOpportunity(item: Record<string, any>): boolean {
    const summary = this.cleanOptionalText(item.summary, 420) || "";
    const description = this.cleanText(String(item.description ?? ""), 1800);
    const requirements = this.normalizeStringList(
      item.requirements || item.metadata?.requirements,
    );
    const benefits = this.normalizeStringList(
      item.benefits || item.metadata?.benefits,
    );
    const applicationProcess = this.normalizeStringList(
      item.applicationProcess ||
        item.application_process ||
        item.metadata?.application_process,
    );

    return (
      !summary ||
      summary.split(/\s+/).filter(Boolean).length < 18 ||
      description.length < 180 ||
      !this.cleanOptionalText(item.eligibilityCriteria) ||
      !this.cleanOptionalText(item.fundingType) ||
      !this.cleanOptionalText(item.targetRegion) ||
      requirements.length === 0 ||
      benefits.length === 0 ||
      applicationProcess.length === 0
    );
  }

  private normalizeProcessedItem(
    item: Record<string, any>,
    aiData?: Record<string, any> | null,
    enrichment?: { aiAttempted?: boolean; sourceTextUsed?: boolean },
  ): ProcessedItem {
    const requirements = this.normalizeStringList(
      aiData?.requirements || item.requirements || item.metadata?.requirements,
    );
    const benefits = this.normalizeStringList(
      aiData?.benefits || item.benefits || item.metadata?.benefits,
    );
    const applicationProcess = this.normalizeStringList(
      aiData?.applicationProcess ||
        aiData?.application_process ||
        item.applicationProcess ||
        item.application_process ||
        item.metadata?.application_process,
    );
    const summary = this.normalizeSummary(
      aiData?.summary || item.summary || item.description || "",
      aiData?.description || item.description || "",
      String(item.title ?? ""),
    );
    const description = this.normalizeDescription(
      aiData?.description || item.description || "",
    );

    const metadata = {
      ...(item.metadata || {}),
      ai_enrichment: {
        attempted: Boolean(enrichment?.aiAttempted),
        source_text_used: Boolean(enrichment?.sourceTextUsed),
        confidence: Number(aiData?.confidence ?? item.confidence ?? 0),
        notes: this.normalizeStringList(aiData?.notes || item.notes),
        improved_at: enrichment?.aiAttempted
          ? new Date().toISOString()
          : item.metadata?.ai_enrichment?.improved_at,
      },
    };

    return {
      ...item,
      metadata,
      summary,
      description,
      organization:
        this.cleanOptionalText(
          aiData?.organization || item.organization || "",
          200,
        ) || null,
      eligibilityCriteria:
        this.cleanOptionalText(
          aiData?.eligibilityCriteria || item.eligibilityCriteria || "",
          500,
        ) || "",
      fundingType:
        this.cleanOptionalText(
          aiData?.fundingType || item.fundingType || "",
          200,
        ) || "",
      targetRegion:
        this.cleanOptionalText(
          aiData?.targetRegion || item.targetRegion || "",
          200,
        ) || "",
      deadline: item.deadline || aiData?.deadline || null,
      requirements,
      benefits,
      applicationProcess,
      eligibility:
        (aiData?.eligibility as Record<string, unknown>) ||
        item.eligibility ||
        {},
      confidence: Number(aiData?.confidence ?? item.confidence ?? 0),
      notes: this.normalizeStringList(aiData?.notes || item.notes),
      tags: this.normalizeStringList([
        ...(Array.isArray(item.tags) ? item.tags : []),
        ...(Array.isArray(aiData?.tags) ? aiData.tags : []),
      ]),
    } as unknown as ProcessedItem;
  }

  private buildOpportunityEnhancementPrompt(
    item: Record<string, any>,
    sourceText: string,
  ): string {
    const metadata = (item.metadata || {}) as Record<string, unknown>;
    const requirements = this.normalizeStringList(
      item.requirements || metadata.requirements,
    );
    const benefits = this.normalizeStringList(
      item.benefits || metadata.benefits,
    );
    const applicationProcess = this.normalizeStringList(
      item.applicationProcess ||
        item.application_process ||
        metadata.application_process,
    );
    const sourceUrl =
      item.sourceUrl ||
      item.source_url ||
      item.detailUrl ||
      item.url ||
      item.applyUrl ||
      item.apply_url ||
      "";
    const applyUrl =
      item.applyUrl ||
      item.apply_url ||
      item.applicationUrl ||
      item.application_url ||
      "";

    return `You are Edutu's opportunity content enrichment API. Improve incomplete scholarship, fellowship, internship, grant, or program records for consistent app cards and detail pages.

Use only facts present in the structured input or source text. Do not invent deadlines, countries, funding amounts, eligibility, organizations, or application links. If a fact is missing, return null or an empty array for that field. Write in clear, consistent, student-facing language.

Return ONLY valid JSON matching this schema:
{
  "summary": "25-45 word preview summary or null",
  "description": "4-6 sentence factual overview or null",
  "organization": "host/provider if clearly stated or null",
  "eligibilityCriteria": "who can apply if clearly stated or null",
  "fundingType": "funding amount/type if clearly stated or null",
  "targetRegion": "eligible countries/regions if clearly stated or null",
  "deadline": "YYYY-MM-DD, readable source deadline, or null",
  "requirements": ["specific requirement or document"],
  "benefits": ["specific award, funding, access, mentorship, or other benefit"],
  "applicationProcess": ["specific application step"],
  "eligibility": { "level": "if stated", "nationality": "if stated", "field": "if stated" },
  "tags": ["3-6 concise tags"],
  "confidence": 0.0,
  "notes": ["short caveats for missing or unclear facts"]
}

Structured input:
Title: ${this.cleanText(String(item.title || ""), 260)}
Summary: ${this.cleanText(String(item.summary || ""), 600) || "N/A"}
Description: ${this.cleanText(String(item.description || ""), 1600) || "N/A"}
Organization: ${this.cleanText(String(item.organization || ""), 240) || "N/A"}
Category: ${this.cleanText(String(item.category || item.canonical_category || ""), 160) || "N/A"}
Location: ${this.cleanText(String(item.location || item.targetRegion || item.target_region || ""), 200) || "N/A"}
Deadline: ${this.cleanText(String(item.deadline || item.close_date || ""), 120) || "N/A"}
Source URL: ${sourceUrl || "N/A"}
Application URL: ${applyUrl || "N/A"}
Existing requirements: ${JSON.stringify(requirements)}
Existing benefits: ${JSON.stringify(benefits)}
Existing application process: ${JSON.stringify(applicationProcess)}
Existing eligibility: ${JSON.stringify(item.eligibility || metadata.eligibility || {})}
Existing metadata excerpt: ${JSON.stringify(metadata).slice(0, 2400)}

Source text excerpt:
${sourceText || "No source page text was available. Improve wording only from structured input and keep unknown facts empty."}`;
  }

  private async resolveOpportunitySourceText(
    item: Record<string, any>,
  ): Promise<string> {
    const embeddedText = this.extractEmbeddedSourceText(item);
    if (embeddedText) return embeddedText;
    if (process.env.OPPORTUNITY_AI_FETCH_SOURCE === "false") return "";

    const url =
      item.sourceUrl ||
      item.source_url ||
      item.detailUrl ||
      item.detail_url ||
      item.applyUrl ||
      item.apply_url ||
      item.applicationUrl ||
      item.application_url ||
      "";
    if (!this.isSafeOpportunitySourceUrl(url)) return "";

    try {
      const response = await axios.get(url, {
        timeout: AI_SOURCE_FETCH_TIMEOUT_MS,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; EdutuOpportunityBot/1.0; +https://edutu.ai)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        },
        maxContentLength: 1_500_000,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      return this.extractSourceTextFromHtml(String(response.data || ""));
    } catch (error) {
      this.logger.warn(
        `Could not fetch source text for AI enrichment (${url}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return "";
    }
  }

  private extractEmbeddedSourceText(item: Record<string, any>): string {
    const metadata = (item.metadata || {}) as Record<string, any>;
    const candidates = [
      item.sourceText,
      item.source_text,
      item.rawText,
      item.raw_text,
      item.extractedText,
      item.extracted_text,
      item.contentText,
      item.content_text,
      item.pageText,
      item.page_text,
      metadata.source_text,
      metadata.raw_text,
      metadata.extracted_text,
      metadata.content_text,
      metadata.page_text,
    ];

    for (const candidate of candidates) {
      const cleaned = this.cleanOptionalText(
        candidate,
        AI_SOURCE_TEXT_MAX_CHARS,
      );
      if (cleaned && cleaned.length >= 80) {
        return cleaned;
      }
    }

    return "";
  }

  private extractSourceTextFromHtml(html: string): string {
    if (!html) return "";
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, footer, header, aside, iframe").remove();
    const selectors =
      "article, main, .entry-content, .post-content, .content, [class*='content'], [class*='article']";
    const candidates: string[] = [];

    $(selectors).each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length >= 120) {
        candidates.push(text);
      }
    });

    const text = candidates.length
      ? candidates
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join("\n\n")
      : $("body").text();

    return text.replace(/\s+/g, " ").trim().slice(0, AI_SOURCE_TEXT_MAX_CHARS);
  }

  private isSafeOpportunitySourceUrl(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) return false;
      const host = parsed.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "0.0.0.0" ||
        host === "127.0.0.1" ||
        host === "::1"
      ) {
        return false;
      }
      if (
        /^(10|127)\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        /^169\.254\./.test(host)
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private normalizeSummary(
    summary: string | null | undefined,
    description: string | null | undefined,
    title: string,
  ): string {
    const cleanedSummary = this.cleanOptionalText(summary, 420);
    const cleanedDescription = this.cleanText(String(description || ""), 1200);
    const fallback =
      this.firstSentence(cleanedDescription) ||
      this.cleanText(title, 220) ||
      "Scholarship opportunity details are being verified by Edutu.";
    const candidate = cleanedSummary || fallback;
    const words = candidate.split(/\s+/).filter(Boolean);
    const limited =
      words.length > 45 ? words.slice(0, 45).join(" ") : candidate;
    return /[.!?]$/.test(limited) ? limited : `${limited}.`;
  }

  private normalizeDescription(description: string | null | undefined): string {
    return this.cleanOptionalText(description, 1800) || "";
  }

  private cleanText(text: string, maxChars = 500): string {
    return (text ?? "").replace(/\s+/g, " ").trim().substring(0, maxChars);
  }

  private cleanOptionalText(
    value: unknown,
    maxChars = 500,
  ): string | undefined {
    const cleaned = this.cleanText(String(value ?? ""), maxChars);
    if (!cleaned) return undefined;
    if (
      /^(n\/a|na|none|null|unknown(?:\s+.*)?|not available|not provided|not stated|not specified|unspecified|tbd|tba)$/i.test(
        cleaned,
      )
    ) {
      return undefined;
    }
    return cleaned;
  }

  private normalizeStringList(value: unknown): string[] {
    const queue = Array.isArray(value) ? value : value ? [value] : [];
    const flattened = queue.flatMap((entry) => {
      if (Array.isArray(entry)) return entry;
      if (typeof entry === "string") return [entry];
      if (entry && typeof entry === "object") {
        return Object.values(entry as Record<string, unknown>).map((value) =>
          String(value ?? ""),
        );
      }
      return [String(entry ?? "")];
    });

    return Array.from(
      new Set(
        flattened
          .map((entry) => this.cleanOptionalText(entry, 220))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ).slice(0, 12);
  }

  private firstSentence(text: string): string {
    if (!text) return "";
    const sentenceMatch = text.match(/^(.{40,240}?[.!?])(?:\s|$)/);
    return sentenceMatch?.[1]?.trim() || text.substring(0, 220).trim();
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
        if (!this.shouldEnhanceOpportunity(item)) {
          processedItems.push(
            this.normalizeProcessedItem(item, null, {
              aiAttempted: false,
              sourceTextUsed: false,
            }),
          );
          continue;
        }

        const sourceText = await this.resolveOpportunitySourceText(item);
        const prompt = this.buildOpportunityEnhancementPrompt(item, sourceText);
        const aiData = await this.generateOpportunityEnhancement(prompt, {
          title: item.title,
          sourceUrl: item.sourceUrl || item.source_url || item.applyUrl,
          sourceTextLength: sourceText.length,
        });

        processedItems.push(
          this.normalizeProcessedItem(item, aiData, {
            aiAttempted: true,
            sourceTextUsed: sourceText.length > 0,
          }),
        );
      } catch (err) {
        this.logger.warn(
          `AI processing failed for item: ${item.title}`,
          err.message,
        );
        processedItems.push(
          this.normalizeProcessedItem(item, null, {
            aiAttempted: true,
            sourceTextUsed: false,
          }),
        ); // Keep original if AI fails
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
        const summary = this.normalizeSummary(
          item.summary || "",
          item.description || "",
          item.title,
        );
        const requirements = this.normalizeStringList(
          item.requirements || item.metadata?.requirements,
        );
        const benefits = this.normalizeStringList(
          item.benefits || item.metadata?.benefits,
        );
        const applicationProcess = this.normalizeStringList(
          item.applicationProcess ||
            item.application_process ||
            item.metadata?.application_process,
        );
        const eligibility = item.eligibility || {};
        const qualityScore = this.scoreCanonicalOpportunity({
          ...item,
          summary,
          description: item.description || "",
          requirements,
          benefits,
        });
        const base = this.toCanonicalOpportunityPayload(
          {
            title: item.title,
            summary,
            description: item.description || null,
            organization: item.organization || null,
            category: item.category || "scholarship",
            type: item.type || "scholarship",
            eligibilityCriteria: item.eligibilityCriteria || null,
            fundingType: item.fundingType || null,
            targetRegion: item.targetRegion || null,
            eligibility,
            deadline: item.deadline || null,
            sourceUrl: item.sourceUrl,
            applyUrl: item.applyUrl || item.sourceUrl,
            imageUrl: item.imageUrl || null,
            isRemote: item.isRemote ?? true,
            status: "pending",
            tags: item.tags || [],
            requirements,
            benefits,
            applicationProcess,
            qualityScore: qualityScore.score,
            validationStatus:
              qualityScore.score >= 70 ? "complete" : "needs_review",
          },
          "pending",
        );

        return {
          ...base,
          metadata: {
            ...((base.metadata as Record<string, unknown>) || {}),
            summary,
            organization: item.organization || null,
            requirements,
            benefits,
            application_process: applicationProcess,
            eligibility,
            quality_score: qualityScore.score,
            validation_status:
              qualityScore.score >= 70 ? "complete" : "needs_review",
            extraction_missing_fields: qualityScore.missingFields,
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
      await this.prewarmShareAssets(saved);
      return { inserted, skipped, opportunities: saved };
    }

    const values = validItems.map((item) => {
      const summary = this.normalizeSummary(
        item.summary || "",
        item.description || "",
        item.title,
      );
      const requirements = this.normalizeStringList(
        item.requirements || item.metadata?.requirements,
      );
      const benefits = this.normalizeStringList(
        item.benefits || item.metadata?.benefits,
      );
      const applicationProcess = this.normalizeStringList(
        item.applicationProcess ||
          item.application_process ||
          item.metadata?.application_process,
      );
      const eligibility = item.eligibility || {};
      const qualityScore = this.scoreCanonicalOpportunity({
        ...item,
        summary,
        description: item.description || "",
        requirements,
        benefits,
      });

      return {
        title: item.title,
        summary,
        description: item.description || null,
        organization: item.organization || null,
        category: item.category || "scholarship",
        canonicalCategory: categorizeOpportunity(item),
        type: item.type || "scholarship",
        eligibilityCriteria: item.eligibilityCriteria || null,
        fundingType: item.fundingType || null,
        targetRegion: item.targetRegion || null,
        eligibility,
        deadline: item.deadline ? new Date(item.deadline) : null,
        sourceUrl: item.sourceUrl,
        applyUrl: item.applyUrl || item.sourceUrl,
        imageUrl: item.imageUrl || null,
        tags: item.tags || [],
        isRemote: true,
        status: "pending",
        qualityScore: qualityScore.score,
        validationStatus:
          qualityScore.score >= 70 ? "complete" : "needs_review",
        metadata: {
          summary,
          organization: item.organization || null,
          requirements,
          benefits,
          application_process: applicationProcess,
          eligibility,
          quality_score: qualityScore.score,
          validation_status:
            qualityScore.score >= 70 ? "complete" : "needs_review",
          extraction_missing_fields: qualityScore.missingFields,
          original: item,
        },
        originalJson: JSON.stringify(item),
      };
    });

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
      await this.prewarmShareAssets(result);
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
      await this.prewarmShareAssets(savedOpportunities);
      return { inserted, skipped, opportunities: savedOpportunities };
    }
  }

  private async prewarmShareAssets(opportunityRows: Record<string, any>[]) {
    if (!opportunityRows.length) return;

    await this.opportunityShareCardService.ensureShareCardsForOpportunities(
      opportunityRows,
    );

    if (process.env.OPPORTUNITY_SHARE_PDF_PREWARM === "true") {
      await this.opportunityShareCardService.ensureSharePdfsForOpportunities(
        opportunityRows,
      );
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

  private buildSharePdfFileName(opportunity: { id?: string; title?: string }) {
    const title = (opportunity.title || "edutu-opportunity")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const suffix = opportunity.id ? `-${opportunity.id}` : "";
    return `${title || "edutu-opportunity"}${suffix}.pdf`;
  }

  getPublicAppBaseUrl(): string {
    return (
      process.env.EDUTU_PUBLIC_APP_URL ||
      process.env.PUBLIC_WEB_APP_URL ||
      process.env.WEB_APP_URL ||
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      "https://edutu.ai"
    ).replace(/\/$/, "");
  }
}
