import {
  Injectable,
  Logger,
  Optional,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { db } from "../db";
import { opportunities } from "../db/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { eq, or, and, sql, lt, gte, isNull, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { parseDeadlineDetailed } from "./deadline.util";
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from "./dto/personalization.dto";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
import { CacheService } from "../common/cache/cache.service";
import { SavedSearchesService } from "../saved-searches/saved-searches.service";
import {
  filterStaticOpportunityRows,
  loadStaticOpportunitySnapshot,
  pickOpportunityUrl,
  withOpportunityUrlAliases,
} from "./opportunity-static-snapshot";

const OPPS_CACHE_PREFIX = "opps:";
import {
  buildOpportunityPublicShareUrl,
  buildOpportunityShareText,
} from "./opportunity-share-text";
import {
  categorizeOpportunity,
  classifyOpportunity,
  type OpportunityCanonicalCategory,
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
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional(),
  isFeatured: z.boolean().optional().default(false),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending_review"),
  tags: z.array(z.string()).optional(),
});

// Canonical status vocabulary is pending_review/active/draft/closed/rejected
// (what the admin UI and DB queries key on). Legacy spellings still arrive
// from older clients/imports — normalize instead of persisting the drift.
const LEGACY_OPPORTUNITY_STATUS: Record<string, string> = {
  pending: "pending_review",
  expired: "closed",
};

export function canonicalOpportunityStatus(
  status: string | null | undefined,
  fallback = "pending_review",
): string {
  const value = (status || "").trim().toLowerCase();
  if (!value) return fallback;
  return LEGACY_OPPORTUNITY_STATUS[value] ?? value;
}

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
  skills: z.array(z.string()).max(12).optional().default([]),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  confidence: z.number().optional().default(0),
  notes: z.array(z.string()).optional().default([]),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending_review"),
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
  skills: z.array(z.string()).max(12).optional().default([]),
  eligibility: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0),
  notes: z.array(z.string()).optional().default([]),
});

type OpportunityEnhancement = z.infer<typeof OpportunityEnhancementSchema>;

const AI_SOURCE_TEXT_MAX_CHARS = 8_000;
const AI_SOURCE_FETCH_TIMEOUT_MS = 12_000;
// Below this, page text is too thin to enrich from (nav-only pages, dead links,
// interstitials) — the enricher falls back to an open-web search for the record.
const AI_SOURCE_MIN_USEFUL_CHARS = 400;
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
    skills: { type: "array", items: { type: "string" } },
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
    "skills",
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
  /**
   * Exclude opportunities whose deadline has passed. Defaults to true (include
   * them) so existing callers are unaffected; the admin list opts out.
   */
  includeExpired?: boolean;
  /** Only rows with no deadline at all — the re-scrape/AI recovery cohort. */
  missingDeadline?: boolean;
  /** Only featured rows — mirrors the Featured stat card. */
  featured?: boolean;
  /** Deadline within the next 7 days — mirrors the Expiring Soon stat card. */
  expiringSoon?: boolean;
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

@Injectable()
export class OpportunitiesService {
  private readonly logger = new Logger(OpportunitiesService.name);
  private readonly supabase: SupabaseClient | null = null;

  // Read-through cache for the near-static catalog is served by the shared
  // (Redis-backed) CacheService under the "opps:" prefix. Every write
  // (create/update/status/remove/import/enhance/purge/sync) invalidates it so
  // edits are visible immediately rather than after the TTL lapses.
  private invalidateReadCaches(): void {
    void this.cache?.delByPrefix(OPPS_CACHE_PREFIX);
  }

  constructor(
    private readonly opportunityRankingService: OpportunityRankingService,
    private readonly aiService: AiService,
    private readonly opportunityShareCardService: OpportunityShareCardService,
    private readonly shareEnrichService: OpportunityShareEnrichService,
    private readonly embeddingService: OpportunityEmbeddingService,
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly savedSearchesService?: SavedSearchesService,
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
    const cacheKey = `${OPPS_CACHE_PREFIX}list:${statusFilter}:${category || ""}:${cappedLimit}:${normalizedOffset}`;

    // Public "active" listings must not surface opportunities whose deadline
    // has already passed (mirrors opportunity-ranking fetchCandidateOpportunities).
    const excludeExpired = statusFilter === "active";
    const today = new Date().toISOString().slice(0, 10);

    const run = async () => {
      try {
        if (this.supabase) {
          let request = this.supabase
            .from("opportunities")
            .select("*")
            .eq("status", statusFilter)
            .order("created_at", { ascending: false })
            .range(normalizedOffset, normalizedOffset + cappedLimit - 1);

          if (excludeExpired) {
            request = request.or(`close_date.gte.${today},close_date.is.null`);
          }

          if (category) {
            request = request.eq("category", category);
          }

          const { data, error } = await request;
          if (!error) {
            const rows = data ?? [];
            if (rows.length > 0) {
              return rows.map((row) =>
                withOpportunityUrlAliases(row as Record<string, any>),
              );
            }
          } else {
            this.logger.warn(
              `Canonical opportunity list query failed, falling back to Drizzle schema: ${error.message}`,
            );
          }
        }

        const conditions = [eq(opportunities.status, statusFilter)];
        if (category) {
          conditions.push(eq(opportunities.category, category));
        }
        if (excludeExpired) {
          conditions.push(
            or(
              isNull(opportunities.closeDate),
              gte(opportunities.closeDate, today),
            )!,
          );
        }

        const query = db
          .select()
          .from(opportunities)
          .where(and(...conditions))
          .limit(cappedLimit)
          .offset(normalizedOffset)
          .orderBy(desc(opportunities.createdAt));

        const rows = await query.execute();
        if (rows.length > 0) {
          return rows.map((row) =>
            withOpportunityUrlAliases(row as Record<string, any>),
          );
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
      ).map((row) => withOpportunityUrlAliases(row as Record<string, any>));
    };

    return this.cache ? this.cache.wrap(cacheKey, 45, run) : run();
  }

  /**
   * Editorially featured opportunities, active and not past their deadline.
   *
   * Deliberately its own query rather than a filter over the recommendations
   * feed: ranking decides what a *user* is competitive for, which is a
   * different question from what the team chose to spotlight. Filtering the
   * ranked feed meant a featured item outside a user's top-N candidates simply
   * never appeared, so the home rail emptied for reasons no one could see.
   */
  async findFeatured(limit: number = 10) {
    const cappedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `${OPPS_CACHE_PREFIX}featured:${cappedLimit}`;

    // The generated share card is the image fallback for rows with no scraped
    // image, but it lives in `metadata`, which the public projection strips.
    // Lift it to a top-level field so featured cards don't render imageless.
    const shape = (row: Record<string, any>) => ({
      ...withOpportunityUrlAliases(row),
      share_image_url:
        row.metadata?.share_card?.url ?? row.share_image_url ?? null,
    });

    const run = async () => {
      try {
        if (this.supabase) {
          const { data, error } = await this.supabase
            .from("opportunities")
            .select("*")
            .eq("status", "active")
            .eq("is_featured", true)
            .or(`close_date.gte.${today},close_date.is.null`)
            // Soonest real deadline first; rolling (null) items sort last so a
            // spotlight the user can still act on leads the rail.
            .order("close_date", { ascending: true, nullsFirst: false })
            .limit(cappedLimit);

          if (!error) {
            return (data ?? []).map((row) => shape(row as Record<string, any>));
          }

          this.logger.warn(
            `Featured opportunity query failed, falling back to Drizzle schema: ${error.message}`,
          );
        }

        const rows = await db
          .select()
          .from(opportunities)
          .where(
            and(
              eq(opportunities.status, "active"),
              eq(opportunities.isFeatured, true),
              or(
                isNull(opportunities.closeDate),
                gte(opportunities.closeDate, today),
              ),
            ),
          )
          .limit(cappedLimit)
          .execute();

        return rows.map((row) => shape(row as Record<string, any>));
      } catch (error: any) {
        this.logger.warn(
          `Featured opportunities unavailable: ${error?.message ?? String(error)}`,
        );
        // An empty rail is the correct degraded state here — never a random
        // unfeatured row dressed up as an editorial pick.
        return [];
      }
    };

    return this.cache ? this.cache.wrap(cacheKey, 120, run) : run();
  }

  // Logged once so a missing migration doesn't spam a warn per search request.
  private hybridSearchDegradedLogged = false;

  /**
   * Hybrid search over active opportunities using Reciprocal Rank Fusion of:
   *   (a) weighted full-text rank (websearch_to_tsquery over search_tsv),
   *   (b) trigram similarity on lower(title) for typo tolerance (> 0.25),
   *   (c) optional semantic leg (pgvector cosine) when a query embedding is
   *       available within SEARCH_EMBED_TIMEOUT_MS.
   * Requires migration 20260710170000_opportunity_hybrid_search; until it is
   * applied the query errors and we gracefully fall back to the legacy ILIKE
   * path (logged once).
   */
  async hybridSearch(
    term: string,
    filters: { category?: string } = {},
    limit = 20,
    offset = 0,
  ) {
    const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 60);
    const cappedOffset = Math.max(Number(offset) || 0, 0);
    const trimmed = String(term || "").trim();
    if (trimmed.length < 2) {
      return [];
    }
    const category = filters.category?.trim() || null;

    // Optional semantic leg — never let search latency hang on the embedding
    // provider (hard 1500ms budget, proceed lexically-only on miss).
    const queryEmbedding = await this.resolveSearchEmbedding(trimmed);
    const vectorLiteral = queryEmbedding
      ? `[${queryEmbedding.join(",")}]`
      : null;

    const activeFilter = sql`
      o.status = 'active'
      and (o.close_date is null or o.close_date >= current_date)
      ${category ? sql`and o.category = ${category}` : sql``}
    `;

    try {
      // RRF with the standard k=60 constant. FTS is weighted 1.0, trigram 0.8
      // (typo rescue, not the primary signal), semantic 0.9 when present.
      const semanticCte = vectorLiteral
        ? sql`,
          sem as (
            select o.id,
                   row_number() over (
                     order by o.embedding <=> ${vectorLiteral}::vector
                   ) as rank
            from opportunities o
            where ${activeFilter}
              and o.embedding is not null
            order by o.embedding <=> ${vectorLiteral}::vector
            limit 100
          )`
        : sql``;
      const semanticJoin = vectorLiteral
        ? sql`full outer join sem s using (id)`
        : sql``;
      const semanticScore = vectorLiteral
        ? sql`+ coalesce(0.9 / (60 + s.rank), 0)`
        : sql``;

      const result = await db.execute(sql`
        with fts as (
          select o.id,
                 row_number() over (
                   order by ts_rank_cd(
                     o.search_tsv,
                     websearch_to_tsquery('english', ${trimmed})
                   ) desc
                 ) as rank
          from opportunities o
          where ${activeFilter}
            and o.search_tsv @@ websearch_to_tsquery('english', ${trimmed})
          order by ts_rank_cd(
            o.search_tsv,
            websearch_to_tsquery('english', ${trimmed})
          ) desc
          limit 100
        ),
        trgm as (
          select o.id,
                 row_number() over (
                   order by similarity(lower(o.title), lower(${trimmed})) desc
                 ) as rank
          from opportunities o
          where ${activeFilter}
            and similarity(lower(o.title), lower(${trimmed})) > 0.25
          order by similarity(lower(o.title), lower(${trimmed})) desc
          limit 100
        )
        ${semanticCte},
        fused as (
          select id,
                 coalesce(1.0 / (60 + f.rank), 0)
                   + coalesce(0.8 / (60 + t.rank), 0)
                   ${semanticScore}
                   as score
          from fts f
          full outer join trgm t using (id)
          ${semanticJoin}
        )
        select o.*, fused.score as search_score
        from fused
        join opportunities o on o.id = fused.id
        order by fused.score desc, o.created_at desc
        limit ${cappedLimit} offset ${cappedOffset}
      `);

      const rows = (
        Array.isArray(result)
          ? result
          : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])
      ) as Record<string, any>[];
      return rows.map((row) => this.sanitizeSearchRow(row));
    } catch (error) {
      if (!this.hybridSearchDegradedLogged) {
        this.hybridSearchDegradedLogged = true;
        this.logger.warn(
          `Hybrid search unavailable (migration not applied yet?), serving ILIKE fallback: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return this.searchWithIlikeFallback(
        trimmed,
        category,
        cappedLimit,
        cappedOffset,
      );
    }
  }

  /** Legacy ILIKE search (same fields as the admin list search), parameterized. */
  private async searchWithIlikeFallback(
    term: string,
    category: string | null,
    limit: number,
    offset: number,
  ) {
    const pattern = `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

    try {
      const result = await db.execute(sql`
        select o.*
        from opportunities o
        where o.status = 'active'
          and (o.close_date is null or o.close_date >= current_date)
          ${category ? sql`and o.category = ${category}` : sql``}
          and (
            o.title ilike ${pattern}
            or o.organization ilike ${pattern}
            or o.category ilike ${pattern}
            or o.source ilike ${pattern}
          )
        order by o.created_at desc
        limit ${limit} offset ${offset}
      `);

      const rows = (
        Array.isArray(result)
          ? result
          : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])
      ) as Record<string, any>[];
      return rows.map((row) => this.sanitizeSearchRow(row));
    } catch (error) {
      this.logger.warn(
        `ILIKE search fallback failed, returning empty result: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Query embedding for the semantic leg, raced against a hard timeout so
   * search never blocks on the LLM provider. Null = skip the semantic leg.
   */
  private async resolveSearchEmbedding(term: string): Promise<number[] | null> {
    const SEARCH_EMBED_TIMEOUT_MS = 1500;
    try {
      const timeout = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SEARCH_EMBED_TIMEOUT_MS),
      );
      const embed = (async () => {
        const result = await this.aiService.embed({
          feature: "embeddings.query",
          input: term,
          taskType: "RETRIEVAL_QUERY",
          dimensions: 768,
        });
        return result?.embeddings?.[0] ?? null;
      })().catch(() => null);

      const embedding = await Promise.race([embed, timeout]);
      return embedding?.length === 768 ? embedding : null;
    } catch {
      return null;
    }
  }

  /** Never let embeddings or internal scores leak into API payloads. */
  private sanitizeSearchRow(row: Record<string, any>) {
    delete row.embedding;
    delete row.embedding_model;
    delete row.search_tsv;
    return withOpportunityUrlAliases(row);
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
    const run = async () => {
      try {
        if (this.supabase) {
          const { data, error } = await this.supabase
            .from("opportunities")
            .select("*")
            .eq("id", id)
            .maybeSingle();

          if (!error) {
            if (data) {
              return withOpportunityUrlAliases(data as Record<string, any>);
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
          return withOpportunityUrlAliases(res[0] as Record<string, any>);
        }
      } catch (error: any) {
        this.logger.warn(
          `Canonical opportunity detail unavailable, falling back to static snapshot: ${error?.message ?? String(error)}`,
        );
      }

      const snapshotRows = await loadStaticOpportunitySnapshot();
      const row = snapshotRows.find((item) => String(item.id) === String(id));
      return row ? withOpportunityUrlAliases(row as Record<string, any>) : null;
    };

    return this.cache
      ? this.cache.wrap(`${OPPS_CACHE_PREFIX}detail:${id}`, 60, run)
      : run();
  }

  async ensureShareCard(id: string) {
    const loaded = await this.findOne(id);
    if (!loaded) {
      return null;
    }
    // Fill any missing benefits/eligibility/summary (grounded, cached) so the
    // share text, card and OG unfurl all read as complete.
    const opportunity = await this.shareEnrichService.ensureEnriched(loaded);

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
    // Clamp matches the largest page size the admin UI offers (200); a lower
    // cap silently truncated the "200 rows" option to 100.
    const limit = Math.min(Math.max(Number(query.limit) || 50, 10), 200);
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

      // "planned" is a query-planner estimate that only happens to be right for
      // an unfiltered table: with the hide-expired predicate it reported 171
      // against 341 real rows, which would strand ~190 opportunities behind a
      // page count that never reaches them. "exact" measured faster here anyway
      // (188ms vs 524ms) — the estimate isn't buying anything.
      let request = this.supabase
        .from("opportunities")
        .select(ADMIN_OPPORTUNITY_COLUMNS, { count: "exact" })
        .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
        .order("id", { ascending: sort.ascending });

      const hasStatusFilter = Boolean(query.status && query.status !== "all");

      if (hasStatusFilter) {
        if (query.status === "closed") {
          // "Closed" must mean what the UI shows. effectiveStatus() renders an
          // 'active' row with a passed deadline as Closed, so a literal
          // eq('status','closed') returned a list missing rows that were badged
          // Closed right there on screen.
          request = request.or(
            `status.eq.closed,close_date.lt.${new Date().toISOString().slice(0, 10)}`,
          );
        } else if (query.status === "active") {
          // Mirror image: an 'active' row past its deadline is not active.
          request = request
            .eq("status", "active")
            .or(
              `close_date.is.null,close_date.gte.${new Date().toISOString().slice(0, 10)}`,
            );
        } else {
          request = request.eq("status", query.status);
        }
      }

      // "Expired" is not a stored status: it's status='closed' OR a close_date
      // in the past. The hourly verification job flips passed deadlines to
      // 'closed', but until it runs a row can still say 'active' with a dead
      // deadline — so both predicates are needed to actually exclude expired.
      //
      // Skipped when an explicit status is requested: asking for status=closed
      // AND not-expired is a contradiction that would always return zero rows.
      if (query.includeExpired === false && !hasStatusFilter) {
        request = request
          .neq("status", "closed")
          // close_date is nullable, and a null deadline is not an expiry —
          // a plain gte would silently drop every rolling opportunity.
          .or(
            `close_date.is.null,close_date.gte.${new Date().toISOString().slice(0, 10)}`,
          );
      }

      // Both columns must be empty: the 2026-07-12 migration coalesced
      // close_date <-> deadline, so a row with either one still has a date.
      if (query.missingDeadline) {
        request = request.is("close_date", null).is("deadline", null);
      }

      if (query.featured) {
        request = request.eq("is_featured", true);
      }

      // Same window as the expiringSoon stat: close_date within [today,
      // today + 7 days]. Date-only strings compare against midnight, matching
      // the RPC's current_date + interval '7 days' boundary.
      if (query.expiringSoon) {
        const today = new Date().toISOString().slice(0, 10);
        const inSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        request = request
          .not("close_date", "is", null)
          .gte("close_date", today)
          .lte("close_date", inSevenDays);
      }

      // "Expired" is not a stored status: it's status='closed' OR a close_date
      // in the past. The hourly verification job flips passed deadlines to
      // 'closed', but until it runs a row can still say 'active' with a dead
      // deadline — so both predicates are needed to actually exclude expired.
      //
      // Skipped when an explicit status is requested: asking for status=closed
      // AND not-expired is a contradiction that would always return zero rows.
      if (query.includeExpired === false && !hasStatusFilter) {
        request = request
          .neq("status", "closed")
          // close_date is nullable, and a null deadline is not an expiry —
          // a plain gte would silently drop every rolling opportunity.
          .or(
            `close_date.is.null,close_date.gte.${new Date().toISOString().slice(0, 10)}`,
          );
      }

      // Both columns must be empty: the 2026-07-12 migration coalesced
      // close_date <-> deadline, so a row with either one still has a date.
      if (query.missingDeadline) {
        request = request.is("close_date", null).is("deadline", null);
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
        data: rows.map((row) =>
          withOpportunityUrlAliases(row as Record<string, any>),
        ),
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

    // Must mirror opportunity_admin_stats() (migration 20260715090000) — if the
    // two disagree, the cards silently change meaning depending on whether the
    // RPC happened to be reachable.
    const result = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (
          where status = 'active'
            and (close_date is null or close_date >= current_date)
        )::int as active,
        count(*) filter (
          where status = 'closed'
             or (close_date is not null and close_date < current_date)
        )::int as expired,
        count(*) filter (
          where close_date is null and deadline is null
        )::int as "missingDeadline",
        count(*) filter (where is_featured = true)::int as featured,
        count(*) filter (
          where status = 'pending_review'
             or (
               coalesce(metadata->>'needs_review', 'false') = 'true'
               and status not in ('active', 'rejected', 'closed')
             )
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
        expired: 0,
        missingDeadline: 0,
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
    this.invalidateReadCaches();
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
      .where(deleteCondition)
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
    if (!dryRun) {
      this.invalidateReadCaches();
    }
    const { data, error } = await this.supabase
      .from("opportunities")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as Array<Record<string, any>>;
    const categoryLabels: Record<string, string> = {
      scholarships: "Scholarships",
      internships: "Internships",
      programs: "Programs",
      fellowships: "Fellowships",
      grants: "Grants",
      graduate_programs: "Graduate Programs",
      bootcamps: "Bootcamps",
      events: "Events",
      other: "Other",
    };
    const updates = rows.map((row) => {
      const rowMetadata =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const manuallyLocked = rowMetadata.classification_locked === true;
      const input = manuallyLocked
        ? row
        : {
            ...row,
            canonical_category: undefined,
            canonicalCategory: undefined,
          };
      const classification = classifyOpportunity(input);
      const metadata = {
        ...rowMetadata,
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
        displayCategory:
          categoryLabels[classification.canonicalCategory] ??
          classification.canonicalCategory,
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
            category: update.displayCategory,
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
    this.invalidateReadCaches();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .insert(this.toCanonicalOpportunityPayload(dto, "pending_review"))
        .select()
        .single();

      if (!error) {
        if (data?.id) void this.embeddingService.embedOpportunity(data.id);
        return withOpportunityUrlAliases(data as Record<string, any>);
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
        status: canonicalOpportunityStatus(dto.status),
        originalJson: JSON.stringify(dto),
      })
      .returning()
      .execute();

    if (result[0]?.id) {
      void this.embeddingService.embedOpportunity(result[0].id);
    }

    return result[0]
      ? withOpportunityUrlAliases(result[0] as Record<string, any>)
      : result[0];
  }

  async update(id: string, data: Partial<CreateOpportunityDto>) {
    this.invalidateReadCaches();
    if (this.supabase) {
      const { data: updated, error } = await this.supabase
        .from("opportunities")
        .update({
          ...this.toCanonicalOpportunityPayload(data),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (!error && updated) {
        return withOpportunityUrlAliases(updated as Record<string, any>);
      }

      if (!error) {
        // No error and no row means the id didn't match anything.
        throw new NotFoundException("Opportunity not found");
      }

      // A duplicate apply/source URL is a real conflict, not a server fault —
      // report it as 409 with a clear message instead of an opaque 500 (and
      // don't bother with the fallback, which hits the same unique index).
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          "Another opportunity already uses this apply or source URL. Change the URL and try again.",
        );
      }

      this.logger.warn(
        `Canonical opportunity update failed, trying direct DB update: ${error.message}`,
      );
    }

    // Fallback path (Supabase service client unavailable, or the canonical
    // update errored). The admin DTO carries camelCase fields AND metadata-only
    // keys (applicationProcess / application_process / requirements / benefits)
    // that are NOT columns on the Drizzle table. Spreading `...data` therefore
    // emitted `SET "application_process" = …` → invalid SQL → 500 on every
    // edit whenever this path ran. Map ONLY real columns, like create() does,
    // and only touch fields that were actually provided (partial update).
    const updateData: Partial<typeof opportunities.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title;
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.organization !== undefined)
      updateData.organization = data.organization;
    if (data.location !== undefined || data.targetRegion !== undefined)
      updateData.location = data.location || data.targetRegion || null;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.eligibilityCriteria !== undefined)
      updateData.eligibilityCriteria = data.eligibilityCriteria;
    if (data.fundingType !== undefined)
      updateData.fundingType = data.fundingType;
    if (data.targetRegion !== undefined)
      updateData.targetRegion = data.targetRegion;
    if (data.sourceUrl !== undefined) updateData.sourceUrl = data.sourceUrl;
    if (data.applyUrl !== undefined || data.sourceUrl !== undefined)
      updateData.applyUrl = data.applyUrl || data.sourceUrl || null;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.eligibility !== undefined)
      updateData.eligibility = data.eligibility as any;
    if (data.tags !== undefined) updateData.tags = data.tags as any;
    if (data.isFeatured !== undefined) updateData.isFeatured = data.isFeatured;
    if (data.isRemote !== undefined) updateData.isRemote = data.isRemote;
    if (data.status !== undefined) updateData.status = data.status;

    // Guard the date: an invalid string used to throw RangeError → 500.
    if (data.deadline !== undefined) {
      const parsed = data.deadline ? new Date(data.deadline) : null;
      updateData.deadline =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }

    // NOTE: no `.returning()`. The Drizzle `opportunities` model declares a
    // `provider_id` column that does NOT exist on the live table, so a full
    // RETURNING clause throws `column "provider_id" does not exist` → 500. We
    // update, then re-read through findOne(), which is resilient on its own.
    try {
      await db
        .update(opportunities)
        .set(updateData)
        .where(eq(opportunities.id, id))
        .execute();
    } catch (error: any) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          "Another opportunity already uses this apply or source URL. Change the URL and try again.",
        );
      }
      throw error;
    }

    return this.findOne(id);
  }

  // Postgres unique-violation detector (SQLSTATE 23505), tolerant of both the
  // supabase-js error shape and Drizzle's wrapped driver error.
  private isUniqueViolation(error: any): boolean {
    const code = error?.code ?? error?.cause?.code;
    const message = String(error?.message ?? error?.cause?.message ?? "");
    return code === "23505" || /duplicate key|unique constraint/i.test(message);
  }

  async updateStatus(id: string, status: string) {
    this.invalidateReadCaches();
    if (this.supabase) {
      const { error } = await this.supabase
        .from("opportunities")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (!error) {
        // Approval makes the row visible to recommendations — make sure it
        // carries an embedding. Fire-and-forget; never throws.
        if (status === "active") {
          void this.embeddingService.embedOpportunity(id);
        }
        const row = await this.findOne(id);
        // Approval is when a row becomes visible — record saved-search matches
        // now. Delivery is batched by the saved-search digest cron, never here.
        if (status === "active" && row) {
          void this.savedSearchesService?.notifyNewOpportunities([row]);
        }
        return row;
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
    if (status === "active") {
      void this.embeddingService.embedOpportunity(id);
    }
    const row = await this.findOne(id);
    if (status === "active" && row) {
      void this.savedSearchesService?.notifyNewOpportunities([row]);
    }
    return row;
  }

  // Admin bulk status change: one batched UPDATE across all ids.
  async bulkUpdateStatus(ids: string[], status: string) {
    this.invalidateReadCaches();
    let updatedIds: string[] | null = null;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", ids)
        .select("id");

      if (!error) {
        updatedIds = (data ?? []).map((row: { id: string }) => row.id);
      } else {
        this.logger.warn(
          `Canonical bulk status update failed, falling back to Drizzle schema: ${error.message}`,
        );
      }
    }

    if (updatedIds === null) {
      const rows = await db
        .update(opportunities)
        .set({ status, updatedAt: new Date() })
        .where(inArray(opportunities.id, ids))
        .returning({ id: opportunities.id });
      updatedIds = rows.map((row) => row.id);
    }

    // Approval makes rows visible to recommendations — make sure they carry
    // embeddings. Fire-and-forget; never throws (mirrors updateStatus).
    if (status === "active") {
      for (const id of updatedIds) {
        void this.embeddingService.embedOpportunity(id);
      }
    }

    return { updated: updatedIds.length };
  }

  // Admin bulk re-categorization: moves selected rows to another discovery
  // tab. Writes both the display label (category) and canonical_category so
  // list filters and the mobile tabs agree.
  async bulkUpdateCategory(
    ids: string[],
    canonical: OpportunityCanonicalCategory,
  ) {
    const labels: Record<string, string> = {
      scholarships: "Scholarships",
      internships: "Internships",
      programs: "Programs",
      fellowships: "Fellowships",
      grants: "Grants",
      graduate_programs: "Graduate Programs",
      bootcamps: "Bootcamps",
      events: "Events",
    };
    const label = labels[canonical] ?? canonical;

    this.invalidateReadCaches();
    const classificationUpdatedAt = new Date().toISOString();

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .update({
          category: label,
          canonical_category: canonical,
          updated_at: classificationUpdatedAt,
        })
        .in("id", ids)
        .select("id");

      if (!error) {
        // A bulk move is an explicit admin decision. Preserve that decision
        // when the background classifier is run later, without replacing the
        // rest of each row's scraper metadata.
        const { data: metadataRows, error: metadataError } = await this.supabase
          .from("opportunities")
          .select("id, metadata")
          .in("id", ids);
        if (metadataError) {
          this.logger.warn(
            `Manual category lock could not be read: ${metadataError.message}`,
          );
        } else {
          const lockRows = (metadataRows ?? []) as Array<{
            id: string;
            metadata?: unknown;
          }>;
          for (let offset = 0; offset < lockRows.length; offset += 20) {
            const chunk = lockRows.slice(offset, offset + 20);
            await Promise.all(
              chunk.map(async (row) => {
                const existing =
                  row.metadata &&
                  typeof row.metadata === "object" &&
                  !Array.isArray(row.metadata)
                    ? (row.metadata as Record<string, unknown>)
                    : {};
                const { error: lockError } = await this.supabase!
                  .from("opportunities")
                  .update({
                    metadata: {
                      ...existing,
                      classification_locked: true,
                      classification_source: "manual",
                      classification_updated_at: classificationUpdatedAt,
                    },
                  })
                  .eq("id", row.id);
                if (lockError) {
                  this.logger.warn(
                    `Manual category lock failed for ${row.id}: ${lockError.message}`,
                  );
                }
              }),
            );
          }
        }
        return { updated: (data ?? []).length, category: label };
      }
      this.logger.warn(
        `Canonical bulk category update failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const rows = await db
      .update(opportunities)
      .set({
        category: label,
        canonicalCategory: canonical,
        updatedAt: new Date(),
      })
      .where(inArray(opportunities.id, ids))
      .returning({ id: opportunities.id });

    const metadataRows = await db
      .select({ id: opportunities.id, metadata: opportunities.metadata })
      .from(opportunities)
      .where(inArray(opportunities.id, ids));
    await Promise.all(
      metadataRows.map((row) => {
        const existing =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        return db
          .update(opportunities)
          .set({
            metadata: {
              ...existing,
              classification_locked: true,
              classification_source: "manual",
              classification_updated_at: classificationUpdatedAt,
            },
          })
          .where(eq(opportunities.id, row.id));
      }),
    );

    return { updated: rows.length, category: label };
  }

  // Admin bulk delete: one batched DELETE across all ids.
  async bulkRemove(ids: string[]) {
    this.invalidateReadCaches();

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .delete()
        .in("id", ids)
        .select("id");

      if (!error) {
        return { deleted: (data ?? []).length };
      }

      this.logger.warn(
        `Canonical bulk delete failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const rows = await db
      .delete(opportunities)
      .where(inArray(opportunities.id, ids))
      .returning({ id: opportunities.id });
    return { deleted: rows.length };
  }

  async enhanceOpportunity(id: string) {
    const opportunity = await this.findOne(id);
    if (!opportunity) return null;

    const metadata = (opportunity.metadata || {}) as Record<string, any>;
    const sourceUrl =
      opportunity.source_url ||
      opportunity.application_url ||
      opportunity.apply_url ||
      opportunity.applicationUrl ||
      opportunity.applyUrl ||
      opportunity.link ||
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
        applyUrl:
          opportunity.application_url ||
          opportunity.apply_url ||
          opportunity.applicationUrl ||
          opportunity.applyUrl ||
          opportunity.link,
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

    // The AI provider returned nothing usable (missing/invalid key, outage, or
    // schema rejection). Proceeding would recompute the same quality score off
    // the unchanged content and report a misleading "complete" — surface the
    // real failure so the admin can retry or fix the provider key instead.
    if (!aiData) {
      const existingScore = Number(opportunity.quality_score) || 0;
      return {
        success: false,
        error:
          "AI enhancement is temporarily unavailable (no response from the AI provider). Please check the AI provider key and try again.",
        completeness: {
          status: existingScore >= 70 ? "complete" : "not_complete",
          score: existingScore,
          missingFields: [],
          checkedAt: new Date().toISOString(),
        },
      };
    }

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
    const descriptionText =
      this.cleanOptionalText(aiData?.description) ||
      this.cleanOptionalText(opportunity.description) ||
      "";
    const summaryText =
      this.cleanOptionalText(aiData?.summary) ||
      this.cleanOptionalText(opportunity.summary) ||
      "";
    const description = this.normalizeDescription(descriptionText);
    const titleText = this.cleanOptionalText(opportunity.title, 220) || "";
    const summary = this.normalizeSummary(summaryText, description, titleText);
    // The enhancement prompt explicitly permits a readable deadline ("March 5"),
    // but close_date is a `date` column — writing the raw string makes Postgres
    // reject the entire update with 22007, which surfaces only as a logged warn
    // and success:false. So the AI date has to be parsed, not passed through.
    const titleYear = titleText.match(/\b(20\d{2})\b/)?.[1];
    const aiDeadline = parseDeadlineDetailed(
      aiData?.deadline ?? null,
      titleYear ? Number(titleYear) : null,
    );
    const closeDate =
      aiDeadline.date || opportunity.close_date || opportunity.deadline;
    const qualityScore = this.scoreCanonicalOpportunity({
      ...opportunity,
      summary,
      description,
      requirements,
      benefits,
      deadline: closeDate,
    });

    const skills = this.normalizeStringList(
      Array.isArray(aiData?.skills) && aiData.skills.length
        ? aiData.skills
        : opportunity.skills,
    );
    const eligibilityCriteria =
      this.cleanOptionalText(aiData?.eligibilityCriteria, 800) ||
      this.cleanOptionalText(opportunity.eligibility_criteria, 800) ||
      this.cleanOptionalText(metadata.eligibility_criteria, 800) ||
      null;

    const updatePayload = {
      summary,
      description,
      organization: organization || undefined,
      close_date: closeDate || undefined,
      skills,
      eligibility_criteria: eligibilityCriteria,
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
        // Only claim a confidence when the AI actually produced a usable date;
        // otherwise leave whatever the verification job already established.
        ...(aiDeadline.date
          ? { deadline_confidence: aiDeadline.confidence }
          : {}),
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

    // findOne() above populated the caches with the pre-enhancement row; clear
    // them now (just before the write) so post-enhancement reads are fresh.
    this.invalidateReadCaches();

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("opportunities")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (!error) {
        // Fire-and-forget: refresh the semantic embedding with the enriched
        // content. Never throws; degrades to a no-op without an API key.
        void this.embeddingService.embedOpportunity(id);
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

  /**
   * Admin backfill: re-run the single-row enhancement path over ACTIVE rows
   * that have no skills yet (the marker that they predate skills extraction),
   * newest first. Sequential with a small delay between rows to respect
   * provider rate limits. Per-row failures are counted, never thrown.
   */
  async backfillEnrichment(
    options: { limit?: number } = {},
  ): Promise<{ processed: number; enhanced: number; failed: number }> {
    const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 200);
    const rows = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.status, "active"),
          sql`coalesce(cardinality(${opportunities.skills}), 0) = 0`,
        ),
      )
      .orderBy(desc(opportunities.updatedAt))
      .limit(limit)
      .execute();

    const result = { processed: 0, enhanced: 0, failed: 0 };
    for (let i = 0; i < rows.length; i += 1) {
      const { id } = rows[i];
      result.processed += 1;
      try {
        const outcome = await this.enhanceOpportunity(id);
        if (outcome && (outcome as { success?: boolean }).success !== false) {
          result.enhanced += 1;
          // enhanceOpportunity already refreshes the embedding on success;
          // this direct call covers rows whose content did not change.
          void this.embeddingService.embedOpportunity(id);
        } else {
          result.failed += 1;
        }
      } catch (error) {
        result.failed += 1;
        this.logger.warn(
          `Enrichment backfill failed for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (i < rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    this.logger.log(
      `Enrichment backfill: processed=${result.processed} enhanced=${result.enhanced} failed=${result.failed}`,
    );
    return result;
  }

  async remove(id: string) {
    this.invalidateReadCaches();
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

    const applicationUrl = pickOpportunityUrl(
      input.applyUrl,
      input.applicationUrl,
      input.application_url,
      input.apply_url,
      input.link,
      input.sourceUrl,
      input.source_url,
    );
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
      // Real columns (not just metadata) so ranking/embedding can read them.
      skills: Array.isArray(record.skills)
        ? this.normalizeStringList(record.skills)
        : undefined,
      eligibility_criteria:
        input.eligibilityCriteria !== undefined
          ? input.eligibilityCriteria
          : ((record.eligibility_criteria as string | null | undefined) ??
            undefined),
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
      status: canonicalOpportunityStatus(input.status, defaultStatus),
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
          input.link ||
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
      skills: this.normalizeStringList(aiData?.skills || item.skills),
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
      item.applicationUrl ||
      item.application_url ||
      item.link ||
      "";
    const applyUrl =
      item.applyUrl ||
      item.apply_url ||
      item.applicationUrl ||
      item.application_url ||
      item.link ||
      "";

    return `You are Edutu's opportunity content enrichment API. Turn incomplete scholarship, fellowship, internship, grant, or training-program records into complete, trustworthy app cards and detail pages.

GOAL: produce a record complete enough to render a rich, context-driven detail page — aim to fill every field you reasonably can. ALWAYS write a clear 25-45 word summary and a factual 4-6 sentence description from the title, category, organization, and source text (never leave these two empty). Derive requirements, benefits, applicationProcess, and skills from the source text and the evident nature of the program; when the source clearly implies them for this kind of opportunity but does not spell them out, include the most likely items and add a short caveat in "notes" naming what was inferred.

INTEGRITY — do NOT fabricate these hard facts: exact deadline dates, specific funding amounts, application/source URLs, and nationality/eligibility restrictions. Provide those only when clearly supported by the input or source text; otherwise use null (or omit from arrays). Never contradict a fact already present in the input. Write in clear, consistent, student-facing language.

Return ONLY valid JSON matching this schema:
{
  "summary": "25-45 word preview summary (always provide one)",
  "description": "factual 4-6 sentence overview (always provide one)",
  "organization": "host/provider if stated or reasonably identifiable, else null",
  "eligibilityCriteria": "who can apply — from source, or the typical audience for this program type (note if inferred), else null",
  "fundingType": "funding amount/type if clearly stated, else null",
  "targetRegion": "eligible countries/regions if clearly stated, else null",
  "deadline": "YYYY-MM-DD, readable source deadline, or null",
  "requirements": ["specific or clearly-inferred requirement/document — leave empty only if truly indeterminable"],
  "benefits": ["specific or clearly-inferred award, funding, training, access, mentorship, or other benefit"],
  "applicationProcess": ["specific or typical application step"],
  "skills": ["5-12 concrete skills or competencies this opportunity develops or requires"],
  "eligibility": { "level": "if stated", "nationality": "if stated", "field": "if stated" },
  "tags": ["3-6 concise tags"],
  "confidence": 0.0,
  "notes": ["short caveats naming any inferred or unclear facts"]
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
${sourceText || "No source page text was available. Still write a complete summary and description from the structured input above, and infer the likely requirements, benefits, application steps, and skills for this kind of program — mark inferred items in notes. Keep hard facts (exact deadline, funding amount, application URL, nationality) null unless supported."}`;
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
      item.link ||
      "";

    // 1) Direct read of the stored source/apply URL.
    const directText = this.isSafeOpportunitySourceUrl(url)
      ? await this.fetchSourceUrlText(url)
      : "";
    if (directText.length >= AI_SOURCE_MIN_USEFUL_CHARS) return directText;

    // 2) Browse fallback — the record carries no usable page text of its own
    //    (missing, dead, or aggregator/listing URL), so search the open web for
    //    the canonical page and read that instead. This is what lets "AI improve"
    //    actually complete a record rather than re-scoring the same thin input.
    if (process.env.OPPORTUNITY_AI_WEB_SEARCH !== "false") {
      const searchedText = await this.searchWebForSourceText(item, url);
      if (searchedText.length > directText.length) return searchedText;
    }

    return directText;
  }

  private async fetchSourceUrlText(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: AI_SOURCE_FETCH_TIMEOUT_MS,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; EdutuOpportunityBot/1.0; +https://www.edutu.org)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        },
        maxContentLength: 1_500_000,
        maxRedirects: 4,
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

  /**
   * Open-web browse fallback for AI enrichment. Builds a query from the record's
   * strongest identifiers (title + organization), runs it through DuckDuckGo's
   * keyless HTML endpoint, then reads the first credible result page. Best-effort
   * and quiet on failure — enrichment still proceeds on structured input alone.
   */
  private async searchWebForSourceText(
    item: Record<string, any>,
    excludeUrl: string,
  ): Promise<string> {
    const title = this.cleanText(String(item.title || ""), 160);
    if (title.length < 8) return "";
    const organization = this.cleanText(String(item.organization || ""), 120);
    const query = [title, organization].filter(Boolean).join(" ").trim();

    let candidateUrls: string[] = [];
    try {
      const response = await axios.get("https://html.duckduckgo.com/html/", {
        params: { q: query },
        timeout: AI_SOURCE_FETCH_TIMEOUT_MS,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; EdutuOpportunityBot/1.0; +https://www.edutu.org)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.7",
        },
        maxContentLength: 1_500_000,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      candidateUrls = this.extractSearchResultUrls(
        String(response.data || ""),
        excludeUrl,
      );
    } catch (error) {
      this.logger.warn(
        `Web search fallback failed for AI enrichment ("${query}"): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return "";
    }

    for (const candidate of candidateUrls.slice(0, 3)) {
      const text = await this.fetchSourceUrlText(candidate);
      if (text.length >= AI_SOURCE_MIN_USEFUL_CHARS) return text;
    }
    return "";
  }

  private extractSearchResultUrls(html: string, excludeUrl: string): string[] {
    if (!html) return [];
    const $ = cheerio.load(html);
    const excludeHost = this.safeHost(excludeUrl);
    const blockedHosts = [
      "duckduckgo.com",
      "google.com",
      "bing.com",
      "facebook.com",
      "twitter.com",
      "x.com",
      "youtube.com",
      "linkedin.com",
      "instagram.com",
      "pinterest.com",
      "t.me",
      "reddit.com",
    ];
    const seen = new Set<string>();
    const urls: string[] = [];

    $("a.result__a, a.result__url").each((_, el) => {
      let href = $(el).attr("href") || "";
      if (!href) return;
      // DuckDuckGo wraps results in a redirect: /l/?uddg=<encoded-target>.
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try {
          href = decodeURIComponent(uddg[1]);
        } catch {
          return;
        }
      }
      if (href.startsWith("//")) href = `https:${href}`;
      if (!this.isSafeOpportunitySourceUrl(href)) return;
      const host = this.safeHost(href);
      if (!host || host === excludeHost) return;
      if (blockedHosts.some((b) => host === b || host.endsWith(`.${b}`)))
        return;
      if (seen.has(href)) return;
      seen.add(href);
      urls.push(href);
    });

    return urls;
  }

  private safeHost(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
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
      this.firstSentence(cleanedDescription) || this.cleanText(title, 220);
    const candidate = cleanedSummary || fallback;
    if (!candidate) return "";
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

  async recordUserOpportunitySignals(
    userId: string,
    inputs: OpportunitySignalDto[],
  ) {
    const signals = await this.opportunityRankingService.recordSignals(
      userId,
      inputs,
    );
    return { recorded: signals.length };
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

  async scoreOpportunitiesForUser(userId: string, opportunityIds: string[]) {
    return this.opportunityRankingService.scoreOpportunitiesForUser(
      userId,
      opportunityIds,
    );
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
          sourceUrl:
            item.sourceUrl ||
            item.source_url ||
            item.applyUrl ||
            item.apply_url ||
            item.applicationUrl ||
            item.application_url ||
            item.link,
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
    this.invalidateReadCaches();
    let inserted = 0;
    let skipped = 0;

    const validItems = items.filter(
      (item) =>
        item.title &&
        (item.sourceUrl ||
          item.source_url ||
          item.applyUrl ||
          item.apply_url ||
          item.applicationUrl ||
          item.application_url ||
          item.link),
    );
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
            sourceUrl:
              item.sourceUrl ||
              item.source_url ||
              item.applyUrl ||
              item.apply_url ||
              item.applicationUrl ||
              item.application_url ||
              item.link,
            applyUrl:
              item.applyUrl ||
              item.applicationUrl ||
              item.application_url ||
              item.apply_url ||
              item.link ||
              item.sourceUrl,
            imageUrl: item.imageUrl || null,
            isRemote: item.isRemote ?? true,
            status: "pending_review",
            tags: item.tags || [],
            requirements,
            benefits,
            applicationProcess,
            skills: this.normalizeStringList(item.skills),
            qualityScore: qualityScore.score,
            validationStatus:
              qualityScore.score >= 70 ? "complete" : "needs_review",
          },
          "pending_review",
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
          saved.push(withOpportunityUrlAliases(data as Record<string, any>));
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
      // Fire-and-forget: embed each new row for semantic recommendations.
      for (const record of saved) {
        const savedId = record.id;
        if (savedId)
          void this.embeddingService.embedOpportunity(String(savedId));
      }
      // Fire-and-forget: record saved-search matches (active rows only). The
      // digest cron batches them into one push per user.
      void this.savedSearchesService?.notifyNewOpportunities(saved);
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
        skills: this.normalizeStringList(item.skills),
        deadline: item.deadline ? new Date(item.deadline) : null,
        sourceUrl:
          item.sourceUrl ||
          item.source_url ||
          item.applyUrl ||
          item.apply_url ||
          item.applicationUrl ||
          item.application_url ||
          item.link,
        applyUrl:
          item.applyUrl ||
          item.applicationUrl ||
          item.application_url ||
          item.apply_url ||
          item.link ||
          item.sourceUrl,
        imageUrl: item.imageUrl || null,
        tags: item.tags || [],
        isRemote: true,
        status: "pending_review",
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
      for (const row of result) {
        if (row.id) void this.embeddingService.embedOpportunity(row.id);
      }
      void this.savedSearchesService?.notifyNewOpportunities(
        result as unknown as Record<string, unknown>[],
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
              skills: this.normalizeStringList(item.skills),
              deadline: item.deadline ? new Date(item.deadline) : null,
              sourceUrl:
                item.sourceUrl ||
                item.source_url ||
                item.applyUrl ||
                item.apply_url ||
                item.applicationUrl ||
                item.application_url ||
                item.link,
              applyUrl:
                item.applyUrl ||
                item.applicationUrl ||
                item.application_url ||
                item.apply_url ||
                item.link ||
                item.sourceUrl,
              imageUrl: item.imageUrl || null,
              isRemote: true,
              status: "pending_review",
              originalJson: JSON.stringify(item),
            })
            .onConflictDoNothing({ target: opportunities.sourceUrl })
            .returning()
            .execute();

          if (result[0]) {
            inserted++;
            if (result[0].id) {
              void this.embeddingService.embedOpportunity(result[0].id);
            }
            savedOpportunities.push(
              withOpportunityUrlAliases(result[0] as Record<string, any>),
            );
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
      void this.savedSearchesService?.notifyNewOpportunities(
        savedOpportunities,
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
      "https://www.edutu.org"
    ).replace(/\/$/, "");
  }
}
