import { recordOpportunitySignal } from '@edutu/core/src/services/opportunitySignals';

/**
 * Impression plumbing: which opportunities were actually SEEN, where, and at
 * which position. The ranking engine can't compute CTR, position bias, or
 * impression fatigue ("shown 6 times, never tapped → stop showing it")
 * without this — clicks alone only describe the winners.
 *
 * Deduped per app session per (surface, opportunity) so a re-render or a
 * scroll wiggle doesn't spam the queue; cross-session frequency is what the
 * server-side fatigue logic aggregates.
 */

type TokenProvider = () => Promise<string | null | undefined>;

const seenThisSession = new Set<string>();

export function markImpression(
  opportunityId: string,
  surface: string,
  position: number,
  getAuthToken?: TokenProvider,
): void {
  if (!opportunityId) return;
  const key = `${surface}:${opportunityId}`;
  if (seenThisSession.has(key)) return;
  seenThisSession.add(key);

  void recordOpportunitySignal(
    {
      opportunityId,
      signalType: 'impression',
      source: 'mobile',
      context: surface,
      details: { surface, position },
    },
    getAuthToken,
  );
}

// ── Visibility check registry ────────────────────────────────────────────────
// ScrollView screens (home) have no viewability API, so tracked cards register
// a measure-and-fire check here and the screen pumps it on scroll/mount.

type VisibilityCheck = () => void;

const checks = new Set<VisibilityCheck>();

export function registerImpressionCheck(check: VisibilityCheck): () => void {
  checks.add(check);
  return () => {
    checks.delete(check);
  };
}

let lastRunAt = 0;
const RUN_THROTTLE_MS = 300;

/** Call from onScroll / after layout; throttled internally. */
export function runImpressionChecks(force = false): void {
  const now = Date.now();
  if (!force && now - lastRunAt < RUN_THROTTLE_MS) return;
  lastRunAt = now;
  checks.forEach((check) => check());
}
