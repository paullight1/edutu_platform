import type { OpportunityPreferenceDto } from "./dto/personalization.dto";

/**
 * Pure helpers for the rule-based profile-fit scorer and the preferences
 * PATCH endpoint. Kept out of the service so they unit-test without the
 * DB/AI wiring (same pattern as recommendation-blender).
 */

export interface GoalLike {
  title?: string | null;
  description?: string | null;
}

/**
 * Education-level buckets. `user` matches the member's stored degree text
 * (free text — "Undergraduate", "MSc Economics", "PhD candidate"…);
 * `opportunity` matches the level language opportunities actually use.
 * `graduate` uses a lookbehind so "undergraduate" never counts as graduate.
 */
const EDUCATION_LEVELS: Array<{
  label: string;
  user: RegExp;
  opportunity: RegExp;
}> = [
  {
    label: "high school",
    user: /high[\s-]?school|secondary/,
    opportunity: /high[\s-]?school|secondary school|pre[\s-]?university/,
  },
  {
    label: "undergraduate",
    user: /undergrad|bachelor|\bbsc\b|\bb\.sc\b/,
    opportunity: /undergraduate|bachelor/,
  },
  {
    label: "graduate",
    user: /(?<!under)grad(?:uate)?\b|master|\bmsc\b|\bm\.sc\b|\bmba\b|postgrad/,
    opportunity: /(?<!under)graduate|master|\bmsc\b|\bmba\b|postgraduate/,
  },
  {
    label: "doctoral",
    user: /phd|doctor/,
    opportunity: /\bphd\b|doctoral|doctorate/,
  },
  {
    label: "professional",
    user: /professional/,
    opportunity: /professionals?|early[\s-]?career|mid[\s-]?career/,
  },
];

/**
 * Returns the matched education-level label when the member's degree bucket
 * appears in the opportunity text, null otherwise.
 */
export function matchEducationLevel(
  degree: string | null | undefined,
  opportunityText: string,
): string | null {
  const normalized = degree?.toLowerCase().trim();
  if (!normalized) return null;
  for (const level of EDUCATION_LEVELS) {
    if (
      level.user.test(normalized) &&
      level.opportunity.test(opportunityText)
    ) {
      return level.label;
    }
  }
  return null;
}

/**
 * Bucket a required-level string an opportunity uses (e.g. "graduate",
 * "PhD", "undergraduate") into its canonical label, or null when the text
 * matches no known level. Complements {@link matchEducationLevel} for the
 * eligibility gate: it decides whether a structured `degree_levels` entry is
 * even interpretable before deciding if a member qualifies.
 */
export function opportunityEducationLevel(
  text: string | null | undefined,
): string | null {
  const normalized = text?.toLowerCase().trim();
  if (!normalized) return null;
  for (const level of EDUCATION_LEVELS) {
    if (level.opportunity.test(normalized)) return level.label;
  }
  return null;
}

// Filler words in goal titles like "Win a scholarship" / "Land my first job";
// without them every goal would "match" via its connectives.
const GOAL_TERM_STOPWORDS = new Set([
  "with",
  "from",
  "that",
  "this",
  "your",
  "their",
  "them",
  "then",
  "than",
  "into",
  "about",
  "want",
  "will",
  "have",
  "been",
  "more",
  "other",
  "some",
  "goal",
  "goals",
]);

function goalTerms(goal: GoalLike): string[] {
  return `${goal.title || ""} ${goal.description || ""}`
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 3 && !GOAL_TERM_STOPWORDS.has(term));
}

/**
 * Goals whose significant terms appear in the opportunity text — e.g. a
 * "Win a scholarship" goal matches any text containing "scholarship".
 */
export function matchedGoals<T extends GoalLike>(
  userGoals: readonly T[] | null | undefined,
  opportunityText: string,
): T[] {
  return (userGoals ?? []).filter((goal) =>
    goalTerms(goal).some((term) => opportunityText.includes(term)),
  );
}

/**
 * Merge-PATCH semantics for preferences: only keys present in the patch
 * overwrite the stored values. Without this, a client updating
 * preferredCategories would null out the excludedCategories accumulated
 * from dismiss signals.
 */
export function mergePreferencePatch(
  current: OpportunityPreferenceDto | null,
  patch: OpportunityPreferenceDto,
): OpportunityPreferenceDto {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as OpportunityPreferenceDto;
  return { ...(current ?? {}), ...defined };
}
