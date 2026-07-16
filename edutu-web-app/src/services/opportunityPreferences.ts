import { productApiRequest } from "./productApi";

/**
 * Derives and syncs the backend `user_opportunity_preferences` row from what
 * the member picks in onboarding / the profile form. The recommendation
 * engine's rule scorer boosts preferredCategories (+18) and preferredRegions
 * (+14) — until this sync existed nothing on web ever populated them.
 */

// Display labels exactly as stored on opportunity rows (the engine compares
// preferredCategories against opportunity.category with an exact match).
type CategoryLabel =
  | "Scholarships"
  | "Internships"
  | "Programs"
  | "Fellowships"
  | "Grants"
  | "Graduate Programs"
  | "Bootcamps"
  | "Events"
  | "Jobs"
  | "Competitions";

// Keyword → category so both preset options ("Win a scholarship") and custom
// free-text entries ("hackathons") map onto the discovery catalog.
// Mirrors the backend's CATEGORY_ALIASES where they overlap (leadership →
// fellowships, education → scholarships, careers → jobs).
const KEYWORD_TO_CATEGORY: Array<[RegExp, CategoryLabel]> = [
  [/scholarship|bursary|study abroad|education/i, "Scholarships"],
  [/fellowship|leadership/i, "Fellowships"],
  [/internship/i, "Internships"],
  [/grant|research|business|startup|entrepreneur/i, "Grants"],
  [/competition|hackathon|challenge/i, "Competitions"],
  [/bootcamp|learn new skills/i, "Bootcamps"],
  [/\bjobs?\b|first job|career/i, "Jobs"],
  [/conference|event|network/i, "Events"],
  [/masters|phd|postgraduate|graduate program/i, "Graduate Programs"],
  [/exchange|volunteer|online course|programs?\b/i, "Programs"],
];

function toCategories(values: readonly string[]): CategoryLabel[] {
  const matched = new Set<CategoryLabel>();
  for (const value of values) {
    for (const [pattern, category] of KEYWORD_TO_CATEGORY) {
      if (pattern.test(value)) matched.add(category);
    }
  }
  return [...matched];
}

export interface PreferenceSources {
  /** Opportunity interests and/or topical interests. */
  interests?: readonly string[];
  /** Onboarding career goals ("Win a scholarship", …). */
  careerGoals?: readonly string[];
  /** Countries the member wants to study/work in. */
  interestedCountries?: readonly string[];
}

export interface DerivedOpportunityPreferences {
  preferredCategories?: string[];
  preferredRegions?: string[];
}

/**
 * Pure mapping. A key is present only when its source was provided, so the
 * backend merge-PATCH leaves everything else (excludedCategories, remoteOnly…)
 * untouched.
 */
export function deriveOpportunityPreferences(
  sources: PreferenceSources,
): DerivedOpportunityPreferences {
  const derived: DerivedOpportunityPreferences = {};

  if (sources.interests !== undefined || sources.careerGoals !== undefined) {
    derived.preferredCategories = toCategories([
      ...(sources.interests ?? []),
      ...(sources.careerGoals ?? []),
    ]);
  }

  if (sources.interestedCountries !== undefined) {
    derived.preferredRegions = sources.interestedCountries.filter(Boolean);
  }

  return derived;
}

/**
 * Best-effort PATCH — callers fire-and-forget so a failed sync never blocks
 * the profile/onboarding save it rides along with.
 */
export async function syncOpportunityPreferences(
  token: string,
  sources: PreferenceSources,
): Promise<void> {
  const derived = deriveOpportunityPreferences(sources);
  if (Object.keys(derived).length === 0) return;

  await productApiRequest("/opportunities/preferences", token, {
    method: "PATCH",
    body: JSON.stringify(derived),
  });
}
