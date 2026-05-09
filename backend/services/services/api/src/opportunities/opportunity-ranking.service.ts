import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, notInArray, or, sql } from 'drizzle-orm';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db';
import {
  goals,
  opportunities,
  profiles,
  userOpportunityPreferences,
  userOpportunitySignals,
} from '../db/schema';
import {
  OpportunityPreferenceDto,
  OpportunitySignalDto,
  RecommendationQueryDto,
  UserRecommendationRequestDto,
} from './dto/personalization.dto';

type OpportunityRow = typeof opportunities.$inferSelect;
type PreferenceRow = typeof userOpportunityPreferences.$inferSelect;

type RankedOpportunity = OpportunityRow & {
  match: number;
  matchReasons: string[];
  matchRisks: string[];
  aiSummary: string | null;
  aiTags: string[];
};

@Injectable()
export class OpportunityRankingService {
  private readonly logger = new Logger(OpportunityRankingService.name);
  private readonly ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

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
        source: input.source ?? 'app',
        context: input.context ?? null,
        details: input.details ?? null,
      })
      .returning()
      .execute();

    if (input.signalType === 'dismiss') {
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
    const limit = Math.min(Math.max(request.limit || 10, 1), 25);
    const minMatchScore = request.minMatchScore ?? 0;
    const excludeIds = request.excludeOpportunityIds || [];
    const rows = await this.fetchCandidateOpportunities(excludeIds);
    const dismissedIds = request.userId
      ? await this.getDismissedOpportunityIds(request.userId)
      : [];

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
          request.message || '',
        ),
      )
      .filter((row) => row.match >= minMatchScore)
      .sort((a, b) => b.match - a.match)
      .slice(0, limit * 2);

    ranked = await this.rerankWithGemini(
      ranked,
      profile,
      preferences,
      goals,
      request.message || '',
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
    const filters = [
      eq(opportunities.status, 'active'),
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
      .limit(100)
      .execute();
  }

  private async getDismissedOpportunityIds(userId: string) {
    const rows = await db
      .select({ opportunityId: userOpportunitySignals.opportunityId })
      .from(userOpportunitySignals)
      .where(
        and(
          eq(userOpportunitySignals.userId, userId),
          eq(userOpportunitySignals.signalType, 'dismiss'),
        ),
      )
      .execute();

    return rows.map((row) => row.opportunityId);
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
      metadata: (preference.metadata as Record<string, unknown> | null) || undefined,
    };
  }

  private scoreOpportunity(
    opportunity: OpportunityRow,
    profile: RecommendationQueryDto['profile'],
    preferences: OpportunityPreferenceDto | null,
    userGoals: RecommendationQueryDto['goals'],
    message: string,
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
      ...((userGoals || []).map((goal) => goal.title || goal.description || '') as string[]),
    ]
      .filter(Boolean)
      .join(' ')
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
      .join(' ')
      .toLowerCase();

    if (preferences?.excludedCategories?.includes(opportunity.category || '')) {
      score -= 30;
      risks.push('Matches a category the user has previously deprioritized.');
    }

    if (preferences?.preferredCategories?.includes(opportunity.category || '')) {
      score += 18;
      reasons.push(`Matches preferred category: ${opportunity.category}.`);
    }

    if (preferences?.preferredFundingTypes?.includes(opportunity.fundingType || '')) {
      score += 15;
      reasons.push(`Matches preferred funding type: ${opportunity.fundingType}.`);
    }

    if (preferences?.preferredOpportunityTypes?.includes(opportunity.type || '')) {
      score += 12;
      reasons.push(`Matches preferred opportunity type: ${opportunity.type}.`);
    }

    if (preferences?.preferredRegions?.length && opportunity.targetRegion) {
      const regionHit = preferences.preferredRegions.some((region) =>
        opportunity.targetRegion?.toLowerCase().includes(region.toLowerCase()),
      );
      if (regionHit) {
        score += 14;
        reasons.push(`Aligned with preferred region: ${opportunity.targetRegion}.`);
      }
    }

    if (preferences?.remoteOnly) {
      if (opportunity.isRemote) {
        score += 8;
        reasons.push('Supports remote access.');
      } else {
        score -= 12;
        risks.push('User prefers remote opportunities.');
      }
    }

    if (profile?.country && opportunity.targetRegion) {
      if (opportunity.targetRegion.toLowerCase().includes(profile.country.toLowerCase())) {
        score += 10;
        reasons.push(`Relevant to ${profile.country}.`);
      }
    }

    const skillHits = (profile?.skills || []).filter((skill) =>
      opportunityText.includes(skill.toLowerCase()),
    );
    if (skillHits.length) {
      score += Math.min(20, skillHits.length * 6);
      reasons.push(`Reflects user skills: ${skillHits.slice(0, 3).join(', ')}.`);
    }

    const preferenceSkillHits = (preferences?.preferredSkills || []).filter((skill) =>
      opportunityText.includes(skill.toLowerCase()),
    );
    if (preferenceSkillHits.length) {
      score += Math.min(14, preferenceSkillHits.length * 5);
      reasons.push(
        `Supports preferred skills: ${preferenceSkillHits.slice(0, 3).join(', ')}.`,
      );
    }

    const interestHits = (profile?.interests || []).filter((interest) =>
      opportunityText.includes(interest.toLowerCase()),
    );
    if (interestHits.length) {
      score += Math.min(15, interestHits.length * 4);
      reasons.push(`Aligned with interests: ${interestHits.slice(0, 3).join(', ')}.`);
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
      const matchedTerms = requestTerms.filter((term) => opportunityText.includes(term));
      if (matchedTerms.length) {
        score += Math.min(20, matchedTerms.length * 4);
        reasons.push(
          `Responds to request terms: ${matchedTerms.slice(0, 4).join(', ')}.`,
        );
      }
    }

    if (preferences?.maxDeadlineDays && opportunity.deadline) {
      const msRemaining = new Date(opportunity.deadline).getTime() - Date.now();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      if (daysRemaining > preferences.maxDeadlineDays) {
        score -= 10;
        risks.push(`Deadline is beyond preferred window (${daysRemaining} days).`);
      } else {
        score += 6;
        reasons.push(`Deadline fits the preferred window (${daysRemaining} days).`);
      }
    }

    if (!opportunity.applyUrl) {
      risks.push('No direct application URL stored yet.');
      score -= 8;
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

  private async rerankWithGemini(
    candidates: RankedOpportunity[],
    profile: RecommendationQueryDto['profile'],
    preferences: OpportunityPreferenceDto | null,
    goalsInput: RecommendationQueryDto['goals'],
    message: string,
    limit: number,
  ) {
    if (!this.ai || !candidates.length) {
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
${message || ''}

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

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const text = response.text?.trim();
      if (!text) return shortlist;

      const parsed = JSON.parse(text) as {
        matches?: Array<{ id: string; score: number; reason?: string }>;
      };
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
              Math.min(100, Math.round((item.match * 0.6) + (ranked.score * 0.4))),
            ),
            matchReasons: ranked.reason
              ? [ranked.reason, ...item.matchReasons].slice(0, 4)
              : item.matchReasons,
          };
        })
        .sort((a, b) => b.match - a.match)
        .slice(0, limit);
    } catch (error) {
      this.logger.warn(`Gemini rerank failed: ${error instanceof Error ? error.message : String(error)}`);
      return shortlist.slice(0, limit);
    }
  }

  private buildSummary(opportunity: OpportunityRow) {
    return (
      opportunity.description ||
      opportunity.eligibilityCriteria ||
      `A ${opportunity.type || 'scholarship'} opportunity in ${opportunity.targetRegion || 'multiple regions'}.`
    );
  }

  private extractTags(opportunity: OpportunityRow) {
    return Array.from(
      new Set(
        [
          opportunity.category,
          opportunity.type,
          opportunity.fundingType,
          opportunity.targetRegion,
          opportunity.isRemote ? 'remote' : null,
        ].filter(Boolean) as string[],
      ),
    );
  }
}
