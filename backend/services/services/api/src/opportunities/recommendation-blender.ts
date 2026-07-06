// Pure scoring core for the hybrid recommendation engine. No Nest, no DB —
// every function here is deterministic and unit-testable in isolation.
//
// Final match = 100 * ( w.semantic  * semantic
//                     + w.behavior  * behavior
//                     + w.profileFit* profileFit
//                     + w.freshness * freshness )
// with the semantic weight redistributed pro-rata when no embedding exists
// (cold profile, missing GEMINI_API_KEY, or an unembedded row).

export interface BlendWeights {
  semantic: number;
  behavior: number;
  profileFit: number;
  freshness: number;
}

export const DEFAULT_WEIGHTS: BlendWeights = {
  semantic: 0.45,
  behavior: 0.2,
  profileFit: 0.25,
  freshness: 0.1,
};

export interface ScoreComponents {
  /** Normalized cosine similarity 0..1, or null when unavailable. */
  semantic: number | null;
  /** 0..1 — per-opportunity signal score blended with category affinity. */
  behavior: number;
  /** 0..1 — rule-based profile fit (the legacy heuristic, normalized). */
  profileFit: number;
  /** 0..1 — recency + deadline-window score. */
  freshness: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/** Renormalizes weights to sum to 1 (guarding zero/negative/missing env input). */
export function normalizeWeights(weights: Partial<BlendWeights>): BlendWeights {
  const merged: BlendWeights = {
    semantic: positiveOr(weights.semantic, DEFAULT_WEIGHTS.semantic),
    behavior: positiveOr(weights.behavior, DEFAULT_WEIGHTS.behavior),
    profileFit: positiveOr(weights.profileFit, DEFAULT_WEIGHTS.profileFit),
    freshness: positiveOr(weights.freshness, DEFAULT_WEIGHTS.freshness),
  };
  const total =
    merged.semantic + merged.behavior + merged.profileFit + merged.freshness;
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    semantic: merged.semantic / total,
    behavior: merged.behavior / total,
    profileFit: merged.profileFit / total,
    freshness: merged.freshness / total,
  };
}

/** Reads RECS_WEIGHT_* env vars, falling back to defaults, renormalized. */
export function loadWeightsFromEnv(
  env: Record<string, string | undefined> = process.env,
): BlendWeights {
  const read = (key: string): number | undefined => {
    const parsed = Number(env[key]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };
  return normalizeWeights({
    semantic: read("RECS_WEIGHT_SEMANTIC"),
    behavior: read("RECS_WEIGHT_BEHAVIOR"),
    profileFit: read("RECS_WEIGHT_PROFILE_FIT"),
    freshness: read("RECS_WEIGHT_FRESHNESS"),
  });
}

/**
 * Maps raw cosine similarity (typically ~0.5-0.9 for text-embedding-004 on
 * related texts) onto 0..1 so mid-range similarities spread usefully.
 */
export function normalizeSemantic(cosineSimilarity: number): number {
  return clamp01((cosineSimilarity - 0.5) / 0.4);
}

/**
 * Behavior 0..1 from the per-opportunity signal score (SQL-aggregated,
 * clamped ±30) plus the user's category affinity (0..1), which generalizes
 * engagement to items the user has never seen.
 */
export function behaviorFromSignals(
  signalScore: number,
  categoryAffinity: number,
): number {
  const direct = clamp01((clampSignal(signalScore) + 30) / 60);
  return clamp01(0.6 * direct + 0.4 * clamp01(categoryAffinity));
}

function clampSignal(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(-30, Math.min(30, score));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 30;

/**
 * Freshness 0..1 = recency (exp decay, half-life 30d, contributes ≤0.5)
 * + deadline window (apply-able soon is best; imminent (<3d) is risky-low).
 */
export function freshnessScore(
  updatedAt: Date | null,
  deadline: Date | null,
  now: Date = new Date(),
): number {
  let recency = 0.25; // unknown update time — neutral-ish
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) {
    const ageDays = Math.max(0, (now.getTime() - updatedAt.getTime()) / DAY_MS);
    recency = 0.5 * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  }

  let deadlineComponent = 0.25; // no deadline — evergreen, mildly positive
  if (deadline instanceof Date && !Number.isNaN(deadline.getTime())) {
    const daysLeft = (deadline.getTime() - now.getTime()) / DAY_MS;
    if (daysLeft < 0) deadlineComponent = 0; // passed
    else if (daysLeft < 3) deadlineComponent = 0.1; // too tight to apply well
    else if (daysLeft <= 45) deadlineComponent = 0.5; // sweet spot
    else if (daysLeft <= 90) deadlineComponent = 0.3;
    else deadlineComponent = 0.2; // far out
  }

  return clamp01(recency + deadlineComponent);
}

/**
 * Blends components into a 0..100 integer match score. A null semantic
 * component redistributes its weight pro-rata across the others so scores
 * stay comparable between embedded and heuristic-only requests.
 */
export function blendScore(
  components: ScoreComponents,
  weights: BlendWeights = DEFAULT_WEIGHTS,
): number {
  const w = normalizeWeights(weights);
  let score: number;

  if (components.semantic === null) {
    const rest = w.behavior + w.profileFit + w.freshness;
    if (rest <= 0) return 0;
    score =
      (w.behavior / rest) * clamp01(components.behavior) +
      (w.profileFit / rest) * clamp01(components.profileFit) +
      (w.freshness / rest) * clamp01(components.freshness);
  } else {
    score =
      w.semantic * clamp01(components.semantic) +
      w.behavior * clamp01(components.behavior) +
      w.profileFit * clamp01(components.profileFit) +
      w.freshness * clamp01(components.freshness);
  }

  return Math.round(clamp01(score) * 100);
}

export interface ReasonContext {
  topCategory?: string | null;
  daysToDeadline?: number | null;
  categoryAffinity?: number;
}

/**
 * Human-readable reasons, ordered by strength: semantic fit first, then
 * behavioral affinity, then the rule-derived reasons, then deadline urgency.
 * Capped at 4 so cards stay scannable.
 */
export function deriveMatchReasons(
  components: ScoreComponents,
  ruleReasons: string[],
  context: ReasonContext = {},
): string[] {
  const reasons: string[] = [];

  if (components.semantic !== null && components.semantic >= 0.75) {
    reasons.push("Strong fit with your profile and interests.");
  } else if (components.semantic !== null && components.semantic >= 0.55) {
    reasons.push("Good overall match for your profile.");
  }

  if ((context.categoryAffinity ?? 0) >= 0.5 && context.topCategory) {
    reasons.push(
      `Because you engaged with similar ${context.topCategory} opportunities.`,
    );
  }

  for (const reason of ruleReasons) {
    if (reasons.length >= 4) break;
    if (!reasons.includes(reason)) reasons.push(reason);
  }

  if (
    reasons.length < 4 &&
    typeof context.daysToDeadline === "number" &&
    context.daysToDeadline >= 3 &&
    context.daysToDeadline <= 21
  ) {
    reasons.push(
      `Deadline in ${Math.round(context.daysToDeadline)} days — apply soon.`,
    );
  }

  return reasons.slice(0, 4);
}
