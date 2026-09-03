import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { OpportunityIntentService } from "./opportunity-intent.service";
import { OpportunityJourneysRepository } from "./opportunity-journeys.repository";
import { buildOpportunityDecisionSupport } from "./opportunity-decision-support";
import { estimateOpportunityEffortHours } from "./opportunity-effort";

export interface IntentRecommendationView extends Record<string, unknown> {
  id: string;
  title: string;
  matchScore: number | null;
  matchReasons: string[];
  matchRisks: string[];
  eligibilityStatus: "eligible" | "likely" | "unclear" | "ineligible";
  eligibilityConfidence: number;
  eligibilityReasons: string[];
  eligibilityBlockers: string[];
  estimatedEffortHours: number;
  deadline: string | null;
  daysUntilDeadline: number | null;
}

export interface OpportunityShortlistResult {
  batchId: string;
  intent: Record<string, unknown>;
  recommendations: IntentRecommendationView[];
  degraded: boolean;
  degradedReasons: string[];
  engine: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function candidateId(candidate: Record<string, unknown>): string {
  return text(candidate.id);
}

function candidateDeadline(candidate: Record<string, unknown>): unknown {
  return (
    candidate.deadline ??
    candidate.closeDate ??
    candidate.close_date ??
    null
  );
}

function candidateIsRemote(candidate: Record<string, unknown>): boolean {
  return candidate.isRemote === true || candidate.is_remote === true;
}

function candidateType(candidate: Record<string, unknown>): string {
  return text(
    candidate.type ?? candidate.canonicalCategory ?? candidate.canonical_category ?? candidate.category,
  ).toLowerCase();
}

function candidateLocation(candidate: Record<string, unknown>): string {
  return text(candidate.location ?? candidate.targetRegion ?? candidate.target_region).toLowerCase();
}

function candidateMatchReasons(candidate: Record<string, unknown>): string[] {
  return stringArray(candidate.matchReasons ?? candidate.match_reasons);
}

function candidateMatchRisks(candidate: Record<string, unknown>): string[] {
  return stringArray(candidate.matchRisks ?? candidate.match_risks);
}

function intentFit(
  candidate: Record<string, unknown>,
  intent: Record<string, unknown>,
  now: Date,
): number {
  let score = 0;
  const type = candidateType(candidate);
  const preferredTypes = stringArray(intent.opportunityTypes).map((value) =>
    value.toLowerCase(),
  );
  if (
    preferredTypes.length > 0 &&
    preferredTypes.some(
      (preferred) => type.includes(preferred) || preferred.includes(type),
    )
  ) {
    score += 40;
  }

  const location = candidateLocation(candidate);
  const locations = stringArray(intent.locations).map((value) =>
    value.toLowerCase(),
  );
  if (
    locations.length > 0 &&
    locations.some(
      (preferred) =>
        location.includes(preferred) ||
        preferred.includes(location) ||
        (preferred === "remote" && candidateIsRemote(candidate)),
    )
  ) {
    score += 20;
  }

  if (
    intent.remotePreference === "required" &&
    candidateIsRemote(candidate)
  ) {
    score += 20;
  } else if (
    intent.remotePreference === "required" &&
    !candidateIsRemote(candidate)
  ) {
    score -= 40;
  } else if (
    intent.remotePreference === "preferred" &&
    candidateIsRemote(candidate)
  ) {
    score += 10;
  }

  const rawDeadline = candidateDeadline(candidate);
  const deadline = rawDeadline ? new Date(String(rawDeadline)) : null;
  const horizon = Number(intent.actionHorizonDays ?? 90);
  if (deadline && !Number.isNaN(deadline.getTime())) {
    const days = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
    if (days >= 0 && days <= horizon) score += 15;
    if (intent.readinessMode === "apply_now" && days > horizon) score -= 10;
  }

  return score;
}

function requirementsText(candidate: Record<string, unknown>): string {
  const metadata = record(candidate.metadata);
  return [
    text(candidate.eligibilityCriteria ?? candidate.eligibility_criteria),
    text(candidate.description),
    ...stringArray(metadata.requirements),
  ]
    .filter(Boolean)
    .join(" ");
}

function toRecommendation(
  candidate: Record<string, unknown>,
  profile: unknown,
  now: Date,
): IntentRecommendationView {
  const matchScore = numberOrNull(
    candidate.match ?? candidate.matchScore ?? candidate.match_score,
  );
  const support = buildOpportunityDecisionSupport({
    eligibility: candidate.eligibility ?? null,
    profile,
    matchScore,
    matchReasons: candidateMatchReasons(candidate),
    matchRisks: candidateMatchRisks(candidate),
    deadline: candidateDeadline(candidate) as Date | string | null,
    now,
  });
  const title = text(candidate.title) || "Untitled opportunity";
  const category = candidateType(candidate);

  return {
    ...candidate,
    id: candidateId(candidate),
    title,
    matchScore: support.matchScore,
    matchReasons: support.matchReasons,
    matchRisks: support.matchRisks,
    eligibilityStatus: support.eligibilityStatus,
    eligibilityConfidence: support.eligibilityConfidence,
    eligibilityReasons: support.eligibilityReasons,
    eligibilityBlockers: support.eligibilityBlockers,
    estimatedEffortHours: estimateOpportunityEffortHours({
      category,
      requirementsText: requirementsText(candidate),
    }),
    deadline: support.deadline,
    daysUntilDeadline: support.daysUntilDeadline,
  };
}

@Injectable()
export class OpportunityShortlistService {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly repository: OpportunityJourneysRepository,
    private readonly intentService: OpportunityIntentService,
  ) {}

  async getShortlist(
    userId: string,
    requestedLimit = 3,
  ): Promise<OpportunityShortlistResult> {
    const limit = Math.min(Math.max(Math.trunc(requestedLimit || 3), 1), 5);
    const now = new Date();
    const [intent, journeys] = await Promise.all([
      this.intentService.getCurrentIntent(userId),
      this.repository.listJourneysForUser(userId),
    ]);
    const intentRecord = record(intent);
    const excludeOpportunityIds = Array.from(
      new Set(journeys.map((journey) => journey.opportunityId)),
    );
    const excluded = new Set(excludeOpportunityIds);
    const batchId = randomUUID();

    let rows: Record<string, unknown>[] = [];
    let profile: unknown = {};
    let engine = "catalog_fallback";
    let degraded = false;
    const degradedReasons: string[] = [];

    try {
      const response = record(
        await this.opportunitiesService.getPersonalizedRecommendations(userId, {
          limit: 30,
          excludeOpportunityIds,
          aiRerank: false,
        }),
      );
      rows = Array.isArray(response.opportunities)
        ? response.opportunities.map(record)
        : [];
      profile = response.profile ?? {};
      engine = text(response.engine) || "personalized";
    } catch {
      degraded = true;
      degradedReasons.push("personalized_recommendations_unavailable");
      rows = (await this.opportunitiesService.findAll(30, 0, "active")).map(
        record,
      );
    }

    const recommendations = rows
      .filter((candidate) => {
        const id = candidateId(candidate);
        return Boolean(id) && !excluded.has(id);
      })
      .map((candidate) => ({
        candidate,
        view: toRecommendation(candidate, profile, now),
        intentFit: intentFit(candidate, intentRecord, now),
      }))
      .filter(({ view }) => view.eligibilityStatus !== "ineligible")
      .sort(
        (left, right) =>
          right.intentFit - left.intentFit ||
          (right.view.matchScore ?? 0) - (left.view.matchScore ?? 0),
      )
      .slice(0, limit)
      .map(({ view }) => view);

    await this.repository.recordUserEvent(userId, {
      eventType: "focused_shortlist_generated",
      source: "backend",
      idempotencyKey: `focused-shortlist:${batchId}`,
      metadata: {
        batchId,
        engine,
        degraded,
        resultIds: recommendations.map((item) => item.id),
        intentSource: intentRecord.source ?? "unknown",
      },
    });

    return {
      batchId,
      intent: intentRecord,
      recommendations,
      degraded,
      degradedReasons,
      engine,
    };
  }
}
