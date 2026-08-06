/**
 * The scheduler's decision logic, as pure functions.
 *
 * Every helper here takes explicit inputs and returns a value — no database, no
 * clock it did not receive, no Nest. That is deliberate: the cron body is thin
 * orchestration over these, so the ranking, collapsing, fatigue and send-time
 * rules can be tested exhaustively without a Postgres round trip. A scheduler
 * whose judgement lives inside its cron handler is a scheduler nobody can
 * verify.
 */

import { localMinutes } from "../../common/quiet-hours";
import type {
  KindEngagement,
  ScorableCandidate,
  ScoredCandidate,
} from "./notification-scheduler.types";

/** Hours after which a candidate's recency weight has decayed by 1/e. */
export const RECENCY_HALF_LIFE_HOURS = 72;

/** Bounds on how far engagement history may move a score in either direction. */
export const ENGAGEMENT_MULTIPLIER_MIN = 0.25;
export const ENGAGEMENT_MULTIPLIER_MAX = 2.0;

/**
 * Confidence floor. Below this many delivered notifications for a (user, kind)
 * pair the open rate is noise — one open out of one delivery is not a 100%
 * engagement rate — so the multiplier is exactly neutral.
 */
export const ENGAGEMENT_MIN_DELIVERIES = 5;

/** Consecutive delivered-but-unopened notifications that halve a kind's score. */
export const SUPPRESSION_HALVE_AT = 3;
/** …and that mute the kind outright. */
export const SUPPRESSION_SKIP_AT = 6;
/** How long a muted kind stays muted. */
export const SUPPRESSION_SKIP_DAYS = 14;

/** Default local send time when we have no evidence of when a user engages. */
export const DEFAULT_SEND_HOUR = 8;
export const DEFAULT_SEND_MINUTE = 30;

/** Opens required before a user's own modal hour beats the 08:30 default. */
export const MODAL_HOUR_MIN_OPENS = 10;

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Exponential recency weight: 1.0 for a candidate proposed just now, decaying
 * smoothly with age. Strictly decreasing, never negative, never zero.
 */
export function recencyDecay(ageHours: number): number {
  const age = Number.isFinite(ageHours) ? Math.max(0, ageHours) : 0;
  return Math.exp(-age / RECENCY_HALF_LIFE_HOURS);
}

/** Age in hours of `createdAt` relative to `now` (never negative). */
export function ageInHours(createdAt: Date, now: Date): number {
  return Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);
}

/**
 * How much this user's own history with this kind should move its score,
 * relative to everyone else's.
 *
 * Returns exactly 1.0 (neutral) when the pair has fewer than
 * {@link ENGAGEMENT_MIN_DELIVERIES} deliveries, or when the global rate is
 * unusable — we refuse to let a single lucky open swing the ranking.
 */
export function engagementMultiplier(input: {
  deliveredCount: number;
  openedCount: number;
  globalOpenRate: number;
}): number {
  const { deliveredCount, openedCount, globalOpenRate } = input;
  if (!Number.isFinite(deliveredCount) || deliveredCount <= 0) return 1;
  if (deliveredCount < ENGAGEMENT_MIN_DELIVERIES) return 1;
  if (!Number.isFinite(globalOpenRate) || globalOpenRate <= 0) return 1;

  const userRate = Math.max(0, openedCount) / deliveredCount;
  return clamp(
    userRate / globalOpenRate,
    ENGAGEMENT_MULTIPLIER_MIN,
    ENGAGEMENT_MULTIPLIER_MAX,
  );
}

/**
 * urgency × relevance × recency_decay × engagement_multiplier.
 *
 * Suppression is applied separately ({@link kindSuppression}) so a muted kind
 * is visible as a distinct decision rather than a mysteriously small number.
 */
export function scoreCandidate(input: {
  urgency: number;
  relevance: number;
  ageHours: number;
  engagementMultiplier: number;
}): number {
  const urgency = Number.isFinite(input.urgency) ? input.urgency : 0;
  const relevance = Number.isFinite(input.relevance) ? input.relevance : 0;
  const engagement = Number.isFinite(input.engagementMultiplier)
    ? input.engagementMultiplier
    : 1;
  return urgency * relevance * recencyDecay(input.ageHours) * engagement;
}

/**
 * Fatigue response to a run of ignored notifications of one kind.
 *
 * 3 in a row unopened → half weight (the user is drifting).
 * 6 in a row unopened → muted for {@link SUPPRESSION_SKIP_DAYS} days, dated
 * from the last delivery. Once that window has passed the kind gets one more
 * honest chance at full weight rather than being condemned forever.
 */
export function kindSuppression(input: {
  consecutiveUnopened: number;
  lastDeliveredAt?: Date | null;
  now?: Date;
}): { multiplier: number; skipUntil: Date | null } {
  const streak = Math.max(0, input.consecutiveUnopened || 0);
  const now = input.now ?? new Date();

  if (streak >= SUPPRESSION_SKIP_AT) {
    const from = input.lastDeliveredAt ?? now;
    const skipUntil = new Date(
      from.getTime() + SUPPRESSION_SKIP_DAYS * 24 * 3_600_000,
    );
    if (now.getTime() < skipUntil.getTime()) {
      return { multiplier: 0, skipUntil };
    }
    // Mute expired: let one through and re-measure.
    return { multiplier: 1, skipUntil: null };
  }

  if (streak >= SUPPRESSION_HALVE_AT)
    return { multiplier: 0.5, skipUntil: null };
  return { multiplier: 1, skipUntil: null };
}

/**
 * Length of the current run of delivered-but-unopened notifications.
 *
 * `openedFlags` must be newest-first. The run ends at the first opened item.
 */
export function countConsecutiveUnopened(openedFlags: boolean[]): number {
  let streak = 0;
  for (const opened of openedFlags) {
    if (opened) break;
    streak += 1;
  }
  return streak;
}

/**
 * Collapses candidates that talk about the same thing down to the single
 * highest scorer.
 *
 * This is the structural cure for the duplicate-deadline class of bug: three
 * senders that each independently decided to mention opportunity X produce one
 * notification, by construction, rather than by each sender remembering to
 * check on the others. Candidates with no entity (`entity_type` and `entity_id`
 * both null) are never collapsed — they are not about anything in particular,
 * so they cannot be about the *same* thing.
 *
 * Ties break on the higher score, then the earlier `createdAt`, then id, so the
 * result is deterministic. Input order is otherwise preserved.
 */
export function collapseByEntity<T extends ScoredCandidate>(scored: T[]): T[] {
  const winners = new Map<string, T>();
  const order: string[] = [];

  for (const candidate of scored) {
    const key =
      candidate.entityType === null && candidate.entityId === null
        ? `__unkeyed__:${candidate.id}`
        : `${candidate.entityType ?? ""}:${candidate.entityId ?? ""}`;

    const incumbent = winners.get(key);
    if (!incumbent) {
      winners.set(key, candidate);
      order.push(key);
      continue;
    }
    if (beats(candidate, incumbent)) winners.set(key, candidate);
  }

  return order.map((key) => winners.get(key) as T);
}

function beats(a: ScoredCandidate, b: ScoredCandidate): boolean {
  if (a.score !== b.score) return a.score > b.score;
  const aTime = a.createdAt?.getTime() ?? 0;
  const bTime = b.createdAt?.getTime() ?? 0;
  if (aTime !== bTime) return aTime < bTime;
  return a.id < b.id;
}

/**
 * The hour of day (0–23) at which this user most often opens notifications, or
 * null while we have too little evidence ({@link MODAL_HOUR_MIN_OPENS}).
 * Ties go to the earlier hour.
 */
export function modalOpenHour(
  openHourCounts: Record<number, number> | null | undefined,
  totalOpens: number,
): number | null {
  if (!openHourCounts) return null;
  if (!Number.isFinite(totalOpens) || totalOpens < MODAL_HOUR_MIN_OPENS) {
    return null;
  }

  let bestHour: number | null = null;
  let bestCount = 0;
  for (const [rawHour, rawCount] of Object.entries(openHourCounts)) {
    const hour = Number(rawHour);
    const count = Number(rawCount);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (!Number.isFinite(count) || count <= 0) continue;
    if (count > bestCount || (count === bestCount && hour < (bestHour ?? 24))) {
      bestHour = hour;
      bestCount = count;
    }
  }
  return bestHour;
}

/**
 * The next UTC instant at which the user's local wall clock reads
 * `hour:minute`. If that is exactly now, now is returned.
 *
 * Advancing the UTC instant by the local minutes-until-target sidesteps
 * offset/DST arithmetic entirely — the same trick `deferForQuietHours` uses.
 */
export function nextLocalTimeUtc(
  now: Date,
  timezone: string | null | undefined,
  hour: number,
  minute: number,
): Date {
  const nowMins = localMinutes(now, timezone);
  const target = (hour % 24) * 60 + minute;
  let delta = target - nowMins;
  if (delta < 0) delta += 24 * 60;
  return new Date(now.getTime() + delta * 60_000);
}

/**
 * When to deliver: 08:30 in the user's own timezone by default, or the hour
 * they actually open things once we have enough opens to believe it.
 *
 * Quiet hours are NOT applied here — `NotificationsService.broadcast()` owns
 * that, and duplicating it would double-defer.
 */
export function resolveSendTime(input: {
  now: Date;
  timezone?: string | null;
  openHourCounts?: Record<number, number> | null;
  totalOpens?: number;
}): Date {
  const modal = modalOpenHour(input.openHourCounts, input.totalOpens ?? 0);
  const hour = modal ?? DEFAULT_SEND_HOUR;
  const minute = modal === null ? DEFAULT_SEND_MINUTE : 0;
  return nextLocalTimeUtc(input.now, input.timezone, hour, minute);
}

/**
 * Scores one user's pending candidates end to end: score → suppress → collapse.
 *
 * Returns the survivors ordered best-first, with muted kinds (`score === 0`)
 * already dropped. Split out from the service so the whole pipeline — not just
 * its individual rules — is testable without a database.
 */
export function rankCandidates(input: {
  candidates: ScorableCandidate[];
  engagementByKind: Map<string, KindEngagement>;
  globalOpenRateByKind: Map<string, number>;
  now: Date;
}): ScoredCandidate[] {
  const { candidates, engagementByKind, globalOpenRateByKind, now } = input;

  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const engagement = engagementByKind.get(candidate.kind);
    const multiplier = engagementMultiplier({
      deliveredCount: engagement?.deliveredCount ?? 0,
      openedCount: engagement?.openedCount ?? 0,
      globalOpenRate: globalOpenRateByKind.get(candidate.kind) ?? 0,
    });
    const suppression = kindSuppression({
      consecutiveUnopened: engagement?.consecutiveUnopened ?? 0,
      lastDeliveredAt: engagement?.lastDeliveredAt ?? null,
      now,
    });
    if (suppression.multiplier === 0) continue;

    const base = scoreCandidate({
      urgency: candidate.urgency,
      relevance: candidate.relevance,
      ageHours: ageInHours(candidate.createdAt, now),
      engagementMultiplier: multiplier,
    });

    scored.push({ ...candidate, score: base * suppression.multiplier });
  }

  return collapseByEntity(scored)
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => (beats(a, b) ? -1 : 1));
}

/**
 * Buckets raw `opened_at` instants into a histogram of the user's LOCAL hour.
 *
 * Bucketing in UTC would put a Lagos user's 08:00 habit in the 07:00 bucket and
 * a Los Angeles user's in the 16:00 one, which is how "personalised send time"
 * quietly becomes "random send time".
 */
export function buildOpenHourHistogram(
  openedAt: Date[],
  timezone: string | null | undefined,
): { counts: Record<number, number>; total: number } {
  const counts: Record<number, number> = {};
  let total = 0;
  for (const instant of openedAt) {
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) continue;
    const hour = Math.floor(localMinutes(instant, timezone) / 60) % 24;
    counts[hour] = (counts[hour] ?? 0) + 1;
    total += 1;
  }
  return { counts, total };
}
