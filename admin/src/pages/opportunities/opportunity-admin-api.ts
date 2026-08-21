import type {
  OpportunityListResponse,
  OpportunityPreviewItem,
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

  async function postJson<T>(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal; failureMessage?: string },
  ): Promise<T> {
    const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
      method: "POST",
      headers: await getHeaders(),
      signal: options?.signal,
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(errorMessage(payload, options?.failureMessage || "Request failed"));
    }
    return payload as T;
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
  };
}
