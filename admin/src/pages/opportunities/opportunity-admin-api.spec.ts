import { describe, expect, it, vi } from "vitest";
import { createOpportunityAdminApi } from "./opportunity-admin-api";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function createApi(fetchImpl: ReturnType<typeof vi.fn>) {
  return createOpportunityAdminApi({
    baseUrl: "https://api.edutu.test/",
    getHeaders: async () => ({
      Authorization: "Bearer test",
      "Content-Type": "application/json",
    }),
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe("opportunity admin API transport", () => {
  it("loads the opportunity list and stats with shared admin headers", async () => {
    const getHeaders = vi.fn().mockResolvedValue({
      Authorization: "Bearer test",
      "Content-Type": "application/json",
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ id: "opp-1" }], total: 1, totalPages: 1 }),
      )
      .mockResolvedValueOnce(jsonResponse({ total: 1, active: 1 }));
    const api = createOpportunityAdminApi({
      baseUrl: "https://api.edutu.test/",
      getHeaders,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const params = new URLSearchParams({ page: "2", limit: "50", sortBy: "newest" });

    const result = await api.loadListAndStats(params);

    expect(getHeaders).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.edutu.test/opportunities/admin/list?page=2&limit=50&sortBy=newest",
      { headers: { Authorization: "Bearer test", "Content-Type": "application/json" } },
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.edutu.test/opportunities/admin/stats",
      { headers: { Authorization: "Bearer test", "Content-Type": "application/json" } },
    );
    expect(result.list.total).toBe(1);
    expect(result.stats).toMatchObject({ total: 1, active: 1 });
  });

  it("preserves list failures while allowing stats to be best-effort", async () => {
    const api = createOpportunityAdminApi({
      baseUrl: "https://api.edutu.test",
      getHeaders: async () => ({ Authorization: "Bearer test" }),
      fetchImpl: vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ message: "No access" }, { status: 403 }))
        .mockResolvedValueOnce(jsonResponse({ message: "Stats unavailable" }, { status: 503 })) as unknown as typeof fetch,
    });

    await expect(api.loadListAndStats(new URLSearchParams())).rejects.toThrow("No access");
  });

  it("runs the scraper with the existing POST body and AbortSignal", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, opportunities: [{ title: "Example" }] }),
    );
    const api = createOpportunityAdminApi({
      baseUrl: "https://api.edutu.test",
      getHeaders: async () => ({ "Content-Type": "application/json" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await api.runScraper(
      { allSources: true, maxPages: 3 },
      controller.signal,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.edutu.test/api/scraper/run",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ allSources: true, maxPages: 3 }),
      }),
    );
    expect(result.success).toBe(true);
  });

  it("bulk imports exactly one batch and throws the backend error when rejected", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, inserted: 2, skipped: 1 }))
      .mockResolvedValueOnce(jsonResponse({ error: "Duplicate source" }, { status: 400 }));
    const api = createOpportunityAdminApi({
      baseUrl: "https://api.edutu.test",
      getHeaders: async () => ({ "Content-Type": "application/json" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const items = [{ title: "A" }, { title: "B" }];

    await expect(api.bulkImport(items)).resolves.toMatchObject({ inserted: 2, skipped: 1 });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.edutu.test/opportunities/admin/bulk-import",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ items }) }),
    );
    await expect(api.bulkImport(items)).rejects.toThrow("Duplicate source");
  });

  it("enhances one scraper preview without owning the caller's fallback policy", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, opportunity: { title: "Improved" } }),
    );
    const api = createOpportunityAdminApi({
      baseUrl: "https://api.edutu.test",
      getHeaders: async () => ({ "Content-Type": "application/json" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const preview = { title: "Original" };

    const result = await api.enhancePreview(preview);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.edutu.test/api/scraper/enhance-preview",
      expect.objectContaining({ method: "POST", body: JSON.stringify(preview) }),
    );
    expect(result).toMatchObject({ success: true, opportunity: { title: "Improved" } });
  });

  it("deletes one opportunity and preserves backend error messages", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true }))
      .mockResolvedValueOnce(jsonResponse({ message: "Protected row" }, { status: 409 }));
    const api = createApi(fetchImpl);

    await expect(api.deleteOpportunity("opp-1")).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.edutu.test/opportunities/opp-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    await expect(api.deleteOpportunity("opp-1")).rejects.toThrow("Protected row");
  });

  it("updates one opportunity status with the existing PATCH contract", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const api = createApi(fetchImpl);

    await api.updateStatus("opp-2", "active");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.edutu.test/opportunities/opp-2/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    );
  });

  it("sends one already-chunked bulk status/category/delete request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ updated: 2 }))
      .mockResolvedValueOnce(jsonResponse({ updated: 2 }))
      .mockResolvedValueOnce(jsonResponse({ deleted: 2 }));
    const api = createApi(fetchImpl);
    const ids = ["a", "b"];

    await expect(api.bulkStatus(ids, "active")).resolves.toMatchObject({ updated: 2 });
    await expect(api.bulkCategory(ids, "Scholarships")).resolves.toMatchObject({ updated: 2 });
    await expect(api.bulkDelete(ids)).resolves.toMatchObject({ deleted: 2 });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.edutu.test/opportunities/admin/bulk-status",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids, status: "active" }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.edutu.test/opportunities/admin/bulk-category",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids, category: "Scholarships" }),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://api.edutu.test/opportunities/admin/bulk-delete",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ ids }) }),
    );
  });

  it("enhances one stored opportunity and treats success false as failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, completeness: { score: 88 } }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: "AI unavailable" }));
    const api = createApi(fetchImpl);

    await expect(api.enhanceOpportunity("opp-3")).resolves.toMatchObject({
      completeness: { score: 88 },
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.edutu.test/opportunities/admin/opp-3/enhance",
      expect.objectContaining({ method: "POST" }),
    );
    await expect(api.enhanceOpportunity("opp-3")).rejects.toThrow("AI unavailable");
  });

  it("verifies one deadline with dryRun false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, result: { status: "verified", newCloseDate: "2026-12-31" } }),
    );
    const api = createApi(fetchImpl);

    const result = await api.verifyOpportunity("opp-4");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.edutu.test/opportunities/admin/verification/opp-4",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ dryRun: false }),
      }),
    );
    expect(result.result).toMatchObject({ newCloseDate: "2026-12-31" });
  });

  it("verifies one already-chunked batch and preserves bulk counters", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, checked: 2, found: 1, rolling: 1, failed: 0 }),
    );
    const api = createApi(fetchImpl);
    const ids = ["opp-4", "opp-5"];

    const result = await api.verifyOpportunities(ids);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.edutu.test/opportunities/admin/verification/bulk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ids, dryRun: false }),
      }),
    );
    expect(result).toMatchObject({ checked: 2, found: 1, rolling: 1, failed: 0 });
  });
});
