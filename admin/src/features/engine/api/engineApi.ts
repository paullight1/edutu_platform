import {
  AdminApiError,
  adminApiJson,
  getAdminAuthHeaders,
  type AdminApiFailureCategory,
} from "../../../lib/apiClient";
import { getBackendBaseUrl } from "../../../lib/runtimeConfig";
import type {
  AutomationSettings,
  BulkImportItem,
  BulkImportResult,
  CreateScrapeSourceInput,
  DeleteJobResult,
  DeleteSiteResult,
  EngineStats,
  EngineStatus,
  EngineStreamEvent,
  EngineStreamHandlers,
  EnhancePreviewResult,
  OpenRunStreamOptions,
  OpportunitySite,
  PurgeResult,
  RunStatus,
  ScrapeJob,
  ScrapeResult,
  ScrapedOpportunity,
  ScrapeSource,
  SourceMutationResult,
  UpdateAutomationSettingsInput,
  UpdateScrapeSourceInput,
} from "../model/types";

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function now(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(now() - startedAt));
}

function targetOrigin(apiOrigin: string): string {
  if (apiOrigin) return apiOrigin;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "same-origin";
}

function requestUrl(apiOrigin: string, path: string): string {
  if (!apiOrigin) return path;
  return `${apiOrigin.replace(/\/+$/u, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function categoryForStatus(status: number): AdminApiFailureCategory {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  return "http";
}

function streamError(input: {
  category: AdminApiFailureCategory;
  requestId: string;
  targetOrigin: string;
  startedAt: number;
  status?: number;
}): AdminApiError {
  const statusLabel = input.status ? ` (${input.status})` : "";
  return new AdminApiError({
    message: `The Engine stream request failed${statusLabel}. Reference ${input.requestId}.`,
    category: input.category,
    status: input.status,
    requestId: input.requestId,
    targetOrigin: input.targetOrigin,
    elapsedMs: elapsedSince(input.startedAt),
  });
}

function streamQuery(options: OpenRunStreamOptions): string {
  const params = new URLSearchParams();
  params.set("maxPages", String(options.maxPages));

  if (options.sourceId !== undefined) {
    params.set("sourceId", String(options.sourceId));
  } else if (options.allSources !== false) {
    params.set("allSources", "true");
  }

  params.set("incremental", options.incremental ? "true" : "false");
  return params.toString();
}

function parseStreamBlock(
  block: string,
  requestId: string,
  origin: string,
  startedAt: number,
): EngineStreamEvent | null {
  const data = block
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw streamError({
      category: "invalid-response",
      requestId,
      targetOrigin: origin,
      startedAt,
    });
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { type?: unknown }).type !== "string"
  ) {
    throw streamError({
      category: "invalid-response",
      requestId,
      targetOrigin: origin,
      startedAt,
    });
  }

  return parsed as EngineStreamEvent;
}

function takeNextStreamBlock(buffer: string): {
  block: string;
  rest: string;
} | null {
  const boundary = /\r?\n\r?\n/u.exec(buffer);
  if (!boundary || boundary.index === undefined) return null;

  return {
    block: buffer.slice(0, boundary.index),
    rest: buffer.slice(boundary.index + boundary[0].length),
  };
}

async function openRunStream(
  options: OpenRunStreamOptions,
  handlers: EngineStreamHandlers = {},
  externalSignal?: AbortSignal,
): Promise<ScrapeResult> {
  const startedAt = now();
  const apiOrigin = getBackendBaseUrl();
  const origin = targetOrigin(apiOrigin);
  let activeRequestId = createRequestId();
  const controller = new AbortController();
  const handleExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) handleExternalAbort();
    else externalSignal.addEventListener("abort", handleExternalAbort, { once: true });
  }

  try {
    const headers = new Headers(await getAdminAuthHeaders());
    headers.set("X-Request-Id", activeRequestId);

    const response = await fetch(
      requestUrl(
        apiOrigin,
        `/api/scraper/run/stream?${streamQuery(options)}`,
      ),
      {
        method: "GET",
        headers,
        signal: controller.signal,
      },
    );

    activeRequestId = response.headers.get("x-request-id") || activeRequestId;

    if (!response.ok) {
      throw streamError({
        category: categoryForStatus(response.status),
        status: response.status,
        requestId: activeRequestId,
        targetOrigin: origin,
        startedAt,
      });
    }

    if (!response.body) {
      throw streamError({
        category: "invalid-response",
        status: response.status,
        requestId: activeRequestId,
        targetOrigin: origin,
        startedAt,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: ScrapeResult | null = null;

    const consumeBlock = (block: string) => {
      const event = parseStreamBlock(
        block,
        activeRequestId,
        origin,
        startedAt,
      );
      if (!event) return;

      handlers.onEvent?.(event);
      if (event.type === "done") {
        finalResult = event.result;
      } else if (event.type === "error") {
        throw streamError({
          category: "http",
          requestId: activeRequestId,
          targetOrigin: origin,
          startedAt,
        });
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let next = takeNextStreamBlock(buffer);
        while (next) {
          consumeBlock(next.block);
          buffer = next.rest;
          next = takeNextStreamBlock(buffer);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) consumeBlock(buffer);
    } finally {
      reader.releaseLock();
    }

    if (!finalResult) {
      throw streamError({
        category: "invalid-response",
        requestId: activeRequestId,
        targetOrigin: origin,
        startedAt,
      });
    }

    return finalResult;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;

    throw streamError({
      category: "network",
      requestId: activeRequestId,
      targetOrigin: origin,
      startedAt,
    });
  } finally {
    externalSignal?.removeEventListener("abort", handleExternalAbort);
  }
}

export const engineApi = {
  getStatus(): Promise<EngineStatus> {
    return adminApiJson<EngineStatus>("/api/scraper/engine-status");
  },

  listSources(): Promise<ScrapeSource[]> {
    return adminApiJson<ScrapeSource[]>("/api/scraper/sources");
  },

  createSource(input: CreateScrapeSourceInput): Promise<SourceMutationResult> {
    return adminApiJson<SourceMutationResult>("/api/scraper/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  updateSource(
    id: number,
    input: UpdateScrapeSourceInput,
  ): Promise<SourceMutationResult> {
    return adminApiJson<SourceMutationResult>(`/api/scraper/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  deleteSource(id: number): Promise<SourceMutationResult> {
    return adminApiJson<SourceMutationResult>(`/api/scraper/sources/${id}`, {
      method: "DELETE",
    });
  },

  listJobs(limit = 100): Promise<ScrapeJob[]> {
    return adminApiJson<ScrapeJob[]>(
      `/api/scraper/jobs?limit=${encodeURIComponent(String(limit))}`,
    );
  },

  getJobOpportunities(id: string): Promise<ScrapedOpportunity[]> {
    return adminApiJson<ScrapedOpportunity[]>(
      `/api/scraper/jobs/${encodeURIComponent(id)}/opportunities`,
    );
  },

  deleteJob(id: string): Promise<DeleteJobResult> {
    return adminApiJson<DeleteJobResult>(
      `/api/scraper/jobs/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  },

  getStats(): Promise<EngineStats> {
    return adminApiJson<EngineStats>("/api/scraper/stats");
  },

  listSites(): Promise<OpportunitySite[]> {
    return adminApiJson<OpportunitySite[]>("/api/scraper/sites");
  },

  deleteSiteOpportunities(host: string): Promise<DeleteSiteResult> {
    return adminApiJson<DeleteSiteResult>(
      `/api/scraper/sites/opportunities?host=${encodeURIComponent(host)}`,
      { method: "DELETE" },
    );
  },

  getRunStatus(): Promise<RunStatus> {
    return adminApiJson<RunStatus>("/api/scraper/run/status");
  },

  async pauseRun(): Promise<void> {
    await adminApiJson("/api/scraper/run/pause", { method: "POST" });
  },

  async resumeRun(): Promise<void> {
    await adminApiJson("/api/scraper/run/resume", { method: "POST" });
  },

  async stopRun(): Promise<void> {
    await adminApiJson("/api/scraper/run/stop", { method: "POST" });
  },

  getAutomationSettings(): Promise<AutomationSettings> {
    return adminApiJson<AutomationSettings>("/api/scraper/settings");
  },

  updateAutomationSettings(
    input: UpdateAutomationSettingsInput,
  ): Promise<{ success: boolean; error?: string }> {
    return adminApiJson("/api/scraper/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  enhancePreview(
    opportunity: ScrapedOpportunity,
  ): Promise<EnhancePreviewResult> {
    return adminApiJson<EnhancePreviewResult>(
      "/api/scraper/enhance-preview",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opportunity),
      },
    );
  },

  bulkImport(items: BulkImportItem[]): Promise<BulkImportResult> {
    return adminApiJson<BulkImportResult>(
      "/opportunities/admin/bulk-import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      },
    );
  },

  purgeOpportunities(olderThanDays: number): Promise<PurgeResult> {
    return adminApiJson<PurgeResult>("/opportunities/admin/purge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ olderThanDays }),
    });
  },

  openRunStream,
};
