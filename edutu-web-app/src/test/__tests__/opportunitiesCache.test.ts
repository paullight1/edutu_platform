import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/analyticsAggregator", () => ({
  syncOpportunityInventorySnapshot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/n8nIntegration", () => ({
  updateOpportunitiesInN8n: vi.fn().mockResolvedValue(undefined),
}));

const SNAPSHOT_KEY = "edutu:opportunities:snapshot:v4";

const backendRow = {
  id: "opp-1",
  title: "Test Scholarship",
  organization: "Test Org",
  category: "Scholarship",
  deadline: "2027-01-01T00:00:00.000Z",
  description: "A very real scholarship for testing.",
  updated_at: "2026-07-01T00:00:00.000Z",
};

function mockFetchSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [backendRow] }),
    }),
  );
}

function mockFetchFailure() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => null,
    }),
  );
}

async function importOpportunities() {
  return import("../../services/opportunities");
}

describe("opportunities snapshot cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.stubEnv("VITE_BACKEND_URL", "https://api.example.test");
  });

  it("persists fetched opportunities and serves them synchronously in a new session", async () => {
    mockFetchSuccess();
    const first = await importOpportunities();
    const rows = await first.fetchOpportunities();
    expect(rows).toHaveLength(1);
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeTruthy();

    // Simulate a fresh page load: module state gone, storage intact.
    vi.resetModules();
    const second = await importOpportunities();
    const cached = second.getCachedOpportunitiesSync();
    expect(cached?.[0]?.title).toBe("Test Scholarship");
    expect(second.getCachedOpportunitySync("opp-1")?.title).toBe(
      "Test Scholarship",
    );
  });

  it("deduplicates an existing fresh snapshot before returning it to the UI", async () => {
    const duplicate = {
      ...backendRow,
      title: "Shared Opportunity",
      sourceUrl: "https://www.example.org/opportunity/one/?utm_source=feed",
    };
    window.localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ savedAt: Date.now(), rows: [duplicate, { ...duplicate, id: "opp-2" }] }),
    );

    const service = await importOpportunities();
    const cached = service.getCachedOpportunitiesSync();

    expect(cached).toHaveLength(1);
    expect(cached?.[0]?.id).toBe("opp-1");
  });

  it.each(["v2", "v3"])(
    "replaces a %s snapshot that may contain unsanitized deadline copy",
    async (version) => {
      window.localStorage.setItem(
        "edutu:opportunities:snapshot:" + version,
        JSON.stringify({
          savedAt: Date.now(),
          rows: [
            {
              ...backendRow,
              summary: "Application deadline: December 2, 2926.",
            },
          ],
        }),
      );
      mockFetchSuccess();

      const service = await importOpportunities();
      expect(service.getCachedOpportunitiesSync()).toBeNull();

      const rows = await service.fetchOpportunities();

      expect(rows[0].summary).not.toContain("2926");
      expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeTruthy();
    },
  );

  it("falls back to the stale snapshot when the backend and static snapshot both fail", async () => {
    mockFetchSuccess();
    const first = await importOpportunities();
    await first.fetchOpportunities();

    vi.resetModules();
    mockFetchFailure();
    const second = await importOpportunities();
    const rows = await second.fetchOpportunities({ force: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Test Scholarship");
  });

  it("does not paint an expired snapshot before the fresh catalog request completes", async () => {
    window.localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ savedAt: Date.now() - 11 * 60 * 1000, rows: [backendRow] }),
    );
    const service = await importOpportunities();

    expect(service.getCachedOpportunitiesSync()).toBeNull();
  });

  it("keeps the last known catalog when a forced refresh returns an empty feed", async () => {
    mockFetchSuccess();
    const service = await importOpportunities();
    const initialRows = await service.fetchOpportunities();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      }),
    );

    const refreshedRows = await service.fetchOpportunities({ force: true });

    expect(refreshedRows).toEqual(initialRows);
    expect(service.getCachedOpportunitiesSync()).toEqual(initialRows);
  });

  it("reports an empty-feed database outage instead of a false empty catalog", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/health/ready")) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ status: "not_ready" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ opportunities: [] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetch);

    const service = await importOpportunities();

    await expect(service.fetchOpportunities()).rejects.toThrow(
      "Opportunities are temporarily unavailable. Please try again.",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/health/ready",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps a genuinely empty catalog as a normal empty result when readiness is healthy", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => url.includes("/health/ready")
          ? ({ status: "ready" })
          : ({ opportunities: [] }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetch);

    const service = await importOpportunities();

    await expect(service.fetchOpportunities()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/health/ready",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes the generated share card when the source has no image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ ...backendRow, image_url: null, share_image_url: "https://cdn.example.test/share-card.png" }],
        }),
      }),
    );

    const service = await importOpportunities();
    const [row] = await service.fetchOpportunities();

    expect(row.image).toBe("https://cdn.example.test/share-card.png");
  });

  it("preserves paragraph breaks in full opportunity descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              ...backendRow,
              description: "Short source summary.",
              metadata: {
                full_description:
                  "Overview paragraph.\n\nWho can apply:\n- Current students\n- Recent graduates\n\nApply before the deadline.",
              },
            },
          ],
        }),
      }),
    );

    const service = await importOpportunities();
    const [row] = await service.fetchOpportunities();

    expect(row.description).toContain("Overview paragraph.\n\nWho can apply:");
    expect(row.description).toContain("- Current students\n- Recent graduates");
  });

  it("does not let scraped page controls replace a real opportunity description", async () => {
    const realDescription =
      "The University of Padua is offering the International Excellence Scholarship for talented international students. Applications are assessed on academic merit.";
    const pageChromeSummary =
      "Home Scholarships Italy University of Padua International Excellence Scholarship 2026 Save & track deadline Partial Funding Masters, Bachelor All Subjects International Students Italy Share Expected to reopen in March 2025 Join WhatsApp Channel!";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              ...backendRow,
              summary: pageChromeSummary,
              description: realDescription,
            },
          ],
        }),
      }),
    );

    const service = await importOpportunities();
    const [row] = await service.fetchOpportunities();

    expect(row.summary).toBe("");
    expect(row.description).toBe(realDescription);
    expect(row.description).not.toContain("Join WhatsApp Channel");
  });

  it("keeps the truncation marker on source descriptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              ...backendRow,
              description:
                "The University offers this award to international students...",
            },
          ],
        }),
      }),
    );

    const service = await importOpportunities();
    const [row] = await service.fetchOpportunities();

    expect(row.description).toBe(
      "The University offers this award to international students…",
    );
  });

  it("uses the canonical category when the stored display category is stale", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              ...backendRow,
              title: "MedixDeck Internship Program",
              category: "Scholarships",
              canonical_category: "internships",
            },
          ],
        }),
      }),
    );

    const service = await importOpportunities();
    const [row] = await service.fetchOpportunities();

    expect(row.category).toBe("Internships");
  });

  it("notifies subscribers when the cache updates", async () => {
    mockFetchSuccess();
    const service = await importOpportunities();
    const listener = vi.fn();
    const unsubscribe = service.subscribeToOpportunities(listener);

    await service.fetchOpportunities();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toHaveLength(1);

    unsubscribe();
    await service.fetchOpportunities({ force: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clearOpportunitiesCache removes the persisted snapshot", async () => {
    mockFetchSuccess();
    const service = await importOpportunities();
    await service.fetchOpportunities();
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeTruthy();

    service.clearOpportunitiesCache();
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(service.getCachedOpportunitiesSync()).toBeNull();
  });
});
