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

  constructor(private readonly aiService: AiService) {
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

    return updated;
  }

  async recordSignal(userId: string, input: OpportunitySignalDto) {
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
    const [profile, preference, userGoals] = await Promise.all([
      this.getUserProfile(userId),
      this.getUserPreferences(userId),
      this.getUserGoals(userId),
    ]);

    return this.queryRecommendations({
      profile,
      preferences: this.toPreferenceDto(preference),
      goals: userGoals,
      message: request.message,
      limit: request.limit,
      minMatchScore: request.minMatchScore,
      excludeOpportunityIds: request.excludeOpportunityIds,
      userId,
    });
  }

  async queryRecommendations(
    request: RecommendationQueryDto & { userId?: string },
  ) {
    const limit = Math.min(Math.max(request.limit || 10, 1), 50);
    const minMatchScore = request.minMatchScore ?? 0;
    const excludeIds = request.excludeOpportunityIds || [];
    const rows = await this.fetchCandidateOpportunities(excludeIds);
    const dismissedIds = request.userId
      ? await this.getDismissedOpportunityIds(request.userId)
      : [];
    const signalScores = request.userId
      ? await this.getUserSignalScores(request.userId)
      : new Map<string, SignalScore>();

    const profile = request.profile || null;
    const preferences = request.preferences || null;
    const goals = request.goals || [];

    let ranked = rows
      .filter((row) => !dismissedIds.includes(row.id))
      .map((row) =>
        this.scoreOpportunity(
          row,
          profile,
          preferences,
          goals,
          request.message || "",
          signalScores.get(row.id),
        ),
      )
      .filter((row) => row.match >= minMatchScore)
      .sort((a, b) => b.match - a.match)
      .slice(0, limit * 2);

    ranked = await this.rerankWithDeepSeek(
      ranked,
      profile,
      preferences,
      goals,
      request.message || "",
      limit,
    );

    const opportunitiesWithShape = ranked.slice(0, limit).map((row) => ({
      ...row,
      match_reasons: row.matchReasons,
      match_risks: row.matchRisks,
      ai_summary: row.aiSummary,
      ai_tags: row.aiTags,
    }));

    return {
      opportunities: opportunitiesWithShape,
      profile,
      preferences,
      count: opportunitiesWithShape.length,
    };
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
        .limit(200);

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
      .limit(200)
      .execute();
  }

  private normalizeCanonicalRow(
    row: Record<string, any>,
  ): RecommendationOpportunity {
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
    const applyUrl = row.apply_url || row.application_url || null;
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
    const rows = await db
      .select({
        opportunityId: userOpportunitySignals.opportunityId,
        signalType: userOpportunitySignals.signalType,
        signalValue: userOpportunitySignals.signalValue,
      })
      .from(userOpportunitySignals)
      .where(eq(userOpportunitySignals.userId, userId))
      .limit(1000)
      .execute();

    const weights: Record<string, number> = {
      view: 2,
      click: 5,
      save: 12,
      apply: 18,
      chat_like: 8,
      chat_dislike: -12,
      recommended_in_chat: 1,
      dismiss: -100,
    };

    const scores = new Map<string, SignalScore>();
    for (const row of rows) {
      const current = scores.get(row.opportunityId) || {
        score: 0,
        positive: 0,
        negative: 0,
        counts: {},
      };
      const value = row.signalValue ?? 1;
      const delta = (weights[row.signalType] ?? 0) * value;

      current.score += delta;
      current.counts[row.signalType] =
        (current.counts[row.signalType] || 0) + 1;
      if (delta > 0) current.positive += delta;
      if (delta < 0) current.negative += Math.abs(delta);

      scores.set(row.opportunityId, current);
    }

    for (const [id, signal] of scores) {
      scores.set(id, {
        ...signal,
        score: Math.max(-30, Math.min(30, signal.score)),
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

  private scoreOpportunity(
    opportunity: RecommendationOpportunity,
    profile: RecommendationQueryDto["profile"],
    preferences: OpportunityPreferenceDto | null,
    userGoals: RecommendationQueryDto["goals"],
    message: string,
    signalScore?: SignalScore,
  ): RankedOpportunity {
    const reasons: string[] = [];
    const risks: string[] = [];
    let score = 20;

    const searchText = [
      opportunity.title,
      opportunity.description,
      opportunity.eligibilityCriteria,
      opportunity.fundingType,
      opportunity.targetRegion,
      opportunity.category,
      opportunity.type,
      message,
      preferences?.notes,
      profile?.fieldOfStudy,
      profile?.field_of_study,
      ...(profile?.skills || []),
      ...(profile?.interests || []),
      ...(preferences?.preferredSkills || []),
      ...(userGoals || []).map((goal) => goal.title || goal.description || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

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

    const fieldOfStudy = profile?.fieldOfStudy || profile?.field_of_study;
    if (fieldOfStudy && opportunityText.includes(fieldOfStudy.toLowerCase())) {
      score += 12;
      reasons.push(`Relevant to field of study: ${fieldOfStudy}.`);
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

    if (signalScore?.score) {
      score += signalScore.score;
      if (signalScore.positive > signalScore.negative) {
        reasons.push("User behavior suggests interest in this opportunity.");
      } else if (signalScore.negative > signalScore.positive) {
        risks.push("User behavior suggests this may be less relevant.");
      }
    }

    return {
      ...opportunity,
      match: Math.max(0, Math.min(100, score)),
      matchReasons: reasons.slice(0, 4),
      matchRisks: risks.slice(0, 3),
      aiSummary: this.buildSummary(opportunity),
      aiTags: this.extractTags(opportunity),
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
