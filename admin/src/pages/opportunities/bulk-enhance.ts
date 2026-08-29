export interface BulkEnhanceResponse {
  success?: boolean;
  processed?: number;
  enhanced?: number;
  failed?: number;
}

export interface BulkEnhanceProgress {
  done: number;
  total: number;
  completed: number;
  failed: number;
  batchIds: string[];
}

export interface BulkEnhanceBatchStart extends BulkEnhanceProgress {
  batchStart: number;
  batchEnd: number;
}

export interface BulkEnhanceRunResult {
  completed: number;
  failed: number;
  cancelled: boolean;
  remainingIds: string[];
}

export interface BulkEnhanceRunOptions {
  signal?: AbortSignal;
  onBatchStart?: (progress: BulkEnhanceBatchStart) => void;
}

type RequestBatch = (ids: readonly string[]) => Promise<BulkEnhanceResponse>;

const BULK_ENHANCE_BATCH_SIZE = 3;

export class BulkEnhancementFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkEnhancementFatalError";
  }
}

function boundedCount(value: unknown, maximum: number): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.min(Math.max(Math.trunc(count), 0), maximum);
}

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Collapse a large AI-complete selection into small, sequential API batches.
 * The backend also processes each batch sequentially, keeping both Nest and
 * the configured AI provider out of burst-rate-limit territory.
 */
export async function runBulkOpportunityEnhancement(
  ids: readonly string[],
  requestBatch: RequestBatch,
  onProgress?: (progress: BulkEnhanceProgress) => void,
  options: BulkEnhanceRunOptions = {},
): Promise<BulkEnhanceRunResult> {
  let completed = 0;
  let failed = 0;
  const failedIds: string[] = [];

  for (let offset = 0; offset < ids.length; offset += BULK_ENHANCE_BATCH_SIZE) {
    if (options.signal?.aborted) {
      return {
        completed,
        failed,
        cancelled: true,
        remainingIds: uniqueIds([...failedIds, ...ids.slice(offset)]),
      };
    }

    const batchIds = ids.slice(offset, offset + BULK_ENHANCE_BATCH_SIZE);
    options.onBatchStart?.({
      done: completed + failed,
      total: ids.length,
      completed,
      failed,
      batchIds: [...batchIds],
      batchStart: offset + 1,
      batchEnd: offset + batchIds.length,
    });

    try {
      const result = await requestBatch(batchIds);
      if (!result.success) throw new Error("AI enhancement batch failed");

      const batchCompleted = boundedCount(result.enhanced, batchIds.length);
      completed += batchCompleted;
      // Treat any unaccounted rows as failed so progress can never stall.
      const batchFailed = batchIds.length - batchCompleted;
      failed += batchFailed;
      if (batchFailed > 0) failedIds.push(...batchIds);
    } catch (error) {
      if (error instanceof BulkEnhancementFatalError) throw error;
      if (options.signal?.aborted) {
        return {
          completed,
          failed,
          cancelled: true,
          remainingIds: uniqueIds([...failedIds, ...ids.slice(offset)]),
        };
      }
      failed += batchIds.length;
      failedIds.push(...batchIds);
    }

    onProgress?.({
      done: completed + failed,
      total: ids.length,
      completed,
      failed,
      batchIds: [...batchIds],
    });
  }

  return {
    completed,
    failed,
    cancelled: false,
    remainingIds: uniqueIds(failedIds),
  };
}
