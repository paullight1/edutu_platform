import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../db";
import { apiPartnerEvents, opportunities } from "../db/schema";
import { OpportunityRankingService } from "../opportunities/opportunity-ranking.service";
import type { ApiConsumerContext } from "./current-api-consumer.decorator";
import type {
  ListOpportunitiesQuery,
  PartnerEventDto,
  ThirdPartyRecommendationRequest,
} from "./dto/edutu-api.dto";

type OpportunityRow = typeof opportunities.$inferSelect;

@Injectable()
export class EdutuApiService {
  constructor(
    private readonly opportunityRankingService: OpportunityRankingService,
  ) {}

  async listOpportunities(
    query: ListOpportunitiesQuery,
    consumer: ApiConsumerContext,
  ) {
    const limit = this.toLimit(query.limit, 25, 100);
    const offset = this.toOffset(query.offset);
    const filters = this.buildOpportunityFilters(query);
    const orderBy = this.toOrderBy(query.sort);

    const rows = await db
      .select()
      .from(opportunities)
      .where(and(...filters))
      .orderBy(orderBy)
      .limit(limit + 1)
      .offset(offset)
      .execute();
    const data = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const total = await this.getOptionalTotal(query.includeTotal, filters);

    return {
      object: "list",
      data: data.map((row) => this.toPublicOpportunity(row)),
      meta: {
        limit,
        offset,
        nextOffset: hasMore ? offset + data.length : null,
        total,
        hasMore,
        generatedAt: new Date().toISOString(),
        requestId: consumer.requestId,
        quota: consumer.quota,
      },
    };
  }

  async getOpportunity(id: string, consumer: ApiConsumerContext) {
    const [row] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.id, id), eq(opportunities.status, "active")))
      .limit(1)
      .execute();

    return row ? this.toPublicOpportunity(row) : null;
  }

  async getOpportunityStats(consumer: ApiConsumerContext) {
    const statsResult = await db.execute(sql`
      select
        count(*)::int as active,
        count(*) filter (
          where deadline is not null
          and deadline >= now()
          and deadline <= now() + interval '30 days'
        )::int as closing_soon,
        count(distinct category)::int as category_count,
        count(*) filter (where verification_status = 'verified')::int as verified_count,
        count(*) filter (where verification_status in ('stale', 'unverified'))::int as needs_verification,
        count(*) filter (where verification_status = 'broken_link')::int as broken_link_count,
        max(updated_at) as last_updated_at
      from opportunities
      where status = 'active'
    `);

    const row = ((statsResult as { rows?: Record<string, unknown>[] })
      .rows?.[0] ?? {}) as Record<string, unknown>;

    return {
      object: "opportunity.catalog_stats",
      active: Number(row.active ?? 0),
      closingSoon: Number(row.closing_soon ?? 0),
      categoryCount: Number(row.category_count ?? 0),
      verifiedCount: Number(row.verified_count ?? 0),
      needsVerification: Number(row.needs_verification ?? 0),
      brokenLinkCount: Number(row.broken_link_count ?? 0),
      lastUpdatedAt: row.last_updated_at
        ? new Date(String(row.last_updated_at)).toISOString()
        : null,
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: consumer.requestId,
        quota: consumer.quota,
      },
    };
  }

  async getRecommendations(
    body: ThirdPartyRecommendationRequest,
    consumer: ApiConsumerContext,
  ) {
    const result = await this.opportunityRankingService.queryRecommendations({
      ...body,
      limit: this.toLimit(body?.limit, 10, 50),
    });

    return {
      object: "recommendation.list",
      data: (result.opportunities || []).map((row: any) =>
        this.toPublicOpportunity(row),
      ),
      meta: {
        count: result.count,
        profile: result.profile,
        preferences: result.preferences,
        generatedAt: new Date().toISOString(),
        requestId: consumer.requestId,
        quota: consumer.quota,
      },
    };
  }

  async recordPartnerEvent(
    body: PartnerEventDto,
    consumer: ApiConsumerContext,
  ) {
    const [event] = await db
      .insert(apiPartnerEvents)
      .values({
        consumerId: consumer.id,
        requestId: consumer.requestId,
        eventType: body.eventType,
        opportunityId: body.opportunityId ?? null,
        externalUserId: body.externalUserId ?? null,
        sessionId: body.sessionId ?? null,
        source: body.source ?? "partner",
        metadata: body.metadata ?? {},
      })
      .returning({
        id: apiPartnerEvents.id,
        createdAt: apiPartnerEvents.createdAt,
      })
      .execute();

    return {
      object: "event",
      id: event.id,
      accepted: true,
      createdAt: event.createdAt?.toISOString() ?? new Date().toISOString(),
      meta: {
        requestId: consumer.requestId,
        quota: consumer.quota,
      },
    };
  }

  private buildOpportunityFilters(query: ListOpportunitiesQuery) {
    const filters = [eq(opportunities.status, "active")];

    if (query.category)
      filters.push(eq(opportunities.category, query.category));
    if (query.type) filters.push(eq(opportunities.type, query.type));
    if (query.fundingType) {
      filters.push(eq(opportunities.fundingType, query.fundingType));
    }
    if (query.targetRegion) {
      filters.push(
        ilike(opportunities.targetRegion, `%${query.targetRegion}%`),
      );
    }
    if (query.remote !== undefined) {
      filters.push(eq(opportunities.isRemote, query.remote === "true"));
    }
    if (query.includeExpired !== "true") {
      filters.push(
        or(
          gte(opportunities.deadline, new Date()),
          sql`${opportunities.deadline} is null`,
        )!,
      );
    }

    const deadlineFrom = this.toDate(query.deadlineFrom);
    if (deadlineFrom) filters.push(gte(opportunities.deadline, deadlineFrom));

    const deadlineTo = this.toDate(query.deadlineTo);
    if (deadlineTo) filters.push(lte(opportunities.deadline, deadlineTo));

    const updatedSince = this.toDate(query.updatedSince);
    if (updatedSince) filters.push(gte(opportunities.updatedAt, updatedSince));

    const search = query.q?.trim();
    if (search) {
      const pattern = `%${this.escapeLike(search)}%`;
      filters.push(
        or(
          ilike(opportunities.title, pattern),
          ilike(opportunities.description, pattern),
          ilike(opportunities.category, pattern),
          ilike(opportunities.eligibilityCriteria, pattern),
        )!,
      );
    }

    return filters;
  }

  private async getOptionalTotal(
    includeTotal: string | undefined,
    filters: any[],
  ) {
    if (includeTotal !== "true") return null;

    const [totalRows] = await db
      .select({ value: count() })
      .from(opportunities)
      .where(and(...filters))
      .execute();

    return totalRows?.value ?? 0;
  }

  private toPublicOpportunity(row: OpportunityRow & Record<string, any>) {
    return {
      id: row.id,
      object: "opportunity",
      title: row.title,
      description: row.description,
      category: row.category,
      type: row.type,
      eligibilityCriteria: row.eligibilityCriteria,
      fundingType: row.fundingType,
      targetRegion: row.targetRegion,
      deadline: row.deadline?.toISOString() ?? null,
      remote: row.isRemote,
      urls: {
        source: row.sourceUrl,
        apply: row.applyUrl,
      },
      imageUrl: row.imageUrl,
      trust: {
        verificationStatus: row.verificationStatus ?? null,
        lastVerifiedAt: row.lastVerifiedAt?.toISOString?.() ?? null,
        lastSeenAt: row.lastSeenAt?.toISOString?.() ?? null,
        qualityScore: row.qualityScore ?? null,
      },
      match: row.match ?? null,
      matchReasons: row.match_reasons ?? row.matchReasons ?? [],
      matchRisks: row.match_risks ?? row.matchRisks ?? [],
      aiSummary: row.ai_summary ?? row.aiSummary ?? null,
      aiTags: row.ai_tags ?? row.aiTags ?? [],
      updatedAt: row.updatedAt?.toISOString() ?? null,
    };
  }

  private toLimit(value: unknown, fallback: number, max: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), 1), max);
  }

  private toOffset(value: unknown) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(Math.trunc(parsed), 0);
  }

  private toDate(value?: string) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
  }

  private toOrderBy(sort?: string) {
    switch (sort) {
      case "deadline_asc":
        return asc(opportunities.deadline);
      case "deadline_desc":
        return desc(opportunities.deadline);
      case "created_asc":
        return asc(opportunities.createdAt);
      case "created_desc":
        return desc(opportunities.createdAt);
      case "updated_asc":
        return asc(opportunities.updatedAt);
      case "updated_desc":
      default:
        return desc(opportunities.updatedAt);
    }
  }
}
