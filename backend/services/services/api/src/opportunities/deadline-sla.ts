/**
 * Deadline SLA for the recommendation feed.
 *
 * Policy: an active opportunity should carry a real deadline or an explicit
 * "rolling" classification. One that has neither is in limbo — it can never
 * expire and its date is unconfirmed, which erodes trust if it rides the top
 * rails. After a grace window (giving the verifier's deadline-recovery cron
 * time to find a date), such rows are DEPRIORITIZED — not dropped. A hard drop
 * would gut the feed while a large share of the catalog is still dateless; a
 * soft penalty nudges quality up and lifts automatically as deadlines fill in.
 */

/** Hours after first-seen before a dateless-unknown row is penalized. */
export const DEADLINE_SLA_GRACE_HOURS = 72;

/** Match-score points removed from a limbo opportunity (scale is 0–100). */
export const DEADLINE_SLA_PENALTY = 15;

export function deadlineSlaPenalty(input: {
  hasDate: boolean;
  confidence: string | null | undefined;
  firstSeenAt: Date | string | null | undefined;
  now?: Date;
}): number {
  // A real date or an explicit rolling classification satisfies the SLA.
  if (input.hasDate) return 0;
  if (input.confidence === "rolling") return 0;

  // Within the grace window, give the recovery cron a chance — don't penalize
  // a brand-new row that simply hasn't been re-checked yet.
  const firstSeen = input.firstSeenAt ? new Date(input.firstSeenAt) : null;
  const now = input.now ?? new Date();
  if (firstSeen && !Number.isNaN(firstSeen.getTime())) {
    const ageHours = (now.getTime() - firstSeen.getTime()) / 3_600_000;
    if (ageHours < DEADLINE_SLA_GRACE_HOURS) return 0;
  }

  // No date, not rolling, past grace (or unknown age) → deprioritize.
  return DEADLINE_SLA_PENALTY;
}
