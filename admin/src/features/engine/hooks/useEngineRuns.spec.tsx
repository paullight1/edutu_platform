import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeJob, ScrapedOpportunity } from "../model/types";
import {
  toBulkImportItem,
  useEngineRuns,
} from "./useEngineRuns";

const api = vi.hoisted(() => ({
  listJobs: vi.fn(),
  getJobOpportunities: vi.fn(),
  deleteJob: vi.fn(),
  enhancePreview: vi.fn(),
  bulkImport: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

function job(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
  return {
    id: "job-1",
    source_id: 4,
    source_name: "Opportunity Desk",
    run_type: "manual",
    status: "completed",
    urls_discovered: 3,
    urls_scraped: 3,
    urls_saved: 2,
    urls_failed: 0,
    items_found: 2,
    source_results: null,
    errors: [],
    warnings: [],
    duration_seconds: 12,
    started_at: "2026-08-24T09:00:00.000Z",
    completed_at: "2026-08-24T09:00:12.000Z",
    ...overrides,
  };
}

function opportunity(
  index: number,
  overrides: Partial<ScrapedOpportunity> = {},
): ScrapedOpportunity {
  return {
    id: `opp-${index}`,
    title: `Opportunity ${index}`,
    source: "Opportunity Desk",
    sourceUrl: `https://example.org/opportunities/${index}`,
    applyUrl: `https://example.org/apply/${index}`,
    category: "scholarship",
    description: `Description ${index}`,
    ...overrides,
  };
}

describe("toBulkImportItem", () => {
  it("preserves verified source/apply fields and rejects rows with no source URL", () => {
    expect(
      toBulkImportItem(
        opportunity(1, {
          sourceUrl: undefined,
          source_url: "https://source.example.org/award",
          applyUrl: undefined,
          application_url: "https://apply.example.org/award",
          requirements: ["First requirement", "Second requirement"],
          funding_type: "fully_funded",
          target_region: "Africa",
        }),
      ),
    ).toMatchObject({
      title: "Opportunity 1",
      sourceUrl: "https://source.example.org/award",
      applyUrl: "https://apply.example.org/award",
      eligibilityCriteria: "First requirement\nSecond requirement",
      fundingType: "fully_funded",
      targetRegion: "Africa",
      status: "pending",
    });

    expect(
      toBulkImportItem(
        opportunity(2, {
          sourceUrl: undefined,
          source_url: undefined,
          applyUrl: undefined,
          apply_url: undefined,
          application_url: undefined,
        }),
      ),
    ).toBeNull();
  });
});

describe("useEngineRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listJobs.mockResolvedValue([]);
    api.getJobOpportunities.mockResolvedValue([]);
    api.deleteJob.mockResolvedValue({ success: true });
    api.enhancePreview.mockImplementation(async (item: ScrapedOpportunity) => ({
      success: true,
      opportunity: { ...item, title: `${item.title} improved` },
    }));
    api.bulkImport.mockImplementation(async (items: unknown[]) => ({
      success: true,
      inserted: items.length,
      skipped: 0,
    }));
  });

  it("keeps a failed history request distinct from a successful empty history", async () => {
    api.listJobs.mockRejectedValue(new Error("jobs unavailable"));

    const { result } = renderHook(() => useEngineRuns());

    await waitFor(() => expect(result.current.jobs.status).toBe("error"));
    expect(result.current.jobs.data).toBeNull();
    expect(result.current.jobs.error).not.toBeNull();
  });

  it("loads one job's opportunities into a selected, reviewable before/after model", async () => {
    const currentJob = job({
      id: "job-review",
      errors: [{ message: "one source timed out" }],
      warnings: ["two records need review"],
    });
    api.listJobs.mockResolvedValue([currentJob]);
    api.getJobOpportunities.mockResolvedValue([
      opportunity(1),
      opportunity(2),
    ]);

    const { result } = renderHook(() => useEngineRuns());
    await waitFor(() => expect(result.current.jobs.status).toBe("success"));

    await act(async () => {
      await result.current.inspectJob(currentJob);
    });

    expect(api.getJobOpportunities).toHaveBeenCalledWith("job-review");
    expect(result.current.selectedJob).toEqual(currentJob);
    expect(result.current.opportunities.status).toBe("success");
    expect(result.current.opportunities.data).toEqual([
      {
        original: opportunity(1),
        current: opportunity(1),
        selected: true,
        improving: false,
        error: null,
      },
      {
        original: opportunity(2),
        current: opportunity(2),
        selected: true,
        improving: false,
        error: null,
      },
    ]);
  });

  it("caps AI improvement at three concurrent requests and preserves each original", async () => {
    const items = Array.from({ length: 8 }, (_, index) => opportunity(index + 1));
    api.getJobOpportunities.mockResolvedValue(items);
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    api.enhancePreview.mockImplementation(
      (item: ScrapedOpportunity) =>
        new Promise((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve({
              success: true,
              opportunity: { ...item, description: `${item.description} improved` },
            });
          });
        }),
    );

    const { result } = renderHook(() => useEngineRuns());
    await waitFor(() => expect(result.current.jobs.status).toBe("success"));
    await act(async () => {
      await result.current.inspectJob(job());
    });

    let improving!: Promise<void>;
    act(() => {
      improving = result.current.improveSelected();
    });

    await waitFor(() => expect(releases.length).toBe(3));
    while (releases.length > 0 || active > 0) {
      const release = releases.shift();
      if (release) {
        await act(async () => release());
      } else {
        await Promise.resolve();
      }
    }
    await act(async () => improving);

    expect(maxActive).toBe(3);
    expect(result.current.opportunities.data?.every((entry) =>
      entry.current.description?.endsWith(" improved"),
    )).toBe(true);
    expect(result.current.opportunities.data?.[0]?.original.description).toBe(
      "Description 1",
    );
  });

  it("saves selected opportunities in parallel batches of 100 and aggregates outcomes", async () => {
    const items = Array.from({ length: 205 }, (_, index) => opportunity(index + 1));
    api.getJobOpportunities.mockResolvedValue(items);
    api.bulkImport
      .mockResolvedValueOnce({ success: true, inserted: 98, skipped: 2 })
      .mockResolvedValueOnce({ success: true, inserted: 100, skipped: 0 })
      .mockResolvedValueOnce({ success: false, error: "provider unavailable" });

    const { result } = renderHook(() => useEngineRuns());
    await waitFor(() => expect(result.current.jobs.status).toBe("success"));
    await act(async () => {
      await result.current.inspectJob(job());
    });

    let outcome;
    await act(async () => {
      outcome = await result.current.saveSelected();
    });

    expect(api.bulkImport).toHaveBeenCalledTimes(3);
    expect(api.bulkImport.mock.calls.map(([batch]) => batch.length)).toEqual([
      100,
      100,
      5,
    ]);
    expect(outcome).toEqual({ inserted: 198, skipped: 2, failed: 5 });
  });

  it("refreshes history after a new run completion token and after deletion", async () => {
    api.listJobs.mockResolvedValue([job()]);
    const { result, rerender } = renderHook(
      ({ completionToken }) => useEngineRuns(completionToken),
      { initialProps: { completionToken: null as number | null } },
    );
    await waitFor(() => expect(api.listJobs).toHaveBeenCalledTimes(1));

    rerender({ completionToken: 123 });
    await waitFor(() => expect(api.listJobs).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.deleteJob(job());
    });
    expect(api.deleteJob).toHaveBeenCalledWith("job-1");
    expect(api.listJobs).toHaveBeenCalledTimes(3);
  });
});
