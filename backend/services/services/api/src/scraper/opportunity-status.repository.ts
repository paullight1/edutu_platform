import type { SupabaseClient } from "@supabase/supabase-js";

type WarnLogger = {
  warn(message: string): unknown;
};

/** Read-only persistence boundary used to preserve admin-owned opportunity status. */
export class OpportunityStatusRepository {
  constructor(
    private readonly getClient: () => SupabaseClient | undefined,
    private readonly logger: WarnLogger,
  ) {}

  async findByCanonicalUrls(
    canonicalUrls: readonly string[],
  ): Promise<Map<string, string>> {
    const statuses = new Map<string, string>();
    const urls = canonicalUrls.filter(Boolean);
    const client = this.getClient();
    if (urls.length === 0 || !client) return statuses;

    const chunkSize = 200;
    try {
      for (let index = 0; index < urls.length; index += chunkSize) {
        const { data, error } = await client
          .from("opportunities")
          .select("id, canonical_url, status")
          .in("canonical_url", urls.slice(index, index + chunkSize));
        if (error) throw error;

        for (const row of (data as Array<{
          canonical_url: string | null;
          status: string | null;
        }>) ?? []) {
          if (row.canonical_url && row.status) {
            statuses.set(row.canonical_url, row.status);
          }
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `Could not fetch existing statuses (statuses may be overwritten this run): ${error.message}`,
      );
      return new Map();
    }

    return statuses;
  }
}
