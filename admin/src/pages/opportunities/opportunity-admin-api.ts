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

type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  const value = await response.json().catch(() => ({}));
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function errorMessage(payload: JsonRecord, fallback: string) {
  const message = payload.message ?? payload.error;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function createOpportunityAdminApi({
  baseUrl,
  getHeaders,
  fetchImpl = fetch,
}: OpportunityAdminApiOptions) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function postJson(
    path: string,
    body: unknown,
    options?: { signal?: AbortSignal; failureMessage?: string },
  ) {
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
    return payload;
  }

  return {
    async loadListAndStats(params: URLSearchParams) {
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
    ) {
      return postJson("/api/scraper/run", body, {
        signal,
        failureMessage: "Scraper request failed",
      });
    },

    async bulkImport(items: Array<Record<string, unknown>>) {
      const payload = await postJson(
        "/opportunities/admin/bulk-import",
        { items },
        { failureMessage: "Save failed" },
      );
      if (payload.success === false) {
        throw new Error(errorMessage(payload, "Save failed"));
      }
      return payload;
    },

    async enhancePreview(opportunity: OpportunityPreviewItem) {
      return postJson("/api/scraper/enhance-preview", opportunity, {
        failureMessage: `Failed to refine ${opportunity.title || "an opportunity"}`,
      });
    },
  };
}
