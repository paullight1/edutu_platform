/**
 * Shared shapes for the notification scheduler (v2).
 *
 * Kept free of Nest/drizzle imports so the pure scoring layer and its tests can
 * depend on them without dragging in the database.
 */

/** A row of `public.notification_candidates`, as returned by raw SQL. */
export interface NotificationCandidateRow {
  id: string;
  user_id: string;
  kind: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  /** `numeric` comes back from pg as a string; parse before arithmetic. */
  urgency: string | number;
  relevance: string | number;
  expires_at: string | null;
  created_at: string;
  consumed_at: string | null;
}

/** A candidate normalised into plain numbers, ready to score. */
export interface ScorableCandidate {
  id: string;
  userId: string;
  kind: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  urgency: number;
  relevance: number;
  createdAt: Date;
}

/** A candidate with its final score attached. */
export interface ScoredCandidate extends ScorableCandidate {
  score: number;
}

/** Trailing-30-day delivery/open counters for one (user, kind) pair. */
export interface KindEngagement {
  deliveredCount: number;
  openedCount: number;
  /** Length of the current run of delivered-but-unopened notifications. */
  consecutiveUnopened: number;
  /** Most recent `delivered_at` for the pair, used to date the skip window. */
  lastDeliveredAt: Date | null;
}

/** Everything the scheduler needs to know about one user, loaded once per run. */
export interface UserSchedulingContext {
  userId: string;
  /** IANA timezone from `profiles.timezone`; null falls back to UTC. */
  timezone: string | null;
  /** Histogram of the hour-of-day (local) at which this user opens things. */
  openHourCounts: Record<number, number>;
  /** Total recorded opens, i.e. the sum of `openHourCounts`. */
  totalOpens: number;
  /** Engagement counters keyed by notification kind. */
  engagementByKind: Map<string, KindEngagement>;
}

/**
 * Unwraps a drizzle `db.execute()` result.
 *
 * `db` is `drizzle-orm/node-postgres`, so `execute()` resolves to a pg
 * `QueryResult` OBJECT (`{ rows, rowCount }`) — it is NOT an array and is NOT
 * iterable. Iterating it directly yields nothing, silently, which is exactly
 * the bug that left an earlier version of this system dead in production.
 * Handles both shapes so a driver swap cannot resurrect it.
 */
export function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] } | null)?.rows ?? [];
}
