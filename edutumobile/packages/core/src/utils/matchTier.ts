/**
 * Maps a numeric match score (0-100) to a user-facing "fit" tier.
 *
 * We deliberately speak in fit tiers rather than raw percentages so a score
 * reads as "how well this fits you" — not "your odds of winning". Pair the
 * tier with MATCH_TIER_KEY to resolve the localized label for the relevant
 * i18n namespace (home `opportunityCard.*`, opps `detail.*`).
 *
 * Boundaries: >=80 excellent, >=60 strong, >=40 good, otherwise fair.
 * Pure — no side effects.
 */
export type MatchTier = 'excellent' | 'strong' | 'good' | 'fair';

export function getMatchTier(score: number): MatchTier {
  if (score >= 80) {
    return 'excellent';
  }
  if (score >= 60) {
    return 'strong';
  }
  if (score >= 40) {
    return 'good';
  }
  return 'fair';
}

export const MATCH_TIER_KEY: Record<
  MatchTier,
  'fitExcellent' | 'fitStrong' | 'fitGood' | 'fitWorthALook'
> = {
  excellent: 'fitExcellent',
  strong: 'fitStrong',
  good: 'fitGood',
  fair: 'fitWorthALook',
};
