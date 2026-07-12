import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { and, desc, eq, gte, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  goals,
  opportunities,
  profiles,
  userOpportunityPreferences,
  userOpportunitySignals,
} from "../db/schema";
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from "./dto/personalization.dto";
import { AiService } from "../ai";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import {
  BlendWeights,
  ScoreComponents,
  behaviorFromSignals,
  blendScore,
  deriveMatchReasons,
  freshnessScore,
  loadWeightsFromEnv,
  normalizeSemantic,
} from "./recommendation-blender";
import { TtlCache } from "../common/cache/ttl-cache";

// Rollout flag: "hybrid" (embeddings + signals + rules) or "heuristic"
// (legacy behavior only). Lets the new engine ship dark and flip via env.
const RECS_ENGINE = (process.env.RECS_ENGINE || "hybrid").toLowerCase();
const RECS_ANN_CANDIDATES = (() => {
  const parsed = Number(process.env.RECS_ANN_CANDIDATES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 300;
})();
// Anonymous /recommendations/query embeds the request profile inline; cap the
// wait so the public endpoint never blocks on the embedding provider.
const PUBLIC_QUERY_EMBED_TIMEOUT_MS = 400;

type OpportunityRow = typeof opportunities.$inferSelect;
type PreferenceRow = typeof userOpportunityPreferences.$inferSelect;

type RecommendationOpportunity = Partial<OpportunityRow> &
  Record<string, unknown> & {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    type?: string | null;
    eligibilityCriteria?: string | null;
    fundingType?: string | null;
    targetRegion?: string | null;
    deadline?: Date | string | null;
    applyUrl?: string | null;
    imageUrl?: string | null;
    isRemote?: boolean | null;
    status?: string | null;
    createdAt?: Date | string | null;
    updatedAt?: Date | string | null;
  };

type RankedOpportunity = RecommendationOpportunity & {
  match: number;
  matchReasons: string[];
  matchRisks: string[];
  aiSummary: string | null;
  aiTags: string[];
  matchComponents?: {
    semantic: number | null;
    behavior: number;
    profile_fit: number;
    freshness: number;
  };
};

type ProfileFit = {
  fit01: number;
  reasons: string[];
  risks: string[];
};

type SignalScore = {
  score: number;
  positive: number;
  negative: number;
  counts: Record<string, number>;
};

@Injectable()
export class OpportunityRankingService {
  private readonly logger = new Logger(OpportunityRankingService.name);
  private readonly supabase: SupabaseClient | null = null;
  private readonly weights: BlendWeights = loadWeightsFromEnv();
  // Anonymous-query profile embeddings keyed by profile hash (30 min).
  private readonly queryEmbeddingCache = new TtlCache<number[]>(
    30 * 60 * 1000,
    300,
  );
  // Short per-user response cache for the authed feed. Keyed by user+params;
  // per-user key tracking lets a dismiss signal invalidate immediately.
  private readonly responseCache = new TtlCache<
    Awaited<ReturnType<OpportunityRankingService["queryRecommendations"]>>
  >(
    (() => {
      const parsed = Number(process.env.RECS_CACHE_TTL_MS);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000;
    })(),
    300,
  );
  private readonly responseCacheKeysByUser = new Map<string, Set<string>>();

  constructor(
    private readonly aiService: AiService,
    private readonly embeddingService: OpportunityEmbeddingService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key, {
        auth: { persistSession: false },
      });
    }
  }

  async getUserPreferences(userId: string) {
    const [preference] = await db
      .select()
      .from(userOpportunityPreferences)
      .where(eq(userOpportunityPreferences.userId, userId))
      .execute();

    return preference || null;
  }

  async upsertUserPreferences(userId: string, input: OpportunityPreferenceDto) {
    const values = {
      userId,
      preferredCategories: input.preferredCategories ?? null,
      preferredRegions: input.preferredRegions ?? null,
      preferredFundingTypes: input.preferredFundingTypes ?? null,
      preferredOpportunityTypes: input.preferredOpportunityTypes ?? null,
      preferredSkills: input.preferredSkills ?? null,
      excludedCategories: input.excludedCategories ?? null,
      remoteOnly: input.remoteOnly ?? false,
      maxDeadlineDays: input.maxDeadlineDays ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .insert(userOpportunityPreferences)
      .values({
        ...values,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userOpportunityPreferences.userId,
        set: values,
      })
      .returning()
      .execute();

    // Preferences shape the profile embedding — warm the new vector so the
    // next feed request retrieves semantically. Fire-and-forget by design.
    this.embeddingService.refreshProfileEmbedding(userId);

    return updated;
  }

  async recordSignal(userId: string, input: OpportunitySignalDto) {
    // Dismiss visibly reshapes the feed — drop this user's cached responses
    // so the item disappears on the next fetch instead of after the TTL.
    if (input.signalType === "dismiss") {
      this.invalidateUserResponseCache(userId);
    }

    const [signal] = await db
      .insert(userOpportunitySignals)
      .values({
        userId,
        opportunityId: input.opportunityId,
        signalType: input.signalType,
        signalValue: input.signalValue ?? 1,
        source: input.source ?? "app",
        context: input.context ?? null,
        details: input.details ?? null,
      })
      .returning()
      .execute();

    if (input.signalType === "dismiss") {
      const [opportunity] = await db
        .select({
          category: opportunities.category,
        })
        .from(opportunities)
        .where(eq(opportunities.id, input.opportunityId))
        .execute();

      if (opportunity?.category) {
        const current = await this.getUserPreferences(userId);
        const excludedCategories = Array.from(
          new Set([
            ...(current?.excludedCategories || []),
            opportunity.category,
          ]),
        );

        await this.upsertUserPreferences(userId, {
          ...(this.toPreferenceDto(current) || {}),
          excludedCategories,
        });
      }
    }

    return signal;
  }

  async getRecommendationsForUser(
    userId: string,
    request: UserRecommendationRequestDto = {},
  ) {
    // Conversational queries (message) are never cached; plain feed requests
    // are cached briefly per user+params to absorb refresh bursts.
    const cacheKey = request.message
      ? null
      : `${userId}:${JSON.stringify({
          limit: request.limit ?? null,
          minMatchScore: request.minMatchScore ?? null,
          excludeOpportunityIds: request.excludeOpportunityIds ?? [],
          aiRerank: request.aiRerank ?? false,
        })}`;

    if (cacheKey) {
      const cached = this.responseCache.get(cacheKey);
      if (cached) return cached;
    }

    const [profile, preference, userGoals] = await Promise.all([
      this.getUserProfile(userId),
      this.getUserPreferences(userId),
      this.getUserGoals(userId),
    ]);

    const response = await this.queryRecommendations({
      profile,
      preferences: this.toPreferenceDto(preference),
      goals: userGoals,
      message: request.message,
      limit: request.limit,
      minMatchScore: request.minMatchScore,
      excludeOpportunityIds: request.excludeOpportunityIds,
      aiRerank: request.aiRerank,
      userId,
    });

    if (cacheKey) {
      this.responseCache.set(cacheKey, response);
      const keys = this.responseCacheKeysByUser.get(userId) ?? new Set();
      keys.add(cacheKey);
      this.responseCacheKeysByUser.set(userId, keys);
    }

    return response;
  }

  /** Drops every cached feed for a user (called on feed-shaping signals). */
  private invalidateUserResponseCache(userId: string) {
    const keys = this.responseCacheKeysByUser.get(userId);
    if (!keys) return;
    for (const key of keys) this.responseCache.delete(key);
    this.responseCacheKeysByUser.delete(userId);
  }

  async queryRecommendations(
    request: RecommendationQueryDto & { userId?: string },
  ) {
    const startedAt = Date.now();
    const limit = Math.min(Math.max(request.limit || 10, 1), 1000);
    const minMatchScore = request.minMatchScore ?? 0;
    const excludeIds = request.excludeOpportunityIds || [];

    const profile = request.profile || null;
    const preferences = request.preferences || null;
    const goals = request.goals || [];

    // Semantic retrieval needs the profile embedding first; everything else
    // parallelizes behind it. Null embedding = heuristic floor (no key, cold
    // profile, engine flag off) — the request always succeeds.
    let profileEmbedding: number[] | null = null;
    if (RECS_ENGINE === "hybrid") {
      profileEmbedding = request.userId
        ? await this.embeddingService.getProfileEmbedding(
            request.userId,
            profile,
            preferences,
          )
        : await this.resolveQueryEmbedding(profile, preferences);
    }

    const [rows, dismissedIds, signalScores, categoryAffinities] =
      await Promise.all([
        profileEmbedding
          ? this.fetchCandidatesSemantic(profileEmbedding, excludeIds)
          : this.fetchCandidateOpportunities(excludeIds),
        request.userId
          ? this.getDismissedOpportunityIds(request.userId)
          : Promise.resolve([] as string[]),
        request.userId
          ? this.getUserSignalScores(request.userId)
          : Promise.resolve(new Map<string, SignalScore>()),
        request.userId
          ? this.getUserCategoryAffinities(request.userId)
          : Promise.resolve(new Map<string, number>()),
      ]);

    const engine = profileEmbedding ? "hybrid_v2" : "heuristic_v1";

    // O(1) membership instead of Array.includes per candidate (was O(n·m)).
    const dismissedIdSet = new Set(dismissedIds);

    let ranked = rows
      .filter((row) => !dismissedIdSet.has(row.id))
      .map((row) =>
        this.rankCandidate(row, {
          profile,
          preferences,
          goals,
          message: request.message || "",
          signalScore: signalScores.get(row.id),
          categoryAffinities,
          useBlender: Boolean(profileEmbedding),
        }),
      )
      .filter((row) => row.match >= minMatchScore)
      .sort((a, b) => b.match - a.match)
      .slice(0, limit * 2);

    // The ranking above serves every request. The LLM re-rank is an optional
    // refinement that costs a provider round-trip, so it is gated: opt-in via
    // aiRerank AND only for authenticated callers. This keeps the
    // public/anonymous endpoint from driving unbounded LLM spend.
    if (request.aiRerank && request.userId) {
      ranked = await this.rerankWithDeepSeek(
        ranked,
        profile,
        preferences,
        goals,
        request.message || "",
        limit,
      );
    } else {
      ranked = ranked.slice(0, limit);
    }

    const opportunitiesWithShape = ranked.slice(0, limit).map((row) => ({
      ...row,
      match_reasons: row.matchReasons,
      match_risks: row.matchRisks,
      ai_summary: row.aiSummary,
      ai_tags: row.aiTags,
      // Additive contract extensions (clients may ignore them safely).
      match_components: row.matchComponents ?? null,
      match_reason_details: this.toReasonDetails(row),
      engine,
    }));

    this.logger.log(
      `recs engine=${engine} user=${request.userId || "anon"} candidates=${rows.length} returned=${opportunitiesWithShape.length} ms=${Date.now() - startedAt}`,
    );

    return {
      opportunities: opportunitiesWithShape,
      profile,
      preferences,
      count: opportunitiesWithShape.length,
      engine,
    };
  }

  /**
   * Scores a specific set of opportunities for a user through the same
   * pipeline as the feed (for client-side badge hydration).
   */
  async scoreOpportunitiesForUser(userId: string, opportunityIds: string[]) {
    const ids = Array.from(new Set(opportunityIds)).slice(0, 50);
    if (!ids.length) return { scores: [], count: 0 };

    const [profile, preference, userGoals] = await Promise.all([
      this.getUserProfile(userId),
      this.getUserPreferences(userId),
      this.getUserGoals(userId),
    ]);
    const preferences = this.toPreferenceDto(preference);

    const profileEmbedding =
      RECS_ENGINE === "hybrid"
        ? await this.embeddingService.getProfileEmbedding(
            userId,
            profile,
            preferences,
          )
        : null;

    const [rows, signalScores, categoryAffinities] = await Promise.all([
      this.fetchOpportunitiesByIds(ids, profileEmbedding),
      this.getUserSignalScores(userId),
      this.getUserCategoryAffinities(userId),
    ]);

    const engine = profileEmbedding ? "hybrid_v2" : "heuristic_v1";
    const scores = rows.map((row) => {
      const ranked = this.rankCandidate(row, {
        profile,
        preferences,
        goals: userGoals,
        message: "",
        signalScore: signalScores.get(row.id),
        categoryAffinities,
        useBlender: Boolean(profileEmbedding),
      });
      return {
        id: row.id,
        match_score: ranked.match,
        match_reasons: ranked.matchReasons,
        match_risks: ranked.matchRisks,
        match_reason_details: this.toReasonDetails(ranked),
        match_components: ranked.matchComponents ?? null,
        engine,
      };
    });

    return { scores, count: scores.length, engine };
  }

  /**
   * Anonymous-query embedding: hash-cached, and raced against a short timeout
   * so the throttled public endpoint never blocks on the provider.
   */
  private async resolveQueryEmbedding(
    profile: RecommendationQueryDto["profile"],
    preferences: OpportunityPreferenceDto | null,
  ): Promise<number[] | null> {
    const text = this.embeddingService.buildProfileText(
      profile as Record<string, unknown> | null,
      preferences as Record<string, unknown> | null,
    );
    if (!text) return null;

    const hash = this.embeddingService.profileHash(
      profile as Record<string, unknown> | null,
      preferences as Record<string, unknown> | null,
    );
    const cached = this.queryEmbeddingCache.get(hash);
    if (cached) return cached;

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), PUBLIC_QUERY_EMBED_TIMEOUT_MS),
    );
    const embed = (async () => {
      const result = await this.aiService.embed({
        feature: "embeddings.query",
        input: text,
        taskType: "RETRIEVAL_QUERY",
        dimensions: 768,
      });
      return result?.embeddings?.[0] ?? null;
    })();

    const embedding = await Promise.race([embed, timeout]);
    if (embedding?.length) {
      this.queryEmbeddingCache.set(hash, embedding);
      return embedding;
    }

    // If the provider answers after the race, cache for the next request.
    void embed.then((late) => {
      if (late?.length) this.queryEmbeddingCache.set(hash, late);
    });
    return null;
  }

  /**
   * Semantic candidate retrieval: ANN top-N by profile-embedding similarity,
   * UNION'd with recent unembedded rows so brand-new opportunities still
   * surface before their embedding lands. Raw SQL over the pg pool because
   * supabase-js cannot express the `<=>` operator.
   */
  private async fetchCandidatesSemantic(
    profileEmbedding: number[],
    excludeIds: string[],
  ): Promise<RecommendationOpportunity[]> {
    const vectorLiteral = `[${profileEmbedding.join(",")}]`;
    const exclude = excludeIds.length ? excludeIds : null;

    try {
      const result = await db.execute(sql`
        (
          select o.*, 1 - (o.embedding <=> ${vectorLiteral}::vector) as semantic_similarity
          from opportunities o
          where o.status = 'active'
            and (o.close_date is null or o.close_date >= current_date)
            and o.embedding is not null
            ${exclude ? sql`and not (o.id = any(${exclude}::uuid[]))` : sql``}
          order by o.embedding <=> ${vectorLiteral}::vector
          limit ${RECS_ANN_CANDIDATES}
        )
        union all
        (
          select o.*, null as semantic_similarity
          from opportunities o
          where o.status = 'active'
            and (o.close_date is null or o.close_date >= current_date)
            and o.embedding is null
            ${exclude ? sql`and not (o.id = any(${exclude}::uuid[]))` : sql``}
          order by o.updated_at desc
          limit 100
        )
      `);

      const rows =
        ((result as { rows?: Record<string, unknown>[] }).rows ?? []).map(
          (row) => this.normalizeCanonicalRow(row),
        );
      return rows;
    } catch (error) {
      this.logger.warn(
        `Semantic candidate query failed, falling back to heuristic fetch: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fetchCandidateOpportunities(excludeIds);
    }
  }

  /** Fetches specific active rows (for match-scores), with similarity when possible. */
  private async fetchOpportunitiesByIds(
    ids: string[],
    profileEmbedding: number[] | null,
  ): Promise<RecommendationOpportunity[]> {
    try {
      const similarity = profileEmbedding
        ? sql`case when o.embedding is null then null else 1 - (o.embedding <=> ${`[${profileEmbedding.join(",")}]`}::vector) end`
        : sql`null`;
      const result = await db.execute(sql`
        select o.*, ${similarity} as semantic_similarity
        from opportunities o
        where o.id = any(${ids}::uuid[])
      `);
      return (
        (result as { rows?: Record<string, unknown>[] }).rows ?? []
      ).map((row) => this.normalizeCanonicalRow(row));
    } catch (error) {
      this.logger.warn(
        `fetchOpportunitiesByIds failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
  }

  /**
   * Category affinity 0..1 per canonical category, from the same weighted
   * signal aggregation as per-opportunity scores. Generalizes engagement to
   * items the user has never seen.
   */
  private async getUserCategoryAffinities(
    userId: string,
  ): Promise<Map<string, number>> {
    try {
      const result = await db.execute(sql`
        select o.canonical_category as category,
               sum(
                 (case s.signal_type
                    when 'view' then 2
                    when 'click' then 5
                    when 'share' then 10
                    when 'save' then 12
                    when 'apply' then 18
                    when 'chat_like' then 8
                    when 'chat_dislike' then -12
                    when 'recommended_in_chat' then 1
                    when 'dismiss' then -100
                    else 0
                  end) * coalesce(s.signal_value, 1)
               ) as raw_score
        from user_opportunity_signals s
        join opportunities o on o.id = s.opportunity_id
        where s.user_id = ${userId}
          and o.canonical_category is not null
        group by o.canonical_category
      `);

      const rows =
        (result as unknown as {
          rows?: Array<{ category: string; raw_score: unknown }>;
        }).rows ?? [];
      const positives = rows
        .map((row) => Number(row.raw_score) || 0)
        .filter((score) => score > 0);
      const max = positives.length ? Math.max(...positives) : 0;

      const affinities = new Map<string, number>();
      for (const row of rows) {
        const raw = Number(row.raw_score) || 0;
        affinities.set(
          row.category,
          max > 0 ? Math.max(0, Math.min(1, raw / max)) : 0,
        );
      }
      return affinities;
    } catch (error) {
      this.logger.warn(
        `Category affinity query failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return new Map();
    }
  }

  private async fetchCandidateOpportunities(excludeIds: string[]) {
    if (this.supabase) {
      const today = new Date().toISOString().slice(0, 10);
      let request = this.supabase
        .from("opportunities")
        .select("*")
        .eq("status", "active")
        .or(`close_date.gte.${today},close_date.is.null`)
        .order("updated_at", { ascending: false })
        .limit(1000);

      if (excludeIds.length) {
        request = request.not("id", "in", `(${excludeIds.join(",")})`);
      }

      const { data, error } = await request;
      if (!error) {
        return (data ?? []).map((row) => this.normalizeCanonicalRow(row));
      }

      this.logger.warn(
        `Canonical opportunity query failed, falling back to Drizzle schema: ${error.message}`,
      );
    }

    const filters = [
      eq(opportunities.status, "active"),
      or(
        gte(opportunities.deadline, new Date()),
        sql`${opportunities.deadline} is null`,
      ),
    ];

    if (excludeIds.length) {
      filters.push(notInArray(opportunities.id, excludeIds));
    }

    return db
      .select()
      .from(opportunities)
      .where(and(...filters))
      .orderBy(desc(opportunities.updatedAt))
      .limit(1000)
      .execute();
  }

  private normalizeCanonicalRow(
    row: Record<string, any>,
  ): RecommendationOpportunity {
    // NEVER let the raw embedding (768 floats) flow into API payloads.
    if ("embedding" in row) delete row.embedding;
    if ("embedding_model" in row) delete row.embedding_model;
    const metadata = row.metadata || {};
    const requirements = Array.isArray(metadata.requirements)
      ? metadata.requirements
      : [];
    const benefits = Array.isArray(metadata.benefits) ? metadata.benefits : [];
    const fundingType =
      row.funding_type ||
      row.fundingType ||
      (row.stipend ? `${row.currency || "USD"} ${row.stipend}` : null) ||
      benefits[0] ||
      null;
    const targetRegion =
      row.target_region || row.targetRegion || row.location || null;
    const deadline = row.deadline || row.close_date || null;
    const applyUrl =
      row.link ||
      row.apply_url ||
      row.application_url ||
      row.metadata?.link ||
      null;
    const isRemote =
      row.is_remote ??
      row.isRemote ??
      /remote|online|virtual|worldwide|global/i.test(row.location || "");

    return {
      ...row,
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      canonicalCategory:
        row.canonical_category ||
        row.canonicalCategory ||
        metadata.canonical_category ||
        null,
      type: row.type || row.category || "scholarship",
      eligibilityCriteria:
        row.eligibility_criteria ||
        row.eligibilityCriteria ||
        requirements.join("\n") ||
        null,
      fundingType,
      targetRegion,
      deadline: deadline ? new Date(deadline) : null,
      sourceUrl: row.source_url || metadata.source_url || null,
      applyUrl,
      imageUrl: row.image_url || null,
      isRemote,
      status: row.status,
      originalJson: JSON.stringify(metadata),
      createdAt: row.created_at ? new Date(row.created_at) : null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
      match_reasons: row.match_reasons || [],
      match_risks: row.match_risks || [],
      ai_tags: row.tags || [],
    };
  }

  private async getDismissedOpportunityIds(userId: string) {
    const rows = await db
      .select({ opportunityId: userOpportunitySignals.opportunityId })
      .from(userOpportunitySignals)
      .where(
        and(
          eq(userOpportunitySignals.userId, userId),
          eq(userOpportunitySignals.signalType, "dismiss"),
        ),
      )
      .execute();

    return rows.map((row) => row.opportunityId);
  }

  private async getUserSignalScores(
    userId: string,
  ): Promise<Map<string, SignalScore>> {
    // Weighted per-opportunity aggregation, done in SQL (was: fetch up to 1000
    // raw signal rows and reduce in JS, which also silently dropped signals
    // beyond the 1000 cap). GROUP BY returns one row per opportunity the user
    // has signalled, over ALL their signals.
    const weights: Record<string, number> = {
      view: 2,
      click: 5,
      share: 10,
      save: 12,
      apply: 18,
      chat_like: 8,
      chat_dislike: -12,
      recommended_in_chat: 1,
      dismiss: -100,
    };

    // Build the weight lookup as a parameterized CASE so the weights above stay
    // the single source of truth.
    const weightCase = sql.join(
      [
        sql`case ${userOpportunitySignals.signalType}`,
        ...Object.entries(weights).map(
          ([type, weight]) => sql`when ${type} then ${weight}`,
        ),
        sql`else 0 end`,
      ],
      sql` `,
    );

    // delta = weight(signalType) * signalValue (default 1). Positive/negative
    // sum the raw deltas; only the total score is clamped to [-30, 30] — this
    // matches the previous JS behaviour exactly.
    const delta = sql`(${weightCase}) * coalesce(${userOpportunitySignals.signalValue}, 1)`;

    const rows = await db
      .select({
        opportunityId: userOpportunitySignals.opportunityId,
        score: sql<number>`greatest(-30, least(30, sum(${delta})))::int`,
        positive: sql<number>`sum(case when ${delta} > 0 then ${delta} else 0 end)::int`,
        negative: sql<number>`sum(case when ${delta} < 0 then -(${delta}) else 0 end)::int`,
      })
      .from(userOpportunitySignals)
      .where(eq(userOpportunitySignals.userId, userId))
      .groupBy(userOpportunitySignals.opportunityId)
      .execute();

    const scores = new Map<string, SignalScore>();
    for (const row of rows) {
      scores.set(row.opportunityId, {
        score: Number(row.score) || 0,
        positive: Number(row.positive) || 0,
        negative: Number(row.negative) || 0,
        counts: {},
      });
    }

    return scores;
  }

  private async getUserProfile(userId: string) {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();

    return profile || null;
  }

  private async getUserGoals(userId: string) {
    return db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .limit(5)
      .execute();
  }

  private toPreferenceDto(preference: PreferenceRow | null | undefined) {
    if (!preference) return null;
    return {
      preferredCategories: preference.preferredCategories || [],
      preferredRegions: preference.preferredRegions || [],
      preferredFundingTypes: preference.preferredFundingTypes || [],
      preferredOpportunityTypes: preference.preferredOpportunityTypes || [],
      preferredSkills: preference.preferredSkills || [],
      excludedCategories: preference.excludedCategories || [],
      remoteOnly: preference.remoteOnly || false,
      maxDeadlineDays: preference.maxDeadlineDays,
      notes: preference.notes,
      metadata: preference.metadata || undefined,
    };
  }

  /**
   * Ranks one candidate. Hybrid mode blends semantic/behavior/profile-fit/
   * freshness; heuristic mode reproduces the legacy additive score exactly
   * (rule score + clamped signal delta) so RECS_ENGINE=heuristic is a true
   * kill switch back to pre-refactor behavior.
   */
  private rankCandidate(
    opportunity: RecommendationOpportunity,
    context: {
      profile: RecommendationQueryDto["profile"];
      preferences: OpportunityPreferenceDto | null;
      goals: RecommendationQueryDto["goals"];
      message: string;
      signalScore?: SignalScore;
      categoryAffinities: Map<string, number>;
      useBlender: boolean;
    },
  ): RankedOpportunity {
    const fit = this.computeProfileFit(
      opportunity,
      context.profile,
      context.preferences,
      context.goals,
      context.message,
    );

    const reasons = [...fit.reasons];
    const risks = [...fit.risks];
    const signal = context.signalScore;
    if (signal?.score) {
      if (signal.positive > signal.negative) {
        reasons.push("User behavior suggests interest in this opportunity.");
      } else if (signal.negative > signal.positive) {
        risks.push("User behavior suggests this may be less relevant.");
      }
    }

    const canonicalCategory = String(
      (opportunity as Record<string, unknown>).canonicalCategory ??
        opportunity.category ??
        "",
    );
    const affinity = context.categoryAffinities.get(canonicalCategory) ?? 0;

    const deadline =
      opportunity.deadline instanceof Date
        ? opportunity.deadline
        : opportunity.deadline
          ? new Date(opportunity.deadline)
          : null;
    const updatedAt =
      opportunity.updatedAt instanceof Date
        ? opportunity.updatedAt
        : opportunity.updatedAt
          ? new Date(opportunity.updatedAt)
          : null;
    const daysToDeadline =
      deadline && !Number.isNaN(deadline.getTime())
        ? (deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        : null;

    const semanticRaw = (opportunity as Record<string, unknown>)
      .semantic_similarity;
    const semantic =
      typeof semanticRaw === "number" && Number.isFinite(semanticRaw)
        ? normalizeSemantic(semanticRaw)
        : null;

    let match: number;
    let matchComponents: RankedOpportunity["matchComponents"];
    let finalReasons: string[];

    if (context.useBlender) {
      const components: ScoreComponents = {
        semantic,
        behavior: behaviorFromSignals(signal?.score ?? 0, affinity),
        profileFit: fit.fit01,
        freshness: freshnessScore(updatedAt, deadline),
      };
      match = blendScore(components, this.weights);
      matchComponents = {
        semantic: components.semantic,
        behavior: components.behavior,
        profile_fit: components.profileFit,
        freshness: components.freshness,
      };
      finalReasons = deriveMatchReasons(components, reasons, {
        topCategory: canonicalCategory || null,
        daysToDeadline,
        categoryAffinity: affinity,
      });
    } else {
      // Legacy path: additive rule score + clamped signal delta.
      match = Math.max(
        0,
        Math.min(100, fit.rawScore + (signal?.score ?? 0)),
      );
      matchComponents = undefined;
      finalReasons = reasons.slice(0, 4);
    }

    const row = { ...opportunity } as Record<string, unknown>;
    delete row.embedding;
    delete row.embedding_model;
    delete row.semantic_similarity;

    return {
      ...(row as RecommendationOpportunity),
      match,
      matchReasons: finalReasons,
      matchRisks: risks.slice(0, 3),
      // Honest fields: summary is LLM-written at ingestion; tags come from
      // enrichment. Fall back to derived values only when the row lacks them.
      aiSummary:
        (typeof (opportunity as Record<string, unknown>).summary === "string" &&
        ((opportunity as Record<string, unknown>).summary as string).trim()
          ? ((opportunity as Record<string, unknown>).summary as string)
          : null) ?? this.buildSummary(opportunity),
      aiTags:
        Array.isArray((opportunity as Record<string, unknown>).tags) &&
        ((opportunity as Record<string, unknown>).tags as string[]).length
          ? ((opportunity as Record<string, unknown>).tags as string[])
          : this.extractTags(opportunity),
      matchComponents,
    };
  }

  /** Structured reasons for clients that render icons per reason kind. */
  private toReasonDetails(row: RankedOpportunity) {
    return row.matchReasons.map((label, index) => {
      let kind = "category";
      if (label.startsWith("Strong fit") || label.startsWith("Good overall")) {
        kind = "semantic";
      } else if (label.startsWith("Because you engaged")) {
        kind = "behavior";
      } else if (label.startsWith("Deadline in")) {
        kind = "deadline";
      } else if (label.includes("behavior suggests")) {
        kind = "behavior";
      }
      return { kind, label, points: row.matchReasons.length - index };
    });
  }

  /**
   * Rule-based profile fit (the legacy heuristic). rawScore keeps the exact
   * legacy additive scale (base 20) for the kill-switch path; fit01 is the
   * same rules normalized 0..1 for the blender.
   */
  private computeProfileFit(
    opportunity: RecommendationOpportunity,
    profile: RecommendationQueryDto["profile"],
    preferences: OpportunityPreferenceDto | null,
    userGoals: RecommendationQueryDto["goals"],
    message: string,
  ): ProfileFit & { rawScore: number } {
    const reasons: string[] = [];
    const risks: string[] = [];
    let score = 20;

    const opportunityText = [
      opportunity.title,
      opportunity.description,
      opportunity.eligibilityCriteria,
      opportunity.fundingType,
      opportunity.targetRegion,
      opportunity.category,
      opportunity.type,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (preferences?.excludedCategories?.includes(opportunity.category || "")) {
      score -= 30;
      risks.push("Matches a category the user has previously deprioritized.");
    }

    if (
      preferences?.preferredCategories?.includes(opportunity.category || "")
    ) {
      score += 18;
      reasons.push(`Matches preferred category: ${opportunity.category}.`);
    }

    if (
      preferences?.preferredFundingTypes?.includes(
        opportunity.fundingType || "",
      )
    ) {
      score += 15;
      reasons.push(
        `Matches preferred funding type: ${opportunity.fundingType}.`,
      );
    }

    if (
      preferences?.preferredOpportunityTypes?.includes(opportunity.type || "")
    ) {
      score += 12;
      reasons.push(`Matches preferred opportunity type: ${opportunity.type}.`);
    }

    if (preferences?.preferredRegions?.length && opportunity.targetRegion) {
      const regionHit = preferences.preferredRegions.some((region) =>
        opportunity.targetRegion?.toLowerCase().includes(region.toLowerCase()),
      );
      if (regionHit) {
        score += 14;
        reasons.push(
          `Aligned with preferred region: ${opportunity.targetRegion}.`,
        );
      }
    }

    if (preferences?.remoteOnly) {
      if (opportunity.isRemote) {
        score += 8;
        reasons.push("Supports remote access.");
      } else {
        score -= 12;
        risks.push("User prefers remote opportunities.");
      }
    }

    if (profile?.country && opportunity.targetRegion) {
      if (
        opportunity.targetRegion
          .toLowerCase()
          .includes(profile.country.toLowerCase())
      ) {
        score += 10;
        reasons.push(`Relevant to ${profile.country}.`);
      }
    }

    const skillHits = (profile?.skills || []).filter((skill) =>
      opportunityText.includes(skill.toLowerCase()),
    );
    if (skillHits.length) {
      score += Math.min(20, skillHits.length * 6);
      reasons.push(
        `Reflects user skills: ${skillHits.slice(0, 3).join(", ")}.`,
      );
    }

    const preferenceSkillHits = (preferences?.preferredSkills || []).filter(
      (skill) => opportunityText.includes(skill.toLowerCase()),
    );
    if (preferenceSkillHits.length) {
      score += Math.min(14, preferenceSkillHits.length * 5);
      reasons.push(
        `Supports preferred skills: ${preferenceSkillHits.slice(0, 3).join(", ")}.`,
      );
    }

    const interestHits = (profile?.interests || []).filter((interest) =>
      opportunityText.includes(interest.toLowerCase()),
    );
    if (interestHits.length) {
      score += Math.min(15, interestHits.length * 4);
      reasons.push(
        `Aligned with interests: ${interestHits.slice(0, 3).join(", ")}.`,
      );
    }

    const fieldOfStudy =
      profile?.fieldOfStudy ||
      profile?.field_of_study ||
      profile?.courseOfStudy ||
      profile?.major;
    if (fieldOfStudy && opportunityText.includes(fieldOfStudy.toLowerCase())) {
      score += 12;
      reasons.push(`Relevant to field of study: ${fieldOfStudy}.`);
    }

    const interestedCountries = [
      ...(profile?.interestedCountries || []),
      ...(profile?.interested_countries || []),
    ].map((country) => country.toLowerCase());
    const countryHits = interestedCountries.filter((country) =>
      opportunityText.includes(country),
    );
    if (countryHits.length) {
      score += Math.min(14, countryHits.length * 7);
      reasons.push(
        `Matches interested countries: ${countryHits.slice(0, 3).join(", ")}.`,
      );
    }

    if (
      profile?.country &&
      opportunityText.includes(profile.country.toLowerCase())
    ) {
      score += 6;
      reasons.push(`Relevant to current country: ${profile.country}.`);
    }

    if (message) {
      const requestTerms = message
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 3);
      const matchedTerms = requestTerms.filter((term) =>
        opportunityText.includes(term),
      );
      if (matchedTerms.length) {
        score += Math.min(20, matchedTerms.length * 4);
        reasons.push(
          `Responds to request terms: ${matchedTerms.slice(0, 4).join(", ")}.`,
        );
      }
    }

    if (preferences?.maxDeadlineDays && opportunity.deadline) {
      const msRemaining = new Date(opportunity.deadline).getTime() - Date.now();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      if (daysRemaining > preferences.maxDeadlineDays) {
        score -= 10;
        risks.push(
          `Deadline is beyond preferred window (${daysRemaining} days).`,
        );
      } else {
        score += 6;
        reasons.push(
          `Deadline fits the preferred window (${daysRemaining} days).`,
        );
      }
    }

    if (!opportunity.applyUrl) {
      risks.push("No direct application URL stored yet.");
      score -= 8;
    }

    if (!opportunity.description || opportunity.description.length < 180) {
      risks.push("Opportunity details are incomplete and need review.");
      score -= 10;
    }

    return {
      rawScore: score,
      fit01: Math.max(0, Math.min(1, score / 100)),
      reasons: reasons.slice(0, 4),
      risks: risks.slice(0, 3),
    };
  }

  private async rerankWithDeepSeek(
    candidates: RankedOpportunity[],
    profile: RecommendationQueryDto["profile"],
    preferences: OpportunityPreferenceDto | null,
    goalsInput: RecommendationQueryDto["goals"],
    message: string,
    limit: number,
  ) {
    if (!candidates.length) {
      return candidates.slice(0, limit);
    }

    const shortlist = candidates.slice(0, Math.min(candidates.length, 10));

    try {
      const prompt = `You are ranking Edutu opportunities for one user.
Return strict JSON:
{
  "matches": [
    {
      "id": "opportunity id",
      "score": 0,
      "reason": "one sentence"
    }
  ]
}

User profile:
${JSON.stringify(profile || {}, null, 2)}

User preferences:
${JSON.stringify(preferences || {}, null, 2)}

User goals:
${JSON.stringify(goalsInput || [], null, 2)}

User message:
${message || ""}

Candidate opportunities:
${JSON.stringify(
  shortlist.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    fundingType: item.fundingType,
    targetRegion: item.targetRegion,
    heuristicScore: item.match,
  })),
  null,
  2,
)}`;

      const parsed = await this.aiService.generateJson<{
        matches?: Array<{ id: string; score: number; reason?: string }>;
      }>({
        feature: "opportunities.rerank",
        prompt,
        responseMimeType: "application/json",
        temperature: 0.2,
        metadata: { candidateCount: shortlist.length },
      });

      if (!parsed) return shortlist;

      const ranking = new Map(
        (parsed.matches || []).map((entry) => [entry.id, entry]),
      );

      return shortlist
        .map((item) => {
          const ranked = ranking.get(item.id);
          if (!ranked) return item;
          return {
            ...item,
            match: Math.max(
              item.match,
              Math.min(100, Math.round(item.match * 0.6 + ranked.score * 0.4)),
            ),
            matchReasons: ranked.reason
              ? [ranked.reason, ...item.matchReasons].slice(0, 4)
              : item.matchReasons,
          };
        })
        .sort((a, b) => b.match - a.match)
        .slice(0, limit);
    } catch (error) {
      this.logger.warn(
        `DeepSeek rerank failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return shortlist.slice(0, limit);
    }
  }

  private buildSummary(opportunity: RecommendationOpportunity) {
    return (
      opportunity.description ||
      opportunity.eligibilityCriteria ||
      `A ${opportunity.type || "scholarship"} opportunity in ${opportunity.targetRegion || "multiple regions"}.`
    );
  }

  private extractTags(opportunity: RecommendationOpportunity) {
    return Array.from(
      new Set(
        [
          opportunity.category,
          opportunity.type,
          opportunity.fundingType,
          opportunity.targetRegion,
          opportunity.isRemote ? "remote" : null,
        ].filter(Boolean) as string[],
      ),
    );
  }
}
