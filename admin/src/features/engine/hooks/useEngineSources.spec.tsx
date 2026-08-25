import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeSource } from "../model/types";
import {
  canRunSource,
  parseBulkSourceLines,
  useEngineSources,
} from "./useEngineSources";

const api = vi.hoisted(() => ({
  listSources: vi.fn(),
  listSites: vi.fn(),
  getStats: vi.fn(),
  createSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  deleteSiteOpportunities: vi.fn(),
  openRunStream: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

function source(overrides: Partial<ScrapeSource> = {}): ScrapeSource {
  return {
    id: 1,
    name: "Opportunity Desk",
    url: "https://example.com/opportunities",
    tier: 1,
    category: "scholarship",
    enabled: true,
    priority: 1,
    last_scraped: null,
    last_success: null,
    last_error: null,
    total_scraped: 0,
    total_failed: 0,
    parent_id: null,
    is_group: false,
    ...overrides,
  };
}

describe("parseBulkSourceLines", () => {
  it("accepts Name | URL and bare URL lines while reporting invalid and duplicate rows", () => {
    expect(
      parseBulkSourceLines(`
        Scholarships Hub | https://example.com/scholarships/
        https://second.example.org/listings
        Duplicate | https://example.com/scholarships
        not-a-url
      `),
    ).toEqual({
      entries: [
        {
          name: "Scholarships Hub",
          url: "https://example.com/scholarships",
          line: 2,
        },
        {
          name: "second.example.org",
          url: "https://second.example.org/listings",
          line: 3,
        },
      ],
      duplicateLines: [4],
      invalidLines: [5],
    });
  });
});

describe("canRunSource", () => {
  it("blocks disabled sources and groups with no enabled children", () => {
    const disabled = source({ enabled: false });
    const emptyGroup = source({ id: 10, is_group: true, url: "", enabled: true });
    const enabledChild = source({ id: 11, parent_id: 10, enabled: true });

    expect(canRunSource(disabled, [disabled])).toBe(false);
    expect(canRunSource(emptyGroup, [emptyGroup])).toBe(false);
    expect(canRunSource(emptyGroup, [emptyGroup, enabledChild])).toBe(true);
  });
});

describe("useEngineSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listSources.mockResolvedValue([]);
    api.listSites.mockResolvedValue([]);
    api.getStats.mockResolvedValue({ total: 0, bySource: {} });
    api.createSource.mockResolvedValue({ success: true, data: { id: 20 } });
    api.updateSource.mockResolvedValue({ success: true });
    api.deleteSource.mockResolvedValue({ success: true });
    api.deleteSiteOpportunities.mockResolvedValue({ success: true, deleted: 1 });
    api.openRunStream.mockResolvedValue({ success: true, totalResults: 0 });
  });

  it("keeps a failed sources request distinct from a successful empty inventory", async () => {
    api.listSources.mockRejectedValue(new Error("sources unavailable"));

    const { result } = renderHook(() => useEngineSources());

    await waitFor(() => expect(result.current.sources.status).toBe("error"));

    expect(result.current.sources.data).toBeNull();
    expect(result.current.sources.error).not.toBeNull();
    expect(result.current.sites.status).toBe("success");
    expect(result.current.stats.status).toBe("success");
  });

  it("adds valid bulk rows, skips existing and in-batch duplicates, and reports invalid lines", async () => {
    api.listSources.mockResolvedValue([
      source({
        id: 4,
        name: "Existing",
        url: "https://existing.example.org/listings",
      }),
    ]);

    const { result } = renderHook(() => useEngineSources());
    await waitFor(() => expect(result.current.sources.status).toBe("success"));

    await act(async () => {
      const outcome = await result.current.addBulkSources(
        `
          Existing copy | https://existing.example.org/listings/
          New source | https://new.example.org/opportunities
          Duplicate new | https://new.example.org/opportunities/
          broken value
        `,
        { category: "fellowship", tier: 2 },
      );

      expect(outcome).toEqual({
        added: 1,
        skipped: 2,
        failed: 0,
        invalid: 1,
      });
    });

    expect(api.createSource).toHaveBeenCalledTimes(1);
    expect(api.createSource).toHaveBeenCalledWith({
      name: "New source",
      url: "https://new.example.org/opportunities",
      category: "fellowship",
      tier: 2,
      enabled: true,
      parent_id: null,
    });
  });

  it("rejects a direct run request for a disabled source before opening a stream", async () => {
    const disabled = source({ enabled: false });
    api.listSources.mockResolvedValue([disabled]);

    const { result } = renderHook(() => useEngineSources());
    await waitFor(() => expect(result.current.sources.status).toBe("success"));

    await expect(
      result.current.startRun(disabled, { maxPages: 2, incremental: true }),
    ).rejects.toThrow(/disabled/i);
    expect(api.openRunStream).not.toHaveBeenCalled();
  });
});
