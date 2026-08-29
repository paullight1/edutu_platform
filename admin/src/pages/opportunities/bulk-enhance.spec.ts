import { describe, expect, it, vi } from "vitest";
import {
  BulkEnhancementFatalError,
  runBulkOpportunityEnhancement,
} from "./bulk-enhance";

describe("runBulkOpportunityEnhancement", () => {
  it("collapses a large selection into bounded sequential backend batches", async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `opp-${index + 1}`);
    let active = 0;
    let maxActive = 0;
    const requestBatch = vi.fn(async (batch: readonly string[]) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        success: true,
        processed: batch.length,
        enhanced: batch.length,
        failed: 0,
      };
    });
    const progress = vi.fn();

    await expect(
      runBulkOpportunityEnhancement(ids, requestBatch, progress),
    ).resolves.toEqual({
      completed: 61,
      failed: 0,
      cancelled: false,
      remainingIds: [],
    });

    expect(requestBatch).toHaveBeenCalledTimes(21);
    expect(requestBatch.mock.calls.every(([batch]) => batch.length <= 3)).toBe(
      true,
    );
    expect(maxActive).toBe(1);
    expect(progress).toHaveBeenLastCalledWith({
      done: 61,
      total: 61,
      completed: 61,
      failed: 0,
      batchIds: ["opp-61"],
    });
  });

  it("counts a rejected backend batch without aborting the remaining selection", async () => {
    let call = 0;
    const requestBatch = vi.fn(async (batch: readonly string[]) => {
      call += 1;
      if (call === 1) throw new Error("temporary backend failure");
      return {
        success: true,
        processed: batch.length,
        enhanced: batch.length,
        failed: 0,
      };
    });

    await expect(
      runBulkOpportunityEnhancement(
        Array.from({ length: 12 }, (_, index) => `opp-${index + 1}`),
        requestBatch,
      ),
    ).resolves.toEqual({
      completed: 9,
      failed: 3,
      cancelled: false,
      remainingIds: ["opp-1", "opp-2", "opp-3"],
    });
  });

  it("reports the active batch before waiting for its network response", async () => {
    let resolveBatch!: (value: {
      success: boolean;
      processed: number;
      enhanced: number;
      failed: number;
    }) => void;
    const pendingBatch = new Promise<{
      success: boolean;
      processed: number;
      enhanced: number;
      failed: number;
    }>((resolve) => {
      resolveBatch = resolve;
    });
    const onBatchStart = vi.fn();
    const run = runBulkOpportunityEnhancement(
      ["opp-1", "opp-2", "opp-3", "opp-4"],
      () => pendingBatch,
      undefined,
      { onBatchStart },
    );

    await Promise.resolve();
    expect(onBatchStart).toHaveBeenCalledWith({
      done: 0,
      total: 4,
      completed: 0,
      failed: 0,
      batchIds: ["opp-1", "opp-2", "opp-3"],
      batchStart: 1,
      batchEnd: 3,
    });

    resolveBatch({ success: true, processed: 3, enhanced: 3, failed: 0 });
    await run;
  });

  it("stops scheduling batches after cancellation and returns unfinished IDs", async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `opp-${index + 1}`);
    const controller = new AbortController();
    const requestBatch = vi.fn(async (batch: readonly string[]) => ({
      success: true,
      processed: batch.length,
      enhanced: batch.length,
      failed: 0,
    }));

    const result = await runBulkOpportunityEnhancement(
      ids,
      requestBatch,
      ({ done }) => {
        if (done === 3) controller.abort();
      },
      { signal: controller.signal },
    );

    expect(result).toEqual({
      completed: 3,
      failed: 0,
      cancelled: true,
      remainingIds: ["opp-4", "opp-5", "opp-6", "opp-7", "opp-8"],
    });
    expect(requestBatch).toHaveBeenCalledTimes(1);
  });

  it("does not count an aborted active batch as failed", async () => {
    const controller = new AbortController();
    const requestBatch = vi.fn(async () => {
      controller.abort();
      throw new DOMException("The operation was aborted", "AbortError");
    });

    await expect(
      runBulkOpportunityEnhancement(
        ["opp-1", "opp-2", "opp-3", "opp-4"],
        requestBatch,
        undefined,
        { signal: controller.signal },
      ),
    ).resolves.toEqual({
      completed: 0,
      failed: 0,
      cancelled: true,
      remainingIds: ["opp-1", "opp-2", "opp-3", "opp-4"],
    });
  });

  it("stops immediately when authentication cannot be refreshed", async () => {
    const requestBatch = vi
      .fn()
      .mockRejectedValue(
        new BulkEnhancementFatalError("Admin session expired"),
      );

    await expect(
      runBulkOpportunityEnhancement(
        Array.from({ length: 12 }, (_, index) => `opp-${index + 1}`),
        requestBatch,
      ),
    ).rejects.toThrow("Admin session expired");
    expect(requestBatch).toHaveBeenCalledTimes(1);
  });
});
