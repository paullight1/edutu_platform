import { checkEligibility } from "../opportunities/eligibility.util";
import { toEligibilityProfile } from "../opportunities/eligibility-profile.util";

export type OpportunityEligibilityStatus =
  | "eligible"
  | "likely"
  | "unclear"
  | "ineligible";

export interface OpportunityDecisionSupportInput {
  eligibility: unknown;
  profile: unknown;
  matchScore: number | null;
  matchReasons?: string[] | null;
  matchRisks?: string[] | null;
  deadline?: Date | string | null;
  now?: Date;
}

export interface OpportunityDecisionSupport {
  eligibilityStatus: OpportunityEligibilityStatus;
  eligibilityConfidence: number;
  eligibilityReasons: string[];
  eligibilityBlockers: string[];
  matchScore: number | null;
  matchReasons: string[];
  matchRisks: string[];
  deadline: string | null;
  daysUntilDeadline: number | null;
}

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

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasStructuredEligibility(value: Record<string, unknown>): boolean {
  return (
    value.unrestricted === true ||
    stringArray(value.countries).length > 0 ||
    finiteNumber(value.age_min) !== null ||
    finiteNumber(value.age_max) !== null ||
    stringArray(value.degree_levels).length > 0
  );
}

function missingEvidence(
  eligibility: Record<string, unknown>,
  profile: ReturnType<typeof toEligibilityProfile>,
): string[] {
  const missing: string[] = [];
  const countries = stringArray(eligibility.countries);
  const hasCountryRestriction =
    countries.length > 0 &&
    !countries.some((country) =>
      UNRESTRICTED_COUNTRY_TOKENS.has(country.toLowerCase()),
    );

  if (hasCountryRestriction && !profile.country) missing.push("country");
  if (
    (finiteNumber(eligibility.age_min) !== null ||
      finiteNumber(eligibility.age_max) !== null) &&
    profile.age === undefined
  ) {
    missing.push("age");
  }
  if (
    stringArray(eligibility.degree_levels).length > 0 &&
    !profile.degree
  ) {
    missing.push("education");
  }

  return missing;
}

function normalizedDeadline(
  value: Date | string | null | undefined,
): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function limited(values: string[] | null | undefined): string[] {
  return (values ?? []).filter(Boolean).slice(0, 2);
}

export function buildOpportunityDecisionSupport(
  input: OpportunityDecisionSupportInput,
): OpportunityDecisionSupport {
  const now = input.now ?? new Date();
  const profile = toEligibilityProfile(input.profile, now);
  const structured = plainObject(input.eligibility);
  const verdict = checkEligibility(input.eligibility, profile);
  const deadline = normalizedDeadline(input.deadline);
  const daysUntilDeadline = deadline
    ? Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000)
    : null;

  let eligibilityStatus: OpportunityEligibilityStatus;
  let eligibilityConfidence: number;
  let eligibilityReasons: string[];

  if (verdict.blockers.length > 0) {
    eligibilityStatus = "ineligible";
    eligibilityConfidence = 0.95;
    eligibilityReasons = [];
  } else if (!structured || !hasStructuredEligibility(structured)) {
    eligibilityStatus = "unclear";
    eligibilityConfidence = 0.35;
    eligibilityReasons = [
      "Eligibility must be confirmed from the official opportunity details.",
    ];
  } else {
    const missing = missingEvidence(structured, profile);
    if (missing.length > 0) {
      eligibilityStatus = "likely";
      eligibilityConfidence = 0.7;
      eligibilityReasons = [
        `Likely eligible; confirm your ${missing.join(" and ")} details.`,
      ];
    } else {
      eligibilityStatus = "eligible";
      eligibilityConfidence = 1;
      eligibilityReasons = [
        "Your profile matches the structured eligibility rules.",
      ];
    }
  }

  return {
    eligibilityStatus,
    eligibilityConfidence,
    eligibilityReasons,
    eligibilityBlockers: verdict.blockers,
    matchScore: input.matchScore,
    matchReasons: limited(input.matchReasons),
    matchRisks: limited(input.matchRisks),
    deadline: deadline?.toISOString() ?? null,
    daysUntilDeadline,
  };
}
