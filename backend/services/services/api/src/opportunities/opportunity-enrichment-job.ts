export const ENRICHMENT_FRESHNESS_DAYS = 30;
export const ENRICHMENT_MIN_QUALITY_SCORE = 70;

export type OpportunityEnrichmentJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed";

export interface OpportunityEnrichmentJobError {
  opportunityId?: string;
  title?: string | null;
  message: string;
}
export interface OpportunityEnrichmentJob {
  id: string;
  status: OpportunityEnrichmentJobStatus;
  opportunityIds: string[];
  total: number;
  nextIndex: number;
  completed: number;
  skipped: number;
  failed: number;
  currentOpportunityId: string | null;
  currentOpportunityTitle: string | null;
  errors: OpportunityEnrichmentJobError[];
  createdBy: string | null;
  workerId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt: string | null;
  leaseExpiresAt: string | null;
}

interface EnhancementCandidate {
  quality_score?: unknown;
  metadata?: Record<string, unknown> | null;
}

interface EnrichmentCounters {
  total: number;
  completed: number;
  skipped: number;
  failed: number;
}

export function shouldSkipOpportunityEnhancement(
  opportunity: EnhancementCandidate,
  now = new Date(),
): boolean {
  const metadata =
    opportunity.metadata && typeof opportunity.metadata === "object"
      ? opportunity.metadata
      : {};
  const score = Number(
    opportunity.quality_score ?? metadata.extraction_quality_score ?? 0,
  );
  if (!Number.isFinite(score) || score < ENRICHMENT_MIN_QUALITY_SCORE) {
    return false;
  }

  const improvedAt = metadata.ai_improved_at;
  if (typeof improvedAt !== "string") return false;
  const improvedTime = new Date(improvedAt).getTime();
  if (!Number.isFinite(improvedTime)) return false;

  const freshnessMs = ENRICHMENT_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
  const ageMs = now.getTime() - improvedTime;
  return ageMs >= 0 && ageMs <= freshnessMs;
}

export function enrichmentJobProgress(counters: EnrichmentCounters): {
  processed: number;
  percent: number;
  remaining: number;
} {
  const total = Math.max(0, Math.floor(Number(counters.total) || 0));
  const processed = Math.min(
    total,
    Math.max(
      0,
      Math.floor(Number(counters.completed) || 0) +
        Math.floor(Number(counters.skipped) || 0) +
        Math.floor(Number(counters.failed) || 0),
    ),
  );

  return {
    processed,
    percent: total === 0 ? 0 : Math.round((processed / total) * 100),
    remaining: Math.max(0, total - processed),
  };
}
