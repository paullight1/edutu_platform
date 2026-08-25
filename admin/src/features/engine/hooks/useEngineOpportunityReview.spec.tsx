import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapedOpportunity } from "../model/types";
import {
  toBulkImportItem,
  useEngineOpportunityReview,
} from "./useEngineOpportunityReview";

const api = vi.hoisted(() => ({
  getJobOpportunities: vi.fn(),
  enhancePreview: vi.fn(),
  bulkImport: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

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

describe("useEngineOpportunityReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getJobOpportunities.mockResolvedValue([]);
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

  it("keeps failed review loading distinct from a successful empty job", async () => {
    api.getJobOpportunities.mockRejectedValue(new Error("review unavailable"));
    const { result } = renderHook(() => useEngineOpportunityReview());

    await act(async () => {
      await result.current.load("job-failed");
    });

    expect(result.current.opportunities.status).toBe("error");
    expect(result.current.opportunities.data).toBeNull();
    expect(result.current.opportunities.error).not.toBeNull();
  });

  it("loads selected before/after review entries and can reset them", async () => {
    api.getJobOpportunities.mockResolvedValue([
      opportunity(1),
      opportunity(2),
    ]);
    const { result } = renderHook(() => useEngineOpportunityReview());

    await act(async () => {
      await result.current.load("job-review");
    });

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

    act(() => result.current.reset());
    expect(result.current.opportunities.status).toBe("idle");
    expect(result.current.opportunities.data).toBeNull();
  });

  it("caps AI improvement at three concurrent requests and preserves originals", async () => {
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
              opportunity: {
                ...item,
                description: `${item.description} improved`,
              },
            });
          });
        }),
    );

    const { result } = renderHook(() => useEngineOpportunityReview());
    await act(async () => {
      await result.current.load("job-review");
    });

    let improving!: Promise<void>;
    act(() => {
      improving = result.current.improveSelected();
    });

    await waitFor(() => expect(releases.length).toBe(3));
    while (releases.length > 0 || active > 0) {
      const release = releases.shift();
      if (release) await act(async () => release());
      else await Promise.resolve();
    }
    await act(async () => improving);

    expect(maxActive).toBe(3);
    expect(
      result.current.opportunities.data?.every((entry) =>
        entry.current.description?.endsWith(" improved"),
      ),
    ).toBe(true);
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

    const { result } = renderHook(() => useEngineOpportunityReview());
    await act(async () => {
      await result.current.load("job-review");
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
});
