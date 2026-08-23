import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../../../lib/apiClient";
import { engineApi } from "./engineApi";
import type {
  CreateScrapeSourceInput,
  EngineStreamEvent,
  ScrapedOpportunity,
} from "../model/types";

const mocks = vi.hoisted(() => ({
  adminApiJson: vi.fn(),
  getAdminAuthHeaders: vi.fn(),
  getBackendBaseUrl: vi.fn(),
}));

vi.mock("../../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("../../../lib/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/apiClient")>();
  return {
    ...actual,
    adminApiJson: mocks.adminApiJson,
    getAdminAuthHeaders: mocks.getAdminAuthHeaders,
  };
});

vi.mock("../../../lib/runtimeConfig", () => ({
  getBackendBaseUrl: mocks.getBackendBaseUrl,
}));

function streamFromTextChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("engineApi JSON contracts", () => {
  beforeEach(() => {
    mocks.adminApiJson.mockResolvedValue({ success: true });
    mocks.getAdminAuthHeaders.mockResolvedValue({
      Authorization: "Bearer test-token",
      "X-Edutu-Admin-Email": "admin@edutu.org",
    });
    mocks.getBackendBaseUrl.mockReturnValue("https://api.example.com");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("reads the Engine overview resources from the existing endpoints", async () => {
    await engineApi.getStatus();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/engine-status",
    );

    await engineApi.listSources();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sources",
    );

    await engineApi.listJobs(100);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/jobs?limit=100",
    );

    await engineApi.getStats();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/stats",
    );

    await engineApi.listSites();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sites",
    );

    await engineApi.getRunStatus();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/run/status",
    );
  });

  it("preserves source CRUD contracts", async () => {
    const source: CreateScrapeSourceInput = {
      name: "Scholarship Hub",
      url: "https://example.com/scholarships",
      category: "scholarship",
      tier: 2,
    };

    await engineApi.createSource(source);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sources",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source),
      },
    );

    await engineApi.updateSource(17, { enabled: false });
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sources/17",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      },
    );

    await engineApi.deleteSource(17);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sources/17",
      { method: "DELETE" },
    );
  });

  it("preserves run controls, job inspection, and deletion contracts", async () => {
    await engineApi.pauseRun();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/run/pause",
      { method: "POST" },
    );

    await engineApi.resumeRun();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/run/resume",
      { method: "POST" },
    );

    await engineApi.stopRun();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/run/stop",
      { method: "POST" },
    );

    await engineApi.getJobOpportunities("job/with spaces");
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/jobs/job%2Fwith%20spaces/opportunities",
    );

    await engineApi.deleteJob("job-1");
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/jobs/job-1",
      { method: "DELETE" },
    );
  });

  it("preserves automation, enhancement, import, purge, and site cleanup contracts", async () => {
    await engineApi.getAutomationSettings();
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/settings",
    );

    await engineApi.updateAutomationSettings({
      auto_run_enabled: true,
      cron_schedule: "0 6 * * *",
    });
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/settings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_run_enabled: true,
          cron_schedule: "0 6 * * *",
        }),
      },
    );

    const opportunity: ScrapedOpportunity = {
      title: "Example award",
      source: "Example",
    };
    await engineApi.enhancePreview(opportunity);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/enhance-preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opportunity),
      },
    );

    const items = [
      {
        title: "Example award",
        type: "scholarship",
        sourceUrl: "https://example.com/source",
        applyUrl: "https://example.com/apply",
        isFeatured: false,
        isRemote: true,
        status: "pending",
        tags: [],
      },
    ];
    await engineApi.bulkImport(items);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/opportunities/admin/bulk-import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      },
    );

    await engineApi.purgeOpportunities(30);
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/opportunities/admin/purge",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: 30 }),
      },
    );

    await engineApi.deleteSiteOpportunities("example.com/path");
    expect(mocks.adminApiJson).toHaveBeenLastCalledWith(
      "/api/scraper/sites/opportunities?host=example.com%2Fpath",
      { method: "DELETE" },
    );
  });
});

describe("engineApi authenticated SSE stream", () => {
  beforeEach(() => {
    mocks.getAdminAuthHeaders.mockResolvedValue({
      Authorization: "Bearer test-token",
      "X-Edutu-Admin-Email": "admin@edutu.org",
    });
    mocks.getBackendBaseUrl.mockReturnValue("https://api.example.com");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("parses events split across arbitrary byte boundaries and flushes the final event", async () => {
    const payload = [
      'data: {"type":"start","sources":["One"]}\n\n',
      'data: {"type":"opportunity","opportunity":{"title":"Award","source":"One"}}\n\n',
      'data: {"type":"done","result":{"success":true,"totalResults":1}}',
    ].join("");
    const cuts = [7, 29, 61, 94, payload.length];
    const chunks: string[] = [];
    let start = 0;
    for (const end of cuts) {
      chunks.push(payload.slice(start, end));
      start = end;
    }

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(streamFromTextChunks(chunks), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const events: EngineStreamEvent[] = [];

    await expect(
      engineApi.openRunStream(
        { sourceId: 42, maxPages: 5, incremental: false },
        { onEvent: (event) => events.push(event) },
      ),
    ).resolves.toMatchObject({ success: true, totalResults: 1 });

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "opportunity",
      "done",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.example.com/api/scraper/run/stream?maxPages=5&sourceId=42&incremental=false",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("starts all enabled sources when no source ID is supplied", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        streamFromTextChunks([
          'data: {"type":"done","result":{"success":true}}\n\n',
        ]),
        { status: 200 },
      ),
    );

    await engineApi.openRunStream({
      allSources: true,
      maxPages: 3,
      incremental: true,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/scraper/run/stream?maxPages=3&allSources=true&incremental=true",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("normalizes stream HTTP failures without exposing the response body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("secret database error", {
        status: 503,
        headers: { "x-request-id": "stream-503" },
      }),
    );

    let captured: unknown;
    try {
      await engineApi.openRunStream({
        allSources: true,
        maxPages: 3,
        incremental: true,
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(AdminApiError);
    expect(captured).toMatchObject({
      category: "http",
      status: 503,
      requestId: "stream-503",
      targetOrigin: "https://api.example.com",
    });
    expect(String(captured)).not.toContain("secret database error");
  });
});
