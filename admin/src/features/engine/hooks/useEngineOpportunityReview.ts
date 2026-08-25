import { useCallback, useEffect, useRef, useState } from "react";
import { engineApi } from "../api/engineApi";
import {
  errorResource,
  idleResource,
  loadingResource,
  successResource,
  type EngineResourceState,
} from "../model/errors";
import type {
  BulkImportItem,
  ScrapedOpportunity,
} from "../model/types";

export interface ReviewedOpportunity {
  original: ScrapedOpportunity;
  current: ScrapedOpportunity;
  selected: boolean;
  improving: boolean;
  error: string | null;
}

export interface SaveSelectedOutcome {
  inserted: number;
  skipped: number;
  failed: number;
}

export interface EngineOpportunityReviewState {
  opportunities: EngineResourceState<ReviewedOpportunity[]>;
  pendingOperations: ReadonlySet<string>;
  load(jobId: string): Promise<void>;
  reset(): void;
  toggleSelected(index: number): void;
  selectAll(): void;
  improveSelected(): Promise<void>;
  saveSelected(): Promise<SaveSelectedOutcome>;
}

function sourceUrlFor(opportunity: ScrapedOpportunity): string {
  return (
    opportunity.sourceUrl ||
    opportunity.source_url ||
    opportunity.applyUrl ||
    opportunity.apply_url ||
    opportunity.application_url ||
    ""
  );
}

function applyUrlFor(
  opportunity: ScrapedOpportunity,
  sourceUrl: string,
): string {
  return (
    opportunity.applyUrl ||
    opportunity.apply_url ||
    opportunity.application_url ||
    sourceUrl
  );
}

export function toBulkImportItem(
  opportunity: ScrapedOpportunity,
): BulkImportItem | null {
  const sourceUrl = sourceUrlFor(opportunity);
  if (!sourceUrl) return null;

  return {
    title: opportunity.title,
    summary: opportunity.summary || undefined,
    description: opportunity.description || undefined,
    category: opportunity.category || undefined,
    organization: opportunity.organization || undefined,
    location: opportunity.location || undefined,
    type: opportunity.category || "scholarship",
    eligibilityCriteria: opportunity.requirements?.length
      ? opportunity.requirements.join("\n")
      : undefined,
    fundingType: opportunity.funding_type || undefined,
    targetRegion: opportunity.target_region || undefined,
    deadline: opportunity.deadline || undefined,
    sourceUrl,
    applyUrl: applyUrlFor(opportunity, sourceUrl),
    imageUrl: opportunity.imageUrl || opportunity.image_url || undefined,
    eligibility: opportunity.eligibility || undefined,
    isFeatured: false,
    isRemote: /\bremote\b/iu.test(opportunity.location || ""),
    status: "pending",
    tags: [],
  };
}

function reviewItems(
  opportunities: readonly ScrapedOpportunity[],
): ReviewedOpportunity[] {
  return opportunities.map((opportunity) => ({
    original: opportunity,
    current: opportunity,
    selected: true,
    improving: false,
    error: null,
  }));
}

async function runWithConcurrency(
  indexes: readonly number[],
  concurrency: number,
  worker: (index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(concurrency, indexes.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < indexes.length) {
        const position = cursor;
        cursor += 1;
        await worker(indexes[position]);
      }
    }),
  );
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function useEngineOpportunityReview(): EngineOpportunityReviewState {
  const [opportunities, setOpportunities] = useState<
    EngineResourceState<ReviewedOpportunity[]>
  >(idleResource);
  const [pendingOperations, setPendingOperations] = useState<Set<string>>(
    () => new Set(),
  );
  const requestVersion = useRef(0);

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );

  const withPending = useCallback(
    async <T,>(operationId: string, operation: () => Promise<T>): Promise<T> => {
      setPendingOperations((current) => new Set(current).add(operationId));
      try {
        return await operation();
      } finally {
        setPendingOperations((current) => {
          const next = new Set(current);
          next.delete(operationId);
          return next;
        });
      }
    },
    [],
  );

  const load = useCallback(async (jobId: string) => {
    const version = ++requestVersion.current;
    setOpportunities((previous) => loadingResource(previous));

    try {
      const items = await engineApi.getJobOpportunities(jobId);
      if (version === requestVersion.current) {
        setOpportunities(successResource(reviewItems(items)));
      }
    } catch (error) {
      if (version === requestVersion.current) {
        setOpportunities((previous) =>
          errorResource(
            error,
            "The opportunities for this run are unavailable.",
            previous.data,
          ),
        );
      }
    }
  }, []);

  const reset = useCallback(() => {
    requestVersion.current += 1;
    setOpportunities(idleResource());
    setPendingOperations(new Set());
  }, []);

  const toggleSelected = useCallback((index: number) => {
    setOpportunities((current) => {
      if (!current.data) return current;
      return successResource(
        current.data.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, selected: !entry.selected }
            : entry,
        ),
      );
    });
  }, []);

  const selectAll = useCallback(() => {
    setOpportunities((current) => {
      if (!current.data) return current;
      const select = !current.data.every((entry) => entry.selected);
      return successResource(
        current.data.map((entry) => ({ ...entry, selected: select })),
      );
    });
  }, []);

  const improveSelected = useCallback(async () => {
    const snapshot = opportunities.data ?? [];
    const indexes = snapshot
      .map((entry, index) => (entry.selected ? index : -1))
      .filter((index) => index >= 0);
    if (indexes.length === 0) return;

    setOpportunities(
      successResource(
        snapshot.map((entry, index) =>
          indexes.includes(index)
            ? { ...entry, improving: true, error: null }
            : entry,
        ),
      ),
    );

    await withPending("improve-opportunities", () =>
      runWithConcurrency(indexes, 3, async (index) => {
        const originalEntry = snapshot[index];
        try {
          const result = await engineApi.enhancePreview(originalEntry.current);
          if (!result.success || !result.opportunity) {
            throw new Error(result.error || "AI improvement failed");
          }
          setOpportunities((current) => {
            if (!current.data) return current;
            return successResource(
              current.data.map((entry, entryIndex) =>
                entryIndex === index
                  ? {
                      ...entry,
                      current: result.opportunity!,
                      improving: false,
                      error: null,
                    }
                  : entry,
              ),
            );
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "AI improvement failed";
          setOpportunities((current) => {
            if (!current.data) return current;
            return successResource(
              current.data.map((entry, entryIndex) =>
                entryIndex === index
                  ? { ...entry, improving: false, error: message }
                  : entry,
              ),
            );
          });
        }
      }),
    );
  }, [opportunities.data, withPending]);

  const saveSelected = useCallback(async (): Promise<SaveSelectedOutcome> => {
    const selected = (opportunities.data ?? []).filter((entry) => entry.selected);
    const items = selected
      .map((entry) => toBulkImportItem(entry.current))
      .filter((item): item is BulkImportItem => Boolean(item));
    const invalidCount = selected.length - items.length;
    if (items.length === 0) {
      return { inserted: 0, skipped: 0, failed: invalidCount };
    }

    return withPending("save-opportunities", async () => {
      const results = await Promise.all(
        chunks(items, 100).map(async (batch) => {
          try {
            const result = await engineApi.bulkImport(batch);
            if (!result.success) {
              return { inserted: 0, skipped: 0, failed: batch.length };
            }
            return {
              inserted: result.inserted || 0,
              skipped: result.skipped || 0,
              failed: 0,
            };
          } catch {
            return { inserted: 0, skipped: 0, failed: batch.length };
          }
        }),
      );

      return results.reduce<SaveSelectedOutcome>(
        (total, result) => ({
          inserted: total.inserted + result.inserted,
          skipped: total.skipped + result.skipped,
          failed: total.failed + result.failed,
        }),
        { inserted: 0, skipped: 0, failed: invalidCount },
      );
    });
  }, [opportunities.data, withPending]);

  return {
    opportunities,
    pendingOperations,
    load,
    reset,
    toggleSelected,
    selectAll,
    improveSelected,
    saveSelected,
  };
}
