import type {
  Opportunity,
  OpportunityListResponse,
  OpportunityPreviewItem,
  OpportunityStatus,
  Stats,
} from "./opportunity-domain";

export interface OpportunityAdminApiOptions {
  baseUrl: string;
  getHeaders: () => Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
}

export interface ScraperRunResponse {
  success?: boolean;
  opportunities?: OpportunityPreviewItem[];
  errors?: string[];
  error?: string;
}

export interface BulkImportResponse {
  success?: boolean;
  inserted?: number;
  skipped?: number;
  error?: string;
  message?: string;
}

export interface EnhancePreviewResponse {
  success?: boolean;
  opportunity?: OpportunityPreviewItem;
  error?: string;
  message?: string;
}

export interface BulkMutationResponse {
  success?: boolean;
  updated?: number;
  deleted?: number;
  error?: string;
  message?: string;
}

export interface EnhanceOpportunityTransportResponse {
  success?: boolean;
  opportunity?: Opportunity;
  completeness?: { score?: number; [key: string]: unknown };
  error?: string;
  message?: string;
}

export interface VerificationResult {
  status?: string;
  newCloseDate?: string | null;
  newDeadlineConfidence?: string;
  [key: string]: unknown;
}

export interface VerifyOpportunityResponse {
  success?: boolean;
  result?: VerificationResult;
  error?: string;
  message?: string;
}

export interface VerifyOpportunitiesResponse {
  success?: boolean;
  checked?: number;
  found?: number;
  rolling?: number;
  failed?: number;
  error?: string;
  message?: string;
}

type JsonRecord = Record<string, unknown>;
type ErrorPayload = { message?: unknown; error?: unknown };

async function readJson(response: Response): Promise<JsonRecord> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function errorMessage(payload: ErrorPayload, fallback: string) {
  const message = payload.message ?? payload.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function createOpportunityAdminApi({
  baseUrl,
  getHeaders,
  fetchImpl = fetch,
}: OpportunityAdminApiOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function requestJson<T>(
    path: string,
    options: {
      method: "POST" | "PATCH" | "DELETE";
      body?: unknown;
      signal?: AbortSignal;
      failureMessage: string;
    },
  ): Promise<T> {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: options.method,
      headers: await getHeaders(),
      signal: options.signal,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(errorMessage(payload, options.failureMessage));
    }
    return payload as T;
  }

  async function postJson<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal; failureMessage?: string },
  ): Promise<T> {
    return requestJson<T>(path, {
      method: "POST",
      body,
      signal: options?.signal,
      failureMessage: options?.failureMessage || "Request failed",
    });
  }

  return {
    async loadListAndStats(params: URLSearchParams): Promise<{
      list: OpportunityListResponse;
      stats: Stats | null;
    }> {
      const headers = await getHeaders();
      const [listResponse, statsResponse] = await Promise.all([
        fetchImpl(
          `${normalizedBaseUrl}/opportunities/admin/list?${params.toString()}`,
          { headers },
        ),
        fetchImpl(`${normalizedBaseUrl}/opportunities/admin/stats`, { headers }),
      ]);

      if (!listResponse.ok) {
        const error = await readJson(listResponse);
        throw new Error(errorMessage(error, "Failed to load opportunities"));
      }

      const list = (await listResponse.json()) as OpportunityListResponse;
      const stats = statsResponse.ok
        ? ((await statsResponse.json()) as Stats)
        : null;

      return { list, stats };
    },

    async runScraper(
      body: { allSources: boolean; maxPages: number },
      signal?: AbortSignal,
    ): Promise<ScraperRunResponse> {
      return postJson<ScraperRunResponse>("/api/scraper/run", body, {
        signal,
        failureMessage: "Scraper request failed",
      });
    },

    async bulkImport(
      items: Array<Record<string, unknown>>,
    ): Promise<BulkImportResponse> {
      const payload = await postJson<BulkImportResponse>(
        "/opportunities/admin/bulk-import",
        { items },
        { failureMessage: "Save failed" },
      );
      if (payload.success === false) {
        throw new Error(errorMessage(payload, "Save failed"));
      }
      return payload;
    },

    async enhancePreview(
      opportunity: OpportunityPreviewItem,
    ): Promise<EnhancePreviewResponse> {
      return postJson<EnhancePreviewResponse>(
        "/api/scraper/enhance-preview",
        opportunity,
        {
          failureMessage: `Failed to refine ${opportunity.title || "an opportunity"}`,
        },
      );
    },

    async deleteOpportunity(id: string): Promise<void> {
      await requestJson(`/opportunities/${id}`, {
        method: "DELETE",
        failureMessage: "Failed to delete opportunity",
      });
    },

    async updateStatus(id: string, status: OpportunityStatus): Promise<void> {
      await requestJson(`/opportunities/${id}/status`, {
        method: "PATCH",
        body: { status },
        failureMessage: "Failed to update status",
      });
    },

    async bulkStatus(
      ids: string[],
      status: OpportunityStatus,
    ): Promise<BulkMutationResponse> {
      return postJson<BulkMutationResponse>(
        "/opportunities/admin/bulk-status",
        { ids, status },
        { failureMessage: "Bulk status update failed" },
      );
    },

    async bulkCategory(
      ids: string[],
      category: string,
    ): Promise<BulkMutationResponse> {
      return postJson<BulkMutationResponse>(
        "/opportunities/admin/bulk-category",
        { ids, category },
        { failureMessage: "Bulk category move failed" },
      );
    },

    async bulkDelete(ids: string[]): Promise<BulkMutationResponse> {
      return postJson<BulkMutationResponse>(
        "/opportunities/admin/bulk-delete",
        { ids },
        { failureMessage: "Bulk delete failed" },
      );
    },

    async enhanceOpportunity(
      id: string,
    ): Promise<EnhanceOpportunityTransportResponse> {
      const payload = await postJson<EnhanceOpportunityTransportResponse>(
        `/opportunities/admin/${id}/enhance`,
        undefined,
        { failureMessage: "AI enhancement failed" },
      );
      if (!payload.success) {
        throw new Error(errorMessage(payload, "AI enhancement failed"));
      }
      return payload;
    },

    async verifyOpportunity(id: string): Promise<VerifyOpportunityResponse> {
      const payload = await postJson<VerifyOpportunityResponse>(
        `/opportunities/admin/verification/${id}`,
        { dryRun: false },
        { failureMessage: "Deadline check failed" },
      );
      if (!payload.success) {
        throw new Error(errorMessage(payload, "Deadline check failed"));
      }
      return payload;
    },

    async verifyOpportunities(
      ids: string[],
    ): Promise<VerifyOpportunitiesResponse> {
      const payload = await postJson<VerifyOpportunitiesResponse>(
        "/opportunities/admin/verification/bulk",
        { ids, dryRun: false },
        { failureMessage: "Deadline check failed" },
      );
      if (!payload.success) {
        throw new Error(errorMessage(payload, "Deadline check failed"));
      }
      return payload;
    },
  };
}
