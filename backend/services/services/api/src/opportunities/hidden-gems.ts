// Hidden-gem surfacing: Edutu's aggregator funnels everyone at the same famous
// listings, so strong-fit opportunities that few people have engaged with are
// systematically buried. This module boosts and annotates those "hidden gems"
// — high personal match, low GLOBAL (cross-user) engagement — so a member sees
// listings they can realistically win rather than the same crowded headliners.
//
// The engagement aggregate itself is computed (and cached) in the ranking
// service; everything here is a PURE, side-effect-free transform so it can be
// unit-tested against a scored list + an engagement map with no DB.

/** Prepended/appended reason shown when an item qualifies as a hidden gem. */
export const HIDDEN_GEM_REASON = "Hidden gem — strong fit, few applicants yet";

/** Reason-detail `kind` for the hidden-gem reason (clients fall back safely). */
export const HIDDEN_GEM_KIND = "hidden_gem";

/** Match is a 0..100 score; the boost can never push it past this ceiling. */
export const HIDDEN_GEM_MATCH_CAP = 100;

export interface HiddenGemOptions {
  /** Master switch. Default ON — disabled only when RECS_HIDDEN_GEMS==="false". */
  enabled: boolean;
  /** Minimum personal match for an item to be gem-eligible (strong fit). */
  minMatch: number;
  /** Maximum global engagement for an item to count as low-competition. */
  maxEngagement: number;
  /** Points added to `match` for a qualifying gem (capped at 100). */
  boost: number;
}

/** Minimal shape the annotator needs — any scored feed item satisfies it. */
export interface HiddenGemItem {
  id: string;
  match: number;
  matchReasons: string[];
  hidden_gem?: boolean;
}

const DEFAULTS = {
  enabled: true,
  minMatch: 60,
  maxEngagement: 5,
  boost: 3,
} as const;

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolves the runtime options from env. `RECS_HIDDEN_GEMS` is ON unless it is
 * exactly the string "false" (case-insensitive); the numeric knobs fall back to
 * their defaults on any non-finite/negative value.
 */
export function resolveHiddenGemOptions(
  env: NodeJS.ProcessEnv = process.env,
): HiddenGemOptions {
  return {
    enabled: (env.RECS_HIDDEN_GEMS || "true").toLowerCase() !== "false",
    minMatch: parseNumber(env.RECS_HIDDEN_GEM_MIN_MATCH, DEFAULTS.minMatch),
    maxEngagement: parseNumber(
      env.RECS_HIDDEN_GEM_MAX_ENGAGEMENT,
      DEFAULTS.maxEngagement,
    ),
    boost: parseNumber(env.RECS_HIDDEN_GEM_BOOST, DEFAULTS.boost),
  };
}

/**
 * PURE annotator. Returns a new array; qualifying items are replaced with a
 * boosted copy carrying `hidden_gem: true` and the hidden-gem reason. Non-gems
 * (and every item when disabled) pass through by reference.
 *
 * An id absent from the engagement map ⇒ engagement 0 ⇒ eligible: brand-new
 * listings, which nobody has touched yet, are exactly the point of the feature.
 */
export function annotateHiddenGems<T extends HiddenGemItem>(
  items: readonly T[],
  engagement: ReadonlyMap<string, number>,
  opts: HiddenGemOptions,
): T[] {
  if (!opts.enabled) return items.slice();

  return items.map((item) => {
    const eng = engagement.get(item.id) ?? 0;
    const isGem = item.match >= opts.minMatch && eng <= opts.maxEngagement;
    if (!isGem) return item;

    const matchReasons = item.matchReasons.includes(HIDDEN_GEM_REASON)
      ? item.matchReasons
      : [...item.matchReasons, HIDDEN_GEM_REASON];

    return {
      ...item,
      // The boost feeds the same `match` the downstream sort reads, so gems
      // rise; the cap guarantees it never reports above 100.
      match: Math.min(HIDDEN_GEM_MATCH_CAP, item.match + opts.boost),
      matchReasons,
      hidden_gem: true,
    };
  });
}
