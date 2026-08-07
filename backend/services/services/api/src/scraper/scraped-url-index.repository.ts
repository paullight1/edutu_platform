import type { SupabaseClient } from "@supabase/supabase-js";

type WarnLogger = {
  warn(message: string): unknown;
};

type UrlItem = {
  apply_url: string;
};

type PersistedOpportunity = {
  id?: string | null;
  application_url?: string | null;
  canonical_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Persistence adapter for the crawler's URL index. It tracks discovered and
 * processed URLs and determines which listing items need re-enrichment.
 */
export class ScrapedUrlIndexRepository {
  constructor(
    private readonly getClient: () => SupabaseClient | undefined,
    private readonly normalizeUrl: (url: string) => string,
    private readonly logger: WarnLogger,
  ) {}

  async recordDiscovered(
    source: { id: number; name: string },
    items: readonly UrlItem[],
  ): Promise<void> {
    const client = this.getClient();
    if (!client || items.length === 0) return;

    const now = new Date().toISOString();
    const rows = Array.from(
      new Map(
        items
          .map((item) => this.normalizeUrl(item.apply_url))
          .filter(Boolean)
          .map((url) => [
            url,
            { url, source_id: source.id, status: "pending", last_checked: now },
          ]),
      ).values(),
    );
    if (rows.length === 0) return;

    const { error } = await client
      .from("scraped_urls")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: false });
    if (error) {
      this.logger.warn(
        `Could not record discovered URLs for ${source.name}: ${error.message}`,
      );
    }
  }

  async partitionKnown<T extends UrlItem>(
    items: readonly T[],
    recheckAfterDays: number,
  ): Promise<{ fresh: T[]; skipped: T[] }> {
    const client = this.getClient();
    if (!client || items.length === 0)
      return { fresh: [...items], skipped: [] };

    try {
      const urlByItem = new Map<T, string>();
      for (const item of items) {
        const url = this.normalizeUrl(item.apply_url);
        if (url) urlByItem.set(item, url);
      }
      const urls = [...new Set(urlByItem.values())];
      if (urls.length === 0) return { fresh: [...items], skipped: [] };

      const { data, error } = await client
        .from("scraped_urls")
        .select("url, status, last_checked")
        .in("url", urls);
      if (error) throw error;

      const cutoff = Date.now() - recheckAfterDays * 24 * 60 * 60 * 1000;
      const recentlyProcessed = new Set(
        (data ?? [])
          .filter(
            (row) =>
              row.status === "processed" &&
              row.last_checked &&
              new Date(row.last_checked).getTime() >= cutoff,
          )
          .map((row) => row.url),
      );
      if (recentlyProcessed.size === 0)
        return { fresh: [...items], skipped: [] };

      const candidateApplyUrls = [
        ...new Set(
          items
            .filter((item) => recentlyProcessed.has(urlByItem.get(item) ?? ""))
            .map((item) => item.apply_url),
        ),
      ];
      const { data: existing, error: existsError } = await client
        .from("opportunities")
        .select("apply_url")
        .in("apply_url", candidateApplyUrls);
      if (existsError) throw existsError;
      const existingApplyUrls = new Set(
        (existing ?? []).map((row) => row.apply_url),
      );

      const fresh: T[] = [];
      const skipped: T[] = [];
      for (const item of items) {
        const known =
          recentlyProcessed.has(urlByItem.get(item) ?? "") &&
          existingApplyUrls.has(item.apply_url);
        (known ? skipped : fresh).push(item);
      }
      return { fresh, skipped };
    } catch (error: any) {
      this.logger.warn(
        `Incremental skip check failed (enriching everything): ${error.message}`,
      );
      return { fresh: [...items], skipped: [] };
    }
  }

  async touchSkipped(items: readonly UrlItem[]): Promise<void> {
    const client = this.getClient();
    if (!client || items.length === 0) return;

    const now = new Date().toISOString();
    const normalizedUrls = [
      ...new Set(
        items.map((item) => this.normalizeUrl(item.apply_url)).filter(Boolean),
      ),
    ];
    const applyUrls = [
      ...new Set(items.map((item) => item.apply_url).filter(Boolean)),
    ];
    const [urlUpdate, opportunityUpdate] = await Promise.all([
      client
        .from("scraped_urls")
        .update({ last_checked: now })
        .in("url", normalizedUrls),
      client
        .from("opportunities")
        .update({ last_seen_at: now })
        .in("apply_url", applyUrls),
    ]);
    if (urlUpdate.error) {
      this.logger.warn(
        `Could not bump last_checked for skipped URLs: ${urlUpdate.error.message}`,
      );
    }
    if (opportunityUpdate.error) {
      this.logger.warn(
        `Could not bump last_seen_at for skipped opportunities: ${opportunityUpdate.error.message}`,
      );
    }
  }

  async markProcessed(records: readonly PersistedOpportunity[]): Promise<void> {
    const client = this.getClient();
    if (!client || records.length === 0) return;

    await Promise.all(
      records.map(async (record) => {
        const url = this.normalizeUrl(
          String(
            record.metadata?.aggregator_url ??
              record.application_url ??
              record.canonical_url ??
              "",
          ),
        );
        if (!url) return;

        const { error } = await client
          .from("scraped_urls")
          .update({
            status: "processed",
            opportunity_id: record.id ?? null,
            last_checked: new Date().toISOString(),
          })
          .eq("url", url);
        if (error) {
          this.logger.warn(
            `Could not mark URL processed (${url}): ${error.message}`,
          );
        }
      }),
    );
  }
}
