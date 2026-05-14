import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CronJob } from 'cron';
import axios from 'axios';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { AiService } from '../ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrapeOptions {
  sourceId?: number;
  allSources?: boolean;
  maxPages?: number;
}

export interface ScrapeSource {
  id: number;
  name: string;
  url: string;
  tier: number;
  category: string;
  enabled: boolean;
  priority?: number;
  parent_id?: number;
  is_group?: boolean;
  config?: any; // To hold custom selectors
}

interface RawItem {
  title: string;
  /** URL of the aggregator detail page (used as fallback apply link) */
  apply_url: string;
  /** Real provider apply link extracted from the detail page */
  direct_apply_url?: string | null;
  /** og:image from the detail page */
  image_url?: string | null;
  description?: string;
  amount?: number | null;
  deadline?: string | null;
  location?: string;
  requirements?: string[];
  benefits?: string[];
  application_process?: string[];
  source: string;
  source_url: string;
}

const GeminiExtractionSchema = z.object({
  requirements: z.array(z.string()).optional().default([]),
  benefits: z.array(z.string()).optional().default([]),
  deadline: z.string().nullable().optional(),
  description: z.string().optional(),
  application_process: z.array(z.string()).optional().default([]),
});

type GeminiExtraction = z.infer<typeof GeminiExtractionSchema>;

interface SourceResult {
  name: string;
  url: string;
  status: 'success' | 'failed' | 'skipped';
  itemsFound: number;
  itemsSaved: number;
  error?: string;
  duration?: number;
}

export interface ScrapeResult {
  success: boolean;
  sourcesScraped?: number;
  totalResults?: number;
  duration?: number;
  sources?: string[];
  error?: string;
  sourceResults?: SourceResult[];
  opportunities?: RawItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

const DEFAULT_CONTENT_SELECTORS =
  'article, .entry-content, .post-content, main, [class*="content"], [class*="article"]';
const DEEP_TEXT_MAX_CHARS = 10_000;
const DEEP_FETCH_DELAY_MS = 2_000;
const LIST_PAGE_DELAY_MS = 1_500;
const MAX_ITEMS_PER_PAGE = 20;
const MAX_PAGES_CAP = 5;
const MAX_BACKOFF_ATTEMPTS = 4;
const ENRICH_CONCURRENCY = 3;
const MIN_DESCRIPTION_CHARS = 240;
const MIN_PUBLISH_QUALITY_SCORE = 60;

// Currency symbol → ISO code map
const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  $: 'USD',
};

// Months for deadline regex
const MONTH_PATTERN =
  'January|February|March|April|May|June|July|August|September|October|November|December';

// Apply button text pattern
const APPLY_TEXT_RE =
  /^(apply(\s+(now|here|online))?|register|official\s+link|click\s+here|get\s+started)$/i;

// Category keyword map
const CATEGORY_MAP: Record<string, string[]> = {
  'Computer Science': [
    'computer science',
    'software',
    'programming',
    'coding',
    'data science',
    'ai',
    'machine learning',
  ],
  Engineering: ['engineering', 'mechanical', 'electrical', 'civil', 'chemical'],
  Business: [
    'business',
    'mba',
    'entrepreneurship',
    'finance',
    'accounting',
    'economics',
  ],
  Medical: ['medical', 'medicine', 'health', 'nursing', 'pharmacy', 'biology'],
  Arts: ['art', 'design', 'music', 'film', 'creative', 'writing', 'journalism'],
  Law: ['law', 'legal', 'jurisprudence', 'llm'],
  Science: ['physics', 'chemistry', 'mathematics', 'research'],
  Education: ['education', 'teaching', 'teacher'],
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private supabase: SupabaseClient;

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly aiService: AiService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      this.logger.log('Supabase client initialized.');
    } else {
      this.logger.warn(
        'Supabase not configured — scraping will use mock data.',
      );
    }
  }

  async onModuleInit() {
    this.logger.log('Initializing dynamic scraper schedule...');
    await this.initializeSchedule();
  }

  private async initializeSchedule() {
    if (!this.supabase) return;

    try {
      const { data: configs } = await this.supabase
        .from('scraper_config')
        .select('*');

      const enabled =
        configs?.find((c) => c.key === 'auto_run_enabled')?.value === true;
      const schedule =
        configs?.find((c) => c.key === 'cron_schedule')?.value || '0 0 * * *';

      if (enabled) {
        this.scheduleJob(schedule);
      } else {
        this.logger.log('Auto-run is disabled in config.');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize schedule: ${error.message}`);
    }
  }

  private scheduleJob(cronTime: string) {
    const jobName = 'scheduled-scrape';

    // Remove existing job if any
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch (e) {
      // Job might not exist, that's fine
    }

    const job = new CronJob(cronTime, () => {
      this.logger.log(`Executing dynamic scheduled scrape (${cronTime})`);
      this.runScraper({ allSources: true, maxPages: 2 });
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
    this.logger.log(`Scraper scheduled: ${cronTime}`);
  }

  // ─── Public: Settings ─────────────────────────────────────────────────────

  async getSettings() {
    if (!this.supabase)
      return { auto_run_enabled: false, cron_schedule: '0 0 * * *' };
    const { data } = await this.supabase.from('scraper_config').select('*');
    return {
      auto_run_enabled:
        data?.find((c) => c.key === 'auto_run_enabled')?.value ?? false,
      cron_schedule:
        data?.find((c) => c.key === 'cron_schedule')?.value ?? '0 0 * * *',
      data_retention_days:
        data?.find((c) => c.key === 'data_retention_days')?.value ?? null,
    };
  }

  async updateSettings(body: {
    auto_run_enabled?: boolean;
    cron_schedule?: string;
    data_retention_days?: number | null;
  }) {
    if (!this.supabase) return { success: false, error: 'No database' };

    if (body.auto_run_enabled !== undefined) {
      await this.supabase
        .from('scraper_config')
        .update({ value: body.auto_run_enabled })
        .eq('key', 'auto_run_enabled');
    }
    if (body.cron_schedule !== undefined) {
      await this.supabase
        .from('scraper_config')
        .update({ value: body.cron_schedule })
        .eq('key', 'cron_schedule');
    }
    if (body.data_retention_days !== undefined) {
      // Logic for data_retention_days
      const { data, error } = await this.supabase
        .from('scraper_config')
        .upsert(
          { key: 'data_retention_days', value: body.data_retention_days },
          { onConflict: 'key' },
        );
      if (error) this.logger.error(`Upsert retention failed: ${error.message}`);
    }

    // Re-initialize schedule
    await this.initializeSchedule();

    return { success: true };
  }

  // ─── Public: run scraper ──────────────────────────────────────────────────

  async runScraper(options: ScrapeOptions): Promise<ScrapeResult> {
    const { sourceId, allSources, maxPages = 3 } = options;
    const startTime = Date.now();

    this.logger.log(
      `Starting scrape: sourceId=${sourceId}, allSources=${allSources}, maxPages=${maxPages}`,
    );

    if (!this.supabase) {
      this.logger.warn('No Supabase client — returning mock data');
      return this.mockScrape();
    }

    const jobLogId = await this.startJobLog(options);

    try {
      const sources = await this.resolveSources({ sourceId, allSources });

      if (sources.length === 0) {
        this.logger.warn('No sources found — creating default sources');
        return await this.createDefaultSources();
      }

      this.logger.log(`Found ${sources.length} source(s) to scrape`);
      const { results, sourceResults } = await this.crawlSources(
        sources,
        maxPages,
        jobLogId,
      );
      const duration = Math.round((Date.now() - startTime) / 1000);

      await this.finishJobLog(jobLogId, 'completed', {
        itemsFound: results.length,
        duration,
        sourceResults,
      });

      return {
        success: true,
        sourcesScraped: sources.length,
        totalResults: results.length,
        duration,
        sources: sources.map((s) => s.name),
        sourceResults,
        opportunities: results,
      };
    } catch (error: any) {
      this.logger.error(`Scraper error: ${error.message}`, error.stack);
      await this.finishJobLog(jobLogId, 'failed', {
        errorMessage: error.message,
      });
      return {
        success: false,
        error: error.message ?? 'Unknown error occurred',
      };
    }
  }

  // ─── Job Logging ──────────────────────────────────────────────────────────

  private async startJobLog(options: ScrapeOptions): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('scrape_logs')
      .insert({
        status: 'running',
        started_at: new Date().toISOString(),
        options: JSON.stringify(options),
        run_type: 'manual',
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error(`Error starting job log: ${JSON.stringify(error)}`);
    }

    return data?.id ?? null;
  }

  private async finishJobLog(
    jobLogId: string | null,
    status: 'completed' | 'failed',
    extra: {
      itemsFound?: number;
      duration?: number;
      sourceResults?: SourceResult[];
      errorMessage?: string;
    },
  ): Promise<void> {
    if (!jobLogId) return;
    await this.supabase
      .from('scrape_logs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        ...(extra.itemsFound != null && { items_found: extra.itemsFound }),
        ...(extra.duration != null && { duration_seconds: extra.duration }),
        ...(extra.sourceResults && {
          source_results: JSON.stringify(extra.sourceResults),
        }),
        ...(extra.errorMessage && { error_message: extra.errorMessage }),
      })
      .eq('id', jobLogId);

    // Auto-enforce retention policy after successful job
    if (status === 'completed') {
      await this.enforceRetentionPolicy();
    }
  }

  private async enforceRetentionPolicy(): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data: settings } = await this.supabase
        .from('scraper_config')
        .select('*')
        .eq('key', 'data_retention_days')
        .single();
      const days = typeof settings?.value === 'number' ? settings.value : null;
      if (!days || days <= 0) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Batch delete in chunks of 1000 to avoid table locks
      let deletedCount = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await this.supabase
          .from('opportunities')
          .select('id')
          .lt('created_at', cutoffDate.toISOString())
          .limit(1000);

        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        const ids = data.map((row) => row.id);
        const { error: deleteError } = await this.supabase
          .from('opportunities')
          .delete()
          .in('id', ids);

        if (deleteError) throw deleteError;
        deletedCount += ids.length;

        if (data.length < 1000) {
          hasMore = false;
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Retention enforced: Deleted ${deletedCount} records older than ${days} days`,
        );
      }
    } catch (e: any) {
      this.logger.error(`Retention enforcement error: ${e.message}`);
    }
  }

  // ─── Source Resolution ────────────────────────────────────────────────────

  private async resolveSources({
    sourceId,
    allSources,
  }: Pick<ScrapeOptions, 'sourceId' | 'allSources'>): Promise<ScrapeSource[]> {
    if (allSources) {
      const { data, error } = await this.supabase
        .from('scraping_sources')
        .select('*')
        .eq('enabled', true)
        .eq('is_group', false)
        .order('priority');
      if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
      return data ?? [];
    }

    if (sourceId) {
      const { data: source, error: sourceError } = await this.supabase
        .from('scraping_sources')
        .select('*')
        .eq('id', sourceId)
        .single();
      if (sourceError)
        throw new Error(`Failed to fetch source: ${sourceError.message}`);
      if (!source) return [];

      if (source.is_group) {
        const { data: children, error: childrenError } = await this.supabase
          .from('scraping_sources')
          .select('*')
          .eq('parent_id', sourceId)
          .eq('enabled', true);
        if (childrenError)
          throw new Error(
            `Failed to fetch child sources: ${childrenError.message}`,
          );
        return children ?? [];
      }

      return [source];
    }

    return [];
  }

  // ─── Default Sources ──────────────────────────────────────────────────────

  private async createDefaultSources(): Promise<ScrapeResult> {
    const defaults = [
      {
        url: 'https://opportunitiescircle.com/scholarships/',
        name: 'Opportunities Circle',
        description: 'Scholarship aggregator',
        tier: 1,
        category: 'scholarship',
        enabled: true,
        priority: 1,
      },
      {
        url: 'https://scholars4dev.com/',
        name: 'Scholars4Dev',
        description: 'International scholarships',
        tier: 1,
        category: 'scholarship',
        enabled: true,
        priority: 2,
      },
      {
        url: 'https://www.scholarshipportal.com/scholarships',
        name: 'Scholarship Portal',
        description: 'European scholarships',
        tier: 2,
        category: 'scholarship',
        enabled: true,
        priority: 3,
      },
    ];
    const { error } = await this.supabase
      .from('scraping_sources')
      .upsert(defaults, { onConflict: 'url' });
    if (error) {
      this.logger.error(`Failed to create default sources: ${error.message}`);
      return { success: false, error: error.message };
    }
    return {
      success: true,
      sourcesScraped: 0,
      totalResults: 0,
      duration: 1,
      sources: [],
    };
  }

  // ─── Crawling ─────────────────────────────────────────────────────────────

  private async crawlSources(
    sources: ScrapeSource[],
    maxPages: number,
    jobLogId: string | null,
  ): Promise<{ results: RawItem[]; sourceResults: SourceResult[] }> {
    const allResults: RawItem[] = [];
    const sourceResults: SourceResult[] = [];
    const pagesToCrawl = Math.min(maxPages, MAX_PAGES_CAP);

    for (const source of sources) {
      const sourceStartTime = Date.now();
      let itemsFound = 0;

      try {
        this.logger.log(`Crawling: ${source.name} (${source.url})`);

        for (let page = 1; page <= pagesToCrawl; page++) {
          const pageUrl = this.buildPageUrl(source.url, page);
          this.logger.log(`  → Fetching page ${page}: ${pageUrl}`);

          try {
            const html = await this.fetchHTML(pageUrl);
            if (
              page > 1 &&
              !this.hasNextPage(html, page, source.config?.next_page_selector)
            ) {
              this.logger.log(
                `  → No next page found after page ${page - 1}, stopping.`,
              );
              break;
            }
            const basicItems = this.extractItemsFromList(html, source);
            const enrichedItems = await this.enrichItems(
              basicItems,
              source.config?.content_selectors,
            );
            allResults.push(...enrichedItems);
            itemsFound += enrichedItems.length;
            this.logger.log(
              `  ✓ ${enrichedItems.length} items enriched from page ${page}`,
            );
          } catch (pageError: any) {
            this.logger.error(
              `  ✗ Error on page ${page} of "${source.name}": ${pageError.message}`,
            );
            break;
          }

          await this.delay(LIST_PAGE_DELAY_MS);
        }

        await this.updateSourceStatus(source.id, true, itemsFound);
        const duration = Math.round((Date.now() - sourceStartTime) / 1000);
        sourceResults.push({
          name: source.name,
          url: source.url,
          status: 'success',
          itemsFound,
          itemsSaved: 0,
          duration,
        });
      } catch (error: any) {
        this.logger.error(`Error crawling "${source.name}": ${error.message}`);
        await this.updateSourceStatus(source.id, false, 0, error.message);
        sourceResults.push({
          name: source.name,
          url: source.url,
          status: 'failed',
          itemsFound: 0,
          itemsSaved: 0,
          error: error.message,
        });
      }
    }

    if (allResults.length > 0) {
      await this.persistOpportunities(allResults, sourceResults, jobLogId);
    }

    return { results: allResults, sourceResults };
  }

  private async persistOpportunities(
    results: RawItem[],
    sourceResults: SourceResult[],
    jobLogId: string | null,
  ): Promise<void> {
    const rawRecords = results.map((item) =>
      this.transformToOpportunity(item, jobLogId),
    );

    // Deduplicate within the payload based on canonical_url to avoid Supabase ON CONFLICT errors
    const uniqueRecords: Record<string, unknown>[] = [];
    const seenUrls = new Set<string>();
    for (const rec of rawRecords) {
      const url = rec.canonical_url as string;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        uniqueRecords.push(rec as Record<string, unknown>);
      }
    }

    const { error } = await this.supabase
      .from('opportunities')
      .upsert(uniqueRecords, {
        onConflict: 'canonical_url',
        ignoreDuplicates: false,
      });

    if (error) {
      this.logger.warn(`Could not save opportunities: ${error.message}`);
    } else {
      this.logger.log(
        `Saved/updated ${uniqueRecords.length} opportunities in database.`,
      );
      sourceResults.forEach((sr) => {
        if (sr.status === 'success') sr.itemsSaved = uniqueRecords.length;
      });
    }
  }

  // ─── Deep Enrichment ──────────────────────────────────────────────────────

  private async enrichItems(
    items: RawItem[],
    customContentSelectors?: string,
  ): Promise<RawItem[]> {
    const enriched: RawItem[] = [];

    // Process in batches defined by ENRICH_CONCURRENCY
    for (let i = 0; i < items.length; i += ENRICH_CONCURRENCY) {
      const batch = items.slice(i, i + ENRICH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((item) => this.enrichItem(item, customContentSelectors)),
      );
      enriched.push(...batchResults);
    }

    return enriched;
  }

  private async enrichItem(
    item: RawItem,
    customContentSelectors?: string,
    retry = 1,
  ): Promise<RawItem> {
    if (!item.apply_url?.startsWith('http')) return item;

    // Cache check: skip deep fetch if already enriched
    if (this.supabase && retry === 1) {
      // Only check cache on first attempt
      const { data: existing } = await this.supabase
        .from('opportunities')
        .select('metadata, description, image_url, application_url')
        .eq('application_url', item.apply_url)
        .maybeSingle();

      const cached = existing?.metadata as Record<string, any> | null;
      if (
        cached &&
        Array.isArray(cached.requirements) &&
        cached.requirements.length > 0
      ) {
        this.logger.log(`  ↳ Cache hit for ${item.apply_url}`);
        return {
          ...item,
          requirements: cached.requirements,
          benefits: cached.benefits ?? [],
          description:
            (existing?.description as string | undefined) ?? item.description,
          direct_apply_url: existing?.application_url ?? item.direct_apply_url,
          image_url: existing?.image_url ?? item.image_url,
        };
      }
    }

    try {
      if (retry === 1) this.logger.log(`  ↳ Deep fetch: ${item.apply_url}`);
      const html = await this.fetchDeepHTML(item.apply_url);

      // Extract structured data from HTML (all done on same fetched HTML, zero extra requests)
      const sourceHost = new URL(item.apply_url).hostname;
      const directApplyUrl = this.extractApplyLink(html, sourceHost);
      let imageUrl = this.extractOgImage(html);
      if (imageUrl) {
        const proxiedUrl = await this.proxyImageToStorage(imageUrl);
        if (proxiedUrl) imageUrl = proxiedUrl;
      }
      const text = this.extractTextFromHTML(html, customContentSelectors);

      if (directApplyUrl)
        this.logger.log(`    ↳ Direct apply link: ${directApplyUrl}`);
      if (imageUrl) this.logger.log(`    ↳ Image Proxied: ${imageUrl}`);

      const ai = await this.refineWithGemini(text);

      // If Gemini returned empty data, and we have retries left, try again with a delay
      if (
        !ai.requirements?.length &&
        !ai.benefits?.length &&
        !ai.description &&
        retry > 0
      ) {
        this.logger.warn(
          `    ↳ Empty AI extraction, retrying ${item.apply_url} (retries left: ${retry})`,
        );
        await this.delay(1000);
        return this.enrichItem(item, customContentSelectors, retry - 1);
      }

      return {
        ...item,
        direct_apply_url: directApplyUrl ?? item.direct_apply_url,
        image_url: imageUrl ?? item.image_url,
        requirements: ai.requirements?.length
          ? ai.requirements
          : (item.requirements ?? []),
        benefits: ai.benefits?.length ? ai.benefits : (item.benefits ?? []),
        description: ai.description || item.description,
        deadline: ai.deadline || item.deadline,
        application_process: ai.application_process?.length
          ? ai.application_process
          : (item.application_process ?? ['Online application']),
      };
    } catch (e: any) {
      this.logger.warn(
        `  ↳ Deep fetch failed for ${item.apply_url}: ${e.message}`,
      );
      return item;
    }
  }

  // ─── Pagination ───────────────────────────────────────────────────────────

  private hasNextPage(
    html: string,
    currentPage: number,
    customSelector?: string,
  ): boolean {
    const $ = cheerio.load(html);
    const selector =
      customSelector ||
      `a[href*="/page/${currentPage + 1}/"], a[href*="page=${currentPage + 1}"], a.next, .nav-next a, .pagination a:contains("Next"), .pagination a:contains("»")`;
    return $(selector).length > 0;
  }

  // ─── HTML Fetching ────────────────────────────────────────────────────────

  private async fetchWithBackoff(
    url: string,
    timeoutMs: number,
    attempt = 1,
  ): Promise<string> {
    try {
      const res = await axios.get(url, {
        timeout: timeoutMs,
        headers: BROWSER_HEADERS,
        validateStatus: (s) => s < 500,
      });

      if (res.status === 429) {
        if (attempt >= MAX_BACKOFF_ATTEMPTS)
          throw new Error(
            `Rate-limited after ${MAX_BACKOFF_ATTEMPTS} attempts on ${url}`,
          );
        const backoff = Math.pow(2, attempt) * 1_000;
        this.logger.warn(
          `  ⏳ 429 on ${url} — backing off ${backoff / 1000}s (attempt ${attempt}/${MAX_BACKOFF_ATTEMPTS})`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1);
      }

      if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 429 && attempt < MAX_BACKOFF_ATTEMPTS) {
        const backoff = Math.pow(2, attempt) * 1_000;
        this.logger.warn(
          `  ⏳ 429 (axios) on ${url} — backing off ${backoff / 1000}s`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1);
      }
      throw err;
    }
  }

  private fetchHTML(url: string): Promise<string> {
    return this.fetchWithBackoff(url, 30_000);
  }
  private fetchDeepHTML(url: string): Promise<string> {
    return this.fetchWithBackoff(url, 15_000);
  }

  private extractTextFromHTML(html: string, customSelector?: string): string {
    if (!html) return '';
    const $ = cheerio.load(html);
    $('script, style, noscript, nav, footer, header, aside, form, iframe').remove();
    const selector = customSelector || DEFAULT_CONTENT_SELECTORS;
    const candidates: string[] = [];

    $(selector).each((_, el) => {
      const candidate = $(el).text().replace(/\s+/g, ' ').trim();
      if (candidate.length >= 120) {
        candidates.push(candidate);
      }
    });

    const text = candidates.length
      ? candidates
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join('\n\n')
      : $('body').text();
    return text.replace(/\s+/g, ' ').trim().substring(0, DEEP_TEXT_MAX_CHARS);
  }

  // ─── Gemini Refinement ────────────────────────────────────────────────────

  private async refineWithGemini(text: string): Promise<GeminiExtraction> {
    const fallback: GeminiExtraction = {
      requirements: [],
      benefits: [],
      application_process: [],
    };
    if (!text || text.length < 80) return fallback;

    const prompt = `You are an educational opportunity data extraction API. From the text below, extract fields and return ONLY valid JSON matching this schema exactly:
{
  "requirements": ["string"],
  "benefits": ["string"],
  "deadline": "YYYY-MM-DD or short readable date, or null",
  "description": "3-4 sentence summary of the opportunity",
  "application_process": ["step"]
}
Leave arrays empty and strings null if not found. Do NOT add any markdown or commentary.
TEXT:
${text}`;

    try {
      const parsedJSON = await this.aiService.generateJson({
        feature: 'scraper.extract',
        prompt,
        responseMimeType: 'application/json',
        temperature: 0.05,
        metadata: { textLength: text.length },
      });

      return GeminiExtractionSchema.parse(parsedJSON || fallback);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        this.logger.warn(`Gemini validation failed: ${e.message}`);
      } else {
        this.logger.warn(`Gemini refinement failed: ${e.message}`);
      }
      return fallback;
    }
  }

  // ─── List Extraction ─────────────────────────────────────────────────────

  private extractItemsFromList(html: string, source: ScrapeSource): RawItem[] {
    const $ = cheerio.load(html);
    const items: RawItem[] = [];

    const itemSelector =
      source.config?.item_selector ||
      'article, .scholarship-card, .opportunity-card, .post-item, .listing-item, .program-card, .td-module-image-wrap';
    const cards = $(itemSelector);

    if (cards.length > 0) {
      cards.each((_, el) => {
        const $card = $(el);
        const titleSelector =
          source.config?.title_selector ||
          'h1, h2, h3, h4, .title, .entry-title';
        const title =
          $card.find(titleSelector).first().text().trim() ||
          $card.find('a').first().text().trim();
        if (!title || title.length < 5) return;

        const linkSelector = source.config?.link_selector || 'a[href]';
        const href = $card.find(linkSelector).first().attr('href') ?? '';
        const applyUrl = href.startsWith('http')
          ? href
          : `${source.url.replace(/\/$/, '')}${href}`;
        const cardText = $card.text();

        items.push({
          title: this.cleanText(title),
          apply_url: applyUrl,
          description: this.cleanText($card.find('p').first().text(), 1200),
          amount: this.extractAmount(cardText),
          deadline: this.extractDeadline(cardText),
          location: this.extractLocation(cardText),
          source: source.name,
          source_url: source.url,
        });
      });
    } else {
      // Fallback: grab all opportunity-related links
      $(
        'a[href*="scholarship"], a[href*="opportunity"], a[href*="/programs/"]',
      ).each((_, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        if (!title || title.length < 5) return;
        const href = $el.attr('href') ?? '';
        items.push({
          title: this.cleanText(title),
          apply_url: href.startsWith('http')
            ? href
            : `${source.url.replace(/\/$/, '')}${href}`,
          source: source.name,
          source_url: source.url,
        });
      });
    }

    return items.slice(0, MAX_ITEMS_PER_PAGE);
  }

  // ─── Deep-Link & Image Extraction ────────────────────────────────────────

  /**
   * Finds the real "Apply Now" link from an aggregator detail page.
   * Only returns URLs pointing to a domain OTHER than the aggregator.
   */
  private extractApplyLink(html: string, sourceHost: string): string | null {
    const $ = cheerio.load(html);
    let found: string | null = null;

    const isExternal = (href: string): boolean => {
      try {
        return new URL(href).hostname !== sourceHost;
      } catch {
        return false;
      }
    };

    // Priority 1: explicit apply/register text links to external domain
    $('a[href]').each((_, el) => {
      if (found) return;
      const href = $(el).attr('href') ?? '';
      const text = $(el).text().trim();
      if (
        href.startsWith('http') &&
        isExternal(href) &&
        APPLY_TEXT_RE.test(text)
      ) {
        found = href;
      }
    });
    if (found) return found;

    // Priority 2: styled buttons pointing externally
    $('a[class*="btn"], a[class*="button"], a[class*="apply"]').each(
      (_, el) => {
        if (found) return;
        const href = $(el).attr('href') ?? '';
        if (href.startsWith('http') && isExternal(href)) found = href;
      },
    );

    return found;
  }

  /**
   * Downloads a remote image and uploads it to Supabase Storage to prevent hotlinking and broken images.
   * Creates the bucket automatically if it does not exist.
   */
  private async proxyImageToStorage(imageUrl: string): Promise<string | null> {
    if (!this.supabase || !imageUrl) return null;
    try {
      // 1. Download image
      const res = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10_000,
      });
      const buffer = res.data;
      const contentType =
        (res.headers['content-type'] as string) || 'image/jpeg';
      const extension = contentType.split('/')[1] || 'jpg';
      const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;

      // 2. Ensure bucket exists
      const bucketName = 'opportunities_images';
      const { data: buckets } = await this.supabase.storage.listBuckets();
      if (!buckets?.find((b) => b.name === bucketName)) {
        await this.supabase.storage.createBucket(bucketName, { public: true });
        this.logger.log(`Created storage bucket: ${bucketName}`);
      }

      // 3. Upload to bucket
      const { error } = await this.supabase.storage
        .from(bucketName)
        .upload(filename, buffer, { contentType, upsert: true });

      if (error) throw error;

      // 4. Return Public CDN URL
      const { data } = this.supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);
      return data.publicUrl;
    } catch (e: any) {
      this.logger.warn(`Failed to proxy image ${imageUrl}: ${e.message}`);
      return imageUrl; // Fallback to original url
    }
  }

  /**
   * Extracts the best available image URL from open-graph or twitter card meta tags,
   * falling back to the first content image in the article body.
   */
  private extractOgImage(html: string): string | null {
    const $ = cheerio.load(html);
    const og =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="twitter:image"]').attr('content');

    if (og?.startsWith('http')) return og;

    let imgSrc: string | null = null;
    $('article img, .entry-content img, .post-content img, main img').each(
      (_, el) => {
        if (imgSrc) return;
        const src = $(el).attr('src') ?? '';
        if (src.startsWith('http') && !/logo|icon|avatar/i.test(src))
          imgSrc = src;
      },
    );
    return imgSrc;
  }

  // ─── Transform to DB Format ───────────────────────────────────────────────

  private evaluateOpportunityQuality(item: RawItem): {
    score: number;
    missingFields: string[];
  } {
    let score = 0;
    const missingFields: string[] = [];
    const description = item.description?.trim() || '';

    if (item.title?.trim().length >= 8) score += 15;
    else missingFields.push('title');

    if (description.length >= MIN_DESCRIPTION_CHARS) score += 25;
    else if (description.length >= 100) score += 12;
    else missingFields.push('description');

    if ((item.direct_apply_url || item.apply_url)?.startsWith('http')) score += 15;
    else missingFields.push('application_url');

    if (item.requirements?.length) score += 15;
    else missingFields.push('requirements');

    if (item.benefits?.length || item.amount != null) score += 10;
    else missingFields.push('benefits_or_funding');

    if (item.deadline) score += 10;
    else missingFields.push('deadline');

    if (item.location && item.location !== 'Worldwide') score += 5;
    if (item.image_url) score += 5;

    return {
      score: Math.min(100, score),
      missingFields,
    };
  }

  private transformToOpportunity(
    item: RawItem,
    jobLogId: string | null,
  ): Record<string, unknown> {
    const now = new Date().toISOString();
    const { stipend, currency } = this.parseAmount(item.amount);
    const closeDate = this.parseDate(item.deadline);
    const quality = this.evaluateOpportunityQuality(item);

    const rawUrl = item.direct_apply_url || item.apply_url || '';
    let application_url = rawUrl.split('?')[0].split('#')[0];

    if (!application_url || application_url.trim() === '') {
      const safeTitle = (item.title || 'untitled')
        .replace(/[^a-zA-Z0-9]/g, '-')
        .toLowerCase();
      const baseUrl = item.source_url || 'https://unknown-source.com';
      application_url = baseUrl.endsWith('/')
        ? `${baseUrl}${safeTitle}`
        : `${baseUrl}/${safeTitle}`;
    }

    const canonicalUrl = this.normalizeUrl(application_url);
    const contentFingerprint = this.createContentFingerprint(
      item.title || 'Untitled Opportunity',
      item.source,
      closeDate,
    );

    return {
      title: item.title || 'Untitled Opportunity',
      organization: item.source,
      category: this.categorize(item.title, item.description ?? ''),
      close_date: closeDate,
      location: item.location || 'Worldwide',
      description: item.description || '',
      application_url,
      canonical_url: canonicalUrl,
      content_fingerprint: contentFingerprint,
      quality_score: quality.score,
      validation_status: quality.score >= MIN_PUBLISH_QUALITY_SCORE ? 'valid' : 'needs_review',
      image_url: item.image_url || null,
      stipend,
      currency,
      source: 'scraper',
      tags: ['Scraped', 'Scholarship'],
      metadata: {
        source_url: item.source_url,
        aggregator_url: item.apply_url,
        scrape_job_id: jobLogId,
        extraction_quality_score: quality.score,
        extraction_missing_fields: quality.missingFields,
        description_length: item.description?.length ?? 0,
        needs_review: quality.score < MIN_PUBLISH_QUALITY_SCORE,
        requirements: item.requirements ?? [],
        benefits: item.benefits ?? [],
        application_process: item.application_process ?? ['Online application'],
      },
      created_at: now,
      updated_at: now,
      status: quality.score >= MIN_PUBLISH_QUALITY_SCORE ? 'active' : 'pending_review',
    };
  }

  private normalizeUrl(url: string): string {
    return url
      .trim()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  private createContentFingerprint(
    title: string,
    organization: string,
    closeDate: string | null,
  ): string {
    return `${title}|${organization}|${closeDate ?? ''}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // ─── Deletion ─────────────────────────────────────────────────────────────

  async deleteJobWithOpportunities(
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.supabase) return { success: false, error: 'No database client' };

    try {
      // Delete opportunities whose metadata->>'scrape_job_id' equals jobId
      // We can use a raw delete by query since Supabase PostgREST supports JSON filtering:
      const { error: oppError } = await this.supabase
        .from('opportunities')
        .delete()
        .eq('metadata->>scrape_job_id', jobId);

      if (oppError) throw oppError;

      // Delete the scraping job log itself
      const { error: jobError } = await this.supabase
        .from('scrape_logs')
        .delete()
        .eq('id', jobId);

      if (jobError) throw jobError;

      this.logger.log(`Deleted job ${jobId} and its associated opportunities.`);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`Error deleting job ${jobId}: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private parseAmount(raw: number | string | null | undefined): {
    stipend: number | null;
    currency: string;
  } {
    if (raw == null) return { stipend: null, currency: 'USD' };
    if (typeof raw === 'number')
      return { stipend: isNaN(raw) ? null : raw, currency: 'USD' };

    const str = String(raw);
    for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (str.includes(symbol)) {
        const val = parseFloat(str.replace(/[^0-9.]/g, ''));
        return { stipend: isNaN(val) ? null : val, currency: code };
      }
    }
    const val = parseFloat(str.replace(/[^0-9.]/g, ''));
    return { stipend: isNaN(val) ? null : val, currency: 'USD' };
  }

  private parseDate(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  private buildPageUrl(baseUrl: string, page: number): string {
    if (page === 1) return baseUrl;
    return baseUrl.includes('?')
      ? `${baseUrl}&page=${page}`
      : `${baseUrl.replace(/\/$/, '')}/page/${page}/`;
  }

  private cleanText(text: string, maxChars = 500): string {
    return (text ?? '').replace(/\s+/g, ' ').trim().substring(0, maxChars);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractAmount(text: string): number | null {
    const match = text.match(/[$€£]([\d,]+)/);
    if (match) {
      const n = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(n) ? null : n;
    }
    return null;
  }

  private extractDeadline(text: string): string | null {
    const patterns = [
      /deadline[:\s]*([^\n,]{5,40})/i,
      /closes?\s+(?:on\s+)?([^\n,]{5,40})/i,
      new RegExp(`(${MONTH_PATTERN})\\s+\\d{1,2},?\\s+\\d{4}`, 'i'),
      new RegExp(`\\d{1,2}\\s+(${MONTH_PATTERN})\\s+\\d{4}`, 'i'),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0].trim().substring(0, 60);
    }
    return null;
  }

  private extractLocation(text: string): string {
    const m =
      text.match(/location[:\s]*([^\n,]{3,40})/i) ||
      text.match(/based\s+in[:\s]*([^\n,]{3,40})/i);
    return m ? m[1].trim() : 'Worldwide';
  }

  private categorize(title = '', description = ''): string {
    const t = `${title} ${description}`.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_MAP)) {
      if (keywords.some((kw) => t.includes(kw))) return category;
    }
    return 'General';
  }

  // ─── Source Status ────────────────────────────────────────────────────────

  private async updateSourceStatus(
    id: number,
    success: boolean,
    scraped: number,
    error?: string,
  ): Promise<void> {
    if (!this.supabase || !id) return;
    const update: Record<string, unknown> = {
      last_scraped: new Date().toISOString(),
    };
    if (success) {
      update.last_success = update.last_scraped;
      update.last_error = null;
      update.total_scraped = scraped;
    } else {
      update.last_error = error ?? null;
    }
    await this.supabase.from('scraping_sources').update(update).eq('id', id);
  }

  // ─── Public: Sources / Jobs / Stats ──────────────────────────────────────

  async getSources(): Promise<ScrapeSource[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from('scraping_sources')
      .select('*')
      .order('priority');
    if (error) {
      this.logger.error(error.message);
      return [];
    }
    return data ?? [];
  }

  async addSource(body: {
    name: string;
    url: string;
    category?: string;
    tier?: number;
    parent_id?: number;
    is_group?: boolean;
  }) {
    if (!this.supabase)
      return { success: false, error: 'No database configured' };
    const { data, error } = await this.supabase
      .from('scraping_sources')
      .insert({
        name: body.name,
        url: body.url,
        category: body.category ?? 'scholarship',
        tier: body.tier ?? 2,
        enabled: true,
        parent_id: body.parent_id || null,
        is_group: !!body.is_group,
      })
      .select()
      .single();
    return error
      ? { success: false, error: error.message }
      : { success: true, data };
  }

  async deleteSource(id: number) {
    if (!this.supabase)
      return { success: false, error: 'No database configured' };
    const { error } = await this.supabase
      .from('scraping_sources')
      .delete()
      .eq('id', id);
    return { success: !error, error: error?.message };
  }

  async updateSource(id: number, body: { enabled?: boolean }) {
    if (!this.supabase)
      return { success: false, error: 'No database configured' };
    const { error } = await this.supabase
      .from('scraping_sources')
      .update(body)
      .eq('id', id);
    return { success: !error, error: error?.message };
  }

  async getJobs() {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from('scrape_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return [];
    return data ?? [];
  }

  async getStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
  }> {
    if (!this.supabase) return { total: 0, bySource: {} };

    // Use aggregation query instead of fetching all rows
    const { data, error } = await this.supabase.rpc('count_opportunities_by_source');

    if (error) {
      this.logger.warn(`Stats query failed: ${error.message}, falling back to row fetch`);
      const { data: fallbackData, error: fallbackError } = await this.supabase
        .from('opportunities')
        .select('source');
      if (fallbackError) return { total: 0, bySource: {} };

      const bySource: Record<string, number> = {};
      for (const item of fallbackData ?? []) {
        const src = item.source ?? 'manual';
        bySource[src] = (bySource[src] ?? 0) + 1;
      }
      return { total: fallbackData?.length ?? 0, bySource };
    }

    const bySource: Record<string, number> = {};
    let total = 0;
    for (const row of data ?? []) {
      bySource[row.source] = row.count;
      total += row.count;
    }
    return { total, bySource };
  }

  // ─── Mock Data ────────────────────────────────────────────────────────────

  private async mockScrape(): Promise<ScrapeResult> {
    const now = new Date().toISOString();
    const mock = [
      {
        title: 'International Scholarship for Students',
        organization: 'Global Education Foundation',
        category: 'Education',
        close_date: '2025-12-31',
        location: 'Worldwide',
        description:
          'Fully funded scholarship for international students pursuing undergraduate studies.',
        metadata: {
          requirements: [
            'High school diploma',
            'English proficiency',
            'Leadership experience',
          ],
          benefits: ['Full tuition', 'Living stipend', 'Travel allowance'],
          application_process: [
            'Online application',
            'Essay submission',
            'Interview',
          ],
        },
        application_url: 'https://example.com/apply',
        canonical_url: 'https://example.com/apply',
        content_fingerprint: 'international scholarship for students|global education foundation|2025-12-31',
        quality_score: 100,
        validation_status: 'valid',
        stipend: 50000,
        currency: 'USD',
        source: 'scraper',
        created_at: now,
        updated_at: now,
        status: 'active',
        tags: ['Scholarship', 'International', 'Fully Funded'],
      },
    ];

    if (this.supabase) {
      const { error } = await this.supabase
        .from('opportunities')
        .upsert(mock, { onConflict: 'canonical_url' });
      if (error) this.logger.warn(`Mock save failed: ${error.message}`);
    }

    return {
      success: true,
      sourcesScraped: 1,
      totalResults: mock.length,
      duration: 1,
      sources: ['Mock Source'],
      sourceResults: [
        {
          name: 'Mock Source',
          url: 'https://example.com',
          status: 'success',
          itemsFound: mock.length,
          itemsSaved: mock.length,
          duration: 1,
        },
      ],
    };
  }
}
