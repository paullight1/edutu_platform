import {
  matchEducationLevel,
  opportunityEducationLevel,
} from "./profile-fit.util";

/**
 * Pure eligibility checker for the recommendation pipeline.
 *
 * The scraper now persists a structured `eligibility` jsonb on opportunities:
 * `{ countries, age_min, age_max, degree_levels, gender }` — every field may
 * be null/absent, and legacy rows carry only free-form keys. This util turns
 * that (or anything shaped like it) into a verdict the feed can hard-filter on
 * and the detail path can annotate with.
 *
 * Fail-open contract: we block ONLY on an explicit, interpretable structured
 * mismatch. Missing eligibility, legacy/free-form eligibility, unrecognized
 * values, or a missing profile field all pass. `gender` is never gated —
 * profiles carry no gender column, so we cannot judge it.
 */

export interface EligibilityVerdict {
  eligible: boolean;
  blockers: string[];
}

export interface EligibilityProfile {
  country?: string | null;
  age?: number | null;
  dateOfBirth?: string | null;
  degree?: string | null;
}

// Country entries that mean "no geographic restriction" — treat as unrestricted.
const UNRESTRICTED_COUNTRY_TOKENS = new Set([
  "any",
  "all",
  "international",
  "worldwide",
  "global",
  "open",
  "everyone",
  "anywhere",
]);

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Whole years from an ISO/date string to today, or null when unparseable. */
function ageFromDateOfBirth(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
}

/**
 * Decides whether a member is eligible for an opportunity, given the
 * opportunity's raw eligibility object and the member's profile. Never throws:
 * any malformed input degrades to `eligible: true`.
 */
export function checkEligibility(
  rawEligibility: unknown,
  profile: EligibilityProfile,
): EligibilityVerdict {
  const blockers: string[] = [];

  // Only plain structured objects are interpretable; everything else
  // (null, strings, arrays, legacy free-form) fails open.
  if (
    !rawEligibility ||
    typeof rawEligibility !== "object" ||
    Array.isArray(rawEligibility)
  ) {
    return { eligible: true, blockers };
  }

  const elig = rawEligibility as Record<string, unknown>;

  try {
    // --- Country ---------------------------------------------------------
    const countries = toStringArray(elig.countries)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const profileCountry = normalize(profile.country);
    if (countries.length > 0 && profileCountry) {
      const unrestricted = countries.some((c) =>
        UNRESTRICTED_COUNTRY_TOKENS.has(normalize(c)),
      );
      const matches = countries.some((c) => normalize(c) === profileCountry);
      if (!unrestricted && !matches) {
        blockers.push(`Open to applicants from: ${countries.join(", ")}`);
      }
    }

    // --- Age -------------------------------------------------------------
    const age =
      toFiniteNumber(profile.age) ?? ageFromDateOfBirth(profile.dateOfBirth);
    if (age !== null) {
      const ageMin = toFiniteNumber(elig.age_min);
      const ageMax = toFiniteNumber(elig.age_max);
      if (ageMax !== null && age > ageMax) {
        blockers.push(`Age limit: up to ${ageMax}`);
      } else if (ageMin !== null && age < ageMin) {
        blockers.push(`Minimum age: ${ageMin}`);
      }
    }

    // --- Degree level ----------------------------------------------------
    const degreeLevels = toStringArray(elig.degree_levels);
    const profileDegree = profile.degree?.trim();
    if (degreeLevels.length > 0 && profileDegree) {
      // Keep only entries we can actually interpret; unknown level words
      // (e.g. a field of study) leave the check unjudgeable → fail open.
      const recognized = degreeLevels
        .map((level) => ({
          text: level,
          label: opportunityEducationLevel(level),
        }))
        .filter(
          (entry): entry is { text: string; label: string } =>
            entry.label !== null,
        );
      if (recognized.length > 0) {
        const qualifies = recognized.some(
          (entry) => matchEducationLevel(profileDegree, entry.text) !== null,
        );
        if (!qualifies) {
          const labels = Array.from(
            new Set(recognized.map((entry) => entry.label)),
          );
          blockers.push(`Requires ${labels.join(" or ")}-level study`);
        }
      }
    }
  } catch {
    // Defensive: a malformed eligibility object must never break the feed.
    return { eligible: true, blockers: [] };
  }

  return { eligible: blockers.length === 0, blockers };
}
