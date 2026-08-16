import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/analyticsAggregator", () => ({
  syncOpportunityInventorySnapshot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/n8nIntegration", () => ({
  updateOpportunitiesInN8n: vi.fn().mockResolvedValue(undefined),
}));

const SNAPSHOT_KEY = "edutu:opportunities:snapshot:v1";

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
