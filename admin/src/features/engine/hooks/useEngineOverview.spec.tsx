import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEngineOverview } from "./useEngineOverview";

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  listSources: vi.fn(),
  listJobs: vi.fn(),
  getStats: vi.fn(),
  listSites: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({ engineApi: api }));

describe("useEngineOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getStatus.mockResolvedValue({ success: true });
    api.listSources.mockResolvedValue([]);
    api.listJobs.mockResolvedValue([]);
    api.getStats.mockResolvedValue({ total: 0, bySource: {} });
    api.listSites.mockResolvedValue([]);
  });

  it("keeps successful empty data distinct from failed resources", async () => {
    api.listJobs.mockRejectedValue(new Error("jobs unavailable"));
    api.getStats.mockRejectedValue(new Error("stats unavailable"));

    const { result } = renderHook(() => useEngineOverview());

    await waitFor(() => expect(result.current.sources.status).toBe("success"));
    await waitFor(() => expect(result.current.stats.status).toBe("error"));

    expect(result.current.sources.data).toEqual([]);
    expect(result.current.sources.error).toBeNull();
    expect(result.current.jobs.status).toBe("error");
    expect(result.current.jobs.data).toBeNull();
    expect(result.current.stats.data).toBeNull();
    expect(result.current.stats.error).not.toBeNull();
    expect(result.current.status.status).toBe("success");
    expect(result.current.sites.status).toBe("success");
  });

  it("refreshes every resource while preserving independent outcomes", async () => {
    api.getStats.mockResolvedValueOnce({ total: 4, bySource: { one: 4 } });
    const { result } = renderHook(() => useEngineOverview());

    await waitFor(() => expect(result.current.stats.data?.total).toBe(4));

    api.listSources.mockResolvedValueOnce([
      {
        id: 1,
        name: "Source one",
        url: "https://example.com",
        tier: 1,
        category: "scholarship",
        enabled: true,
        priority: 1,
        last_scraped: null,
        last_success: null,
        last_error: null,
        total_scraped: 2,
        total_failed: 0,
      },
    ]);
    api.getStats.mockRejectedValueOnce(new Error("stats refresh failed"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.sources.status).toBe("success");
    expect(result.current.sources.data).toHaveLength(1);
    expect(result.current.stats.status).toBe("error");
    expect(result.current.stats.data?.total).toBe(4);
    expect(api.getStatus).toHaveBeenCalledTimes(2);
    expect(api.listSources).toHaveBeenCalledTimes(2);
    expect(api.listJobs).toHaveBeenCalledTimes(2);
    expect(api.getStats).toHaveBeenCalledTimes(2);
    expect(api.listSites).toHaveBeenCalledTimes(2);
  });
});
