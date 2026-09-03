import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  goals,
  profiles,
  userOpportunityPreferences,
  userOpportunitySignals,
} from "../db/schema";
import { matchProfileUserId, toDatabaseUserId } from "../common/user-id";
import {
  OpportunityJourneysRepository,
  type ReplaceActiveIntentInput,
} from "./opportunity-journeys.repository";
import {
  opportunityIntentInputSchema,
  type OpportunityIntentGoal,
  type OpportunityIntentInput,
} from "./dto/opportunity-intent.dto";
import { hashOpportunityJourneyMutation } from "./opportunity-journey-event";

export interface OpportunityIntentSourceSnapshot {
  profile: Record<string, unknown>;
  preferences: Record<string, unknown>;
  goals: Array<Record<string, unknown>>;
  signals: Array<Record<string, unknown>>;
}

export interface OpportunityIntentSource {
  load(userId: string): Promise<OpportunityIntentSourceSnapshot>;
}

export interface InferredOpportunityIntent extends OpportunityIntentInput {
  source: "inferred";
}

const GOAL_KEYWORDS: Record<OpportunityIntentGoal, string[]> = {
  study_funding: [
    "scholarship",
    "funded study",
    "postgraduate",
    "undergraduate",
    "tuition",
    "study abroad",
    "education funding",
  ],
  work_experience: [
    "internship",
    "work experience",
    "placement",
    "apprenticeship",
    "trainee",
  ],
  employment: ["job", "employment", "graduate role", "vacancy", "career role"],
  business_funding: [
    "grant",
    "startup",
    "business funding",
    "entrepreneur",
    "seed funding",
  ],
  leadership_growth: [
    "fellowship",
    "leadership",
    "community leader",
    "public service",
  ],
  skill_building: ["course", "bootcamp", "skill", "training", "certification"],
  open_exploration: [],
};

const DEFAULT_TYPES: Record<OpportunityIntentGoal, string[]> = {
  study_funding: ["scholarship"],
  work_experience: ["internship"],
  employment: ["job"],
  business_funding: ["grant"],
  leadership_growth: ["fellowship", "program"],
  skill_building: ["course", "bootcamp"],
  open_exploration: [],
};

function uniqueText(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function evidenceText(snapshot: OpportunityIntentSourceSnapshot): string {
  return JSON.stringify(snapshot).toLowerCase().replace(/[_-]+/gu, " ");
}

function inferGoal(text: string): OpportunityIntentGoal {
  let best: OpportunityIntentGoal = "open_exploration";
  let bestScore = 0;

  for (const [goal, keywords] of Object.entries(GOAL_KEYWORDS) as Array<
    [OpportunityIntentGoal, string[]]
  >) {
    const score = keywords.reduce(
      (total, keyword) => total + (text.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = goal;
      bestScore = score;
    }
  }

  return best;
}

function horizon(value: unknown): 30 | 90 | 180 | 365 {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return 90;
  if (days <= 30) return 30;
  if (days <= 90) return 90;
  if (days <= 180) return 180;
  return 365;
}

export function inferOpportunityIntent(
  snapshot: OpportunityIntentSourceSnapshot,
): InferredOpportunityIntent {
  const goalKey = inferGoal(evidenceText(snapshot));
  const preferredTypes = uniqueText(
    snapshot.preferences.preferredOpportunityTypes,
  );

  return {
    goalKey,
    opportunityTypes:
      preferredTypes.length > 0 ? preferredTypes : DEFAULT_TYPES[goalKey],
    locations: uniqueText(snapshot.preferences.preferredRegions),
    remotePreference:
      snapshot.preferences.remoteOnly === true ? "required" : "neutral",
    actionHorizonDays: horizon(snapshot.preferences.maxDeadlineDays),
    weeklyHours: 4,
    readinessMode: "apply_now",
    source: "inferred",
  };
}

export class DatabaseOpportunityIntentSource implements OpportunityIntentSource {
  constructor(private readonly database: any = db) {}

  async load(userId: string): Promise<OpportunityIntentSourceSnapshot> {
    const convertedUserId = toDatabaseUserId(userId);
    const [[profile], [preferences], goalRows, signalRows] = await Promise.all([
      this.database
        .select()
        .from(profiles)
        .where(matchProfileUserId(profiles.userId, convertedUserId))
        .limit(1)
        .execute(),
      this.database
        .select()
        .from(userOpportunityPreferences)
        .where(eq(userOpportunityPreferences.userId, convertedUserId))
        .limit(1)
        .execute(),
      this.database
        .select()
        .from(goals)
        .where(
          and(eq(goals.userId, convertedUserId), eq(goals.status, "active")),
        )
        .orderBy(desc(goals.updatedAt))
        .limit(10)
        .execute(),
      this.database
        .select({
          signalType: userOpportunitySignals.signalType,
          context: userOpportunitySignals.context,
          details: userOpportunitySignals.details,
          createdAt: userOpportunitySignals.createdAt,
        })
        .from(userOpportunitySignals)
        .where(eq(userOpportunitySignals.userId, convertedUserId))
        .orderBy(desc(userOpportunitySignals.createdAt))
        .limit(50)
        .execute(),
    ]);

    return {
      profile: (profile ?? {}) as Record<string, unknown>,
      preferences: (preferences ?? {}) as Record<string, unknown>,
      goals: goalRows as Array<Record<string, unknown>>,
      signals: signalRows as Array<Record<string, unknown>>,
    };
  }
}

export class OpportunityIntentService {
  constructor(
    private readonly repository = new OpportunityJourneysRepository(),
    private readonly source: OpportunityIntentSource = new DatabaseOpportunityIntentSource(),
  ) {}

  async getProfileSnapshot(userId: string): Promise<Record<string, unknown>> {
    return (await this.source.load(userId)).profile;
  }

  async getCurrentIntent(userId: string) {
    const active = await this.repository.getActiveIntent(userId);
    if (active) return { ...active, persisted: true as const };

    return {
      ...inferOpportunityIntent(await this.source.load(userId)),
      persisted: false as const,
    };
  }

  async ensureActiveIntent(userId: string) {
    const active = await this.repository.getActiveIntent(userId);
    if (active) return active;

    const inferred = inferOpportunityIntent(await this.source.load(userId));
    const idempotencyKey = `intent-inferred:${hashOpportunityJourneyMutation({
      userId: toDatabaseUserId(userId),
      inferred,
    }).slice(0, 24)}`;

    return this.repository.replaceActiveIntent(
      userId,
      inferred as ReplaceActiveIntentInput,
      {
        eventType: "intent_created",
        source: "backend",
        idempotencyKey,
        metadata: { intentSource: "inferred" },
      },
    );
  }

  async saveExplicitIntent(
    userId: string,
    input: OpportunityIntentInput,
    idempotencyKey: string,
  ) {
    const parsed = opportunityIntentInputSchema.parse(input);
    const normalized: OpportunityIntentInput & { source: "explicit" } = {
      ...parsed,
      opportunityTypes: uniqueText(parsed.opportunityTypes),
      locations: uniqueText(parsed.locations),
      source: "explicit",
    };

    return this.repository.replaceActiveIntent(
      userId,
      normalized as ReplaceActiveIntentInput,
      {
        eventType: "intent_updated",
        source: "backend",
        idempotencyKey,
        metadata: { intentSource: "explicit" },
      },
    );
  }
}
