import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CronJob } from "cron";
import axios from "axios";
import { z } from "zod";
import * as cheerio from "cheerio";
import { pool } from "../db";
import { AiService } from "../ai";
import { OpportunityShareCardService } from "../opportunities/opportunity-share-card.service";
import { classifyOpportunity } from "../opportunities/opportunity-categorization";
import {
  parseDeadlineDetailed,
  extractDeadlineText,
} from "../opportunities/deadline.util";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { RobotsChecker } from "./robots-checker";
import { OpportunityDedupService } from "./opportunity-dedup.service";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrapeOptions {
  sourceId?: number;
  allSources?: boolean;
  maxPages?: number;
}

/**
 * Live progress event emitted during a scrape run (consumed by the SSE
 * endpoint). Optional — synchronous callers pass no listener.
 */
export type ScrapeStreamEvent =
  | { type: "start"; totalSources: number; sources: string[] }
  | { type: "source-start"; name: string }
  | { type: "opportunity"; opportunity: unknown }
  | { type: "source-done"; name: string; itemsFound: number; error?: string }
  | { type: "control"; state: "paused" | "resumed" | "stopping" };

export type ScrapeEventListener = (event: ScrapeStreamEvent) => void;

/** Live pause/stop control for the single in-flight scrape (advisory-locked). */
interface ActiveRunControl {
  paused: boolean;
  stopRequested: boolean;
  emit?: ScrapeEventListener;
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
  /** Original (pre-proxy) image URL — kept so duplicate site-default images
   *  can be detected across items and runs. */
  source_image_url?: string | null;
  description?: string;
  amount?: number | null;
  deadline?: string | null;
  location?: string;
  requirements?: string[];
  benefits?: string[];
  application_process?: string[];
  summary?: string;
  eligibility?: Record<string, unknown>;
  funding_type?: string;
  target_region?: string;
  enrichment_confidence?: number;
  enrichment_notes?: string[];
  canonical_category?: string;
  source: string;
  source_url: string;
  source_id?: number;
}

const boundedString = (max: number) =>
  z.preprocess(
    (value) => (value === null ? undefined : value),
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((value) => value || undefined),
  );

const DeepSeekExtractionSchema = z.object({
  summary: boundedString(320),
  description: boundedString(1800),
  requirements: z.array(z.string().trim().min(2)).optional().default([]),
  benefits: z.array(z.string().trim().min(2)).optional().default([]),
  deadline: z.string().nullable().optional(),
  application_process: z.array(z.string().trim().min(2)).optional().default([]),
  eligibility: z.record(z.string(), z.unknown()).optional().default({}),
  funding_type: boundedString(120),
  target_region: boundedString(120),
  confidence: z.number().min(0).max(1).optional().default(0),
  notes: z.array(z.string().trim().min(2)).optional().default([]),
});

type DeepSeekExtraction = z.infer<typeof DeepSeekExtractionSchema>;

interface SourceResult {
  name: string;
  url: string;
  status: "success" | "failed" | "skipped";
  itemsFound: number;
  itemsSaved: number;
  urlsDiscovered?: number;
  error?: string;
  duration?: number;
  /** Non-fatal issues (e.g. a page that failed after retry) surfaced in job log warnings. */
  warnings?: string[];
}

/** Cleanliness report for one scrape run: how much of the output met the
 *  publish contract (complete, verified details) vs. was held for review. */
export interface RunOutcome {
  saved: number;
  published: number;
  needsReview: number;
  withDeadline: number;
  withImage: number;
  withOrganization: number;
  withDirectApplyLink: number;
  duplicateImagesStripped: number;
  /** Field → count of records missing it (why records were held back). */
  missingFieldCounts: Record<string, number>;
}

export interface ScrapeResult {
  success: boolean;
  sourcesScraped?: number;
  totalResults?: number;
  duration?: number;
  jobId?: string;
  sources?: string[];
  error?: string;
  sourceResults?: SourceResult[];
  opportunities?: RawItem[];
  outcome?: RunOutcome | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Fixed key for the scrape advisory lock. Any value works as long as it is
// unique across advisory-lock users in this database; chosen from the private
// range to avoid collisions with other subsystems.
const SCRAPE_ADVISORY_LOCK_KEY = 918273645;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.google.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
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
  "€": "EUR",
  "£": "GBP",
  $: "USD",
};

// Months for deadline regex
const MONTH_PATTERN =
  "January|February|March|April|May|June|July|August|September|October|November|December";

// Apply button text pattern
const APPLY_TEXT_RE =
  /\b(apply|application|apply\s+(now|here|online)|register|registration|official\s+(link|website|portal)|programme?\s+portal|submit|start\s+application|get\s+started)\b/i;
const GENERIC_LINK_TITLE_RE =
  /^(read\s+more|learn\s+more|continue\s+reading|view\s+(details|more)|more|apply(\s+(now|here|online))?|click\s+here|visit\s+site|official\s+link|submit)$/i;
const ROUNDUP_TITLE_RE =
  /^(top|best)\s+\d+\b|\b(top|best)\s+\d+\s+(scholarships?|grants?|fellowships?|internships?|programs?|programmes?|opportunities?)\b|\b(list|collection|roundup)\s+of\b/i;
// Mirror of the opportunities_type_check DB constraint — a value outside this
// set fails the whole batch upsert.
const ALLOWED_OPPORTUNITY_TYPES = new Set([
  "internship",
  "job",
  "course",
  "mentorship",
  "competition",
  "certification",
  "fellowship",
  "scholarship",
  "bootcamp",
]);

// Taxonomy/listing segments anywhere in the path (a "/category/<slug>/" page
// is a listing, never a post), plus utility pages at the end of the path.
const NON_OPPORTUNITY_URL_RE =
  /\/(category|tag|author|search)(\/|$)|\/(page(\/\d+)?|privacy-policy|terms|about|contact)\/?$/i;
const NON_APPLY_URL_RE =
  /(facebook|twitter|x\.com|linkedin|instagram|youtube|tiktok|whatsapp|telegram|mailto:|tel:|\/feed\/|\/comments?\/|#respond)/i;
const SCRAPER_ARTIFACT_RE =
  /\b(?:by\s+admin|posted\s+by|written\s+by|on\s+[a-z]+\s+\d{1,2},\s+20\d{2}|read\s+more|continue\s+reading|leave\s+a\s+comment|comments?|share\s+this|related\s+posts?)\b/i;
const SOURCE_BRAND_RE =
  /\b(?:dixcoverhubx|dixcover\s*hubx|opportunities\s*circle|oya\s*opportunities|scholars4dev|global\s*scholar\s*desk|scholarship\s*portal|jobs\.smartyacad\.com)\b/i;
const PUBLIC_TAG_BLOCKLIST = new Set([
  "scraped",
  "scraper",
  "imported",
  "automation",
  "source",
]);

// Category keyword map — matched on word boundaries, never as raw substrings
// (a bare `includes("ai")` once tagged anything containing "aid"/"training"/
// "available" as Computer Science).
const CATEGORY_MAP: Record<string, string[]> = {
  "Computer Science": [
    "computer science",
    "software",
    "programming",
    "coding",
    "data science",
    "ai",
    "machine learning",
  ],
  Engineering: ["engineering", "mechanical", "electrical", "civil", "chemical"],
  Business: [
    "business",
    "mba",
    "entrepreneurship",
    "finance",
    "accounting",
    "economics",
  ],
  Medical: ["medical", "medicine", "health", "nursing", "pharmacy", "biology"],
  Arts: ["art", "design", "music", "film", "creative", "writing", "journalism"],
  Law: ["law", "legal", "jurisprudence", "llm"],
  Science: ["physics", "chemistry", "mathematics", "research"],
  Education: ["education", "teaching", "teacher"],
};

const CATEGORY_PATTERNS: Array<[string, RegExp]> = Object.entries(
  CATEGORY_MAP,
).map(([category, keywords]) => [
  category,
  new RegExp(
    `\\b(?:${keywords
      .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
      .join("|")})\\b`,
    "i",
  ),
]);

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ScraperService implements OnModuleInit {
  private readonly logger = new Logger(ScraperService.name);
  private supabase: SupabaseClient;
  /** Original image URL → apply_url that claimed it in the current run.
   *  Detects aggregator site-default og:images (same banner on every post)
   *  so each opportunity ends up with its own image or none. */
  private readonly imageClaimsThisRun = new Map<string, string>();

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly aiService: AiService,
    private readonly opportunityShareCardService: OpportunityShareCardService,
    private readonly scraperAlertsService: ScraperAlertsService,
    private readonly robotsChecker: RobotsChecker,
    private readonly opportunityDedupService: OpportunityDedupService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      this.logger.log("Supabase client initialized.");
    } else {
      this.logger.warn(
        "Supabase not configured — scraping will use mock data.",
      );
    }
  }

  async onModuleInit() {
    if (process.env.SCRAPER_SCHEDULER_ENABLED === "false") {
      this.logger.log(
        "Scraper scheduler disabled by SCRAPER_SCHEDULER_ENABLED=false.",
      );
      return;
    }

    this.logger.log("Initializing dynamic scraper schedule...");
    await this.initializeSchedule();
  }

  private async initializeSchedule() {
    if (!this.supabase) return;

    try {
      const { data: configs } = await this.supabase
        .from("scraper_config")
        .select("*");

      const enabled =
        configs?.find((c) => c.key === "auto_run_enabled")?.value === true;
      const schedule =
        configs?.find((c) => c.key === "cron_schedule")?.value || "0 0 * * *";

      if (enabled) {
        this.scheduleJob(schedule);
      } else {
        this.logger.log("Auto-run is disabled in config.");
      }
    } catch (error) {
      this.logger.error(`Failed to initialize schedule: ${error.message}`);
    }
  }

  private scheduleJob(cronTime: string) {
    const jobName = "scheduled-scrape";

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

  async getEngineStatus() {
    const settings = await this.getSettings().catch(() => null);
    const aiConfig = await this.aiService.listConfig().catch((error) => {
      this.logger.warn(
        `Could not read AI control-plane config: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    const scraperRoute = aiConfig?.routes?.find(
      (route: any) => route.feature === "scraper.extract",
    );
    const deepseekKey = aiConfig?.providerKeys?.find(
      (key: any) => key.provider === "deepseek" && key.isActive,
    );
    const geminiKey = aiConfig?.providerKeys?.find(
      (key: any) => key.provider === "gemini" && key.isActive,
    );
    const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY || deepseekKey);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY || geminiKey);
    let databaseReachable = false;
    let databaseError: string | undefined;

    if (this.supabase) {
      const { error } = await this.supabase
        .from("scraper_config")
        .select("key", { head: true, count: "exact" })
        .limit(1);

      if (error) {
        databaseError = error.message;
      } else {
        databaseReachable = true;
      }
    }

    const selectedProvider =
      scraperRoute?.provider ||
      (hasDeepSeek ? "deepseek" : hasGemini ? "gemini" : "deepseek");
    const selectedModel =
      scraperRoute?.model ||
      (selectedProvider === "gemini" ? "gemini-2.0-flash" : "deepseek-chat");
    let aiSource = "missing";
    if (hasDeepSeek) {
      aiSource =
        deepseekKey && process.env.DEEPSEEK_API_KEY
          ? "control-plane-and-env"
          : deepseekKey
            ? "control-plane"
            : "env";
    } else if (hasGemini) {
      aiSource =
        geminiKey && process.env.GEMINI_API_KEY
          ? "gemini-control-plane-and-env"
          : geminiKey
            ? "gemini-control-plane"
            : "gemini-env";
    }

    return {
      success: true,
      database: {
        configured: Boolean(this.supabase),
        reachable: databaseReachable,
        error: databaseError,
      },
      ai: {
        deepseekConfigured: Boolean(
          process.env.DEEPSEEK_API_KEY || deepseekKey,
        ),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY || geminiKey),
        source: aiSource,
        feature: "scraper.extract",
        provider: selectedProvider,
        model: selectedModel,
        enabled: scraperRoute?.isEnabled ?? true,
      },
      scraper: {
        schedulerEnabled: process.env.SCRAPER_SCHEDULER_ENABLED !== "false",
        autoRunEnabled: settings?.auto_run_enabled ?? false,
        cronSchedule: settings?.cron_schedule ?? "0 0 * * *",
        dataRetentionDays: settings?.data_retention_days ?? null,
        enrichConcurrency: ENRICH_CONCURRENCY,
        maxPagesCap: MAX_PAGES_CAP,
        minPublishQualityScore: MIN_PUBLISH_QUALITY_SCORE,
      },
    };
  }

  async getSettings() {
    if (!this.supabase)
      return { auto_run_enabled: false, cron_schedule: "0 0 * * *" };
    const { data } = await this.supabase.from("scraper_config").select("*");
    return {
      auto_run_enabled:
        data?.find((c) => c.key === "auto_run_enabled")?.value ?? false,
      cron_schedule:
        data?.find((c) => c.key === "cron_schedule")?.value ?? "0 0 * * *",
      data_retention_days:
        data?.find((c) => c.key === "data_retention_days")?.value ?? null,
    };
  }

  async updateSettings(body: {
    auto_run_enabled?: boolean;
    cron_schedule?: string;
    data_retention_days?: number | null;
  }) {
    if (!this.supabase) return { success: false, error: "No database" };

    if (body.auto_run_enabled !== undefined) {
      await this.supabase
        .from("scraper_config")
        .update({ value: body.auto_run_enabled })
        .eq("key", "auto_run_enabled");
    }
    if (body.cron_schedule !== undefined) {
      await this.supabase
        .from("scraper_config")
        .update({ value: body.cron_schedule })
        .eq("key", "cron_schedule");
    }
    if (body.data_retention_days !== undefined) {
      // Logic for data_retention_days
      const { data, error } = await this.supabase
        .from("scraper_config")
        .upsert(
          { key: "data_retention_days", value: body.data_retention_days },
          { onConflict: "key" },
        );
      if (error) this.logger.error(`Upsert retention failed: ${error.message}`);
    }

    // Re-initialize schedule
    await this.initializeSchedule();

    return { success: true };
  }

  async enhancePreviewOpportunity(input: Record<string, any>) {
    const sourceUrl =
      input.source_url ||
      input.sourceUrl ||
      input.source ||
      input.apply_url ||
      "";
    const applyUrl =
      input.apply_url ||
      input.applyUrl ||
      input.application_url ||
      input.applicationUrl ||
      sourceUrl;
    const item: RawItem = {
      title: this.cleanText(input.title || "Untitled Opportunity", 240),
      apply_url: applyUrl,
      direct_apply_url: input.direct_apply_url || input.directApplyUrl || null,
      image_url: input.image_url || input.imageUrl || null,
      description: input.description || input.summary || "",
      amount: input.amount ?? null,
      deadline: input.deadline || input.close_date || null,
      location: input.location || input.target_region || "Worldwide",
      requirements: input.requirements || input.metadata?.requirements || [],
      benefits: input.benefits || input.metadata?.benefits || [],
      application_process:
        input.application_process || input.metadata?.application_process || [],
      eligibility: input.eligibility || input.metadata?.eligibility || {},
      funding_type: input.funding_type || input.fundingType || null,
      target_region: input.target_region || input.targetRegion || null,
      source: input.source || input.organization || "Edutu Engine",
      source_url: sourceUrl || applyUrl,
      source_id: input.source_id,
    };

    const enriched = await this.enrichItem(item);
    const quality = this.evaluateOpportunityQuality(enriched);
    const classification = classifyOpportunity(
      enriched as unknown as Record<string, unknown>,
    );

    return {
      success: true,
      opportunity: {
        ...input,
        title: enriched.title,
        summary: enriched.summary,
        description: enriched.description,
        deadline: enriched.deadline,
        location: enriched.location,
        applyUrl: this.sanitizeUrl(enriched.direct_apply_url || enriched.apply_url),
        apply_url: this.sanitizeUrl(enriched.direct_apply_url || enriched.apply_url),
        sourceUrl: this.sanitizeUrl(enriched.apply_url),
        source_url: this.sanitizeUrl(enriched.source_url),
        imageUrl: enriched.image_url,
        image_url: enriched.image_url,
        requirements: enriched.requirements ?? [],
        benefits: enriched.benefits ?? [],
        application_process: enriched.application_process ?? [],
        eligibility: enriched.eligibility ?? {},
        funding_type: enriched.funding_type ?? null,
        target_region: enriched.target_region ?? null,
        category: classification.canonicalCategory,
        canonical_category: classification.canonicalCategory,
        metadata: {
          ...(input.metadata || {}),
          ai_improved_at: new Date().toISOString(),
          extraction_quality_score: quality.score,
          extraction_missing_fields: quality.missingFields,
          needs_review: quality.score < MIN_PUBLISH_QUALITY_SCORE,
          requirements: enriched.requirements ?? [],
          benefits: enriched.benefits ?? [],
          application_process: enriched.application_process ?? [],
        },
      },
      completeness: {
        status:
          quality.score >= MIN_PUBLISH_QUALITY_SCORE
            ? "complete"
            : "not_complete",
        score: quality.score,
        missingFields: quality.missingFields,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  // ─── Public: run scraper ──────────────────────────────────────────────────

  /**
   * Kick off a scrape without blocking the caller. Returns immediately; the
   * crawl runs in the background under the same advisory lock as runScraper,
   * so a long crawl never ties up an HTTP worker past the gateway timeout.
   * Clients poll GET /api/scraper/jobs for progress.
   */
  startScraperRun(options: ScrapeOptions): { started: boolean; error?: string } {
    if (!this.supabase) {
      return { started: false, error: "Scraper is not configured" };
    }

    void this.runScraper(options).catch((error) => {
      this.logger.error(
        `Background scrape failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return { started: true };
  }

  /**
   * Run a scrape guarded by a Postgres session-level advisory lock so that only
   * one crawl executes at a time — across every instance and across cron +
   * manual triggers. Without this, each replica's cron (and overlapping manual
   * runs) would crawl concurrently, duplicating work and AI spend.
   */
  /** Pause/stop control for the current run (only one runs at a time). */
  private activeRun: ActiveRunControl | null = null;

  /** Pause the in-flight scrape — the crawl loop halts between pages/sources. */
  pauseRun(): { ok: boolean; status: string } {
    if (!this.activeRun || this.activeRun.stopRequested) {
      return { ok: false, status: this.activeRun ? "stopping" : "idle" };
    }
    this.activeRun.paused = true;
    this.activeRun.emit?.({ type: "control", state: "paused" });
    return { ok: true, status: "paused" };
  }

  /** Resume a paused scrape. */
  resumeRun(): { ok: boolean; status: string } {
    if (!this.activeRun || this.activeRun.stopRequested) {
      return { ok: false, status: this.activeRun ? "stopping" : "idle" };
    }
    this.activeRun.paused = false;
    this.activeRun.emit?.({ type: "control", state: "resumed" });
    return { ok: true, status: "running" };
  }

  /** Request a graceful stop — the crawl finalizes with partial results. */
  stopRun(): { ok: boolean; status: string } {
    if (!this.activeRun) return { ok: false, status: "idle" };
    this.activeRun.stopRequested = true;
    this.activeRun.paused = false; // release any pause wait so the loop can exit
    this.activeRun.emit?.({ type: "control", state: "stopping" });
    return { ok: true, status: "stopping" };
  }

  getRunStatus(): { running: boolean; paused: boolean; stopping: boolean } {
    return {
      running: Boolean(this.activeRun),
      paused: Boolean(this.activeRun?.paused),
      stopping: Boolean(this.activeRun?.stopRequested),
    };
  }

  /** Block while the run is paused (unless a stop was requested). */
  private async waitWhilePaused(): Promise<void> {
    while (this.activeRun?.paused && !this.activeRun?.stopRequested) {
      await this.delay(400);
    }
  }

  async runScraper(
    options: ScrapeOptions,
    onEvent?: ScrapeEventListener,
  ): Promise<ScrapeResult> {
    const { sourceId, allSources, maxPages = 3 } = options;

    this.logger.log(
      `Starting scrape: sourceId=${sourceId}, allSources=${allSources}, maxPages=${maxPages}`,
    );

    if (!this.supabase) {
      this.logger.warn("No Supabase client — returning mock data");
      return this.mockScrape();
    }

    // Register pause/stop control only once the advisory lock is held, so a
    // concurrent (lock-losing) call can never clobber the active run's control.
    const lock = await this.withScrapeLock(() => {
      this.activeRun = { paused: false, stopRequested: false, emit: onEvent };
      return this.executeScraperRun(options, onEvent).finally(() => {
        this.activeRun = null;
      });
    });

    if (!lock.acquired) {
      this.logger.warn(
        "Skipping scrape: another run is already in progress (advisory lock held).",
      );
      return { success: false, error: "A scrape run is already in progress" };
    }

    return lock.result;
  }

  /**
   * Acquire the scrape advisory lock on a dedicated pooled connection, run the
   * work, then release it. Session-level (not xact) so we don't hold an open
   * transaction for the multi-minute crawl. Returns acquired:false immediately
   * when another holder has the lock.
   */
  private async withScrapeLock<T>(
    run: () => Promise<T>,
  ): Promise<{ acquired: true; result: T } | { acquired: false }> {
    const client = await pool.connect();
    try {
      const res = await client.query<{ locked: boolean }>(
        "select pg_try_advisory_lock($1) as locked",
        [SCRAPE_ADVISORY_LOCK_KEY],
      );
      if (!res.rows[0]?.locked) {
        return { acquired: false };
      }

      try {
        const result = await run();
        return { acquired: true, result };
      } finally {
        await client
          .query("select pg_advisory_unlock($1)", [SCRAPE_ADVISORY_LOCK_KEY])
          .catch((error) =>
            this.logger.warn(
              `Failed to release scrape advisory lock: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
      }
    } finally {
      client.release();
    }
  }

  private async executeScraperRun(
    options: ScrapeOptions,
    onEvent?: ScrapeEventListener,
  ): Promise<ScrapeResult> {
    const { sourceId, allSources, maxPages = 3 } = options;
    const startTime = Date.now();

    // Fresh image-uniqueness ledger per run; cross-run duplicates are caught
    // by the metadata.source_image_url check against the database.
    this.imageClaimsThisRun.clear();

    const jobLogId = await this.startJobLog(options);

    try {
      const sources = await this.resolveSources({ sourceId, allSources });

      if (sources.length === 0) {
        this.logger.warn("No sources found — creating default sources");
        return await this.createDefaultSources();
      }

      this.logger.log(`Found ${sources.length} source(s) to scrape`);
      onEvent?.({
        type: "start",
        totalSources: sources.length,
        sources: sources.map((s) => s.name),
      });
      const { results, sourceResults, outcome } = await this.crawlSources(
        sources,
        maxPages,
        jobLogId,
        onEvent,
      );
      const duration = Math.round((Date.now() - startTime) / 1000);

      await this.finishJobLog(jobLogId, "completed", {
        itemsFound: results.length,
        duration,
        sourceResults,
        outcome,
      });

      // Fire-and-forget alerting. Read-only and wrapped so it can never break a
      // successful scrape. Flags sources with >= 3 consecutive failures.
      void this.runPostScrapeAlerts(sources).catch((alertError) => {
        this.logger.warn(
          `Post-scrape alerting failed: ${
            alertError instanceof Error ? alertError.message : "unknown error"
          }`,
        );
      });

      return {
        success: true,
        sourcesScraped: sources.length,
        totalResults: results.length,
        duration,
        jobId: jobLogId ?? undefined,
        sources: sources.map((s) => s.name),
        sourceResults,
        opportunities: results,
        outcome,
      };
    } catch (error: any) {
      this.logger.error(`Scraper error: ${error.message}`, error.stack);
      await this.finishJobLog(jobLogId, "failed", {
        errorMessage: error.message,
      });
      return {
        success: false,
        error: error.message ?? "Unknown error occurred",
      };
    }
  }

  // ─── Public: backfill incomplete opportunities ────────────────────────────

  /**
   * Re-enriches stored opportunities that are missing an image or carry
   * legacy generic fallback content ("Program Organizer", placeholder
   * summaries). Re-runs the full deep-fetch + og:image + LLM pipeline and
   * merges the results, never overwriting good data with worse.
   */
  async backfillIncompleteOpportunities(limit = 40): Promise<{
    success: boolean;
    scanned: number;
    updated: number;
    imagesAdded: number;
    stillIncomplete: number;
    error?: string;
  }> {
    const empty = {
      scanned: 0,
      updated: 0,
      imagesAdded: 0,
      stillIncomplete: 0,
    };
    if (!this.supabase) {
      return { success: false, ...empty, error: "No database configured" };
    }

    // Backfill runs standalone (outside runScraper), so it needs its own
    // fresh image-uniqueness ledger.
    this.imageClaimsThisRun.clear();

    const cappedLimit = Math.min(Math.max(Number(limit) || 40, 1), 200);
    const { data, error } = await this.supabase
      .from("opportunities")
      .select(
        "id, title, summary, description, organization, location, close_date, apply_url, application_url, source_url, image_url, eligibility, funding_type, target_region, metadata, source",
      )
      .eq("source", "scraper")
      .or(
        'image_url.is.null,organization.is.null,organization.eq."Program Organizer",summary.ilike."*being verified by Edutu*"',
      )
      .order("updated_at", { ascending: true })
      .limit(cappedLimit);

    if (error) {
      return { success: false, ...empty, error: error.message };
    }

    const rows = data ?? [];
    let updated = 0;
    let imagesAdded = 0;
    let stillIncomplete = 0;

    for (let i = 0; i < rows.length; i += ENRICH_CONCURRENCY) {
      const batch = rows.slice(i, i + ENRICH_CONCURRENCY);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const meta = (row.metadata ?? {}) as Record<string, any>;
            const applyUrl =
              meta.detail_url ||
              meta.aggregator_url ||
              row.apply_url ||
              row.source_url;
            if (!applyUrl?.startsWith("http")) {
              stillIncomplete++;
              return;
            }

            const seed: RawItem = {
              title: row.title,
              apply_url: applyUrl,
              direct_apply_url: row.application_url ?? null,
              image_url: row.image_url ?? null,
              description: row.description ?? undefined,
              summary: /being verified by Edutu/i.test(row.summary ?? "")
                ? undefined
                : (row.summary ?? undefined),
              location: row.location ?? undefined,
              deadline: row.close_date ?? undefined,
              requirements: this.normalizeStringList(meta.requirements),
              benefits: this.normalizeStringList(meta.benefits),
              application_process: this.normalizeStringList(
                meta.application_process,
              ),
              eligibility:
                (row.eligibility as Record<string, unknown>) ?? undefined,
              funding_type: row.funding_type ?? undefined,
              target_region: row.target_region ?? undefined,
              source: meta.source_name || row.source || "scraper",
              source_url: row.source_url || applyUrl,
            };

            // retry=0 bypasses the enrichment cache so stale rows are truly
            // re-fetched instead of echoing their own incomplete data back.
            const enriched = await this.enrichItem(seed, undefined, 0);
            const record = this.transformToOpportunity(
              enriched,
              meta.scrape_job_id ?? null,
            );
            const previousOrganization =
              row.organization === "Program Organizer"
                ? null
                : row.organization;

            const update: Record<string, unknown> = {
              summary: record.summary || row.summary,
              description: record.description || row.description,
              organization: record.organization ?? previousOrganization,
              category: record.category,
              canonical_category: record.canonical_category,
              type: record.type,
              is_remote: record.is_remote,
              location: record.location ?? row.location,
              deadline: record.deadline ?? row.close_date,
              close_date: record.close_date ?? row.close_date,
              image_url: record.image_url || row.image_url,
              application_url: record.application_url || row.application_url,
              quality_score: record.quality_score,
              validation_status: record.validation_status,
              status: record.status,
              tags: record.tags,
              ...((record.stipend as number | null) != null
                ? { stipend: record.stipend, currency: record.currency }
                : {}),
              metadata: {
                ...meta,
                ...(record.metadata as Record<string, unknown>),
                backfilled_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            };

            const { error: updateError } = await this.supabase
              .from("opportunities")
              .update(update)
              .eq("id", row.id);
            if (updateError) {
              stillIncomplete++;
              this.logger.warn(
                `Backfill update failed for ${row.id}: ${updateError.message}`,
              );
              return;
            }

            updated++;
            if (!row.image_url && update.image_url) imagesAdded++;
            if (update.validation_status !== "valid") stillIncomplete++;
          } catch (e: any) {
            stillIncomplete++;
            this.logger.warn(`Backfill failed for ${row.id}: ${e.message}`);
          }
        }),
      );
    }

    this.logger.log(
      `Backfill complete: scanned=${rows.length} updated=${updated} imagesAdded=${imagesAdded} stillIncomplete=${stillIncomplete}`,
    );
    return {
      success: true,
      scanned: rows.length,
      updated,
      imagesAdded,
      stillIncomplete,
    };
  }

  // ─── Job Logging ──────────────────────────────────────────────────────────

  /**
   * After a scrape, surface any source that has crossed the consecutive-failure
   * threshold so it can be alerted on. Read-only against scraping_sources.
   */
  private async runPostScrapeAlerts(
    sources: Array<{ id?: number | null; name?: string | null }>,
  ): Promise<void> {
    if (!this.supabase) return;
    const sourceIds = sources
      .map((s) => Number(s.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (sourceIds.length === 0) return;

    const { data, error } = await this.supabase
      .from("scraping_sources")
      .select("id, name, consecutive_failures, last_success")
      .in("id", sourceIds);

    if (error || !data) return;

    const sourcesStatus = (
      data as Array<{
        id: number;
        name: string | null;
        consecutive_failures: number | null;
        last_success: string | null;
      }>
    ).map((row) => ({
      sourceId: row.id,
      sourceName: row.name ?? "unknown",
      lastSuccessAt: row.last_success ?? null,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
    }));

    try {
      await this.scraperAlertsService.checkAlertConditions(sourcesStatus);
    } catch (err: any) {
      this.logger.warn(`source_failing alert check failed: ${err?.message}`);
    }

    // Yield-drop check: opportunities created in the last 24h vs 7-day average.
    try {
      const now = Date.now();
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [{ count: dayCount }, { count: weekCount }] = await Promise.all([
        this.supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayAgo),
        this.supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekAgo),
      ]);
      const opportunitiesPerDay = dayCount ?? 0;
      const sevenDayAverage = (weekCount ?? 0) / 7;
      const dropPercent =
        sevenDayAverage > 0
          ? Math.round(
              ((sevenDayAverage - opportunitiesPerDay) / sevenDayAverage) * 100,
            )
          : 0;
      await this.scraperAlertsService.checkYieldDrop({
        opportunitiesPerDay,
        sevenDayAverage,
        dropPercent,
      });
    } catch (err: any) {
      this.logger.warn(`yield_drop alert check failed: ${err?.message}`);
    }

    // Error-spike check: failed vs total scrape jobs in the last hour.
    try {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: jobs, error: jobsError } = await this.supabase
        .from("scrape_logs")
        .select("status")
        .gte("created_at", hourAgo)
        .limit(500);
      if (!jobsError && jobs) {
        const totalJobs = jobs.length;
        const failedJobs = jobs.filter(
          (j: { status: string | null }) => j.status === "failed",
        ).length;
        await this.scraperAlertsService.checkErrorSpike({
          errorRate:
            totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 100) : 0,
          totalJobs,
          failedJobs,
          windowMinutes: 60,
        });
      }
    } catch (err: any) {
      this.logger.warn(`error_spike alert check failed: ${err?.message}`);
    }
  }

  private async startJobLog(options: ScrapeOptions): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("scrape_logs")
      .insert({
        status: "running",
        started_at: new Date().toISOString(),
        run_type: "manual",
        warnings: [
          {
            type: "options",
            options,
          },
        ],
      })
      .select("id")
      .single();

    if (error) {
      this.logger.error(`Error starting job log: ${JSON.stringify(error)}`);
    }

    return data?.id ?? null;
  }

  private async finishJobLog(
    jobLogId: string | null,
    status: "completed" | "failed",
    extra: {
      itemsFound?: number;
      duration?: number;
      sourceResults?: SourceResult[];
      errorMessage?: string;
      outcome?: RunOutcome | null;
    },
  ): Promise<void> {
    if (!jobLogId) return;
    await this.supabase
      .from("scrape_logs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        ...(extra.itemsFound != null && { urls_scraped: extra.itemsFound }),
        ...(extra.sourceResults && {
          urls_saved: extra.sourceResults.reduce(
            (sum, source) => sum + (source.itemsSaved || 0),
            0,
          ),
          // Per-source results plus the run cleanliness report. Kept as an
          // array so existing admin readers that iterate warnings still work.
          warnings: extra.outcome
            ? [...extra.sourceResults, { run_outcome: extra.outcome }]
            : extra.sourceResults,
        }),
        ...(extra.duration != null && { duration_seconds: extra.duration }),
        ...(extra.errorMessage && {
          errors: [{ message: extra.errorMessage }],
        }),
      })
      .eq("id", jobLogId);

    // Auto-enforce retention policy after successful job
    if (status === "completed") {
      await this.enforceRetentionPolicy();
    }
  }

  private async enforceRetentionPolicy(): Promise<void> {
    if (!this.supabase) return;
    try {
      const { data: settings } = await this.supabase
        .from("scraper_config")
        .select("*")
        .eq("key", "data_retention_days")
        .single();
      const days = typeof settings?.value === "number" ? settings.value : null;
      if (!days || days <= 0) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Batch delete in chunks of 1000 to avoid table locks
      let deletedCount = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await this.supabase
          .from("opportunities")
          .select("id")
          .lt("created_at", cutoffDate.toISOString())
          .limit(1000);

        if (error) throw error;
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        const ids = data.map((row) => row.id);
        const { error: deleteError } = await this.supabase
          .from("opportunities")
          .delete()
          .in("id", ids);

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
  }: Pick<ScrapeOptions, "sourceId" | "allSources">): Promise<ScrapeSource[]> {
    if (allSources) {
      const { data, error } = await this.supabase
        .from("scraping_sources")
        .select("*")
        .eq("enabled", true)
        .eq("is_group", false)
        .order("priority");
      if (error) throw new Error(`Failed to fetch sources: ${error.message}`);
      return data ?? [];
    }

    if (sourceId) {
      const { data: source, error: sourceError } = await this.supabase
        .from("scraping_sources")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (sourceError)
        throw new Error(`Failed to fetch source: ${sourceError.message}`);
      if (!source) return [];

      if (source.is_group) {
        const { data: children, error: childrenError } = await this.supabase
          .from("scraping_sources")
          .select("*")
          .eq("parent_id", sourceId)
          .eq("enabled", true);
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
        url: "https://opportunitiescircle.com/scholarships/",
        name: "Opportunities Circle",
        description: "Scholarship aggregator",
        tier: 1,
        category: "scholarship",
        enabled: true,
        priority: 1,
        config: {
          item_selector: ".post-item, .opportunity-card, article",
          title_selector: "h2, h3, .entry-title",
          link_selector:
            "a[href*='/scholarship/'], a[href*='/opportunity/'], a[href*='/fellowship/']",
        },
      },
      {
        url: "https://scholars4dev.com/",
        name: "Scholars4Dev",
        description: "International scholarships",
        tier: 1,
        category: "scholarship",
        enabled: true,
        priority: 2,
        config: {
          item_selector: ".td-module-image-wrap, .wpb_text_column, .post",
          title_selector: "h3, .entry-title, h2",
          link_selector: "a[href*='/']",
        },
      },
      {
        url: "https://oyaopportunities.com/scholarships/",
        name: "OYA Opportunities",
        description: "Scholarships and youth opportunities",
        tier: 1,
        category: "scholarship",
        enabled: true,
        priority: 3,
        config: {
          item_selector: ".listing-item, .opportunity, .card, article",
          title_selector: ".title, h3, h2",
          link_selector:
            "a.button, a[href*='/apply'], a[href*='/opp/'], a[href]",
        },
      },
      {
        url: "https://globalscholardesk.com/scholarships/",
        name: "Global Scholar Desk",
        description: "Global scholarship listings",
        tier: 2,
        category: "scholarship",
        enabled: true,
        priority: 4,
        config: {
          item_selector: ".scholarship-card, .post, .card, article",
          title_selector: "h2, .scholarship-title, .entry-title",
          link_selector: "a[href*='/scholarship/'], a[href*='/opp/'], a[href]",
        },
      },
      {
        url: "https://www.scholarshipportal.com/scholarships",
        name: "Scholarship Portal",
        description: "European scholarships",
        tier: 2,
        category: "scholarship",
        enabled: true,
        priority: 5,
        config: {
          item_selector: ".scholarship-item, .program-card, .listing, article",
          title_selector: ".scholarship-title, h3, h2",
          link_selector: "a[href*='/scholarship/'], a[href]",
        },
      },
    ];
    const { data, error } = await this.supabase
      .from("scraping_sources")
      .upsert(defaults, { onConflict: "url" });
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
    onEvent?: ScrapeEventListener,
  ): Promise<{
    results: RawItem[];
    sourceResults: SourceResult[];
    outcome: RunOutcome | null;
  }> {
    const allResults: RawItem[] = [];
    const sourceResults: SourceResult[] = [];
    const pagesToCrawl = Math.min(maxPages, MAX_PAGES_CAP);

    for (const source of sources) {
      // Honor live pause/stop between sources.
      if (this.activeRun?.stopRequested) break;
      await this.waitWhilePaused();
      if (this.activeRun?.stopRequested) break;

      const sourceStartTime = Date.now();
      let itemsFound = 0;
      let urlsDiscovered = 0;
      const sourceWarnings: string[] = [];
      const retriedPages = new Set<number>();

      onEvent?.({ type: "source-start", name: source.name });

      try {
        this.logger.log(`Crawling: ${source.name} (${source.url})`);

        // Respect robots.txt. For a product that resells scraped data, skipping
        // disallowed sources is a legal/ToS necessity. Evaluate against the
        // SAME user-agent we actually fetch with (Chrome UA in BROWSER_HEADERS),
        // with our bot identity (EdutuBot default) as a secondary check.
        const robotsAllowed =
          (await this.robotsChecker.isAllowed(
            source.url,
            BROWSER_HEADERS["User-Agent"],
          )) && (await this.robotsChecker.isAllowed(source.url));
        if (!robotsAllowed) {
          this.logger.warn(
            `  → Skipping ${source.name}: blocked by robots.txt`,
          );
          sourceResults.push({
            name: source.name,
            url: source.url,
            status: "skipped",
            itemsFound: 0,
            itemsSaved: 0,
            error: "blocked by robots.txt",
          });
          continue;
        }

        for (let page = 1; page <= pagesToCrawl; page++) {
          // Honor live pause/stop between pages.
          if (this.activeRun?.stopRequested) break;
          await this.waitWhilePaused();
          if (this.activeRun?.stopRequested) break;

          const pageUrl = this.buildPageUrl(source.url, page);
          this.logger.log(`  → Fetching page ${page}: ${pageUrl}`);

          try {
            let basicItems: RawItem[] = [];

            if (this.isDixcoverHubSource(source)) {
              basicItems = await this.extractDixcoverHubItems(source, page);
              if (page > 1 && basicItems.length === 0) {
                this.logger.log(
                  `  → DixcoverHub adapter found no items on page ${page}, stopping.`,
                );
                break;
              }
            } else {
              const html = await this.fetchListHTML(pageUrl);
              if (
                page > 1 &&
                !this.hasNextPage(html, page, source.config?.next_page_selector)
              ) {
                this.logger.log(
                  `  → No next page found after page ${page - 1}, stopping.`,
                );
                break;
              }
              basicItems = this.extractItemsFromList(html, source);

              if (basicItems.length === 0) {
                const feedUrl = this.extractFeedUrlFromHTML(html, pageUrl);
                if (feedUrl) {
                  this.logger.warn(
                    `  ↳ No list cards found, trying feed fallback: ${feedUrl}`,
                  );
                  const feedHtml = await this.fetchHTML(feedUrl);
                  basicItems = this.extractItemsFromList(feedHtml, source);
                }
              }
            }

            urlsDiscovered += basicItems.length;
            await this.recordDiscoveredUrls(source, basicItems);
            const enrichedItems = await this.enrichItems(
              basicItems,
              source.config?.content_selectors,
            );
            allResults.push(...enrichedItems);
            itemsFound += enrichedItems.length;
            // Stream each enriched opportunity to any live listener (SSE).
            for (const item of enrichedItems) {
              onEvent?.({ type: "opportunity", opportunity: item });
            }
            this.logger.log(
              `  ✓ ${enrichedItems.length} items enriched from page ${page}`,
            );
          } catch (pageError: any) {
            // Give a failed page exactly one more chance before giving up on
            // the source (preserves prior partial-results behavior on repeat
            // failure, but no longer breaks silently).
            if (!retriedPages.has(page)) {
              retriedPages.add(page);
              this.logger.warn(
                `  ↻ Error on page ${page} of "${source.name}": ${pageError.message} — retrying once`,
              );
              await this.delay(LIST_PAGE_DELAY_MS);
              page--; // re-run this page on the next loop iteration
              continue;
            }
            const warning = `Page ${page} of "${source.name}" failed after retry: ${pageError.message}`;
            this.logger.warn(`  ✗ ${warning} — stopping source pagination`);
            sourceWarnings.push(warning);
            break;
          }

          await this.delay(LIST_PAGE_DELAY_MS);
        }

        await this.updateSourceStatus(
          source.id,
          true,
          itemsFound,
          urlsDiscovered,
        );
        const duration = Math.round((Date.now() - sourceStartTime) / 1000);
        sourceResults.push({
          name: source.name,
          url: source.url,
          status: "success",
          itemsFound,
          itemsSaved: 0,
          urlsDiscovered,
          duration,
          ...(sourceWarnings.length > 0 && { warnings: sourceWarnings }),
        });
        onEvent?.({ type: "source-done", name: source.name, itemsFound });
      } catch (error: any) {
        this.logger.error(`Error crawling "${source.name}": ${error.message}`);
        onEvent?.({ type: "source-done", name: source.name, itemsFound: 0, error: error.message });
        await this.updateSourceStatus(
          source.id,
          false,
          0,
          urlsDiscovered,
          error.message,
        );
        sourceResults.push({
          name: source.name,
          url: source.url,
          status: "failed",
          itemsFound: 0,
          itemsSaved: 0,
          urlsDiscovered,
          error: error.message,
          ...(sourceWarnings.length > 0 && { warnings: sourceWarnings }),
        });
      }
    }

    let outcome: RunOutcome | null = null;
    if (allResults.length > 0) {
      outcome = await this.persistOpportunities(
        allResults,
        sourceResults,
        jobLogId,
      );
    }

    return { results: allResults, sourceResults, outcome };
  }

  private async recordDiscoveredUrls(
    source: ScrapeSource,
    items: RawItem[],
  ): Promise<void> {
    if (!this.supabase || items.length === 0) return;

    const now = new Date().toISOString();
    const rows = Array.from(
      new Map(
        items
          .map((item) => this.normalizeUrl(item.apply_url))
          .filter(Boolean)
          .map((url) => [
            url,
            {
              url,
              source_id: source.id,
              status: "pending",
              last_checked: now,
            },
          ]),
      ).values(),
    );

    if (!rows.length) return;

    const { data, error } = await this.supabase
      .from("scraped_urls")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: false });

    if (error) {
      this.logger.warn(
        `Could not record discovered URLs for ${source.name}: ${error.message}`,
      );
    }
  }

  /**
   * Statuses of rows that already exist for these canonical_urls, so a
   * re-scrape upsert never changes the status of an existing row (e.g.
   * demoting an admin-approved 'active' row back to pending_review).
   * One IN query per 200 URLs; fails open to an empty map.
   */
  private async fetchExistingStatuses(
    canonicalUrls: string[],
  ): Promise<Map<string, string>> {
    const statusByUrl = new Map<string, string>();
    const urls = canonicalUrls.filter(Boolean);
    const CHUNK = 200;
    try {
      for (let i = 0; i < urls.length; i += CHUNK) {
        const { data, error } = await this.supabase
          .from("opportunities")
          .select("id, canonical_url, status")
          .in("canonical_url", urls.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data as Array<{
          canonical_url: string | null;
          status: string | null;
        }>) ?? []) {
          if (row.canonical_url && row.status) {
            statusByUrl.set(row.canonical_url, row.status);
          }
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `Could not fetch existing statuses (statuses may be overwritten this run): ${e.message}`,
      );
    }
    return statusByUrl;
  }

  private async persistOpportunities(
    results: RawItem[],
    sourceResults: SourceResult[],
    jobLogId: string | null,
  ): Promise<RunOutcome | null> {
    // Never persist items without a real title — there is nothing to review.
    const titled = results.filter(
      (item) => (item.title ?? "").trim().length >= 8,
    );
    if (titled.length < results.length) {
      this.logger.warn(
        `Dropped ${results.length - titled.length} item(s) with no usable title.`,
      );
    }
    const rawRecords = titled.map((item) =>
      this.transformToOpportunity(item, jobLogId),
    );

    // Deduplicate within the payload based on canonical_url to avoid Supabase ON CONFLICT errors
    const uniqueRecords: Record<string, unknown>[] = [];
    const seenUrls = new Set<string>();
    for (const rec of rawRecords) {
      const url = rec.canonical_url as string;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        uniqueRecords.push(rec);
      }
    }

    // Last-line image guard: any source image appearing on more than one
    // record in this batch is a site default — the first record keeps it,
    // the rest fall back to the web app's branded category tile.
    const seenImages = new Set<string>();
    let strippedImages = 0;
    for (const rec of uniqueRecords) {
      const metadata = rec.metadata as Record<string, unknown> | null;
      const sourceImage =
        (metadata?.source_image_url as string | null) ??
        (typeof rec.image_url === "string"
          ? this.normalizeImageKey(rec.image_url)
          : null);
      if (!sourceImage || !rec.image_url) continue;
      if (seenImages.has(sourceImage)) {
        rec.image_url = null;
        if (metadata) metadata.source_image_url = null;
        strippedImages++;
      } else {
        seenImages.add(sourceImage);
      }
    }
    if (strippedImages > 0) {
      this.logger.warn(
        `Stripped ${strippedImages} duplicate site-default image(s) from this batch.`,
      );
    }

    // Re-scrape status preservation: the upsert below overwrites existing
    // rows on canonical_url conflict, so an admin-approved 'active' row would
    // be demoted every run by the review gates. Fetch existing statuses (one
    // IN query, chunked) and pin them — gates only apply to NEW rows.
    const existingStatusByUrl = await this.fetchExistingStatuses(
      uniqueRecords.map((rec) => rec.canonical_url as string),
    );
    for (const rec of uniqueRecords) {
      const existing = existingStatusByUrl.get(rec.canonical_url as string);
      if (existing !== undefined) rec.status = existing;
    }
    const existingUrls = new Set(existingStatusByUrl.keys());

    // Duplicate detection (annotate-only: sets duplicate_of + routes the row
    // to pending_review — every row is still inserted/updated as before).
    await this.opportunityDedupService.annotateDuplicates(
      uniqueRecords,
      existingUrls,
    );
    // Trust gate: hold 'active' rows on new/unestablished apply-URL domains
    // for admin review. Toggle via SCRAPER_DOMAIN_TRUST_GATE (default ON).
    await this.opportunityDedupService.applyDomainTrustGate(
      uniqueRecords,
      existingUrls,
    );

    const SELECT_COLUMNS =
      "id, title, summary, description, organization, category, canonical_category, close_date, deadline, location, eligibility, funding_type, target_region, application_url, apply_url, canonical_url, image_url, stipend, currency, source, metadata";

    const { data, error } = await this.supabase
      .from("opportunities")
      .upsert(uniqueRecords, {
        onConflict: "canonical_url",
        ignoreDuplicates: false,
      })
      .select(SELECT_COLUMNS);

    let saved: Record<string, any>[] = (data as Record<string, any>[]) ?? [];
    if (error) {
      // The batch upsert is all-or-nothing: one bad row (e.g. a constraint
      // violation) would zero the entire run. Retry records individually so
      // only the genuinely broken ones are lost — and name them in the log.
      this.logger.warn(
        `Batch save failed (${error.message}) — retrying records individually.`,
      );
      saved = [];
      for (const rec of uniqueRecords) {
        const { data: row, error: rowError } = await this.supabase
          .from("opportunities")
          .upsert(rec, { onConflict: "canonical_url", ignoreDuplicates: false })
          .select(SELECT_COLUMNS)
          .maybeSingle();
        if (rowError) {
          this.logger.warn(
            `  ✗ Could not save "${String(rec.title)}": ${rowError.message}`,
          );
        } else if (row) {
          saved.push(row);
        }
      }
    }

    if (saved.length > 0) {
      this.logger.log(
        `Saved/updated ${saved.length}/${uniqueRecords.length} opportunities in database.`,
      );
      sourceResults.forEach((sr) => {
        if (sr.status !== "success") return;
        sr.itemsSaved = saved.filter((record) => {
          const metadata = record.metadata as Record<string, unknown> | null;
          return metadata?.source_url === sr.url;
        }).length;
      });
      await this.markProcessedUrls(saved);
      await this.opportunityShareCardService.ensureShareCardsForOpportunities(
        saved,
      );
      await this.opportunityShareCardService.ensureSharePdfsForOpportunities(
        saved,
      );
    } else {
      this.logger.warn("No opportunities were saved in this run.");
    }

    // Cleanliness report: exactly how much of this run met the publish
    // contract, and which fields held the rest back.
    const outcome: RunOutcome = {
      saved: saved.length,
      published: 0,
      needsReview: 0,
      withDeadline: 0,
      withImage: 0,
      withOrganization: 0,
      withDirectApplyLink: 0,
      duplicateImagesStripped: strippedImages,
      missingFieldCounts: {},
    };
    for (const rec of uniqueRecords) {
      const metadata = rec.metadata as Record<string, unknown> | null;
      if (rec.status === "active") outcome.published++;
      else outcome.needsReview++;
      if (rec.close_date) outcome.withDeadline++;
      if (rec.image_url) outcome.withImage++;
      if (rec.organization) outcome.withOrganization++;
      if (rec.application_url) outcome.withDirectApplyLink++;
      const missing = Array.isArray(metadata?.extraction_missing_fields)
        ? (metadata.extraction_missing_fields as string[])
        : [];
      for (const field of missing) {
        outcome.missingFieldCounts[field] =
          (outcome.missingFieldCounts[field] ?? 0) + 1;
      }
      if (metadata?.deadline_passed_at_scrape) {
        outcome.missingFieldCounts.deadline_passed =
          (outcome.missingFieldCounts.deadline_passed ?? 0) + 1;
      }
    }
    this.logger.log(
      `Run outcome: ${outcome.published} published, ${outcome.needsReview} held for review ` +
        `(deadline ${outcome.withDeadline}/${outcome.saved}, image ${outcome.withImage}/${outcome.saved}, ` +
        `organizer ${outcome.withOrganization}/${outcome.saved}, direct link ${outcome.withDirectApplyLink}/${outcome.saved})`,
    );

    return outcome;
  }

  private async markProcessedUrls(
    records: Array<{
      id?: string | null;
      application_url?: string | null;
      canonical_url?: string | null;
      metadata?: Record<string, any> | null;
    }>,
  ): Promise<void> {
    if (!this.supabase || records.length === 0) return;

    await Promise.all(
      records.map(async (record) => {
        const url = this.normalizeUrl(
          record.metadata?.aggregator_url ||
            record.application_url ||
            record.canonical_url ||
            "",
        );
        if (!url) return;

        const { error } = await this.supabase
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

  // ─── Deep Enrichment ──────────────────────────────────────────────────────

  private async enrichItems(
    items: RawItem[],
    customContentSelectors?: string,
  ): Promise<RawItem[]> {
    const enriched: RawItem[] = [];
    const candidates = items.filter((item) =>
      this.isValidOpportunityCandidate(
        item.title,
        item.apply_url,
        item.source_url,
      ),
    );

    // Process in batches defined by ENRICH_CONCURRENCY
    for (let i = 0; i < candidates.length; i += ENRICH_CONCURRENCY) {
      const batch = candidates.slice(i, i + ENRICH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((item) => this.enrichItem(item, customContentSelectors)),
      );
      enriched.push(
        ...batchResults.filter((item) =>
          this.isValidOpportunityCandidate(
            item.title,
            item.direct_apply_url || item.apply_url,
            item.source_url,
          ),
        ),
      );
      // Pace deep fetches between batches so we don't hammer a single origin.
      if (i + ENRICH_CONCURRENCY < candidates.length) {
        await this.delay(DEEP_FETCH_DELAY_MS);
      }
    }

    return enriched;
  }

  private async enrichItem(
    item: RawItem,
    customContentSelectors?: string,
    retry = 1,
  ): Promise<RawItem> {
    if (!item.apply_url?.startsWith("http")) return item;

    // Cache check: skip deep fetch if already enriched
    if (this.supabase && retry === 1) {
      // Only check cache on first attempt
      const { data: existing } = await this.supabase
        .from("opportunities")
        .select(
          "metadata, summary, description, image_url, application_url, apply_url, eligibility, funding_type, target_region",
        )
        .eq("apply_url", item.apply_url)
        .maybeSingle();

      const cached = existing?.metadata as Record<string, any> | null;
      const cachedDescription =
        typeof existing?.description === "string" ? existing.description : "";
      const cachedSummary =
        typeof existing?.summary === "string" ? existing.summary : "";
      const cachedRequirements = this.normalizeStringList(cached?.requirements);
      const cachedBenefits = this.normalizeStringList(cached?.benefits);
      const cachedApplicationProcess = this.normalizeStringList(
        cached?.application_process,
      );
      if (
        cached &&
        cachedSummary.trim().length >= 80 &&
        cachedDescription.trim().length >= 180 &&
        cachedRequirements.length > 0 &&
        cachedBenefits.length > 0 &&
        cachedApplicationProcess.length > 0 &&
        // A text-complete row without an image must still deep-fetch, or the
        // image backfill can never repair it.
        Boolean(existing?.image_url)
      ) {
        this.logger.log(`  ↳ Cache hit for ${item.apply_url}`);
        return {
          ...item,
          summary: this.normalizeSummary(
            cachedSummary || item.summary || "",
            cachedDescription || item.description || "",
            item.title,
          ),
          requirements: cachedRequirements,
          benefits: cachedBenefits,
          application_process: cachedApplicationProcess,
          eligibility:
            (existing?.eligibility as Record<string, unknown> | undefined) ??
            cached.eligibility ??
            item.eligibility,
          funding_type:
            (existing?.funding_type as string | undefined) ??
            cached.funding_type ??
            item.funding_type,
          target_region:
            (existing?.target_region as string | undefined) ??
            cached.target_region ??
            item.target_region,
          enrichment_confidence: Number(
            cached.enrichment_confidence ?? item.enrichment_confidence ?? 0,
          ),
          enrichment_notes:
            cached.enrichment_notes ?? item.enrichment_notes ?? [],
          description:
            (existing?.description as string | undefined) ?? item.description,
          direct_apply_url: existing?.application_url ?? item.direct_apply_url,
          image_url: existing?.image_url ?? item.image_url,
          source_image_url:
            (cached?.source_image_url as string | undefined) ??
            item.source_image_url ??
            null,
        };
      }
    }

    try {
      if (retry === 1) this.logger.log(`  ↳ Deep fetch: ${item.apply_url}`);
      const html = await this.fetchDeepHTML(item.apply_url);

      // Extract structured data from HTML (all done on same fetched HTML, zero extra requests)
      const sourceHost = new URL(item.apply_url).hostname;
      const directApplyUrl =
        item.direct_apply_url ||
        this.extractApplyLink(html, sourceHost, item.apply_url);
      // Every opportunity must end up with its OWN image: candidates that are
      // already used by another item (site-default banners) are skipped.
      let sourceImageUrl = await this.claimUniqueImage(
        this.extractImageCandidatesFromHTML(html, item.apply_url),
        item.apply_url,
      );
      // Second pass: when the aggregator page has no unique image, try the
      // organizer's own apply page for its og:image / twitter:image.
      if (
        !sourceImageUrl &&
        directApplyUrl?.startsWith("http") &&
        directApplyUrl !== item.apply_url
      ) {
        try {
          const applyHtml = await this.fetchDeepHTML(directApplyUrl);
          sourceImageUrl = await this.claimUniqueImage(
            this.extractImageCandidatesFromHTML(applyHtml, directApplyUrl),
            item.apply_url,
          );
          if (sourceImageUrl) {
            this.logger.log(`    ↳ Image from apply page: ${directApplyUrl}`);
          }
        } catch {
          // Best-effort second pass — continue without an image.
        }
      }
      // Listing-provided image (e.g. WordPress featured media) is the last
      // candidate — it must pass the same uniqueness claim.
      if (!sourceImageUrl && item.image_url) {
        sourceImageUrl = await this.claimUniqueImage(
          [item.image_url],
          item.apply_url,
        );
      }

      let imageUrl: string | null = sourceImageUrl;
      if (imageUrl) {
        const proxiedUrl = await this.proxyImageToStorage(imageUrl);
        if (proxiedUrl) imageUrl = proxiedUrl;
      }
      const text = this.extractTextFromHTML(html, customContentSelectors);
      const fallbackDescription = this.createBriefDescriptionFromText(text);

      if (directApplyUrl)
        this.logger.log(`    ↳ Direct apply link: ${directApplyUrl}`);
      if (imageUrl) this.logger.log(`    ↳ Image Proxied: ${imageUrl}`);

      const ai = await this.refineWithDeepSeek(text);

      // If DeepSeek returned empty data, and we have retries left, try again with a delay
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
        // No unique image → no image. Falling back to the (rejected) listing
        // image here is exactly what produced batches of identical banners.
        image_url: imageUrl,
        source_image_url: sourceImageUrl
          ? this.normalizeImageKey(sourceImageUrl)
          : (item.source_image_url ?? null),
        summary: this.normalizeSummary(
          ai.summary || item.summary || fallbackDescription || "",
          ai.description || item.description || fallbackDescription || "",
          item.title,
        ),
        requirements: this.normalizeStringList(
          ai.requirements?.length ? ai.requirements : (item.requirements ?? []),
        ),
        benefits: this.normalizeStringList(
          ai.benefits?.length ? ai.benefits : (item.benefits ?? []),
        ),
        description: this.normalizeDescription(
          ai.description || item.description || fallbackDescription || "",
        ),
        deadline: ai.deadline || item.deadline,
        application_process: this.normalizeStringList(
          ai.application_process?.length
            ? ai.application_process
            : (item.application_process ?? []),
        ),
        eligibility: ai.eligibility ?? item.eligibility,
        funding_type: ai.funding_type ?? item.funding_type,
        target_region: ai.target_region ?? item.target_region,
        enrichment_confidence: ai.confidence,
        enrichment_notes: ai.notes,
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
        const backoff =
          this.retryAfterMs(res.headers) ?? Math.pow(2, attempt) * 1_000;
        this.logger.warn(
          `  ⏳ 429 on ${url} — backing off ${backoff / 1000}s (attempt ${attempt}/${MAX_BACKOFF_ATTEMPTS})`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1);
      }

      if (res.status >= 400) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.data;
    } catch (err: any) {
      // Retry transient failures: 429, 5xx, and common network errors.
      // Non-429 4xx responses are never retried.
      if (this.isRetryableFetchError(err) && attempt < MAX_BACKOFF_ATTEMPTS) {
        const backoff =
          this.retryAfterMs(err?.response?.headers) ??
          Math.pow(2, attempt) * 1_000;
        const reason = err?.response?.status
          ? `HTTP ${err.response.status}`
          : (err?.code ?? "network error");
        this.logger.warn(
          `  ⏳ ${reason} on ${url} — backing off ${backoff / 1000}s (attempt ${attempt}/${MAX_BACKOFF_ATTEMPTS})`,
        );
        await this.delay(backoff);
        return this.fetchWithBackoff(url, timeoutMs, attempt + 1);
      }
      throw err;
    }
  }

  /** True for errors worth retrying: 429/5xx responses or transient network errors. */
  private isRetryableFetchError(err: any): boolean {
    const status = err?.response?.status;
    if (status === 429 || (typeof status === "number" && status >= 500))
      return true;
    return ["ETIMEDOUT", "ECONNABORTED", "ECONNRESET", "EAI_AGAIN"].includes(
      err?.code,
    );
  }

  /** Parse a Retry-After header (seconds or HTTP-date), capped at 60s. */
  private retryAfterMs(headers: any): number | null {
    const raw = headers?.["retry-after"] ?? headers?.["Retry-After"];
    if (raw == null) return null;
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs >= 0)
      return Math.min(secs * 1_000, 60_000);
    const at = Date.parse(String(raw));
    if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), 60_000);
    return null;
  }

  private fetchHTML(url: string): Promise<string> {
    return this.fetchWithBackoff(url, 30_000);
  }

  private async fetchListHTML(url: string): Promise<string> {
    try {
      return await this.fetchHTML(url);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("HTTP 403")) throw error;

      const feedUrl = this.toWordPressFeedUrl(url);
      if (!feedUrl) throw error;

      this.logger.warn(
        `  ↳ HTML blocked (403), using feed fallback: ${feedUrl}`,
      );
      return this.fetchHTML(feedUrl);
    }
  }

  private toWordPressFeedUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (!pathname.includes("/category/")) return null;

      parsed.pathname = `${pathname}/feed/`;
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  private extractFeedUrlFromHTML(html: string, baseUrl: string): string | null {
    const explicitFeedUrl = this.toWordPressFeedUrl(baseUrl);
    if (explicitFeedUrl) return explicitFeedUrl;

    try {
      const $ = cheerio.load(html);
      const href =
        $('link[type="application/rss+xml"][href*="/category/"]')
          .first()
          .attr("href") ||
        $('link[type="application/rss+xml"]')
          .filter((_, el) => /category|feed/i.test($(el).attr("title") ?? ""))
          .first()
          .attr("href");

      return href ? this.resolveUrl(href, baseUrl) : null;
    } catch {
      return null;
    }
  }

  private fetchDeepHTML(url: string): Promise<string> {
    return this.fetchWithBackoff(url, 15_000);
  }

  private extractTextFromHTML(html: string, customSelector?: string): string {
    if (!html) return "";
    const $ = cheerio.load(html);
    $(
      "script, style, noscript, nav, footer, header, aside, form, iframe",
    ).remove();
    const selector = customSelector || DEFAULT_CONTENT_SELECTORS;
    const candidates: string[] = [];

    $(selector).each((_, el) => {
      const candidate = $(el).text().replace(/\s+/g, " ").trim();
      if (candidate.length >= 120) {
        candidates.push(candidate);
      }
    });

    const text = candidates.length
      ? candidates
          .sort((a, b) => b.length - a.length)
          .slice(0, 3)
          .join("\n\n")
      : $("body").text();
    return text.replace(/\s+/g, " ").trim().substring(0, DEEP_TEXT_MAX_CHARS);
  }

  // ─── DeepSeek Refinement ────────────────────────────────────────────────────

  private async refineWithDeepSeek(text: string): Promise<DeepSeekExtraction> {
    const fallback: DeepSeekExtraction = {
      summary: undefined,
      description: undefined,
      requirements: [],
      benefits: [],
      application_process: [],
      eligibility: {},
      funding_type: undefined,
      target_region: undefined,
      confidence: 0,
      notes: [],
    };
    if (!text || text.length < 80) return fallback;

    const prompt = `You are Edutu's scholarship opportunity enrichment API. Extract only facts supported by the source text. Make the opportunity useful for a student who wants a brief but complete detail page.

Return ONLY valid JSON matching this schema exactly:
{
  "summary": "one concise 25-45 word user-facing summary",
  "description": "4-6 sentence complete overview covering who it is for, what is funded/offered, location/level, deadline if present, and why it matters",
  "requirements": ["string"],
  "benefits": ["string"],
  "deadline": "YYYY-MM-DD or short readable date, or null",
  "application_process": ["step"],
  "eligibility": {
    "level": "string if stated",
    "nationality": "string if stated",
    "field": "string if stated"
  },
  "funding_type": "string if stated",
  "target_region": "string if stated",
  "confidence": 0.0,
  "notes": ["short caveats about missing or unclear facts"]
}
Rules:
- Do not invent amounts, deadlines, eligibility, or links.
- Rewrite scraped article text into clean opportunity information. Do not copy bylines, author names, dates, category labels, social/share text, navigation text, comments, or aggregator wording.
- Never mention scraper/source/aggregator names or domains, including DixcoverHubX, Opportunities Circle, OYA Opportunities, Scholars4Dev, Global Scholar Desk, Scholarship Portal, jobs.smartyacad.com, "By Admin", or "scraped".
- The public description should name the actual opportunity/program and, if stated, the real organizer. It must not say the opportunity is "through" or "from" an aggregator website.
- Prefer concrete bullet-style requirements and benefits. If exact requirements or benefits are missing, leave the arrays empty instead of adding generic filler.
- If a deadline is ambiguous, preserve the readable source wording.
- If the source text is thin, still write the best factual summary from available facts and lower confidence.
- Leave arrays empty and nullable strings null if not found. Do NOT add markdown or commentary.
TEXT:
${text}`;

    try {
      const parsedJSON = await this.aiService.generateJson({
        feature: "scraper.extract",
        prompt,
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            description: { type: "string" },
            requirements: { type: "array", items: { type: "string" } },
            benefits: { type: "array", items: { type: "string" } },
            deadline: { type: ["string", "null"] },
            application_process: { type: "array", items: { type: "string" } },
            eligibility: { type: "object" },
            funding_type: { type: ["string", "null"] },
            target_region: { type: ["string", "null"] },
            confidence: { type: "number" },
            notes: { type: "array", items: { type: "string" } },
          },
          required: [
            "summary",
            "description",
            "requirements",
            "benefits",
            "deadline",
            "application_process",
            "eligibility",
            "funding_type",
            "target_region",
            "confidence",
            "notes",
          ],
          additionalProperties: false,
        },
        temperature: 0.05,
        metadata: { textLength: text.length },
      });

      return DeepSeekExtractionSchema.parse(parsedJSON || fallback);
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        this.logger.warn(`DeepSeek validation failed: ${e.message}`);
      } else {
        this.logger.warn(`DeepSeek refinement failed: ${e.message}`);
      }
      return fallback;
    }
  }

  // ─── List Extraction ─────────────────────────────────────────────────────

  private isDixcoverHubSource(source: ScrapeSource): boolean {
    try {
      return (
        new URL(source.url).hostname.replace(/^www\./, "") ===
        "jobs.smartyacad.com"
      );
    } catch {
      return /jobs\.smartyacad\.com/i.test(source.url);
    }
  }

  private async extractDixcoverHubItems(
    source: ScrapeSource,
    page: number,
  ): Promise<RawItem[]> {
    try {
      const restItems = await this.extractDixcoverHubRestItems(source, page);
      if (restItems.length > 0) {
        this.logger.log(
          `  ↳ DixcoverHub REST discovered ${restItems.length} article URLs`,
        );
        return restItems;
      }
    } catch (error: any) {
      this.logger.warn(
        `  ↳ DixcoverHub REST discovery failed: ${error.message}`,
      );
    }

    try {
      const feedItems = await this.extractDixcoverHubFeedItems(source, page);
      if (feedItems.length > 0) {
        this.logger.log(
          `  ↳ DixcoverHub feed discovered ${feedItems.length} article URLs`,
        );
        return feedItems;
      }
    } catch (error: any) {
      this.logger.warn(
        `  ↳ DixcoverHub feed discovery failed: ${error.message}`,
      );
    }

    try {
      const pageUrl = this.buildPageUrl(source.url, page);
      const html = await this.fetchListHTML(pageUrl);
      const htmlItems = this.extractItemsFromList(html, source);
      if (htmlItems.length > 0) {
        this.logger.log(
          `  ↳ DixcoverHub HTML discovered ${htmlItems.length} article URLs`,
        );
      }
      return htmlItems;
    } catch (error: any) {
      this.logger.warn(
        `  ↳ DixcoverHub HTML discovery failed: ${error.message}`,
      );
      return [];
    }
  }

  private async extractDixcoverHubRestItems(
    source: ScrapeSource,
    page: number,
  ): Promise<RawItem[]> {
    const sourceUrl = new URL(source.url);
    const categorySlug = this.extractWordPressCategorySlug(source.url);
    if (!categorySlug) return [];

    const categoryUrl = `${sourceUrl.origin}/wp-json/wp/v2/categories?slug=${encodeURIComponent(categorySlug)}`;
    const categoryResponse = await axios.get(categoryUrl, {
      timeout: 15_000,
      headers: BROWSER_HEADERS,
      validateStatus: (status) => status < 500,
    });

    if (categoryResponse.status >= 400) {
      throw new Error(`Category REST returned HTTP ${categoryResponse.status}`);
    }

    const categoryId = Number(categoryResponse.data?.[0]?.id);
    if (!categoryId) return [];

    const postsUrl = `${sourceUrl.origin}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=${MAX_ITEMS_PER_PAGE}&page=${page}&_embed=1`;
    const postsResponse = await axios.get(postsUrl, {
      timeout: 20_000,
      headers: BROWSER_HEADERS,
      validateStatus: (status) => status < 500,
    });

    if (postsResponse.status === 400 && page > 1) return [];
    if (postsResponse.status >= 400) {
      throw new Error(`Posts REST returned HTTP ${postsResponse.status}`);
    }

    const posts = Array.isArray(postsResponse.data) ? postsResponse.data : [];
    return posts
      .map((post: any) => {
        const title = this.cleanHtmlText(post?.title?.rendered ?? "", 240);
        const applyUrl = this.resolveUrl(post?.link ?? "", source.url);
        const contentHtml = post?.content?.rendered ?? "";
        const description =
          this.cleanHtmlText(post?.excerpt?.rendered ?? "", 1200) ||
          this.createBriefDescriptionFromText(
            this.cleanHtmlText(contentHtml, 2000),
          ) ||
          "";
        const imageUrl =
          post?._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
          post?._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes
            ?.medium?.source_url ||
          this.extractBestImageFromHTML(contentHtml, applyUrl || source.url) ||
          null;
        const contentText = this.cleanHtmlText(contentHtml, 3000);
        const sourceHost = new URL(source.url).hostname;
        const directApplyUrl = this.extractApplyLink(
          contentHtml,
          sourceHost,
          applyUrl || source.url,
        );

        return {
          title,
          apply_url: applyUrl,
          direct_apply_url: directApplyUrl,
          image_url: imageUrl,
          description,
          amount: this.extractAmount(contentText),
          deadline: this.extractDeadline(contentText),
          location: this.extractLocation(contentText),
          source: source.name,
          source_url: source.url,
          source_id: source.id,
        } satisfies RawItem;
      })
      .filter((item: RawItem) =>
        this.isValidOpportunityCandidate(
          item.title,
          item.apply_url,
          source.url,
        ),
      );
  }

  private async extractDixcoverHubFeedItems(
    source: ScrapeSource,
    page: number,
  ): Promise<RawItem[]> {
    const feedUrl = this.toWordPressFeedUrl(source.url);
    if (!feedUrl) return [];

    const html = await this.fetchHTML(feedUrl);
    const allItems = this.extractItemsFromList(html, source, false);
    const start = (page - 1) * MAX_ITEMS_PER_PAGE;
    return allItems.slice(start, start + MAX_ITEMS_PER_PAGE);
  }

  private extractWordPressCategorySlug(url: string): string | null {
    try {
      const match = new URL(url).pathname.match(/\/category\/([^/]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    } catch {
      const match = url.match(/\/category\/([^/]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : null;
    }
  }

  private extractItemsFromList(
    html: string,
    source: ScrapeSource,
    limit = true,
  ): RawItem[] {
    const isFeed = /^\s*(?:<\?xml|<rss|<feed)/i.test(html);
    const $ = cheerio.load(html, { xmlMode: isFeed });
    const items: RawItem[] = [];

    if (isFeed) {
      $("item").each((_, el) => {
        const $item = $(el);
        const title = this.cleanText($item.find("title").first().text());
        const href = $item.find("link").first().text().trim();
        const applyUrl = this.resolveUrl(href, source.url);
        if (!this.isValidOpportunityCandidate(title, applyUrl, source.url))
          return;

        const description =
          this.cleanHtmlText($item.find("description").first().text(), 1200) ||
          this.cleanHtmlText(
            $item.find("content\\:encoded").first().text(),
            1200,
          );
        const contentHtml = $item.find("content\\:encoded").first().text();
        const itemText = $item.text();
        const sourceHost = new URL(source.url).hostname;

        items.push({
          title,
          apply_url: applyUrl,
          direct_apply_url: this.extractApplyLink(
            contentHtml || itemText,
            sourceHost,
            applyUrl || source.url,
          ),
          image_url: this.extractBestImageFromHTML(
            contentHtml,
            applyUrl || source.url,
          ),
          description,
          amount: this.extractAmount(itemText),
          deadline: this.extractDeadline(itemText),
          location: this.extractLocation(itemText),
          source: source.name,
          source_url: source.url,
          source_id: source.id,
        });
      });

      return limit ? items.slice(0, MAX_ITEMS_PER_PAGE) : items;
    }

    const itemSelector =
      source.config?.item_selector ||
      source.config?.selectors?.list ||
      "article, .elementor-post, .scholarship-card, .opportunity-card, .post-item, .listing-item, .program-card, .td-module-image-wrap";
    const cards = $(itemSelector);

    if (cards.length > 0) {
      cards.each((_, el) => {
        const $card = $(el);
        const titleSelector =
          source.config?.title_selector ||
          source.config?.selectors?.title ||
          "h1, h2, h3, h4, .title, .entry-title, .elementor-post__title";
        const title =
          $card.find(titleSelector).first().text().trim() ||
          $card.find("a").first().text().trim();

        const linkSelector =
          source.config?.link_selector ||
          source.config?.selectors?.link ||
          "a.elementor-post__thumbnail__link, .elementor-post__title a, a[href]";
        const href = $card.find(linkSelector).first().attr("href") ?? "";
        const applyUrl = this.resolveUrl(href, source.url);
        if (!this.isValidOpportunityCandidate(title, applyUrl, source.url))
          return;
        const cardText = $card.text();

        items.push({
          title: this.cleanText(title),
          apply_url: applyUrl,
          image_url: this.extractCardImage($card, source.url),
          description: this.extractCardDescription($card, title),
          amount: this.extractAmount(cardText),
          deadline: this.extractDeadline(cardText),
          location: this.extractLocation(cardText),
          source: source.name,
          source_url: source.url,
          source_id: source.id,
        });
      });
    } else {
      // Fallback: grab all opportunity-related links
      $(
        'a[href*="scholarship"], a[href*="opportunity"], a[href*="/programs/"]',
      ).each((_, el) => {
        const $el = $(el);
        const title = $el.text().trim();
        const href = $el.attr("href") ?? "";
        const applyUrl = this.resolveUrl(href, source.url);
        if (!this.isValidOpportunityCandidate(title, applyUrl, source.url))
          return;
        items.push({
          title: this.cleanText(title),
          apply_url: applyUrl,
          image_url: this.extractCardImage($el.parent(), source.url),
          source: source.name,
          source_url: source.url,
          source_id: source.id,
        });
      });
    }

    return limit ? items.slice(0, MAX_ITEMS_PER_PAGE) : items;
  }

  // ─── Deep-Link & Image Extraction ────────────────────────────────────────

  /**
   * Finds the real "Apply Now" link from an aggregator detail page.
   * Only returns URLs pointing to a domain OTHER than the aggregator.
   */
  private extractApplyLink(
    html: string,
    sourceHost: string,
    baseUrl?: string,
  ): string | null {
    const $ = cheerio.load(html);
    const candidates: Array<{ href: string; score: number }> = [];

    const isExternal = (href: string): boolean => {
      try {
        const parsed = new URL(href);
        return (
          parsed.hostname.replace(/^www\./, "") !==
          sourceHost.replace(/^www\./, "")
        );
      } catch {
        return false;
      }
    };

    const cleanHref = (rawHref: string): string => {
      const resolved = this.sanitizeUrl(
        this.resolveUrl(
          this.sanitizeUrl(rawHref) ?? "",
          baseUrl || `https://${sourceHost}`,
        ),
      );
      if (!resolved || NON_APPLY_URL_RE.test(resolved)) return "";

      try {
        const parsed = new URL(resolved);
        const redirectTarget =
          parsed.searchParams.get("url") ||
          parsed.searchParams.get("u") ||
          parsed.searchParams.get("target") ||
          parsed.searchParams.get("redirect_to");
        if (redirectTarget?.startsWith("http")) return redirectTarget;
      } catch {
        return resolved;
      }

      return resolved;
    };

    $("a[href]").each((_, el) => {
      const href = cleanHref($(el).attr("href") ?? "");
      if (!href || !href.startsWith("http") || !isExternal(href)) return;

      const $el = $(el);
      const text = this.cleanText($el.text(), 180);
      const aria = this.cleanText($el.attr("aria-label") || "", 180);
      const title = this.cleanText($el.attr("title") || "", 180);
      const className = this.cleanText($el.attr("class") || "", 180);
      const context = `${text} ${aria} ${title} ${className}`.trim();

      let score = 0;
      if (APPLY_TEXT_RE.test(context)) score += 80;
      if (
        /forms\.|form\.|application|apply|career|recruit|jobs|portal|smartsheet|typeform|google\.com\/forms|forms\.office|forms\.cloud\.microsoft/i.test(
          href,
        )
      ) {
        score += 40;
      }
      if (/btn|button|apply|elementor-button/i.test(className)) score += 20;
      if (/share|comment|reply|print|download/i.test(context)) score -= 60;
      if (score > 0) candidates.push({ href, score });
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.href ?? null;
  }

  private extractImageCandidate(
    rawValue: string | undefined,
    baseUrl: string,
  ): string | null {
    if (!rawValue) return null;
    const firstSrc = rawValue.split(",")[0]?.trim().split(/\s+/)[0];
    const resolved = this.resolveUrl(firstSrc || rawValue, baseUrl);
    if (!resolved || !resolved.startsWith("http")) return null;
    if (
      /logo|icon|avatar|profile|placeholder|spinner|loading/i.test(resolved)
    ) {
      return null;
    }
    return resolved;
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
        responseType: "arraybuffer",
        timeout: 10_000,
      });
      const buffer = res.data;
      const contentType =
        (res.headers["content-type"] as string) || "image/jpeg";
      const extension = contentType.split("/")[1] || "jpg";
      const filename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;

      // 2. Ensure bucket exists
      const bucketName = "opportunities_images";
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
  private extractBestImageFromHTML(
    html: string,
    baseUrl: string,
  ): string | null {
    return this.extractImageCandidatesFromHTML(html, baseUrl)[0] ?? null;
  }

  /**
   * Ordered image candidates for a page: og/twitter meta image first, then the
   * first few in-article images. Returning a list lets the caller skip a
   * candidate that turns out to be a shared site-default banner.
   */
  private extractImageCandidatesFromHTML(
    html: string,
    baseUrl: string,
  ): string[] {
    const $ = cheerio.load(html);
    const candidates: string[] = [];
    const push = (value: string | null) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };

    const og =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[property="og:image:secure_url"]').attr("content") ||
      $('meta[name="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $('meta[property="twitter:image"]').attr("content");
    push(this.extractImageCandidate(og, baseUrl));

    $("article img, .entry-content img, .post-content img, main img").each(
      (_, el) => {
        if (candidates.length >= 5) return;
        push(
          this.extractImageCandidate($(el).attr("src"), baseUrl) ||
            this.extractImageCandidate($(el).attr("data-src"), baseUrl) ||
            this.extractImageCandidate($(el).attr("srcset"), baseUrl) ||
            this.extractImageCandidate($(el).attr("data-srcset"), baseUrl),
        );
      },
    );

    return candidates;
  }

  private normalizeImageKey(url: string): string | null {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString().toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Pick the first candidate image not already used by a different
   * opportunity — neither earlier in this run nor anywhere in the database.
   * A site-default og:image repeated across posts fails the claim, and the
   * caller falls through to in-article images or no image at all (the web
   * app renders a branded category tile instead — never a duplicate photo).
   */
  private async claimUniqueImage(
    candidates: Array<string | null | undefined>,
    applyUrl: string,
  ): Promise<string | null> {
    for (const candidate of candidates) {
      if (!candidate || !candidate.startsWith("http")) continue;
      const key = this.normalizeImageKey(candidate);
      if (!key) continue;

      const claimedBy = this.imageClaimsThisRun.get(key);
      if (claimedBy && claimedBy !== applyUrl) {
        this.logger.log(
          `    ↳ Skipping shared image (already used by ${claimedBy}): ${candidate}`,
        );
        continue;
      }

      if (!claimedBy && (await this.isImageUsedByOtherOpportunity(key, applyUrl))) {
        // Remember the verdict so sibling items skip the DB round-trip.
        this.imageClaimsThisRun.set(key, "__existing_opportunity__");
        this.logger.log(
          `    ↳ Skipping image already used by a stored opportunity: ${candidate}`,
        );
        continue;
      }

      this.imageClaimsThisRun.set(key, applyUrl);
      return candidate;
    }

    return null;
  }

  private async isImageUsedByOtherOpportunity(
    sourceImageKey: string,
    applyUrl: string,
  ): Promise<boolean> {
    if (!this.supabase) return false;
    try {
      const { data } = await this.supabase
        .from("opportunities")
        .select("id")
        .eq("metadata->>source_image_url", sourceImageKey)
        .neq("apply_url", applyUrl)
        .limit(1);
      return Boolean(data && data.length > 0);
    } catch {
      // Fail open: an occasional duplicate beats dropping images on a DB blip.
      return false;
    }
  }

  // ─── Transform to DB Format ───────────────────────────────────────────────

  private evaluateOpportunityQuality(item: RawItem): {
    score: number;
    missingFields: string[];
  } {
    let score = 0;
    const missingFields: string[] = [];
    const summary = this.normalizeSummary(
      this.cleanOptionalText(item.summary, 360) ||
        this.createFallbackSummary(item),
      item.description || "",
      item.title,
    );
    const description = item.description?.trim() || "";

    if (item.title?.trim().length >= 8) score += 15;
    else missingFields.push("title");

    if (summary.length >= 120) score += 10;
    else if (summary.length >= 60) score += 5;
    else missingFields.push("summary");

    if (description.length >= MIN_DESCRIPTION_CHARS) score += 25;
    else if (description.length >= 100) score += 12;
    else missingFields.push("description");

    if (item.direct_apply_url?.startsWith("http")) score += 15;
    else missingFields.push("application_url");

    if (item.requirements?.length) score += 15;
    else missingFields.push("requirements");

    if (item.benefits?.length || item.amount != null) score += 10;
    else missingFields.push("benefits_or_funding");

    if (item.deadline) score += 10;
    else missingFields.push("deadline");

    if (item.location && item.location !== "Worldwide") score += 5;
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
    // Users only ever see the cleaned title — CTA junk and aggregator
    // suffixes are stripped before anything downstream touches it.
    item = { ...item, title: this.cleanOpportunityTitle(item.title) };
    const now = new Date().toISOString();
    const { stipend, currency } = this.parseAmount(item.amount);
    // A year in the title ("MIP 2026") anchors year-less deadline fragments
    // ("Deadline: April 30") to the right edition instead of a guess.
    const titleYear = item.title?.match(/\b(20\d{2})\b/)?.[1];
    const parsedDeadline = parseDeadlineDetailed(
      item.deadline,
      titleYear ? Number(titleYear) : null,
    );
    const closeDate = parsedDeadline.date;
    const quality = this.evaluateOpportunityQuality(item);
    const summary = this.normalizeSummary(
      item.summary || this.createFallbackSummary(item),
      item.description || "",
      item.title,
    );
    // Strip whitespace/wrapping junk so stored links are always clickable — a
    // scraped URL with a space in it breaks the "Apply" button on web + mobile.
    const detailUrl = this.sanitizeUrl(item.apply_url) || "";
    const directApplyUrl = this.sanitizeUrl(item.direct_apply_url);
    const sourceUrl = this.sanitizeUrl(item.source_url);
    const application_url = directApplyUrl
      ? directApplyUrl.split("#")[0]
      : null;
    const canonicalUrl = this.normalizeUrl(application_url || detailUrl);
    const contentFingerprint = this.createContentFingerprint(
      item.title,
      item.source,
      closeDate,
    );
    const classification = classifyOpportunity(
      item as unknown as Record<string, unknown>,
    );
    const organization = this.inferOrganizerName(item);
    const publicTags = this.buildPublicTags(
      item,
      classification.canonicalCategory,
    );

    // Hard publish gate: a record may only go live when its core fields hold
    // real scraped content — a passing score alone is not enough.
    const hasCoreContent =
      !quality.missingFields.includes("title") &&
      !quality.missingFields.includes("description") &&
      summary.length >= 60 &&
      Boolean(organization);
    // A deadline that already passed at scrape time means a stale post or a
    // misparsed date — either way it would confuse users if published.
    const deadlinePassed = Boolean(
      closeDate && closeDate < now.split("T")[0],
    );
    // Low LLM extraction confidence means the fields themselves are suspect —
    // cap at pending_review. Only applies to AI-enriched items (confidence 0
    // simply means "no AI enrichment ran", which is not a trust signal).
    const enrichmentConfidence = item.enrichment_confidence ?? 0;
    const lowExtractionConfidence =
      enrichmentConfidence > 0 && enrichmentConfidence < 0.5;
    const publishable =
      quality.score >= MIN_PUBLISH_QUALITY_SCORE &&
      hasCoreContent &&
      !deadlinePassed &&
      !lowExtractionConfidence;

    return {
      title: item.title,
      summary,
      organization,
      category:
        this.categorize(item.title) ??
        this.displayCategoryFor(classification.canonicalCategory),
      canonical_category: classification.canonicalCategory,
      close_date: closeDate,
      deadline: closeDate,
      type: this.toAllowedType(
        this.inferType(item.title, item.description ?? ""),
      ),
      is_remote: item.location
        ? /\b(remote|online|virtual|worldwide|global)\b/i.test(item.location)
        : true,
      location: item.location ?? null,
      eligibility: item.eligibility ?? {},
      funding_type: item.funding_type ?? null,
      target_region: item.target_region ?? null,
      description: this.normalizeDescription(item.description || ""),
      application_url,
      apply_url: detailUrl || null,
      source_url: detailUrl || sourceUrl || null,
      canonical_url: canonicalUrl,
      content_fingerprint: contentFingerprint,
      quality_score: quality.score,
      validation_status: publishable ? "valid" : "needs_review",
      image_url: item.image_url || null,
      stipend,
      currency,
      source: "scraper",
      tags: publicTags,
      metadata: {
        source_url: sourceUrl,
        aggregator_url: detailUrl,
        detail_url: detailUrl,
        direct_apply_url: directApplyUrl,
        // Original (pre-proxy) image URL — the storage proxy renames files,
        // so this is the only way to detect shared/default images later.
        source_image_url: item.source_image_url ?? null,
        scrape_job_id: jobLogId,
        ai_enriched: (item.enrichment_confidence ?? 0) > 0,
        ai_feature: "scraper.extract",
        canonical_category: classification.canonicalCategory,
        classification_confidence: classification.confidence,
        classification_reason: classification.reason,
        classification_source: classification.source,
        classification_signals: classification.matchedSignals,
        classification_needs_review: classification.needsReview,
        ai_model_hint: "deepseek-chat",
        enrichment_confidence: item.enrichment_confidence ?? 0,
        enrichment_notes: item.enrichment_notes ?? [],
        extraction_quality_score: quality.score,
        extraction_missing_fields: quality.missingFields,
        deadline_passed_at_scrape: deadlinePassed,
        // Provenance for the stored deadline: raw source wording plus whether
        // the year was stated ("explicit") or projected ("inferred"). The
        // verification job re-confirms inferred/unknown deadlines against the
        // live page before ever closing an opportunity on them.
        deadline_raw_text: item.deadline
          ? String(item.deadline).slice(0, 120)
          : null,
        deadline_confidence: parsedDeadline.confidence,
        low_extraction_confidence: lowExtractionConfidence,
        description_length: item.description?.length ?? 0,
        needs_review: !publishable,
        has_core_content: hasCoreContent,
        source_name: item.source,
        public_organization: organization,
        public_tags: publicTags,
        requirements: this.normalizeStringList(item.requirements ?? []),
        benefits: this.normalizeStringList(item.benefits ?? []),
        application_process: this.normalizeStringList(
          item.application_process ?? [],
        ),
        eligibility: item.eligibility ?? {},
        funding_type: item.funding_type ?? null,
        target_region: item.target_region ?? null,
      },
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      verification_next_check_at: now,
      status: publishable ? "active" : "pending_review",
    };
  }

  private inferType(title = "", description = ""): string {
    // Must stay inside the opportunities_type_check constraint set — one
    // out-of-set value fails the whole batch upsert (all-or-nothing).
    const t = `${title} ${description}`.toLowerCase();
    if (/\bfellowship/.test(t)) return "fellowship";
    if (/\binternship/.test(t)) return "internship";
    // No "grant" in the constraint; funding-style grants read as scholarships
    // (canonical_category keeps the precise classification).
    if (/\bgrant/.test(t)) return "scholarship";
    if (/\b(competition|challenge|contest|award|prize)\b/.test(t))
      return "competition";
    if (/\b(job|vacancy|hiring|recruitment)\b/.test(t)) return "job";
    if (/\bmentorship\b/.test(t)) return "mentorship";
    if (/\b(certification|certificate)\b/.test(t)) return "certification";
    if (/\bboot\s?camp\b/.test(t)) return "bootcamp";
    if (/\b(conference|workshop|training|summit|course|programme?)\b/.test(t))
      return "course";
    return "scholarship";
  }

  private displayCategoryFor(canonicalCategory: string): string {
    const labels: Record<string, string> = {
      scholarships: "Scholarship",
      careers: "Career",
      leadership: "Leadership",
      global_programs: "Global Program",
      training_conferences: "Training",
    };
    return labels[canonicalCategory] ?? "General";
  }

  private createFallbackSummary(item: RawItem): string {
    // Never fabricate copy: only assemble a summary from real scraped facts.
    // When nothing real exists, return "" so the record fails the publish gate
    // instead of shipping placeholder text.
    const parts = [
      item.title,
      item.location ? `for applicants in ${item.location}` : null,
      item.deadline ? `with deadline ${item.deadline}` : null,
    ].filter(Boolean);
    const raw = parts.length ? `${parts.join(" ")}.` : "";
    return this.normalizeSummary(raw, item.description || "", item.title);
  }

  /**
   * Make a scraped URL safe to store and click. A valid URL never contains raw
   * whitespace — spaces/newlines are line-wrap or extraction artifacts that
   * break the link and make it unclickable — so strip all internal whitespace
   * (incl. NBSP / zero-width) and any wrapping quotes or angle brackets.
   * Returns null when nothing usable remains.
   */
  private sanitizeUrl(url: string | null | undefined): string | null {
    if (url === null || url === undefined) return null;
    const cleaned = String(url)
      .replace(/[\s\u200B\u200C\u200D\uFEFF]+/g, "")
      .replace(/^["'<`]+|["'>`]+$/g, "")
      .trim();
    return cleaned || null;
  }

  private normalizeUrl(url: string): string {
    return (url || "")
      .replace(/[\s\u200B\u200C\u200D\uFEFF]+/g, "")
      .trim()
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  private cleanOptionalText(
    value: unknown,
    maxChars = 500,
  ): string | undefined {
    const cleaned = this.scrubPublicText(String(value ?? ""), maxChars);
    if (!cleaned) return undefined;
    if (
      /^(n\/a|na|none|null|unknown(?:\s+.*)?|not available|not provided|not stated|not specified|unspecified|tbd|tba)$/i.test(
        cleaned,
      )
    ) {
      return undefined;
    }
    return cleaned;
  }

  private normalizeSummary(
    summary: string | null | undefined,
    description: string | null | undefined,
    title: string,
  ): string {
    const cleanedSummary = this.cleanOptionalText(summary, 420);
    const cleanedDescription = this.scrubPublicText(
      String(description || ""),
      1200,
    );
    const fallback =
      this.firstSentence(cleanedDescription) || this.cleanText(title, 220);
    const candidate = cleanedSummary || fallback;
    if (!candidate) return "";
    const words = candidate.split(/\s+/).filter(Boolean);
    const limited =
      words.length > 45 ? words.slice(0, 45).join(" ") : candidate;
    return /[.!?]$/.test(limited) ? limited : `${limited}.`;
  }

  private normalizeDescription(description: string | null | undefined): string {
    return this.cleanOptionalText(description, 1800) || "";
  }

  private normalizeStringList(value: unknown): string[] {
    const queue = Array.isArray(value) ? value : value ? [value] : [];
    const flattened = queue.flatMap((entry) => {
      if (Array.isArray(entry)) return entry;
      if (typeof entry === "string") return [entry];
      if (entry && typeof entry === "object") {
        return Object.values(entry as Record<string, unknown>).map((value) =>
          String(value ?? ""),
        );
      }
      return [String(entry ?? "")];
    });

    return Array.from(
      new Set(
        flattened
          .map((entry) => this.cleanPublicListItem(entry, 220))
          .filter((entry): entry is string => Boolean(entry)),
      ),
    ).slice(0, 12);
  }

  private cleanPublicListItem(
    value: unknown,
    maxChars = 220,
  ): string | undefined {
    if (this.isScraperArtifact(String(value ?? ""))) return undefined;
    const cleaned = this.cleanOptionalText(value, maxChars);
    if (!cleaned) return undefined;
    if (this.isScraperArtifact(cleaned)) return undefined;
    if (
      /^(online application|apply online|application|not specified|not stated)$/i.test(
        cleaned,
      )
    ) {
      return undefined;
    }
    return cleaned;
  }

  private scrubPublicText(value: string, maxChars = 500): string {
    if (!value) return "";

    let cleaned = this.cleanText(value, Math.max(maxChars * 2, maxChars));
    cleaned = cleaned
      .replace(
        new RegExp(
          `\\bBy\\s+Admin\\s+On\\s+(?:${MONTH_PATTERN})\\s+\\d{1,2},\\s+20\\d{2}\\b`,
          "gi",
        ),
        " ",
      )
      .replace(/\bBy\s+Admin\b/gi, " ")
      .replace(/\b(?:posted|written)\s+by\s+[^.]{1,60}/gi, " ")
      .replace(
        /\bApplications?\s+are\s+now\s+open\s+for\s+/gi,
        "Applications are open for ",
      )
      .replace(SOURCE_BRAND_RE, "the official organizer")
      .replace(SCRAPER_ARTIFACT_RE, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();

    return this.cleanText(cleaned, maxChars);
  }

  private isScraperArtifact(value: string): boolean {
    return SCRAPER_ARTIFACT_RE.test(value) || SOURCE_BRAND_RE.test(value);
  }

  private inferOrganizerName(item: RawItem): string | null {
    const title = this.scrubPublicText(item.title || "", 220);
    const titleLead = title.match(
      /^(.{3,90}?)\s+(?:fully\s+funded|funded|leadership|scholarships?|fellowships?|grants?|bootcamps?|programs?|programmes?|internships?|accelerators?)\b/i,
    )?.[1];
    // NOTE: item.source (the scraping-source label, e.g. "CALL FOR
    // APPLICATIONS") is deliberately NOT a candidate — it leaks category
    // names into the user-facing organizer field. Null → re-enrichment.
    const candidates = [
      item.eligibility && typeof item.eligibility === "object"
        ? item.eligibility.organization
        : null,
      titleLead,
    ];

    for (const candidate of candidates) {
      const cleaned = this.scrubPublicText(String(candidate ?? ""), 120);
      if (!cleaned || cleaned.length < 3) continue;
      if (
        /^(unknown|admin|edutu engine|scholarship|program|opportunity)$/i.test(
          cleaned,
        )
      ) {
        continue;
      }
      if (
        /\b(call\s+for\s+applications?|applications?\s+open|category|opportunities)\b/i.test(
          cleaned,
        ) &&
        cleaned.split(/\s+/).length <= 4
      ) {
        continue;
      }
      if (SOURCE_BRAND_RE.test(cleaned)) continue;
      return cleaned;
    }

    // No fabricated "Program Organizer" default — store null so the record is
    // flagged for re-enrichment instead of shipping generic text.
    return null;
  }

  private buildPublicTags(item: RawItem, canonicalCategory: string): string[] {
    const categoryTags: Record<string, string> = {
      scholarships: "Scholarship",
      careers: "Career",
      leadership: "Leadership",
      global_programs: "Global Program",
      other: "Opportunity",
    };
    const rawTags = [
      categoryTags[canonicalCategory] || "Opportunity",
      item.funding_type,
      item.target_region,
      item.location && item.location !== "Worldwide" ? item.location : null,
    ];

    return Array.from(
      new Set(
        rawTags
          .map((tag) => this.scrubPublicText(String(tag ?? ""), 40))
          .filter((tag) => tag && !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase())),
      ),
    ).slice(0, 5);
  }

  private firstSentence(text: string): string {
    if (!text) return "";
    const sentenceMatch = text.match(/^(.{40,240}?[.!?])(?:\s|$)/);
    return sentenceMatch?.[1]?.trim() || text.substring(0, 220).trim();
  }

  private createContentFingerprint(
    title: string,
    organization: string,
    closeDate: string | null,
  ): string {
    return `${title}|${organization}|${closeDate ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  // ─── Deletion ─────────────────────────────────────────────────────────────

  async deleteJobWithOpportunities(
    jobId: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.supabase) return { success: false, error: "No database client" };

    try {
      // Delete opportunities whose metadata->>'scrape_job_id' equals jobId
      // We can use a raw delete by query since Supabase PostgREST supports JSON filtering:
      const { error: oppError } = await this.supabase
        .from("opportunities")
        .delete()
        .eq("metadata->>scrape_job_id", jobId);

      if (oppError) throw oppError;

      // Delete the scraping job log itself
      const { error: jobError } = await this.supabase
        .from("scrape_logs")
        .delete()
        .eq("id", jobId);

      if (jobError) throw jobError;

      this.logger.log(`Deleted job ${jobId} and its associated opportunities.`);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`Error deleting job ${jobId}: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isValidOpportunityCandidate(
    rawTitle: string | null | undefined,
    rawUrl: string | null | undefined,
    sourceUrl: string,
  ): boolean {
    const title = this.cleanText(rawTitle ?? "", 220);
    if (title.length < 8) return false;
    if (GENERIC_LINK_TITLE_RE.test(title)) return false;
    if (ROUNDUP_TITLE_RE.test(title)) return false;
    if (/\b(no description available|uncategorized|archives?)\b/i.test(title)) {
      return false;
    }

    const url = rawUrl ?? "";
    if (!url.startsWith("http")) return false;

    try {
      const parsedUrl = new URL(url);
      const parsedSource = new URL(sourceUrl);
      const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
      const sourcePath = parsedSource.pathname.replace(/\/+$/, "");

      if (
        parsedUrl.hostname === parsedSource.hostname &&
        normalizedPath === sourcePath
      ) {
        return false;
      }

      if (NON_OPPORTUNITY_URL_RE.test(parsedUrl.pathname)) return false;
    } catch {
      return false;
    }

    return true;
  }

  private extractCardDescription(card: any, title: string): string {
    const directDescription = card
      .find(
        "p, .entry-summary, .excerpt, .post-excerpt, .elementor-post__excerpt",
      )
      .first()
      .text();
    if (directDescription) return this.cleanText(directDescription, 1200);

    const cleanedTitle = this.cleanText(title, 220);
    const text = card
      .text()
      .replace(cleanedTitle, "")
      .replace(GENERIC_LINK_TITLE_RE, "")
      .replace(/\s+/g, " ")
      .trim();

    return this.cleanText(text, 1200);
  }

  private extractCardImage(card: any, baseUrl: string): string | null {
    let imageUrl: string | null = null;
    card.find("img").each((_, el: any) => {
      if (imageUrl) return;
      const attrs = el.attribs || {};
      imageUrl =
        this.extractImageCandidate(attrs.src, baseUrl) ||
        this.extractImageCandidate(attrs["data-src"], baseUrl) ||
        this.extractImageCandidate(attrs.srcset, baseUrl) ||
        this.extractImageCandidate(attrs["data-srcset"], baseUrl);
    });
    return imageUrl;
  }

  private cleanHtmlText(text: string, maxChars = 500): string {
    if (!text) return "";
    const withoutTags = /<[^>]+>/.test(text)
      ? cheerio.load(`<body>${text}</body>`)("body").text()
      : text;
    return this.cleanText(withoutTags, maxChars);
  }

  private createBriefDescriptionFromText(text: string): string | undefined {
    const cleaned = this.cleanText(text, 900);
    if (cleaned.length < 80) return undefined;

    const sentenceMatch = cleaned.match(/^(.{120,420}?[.!?])\s/);
    return sentenceMatch?.[1]?.trim() || cleaned.substring(0, 360).trim();
  }

  private parseAmount(raw: number | string | null | undefined): {
    stipend: number | null;
    currency: string;
  } {
    if (raw == null) return { stipend: null, currency: "USD" };
    if (typeof raw === "number")
      return { stipend: isNaN(raw) ? null : raw, currency: "USD" };

    const str = String(raw);
    for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (str.includes(symbol)) {
        const val = parseFloat(str.replace(/[^0-9.]/g, ""));
        return { stipend: isNaN(val) ? null : val, currency: code };
      }
    }
    const val = parseFloat(str.replace(/[^0-9.]/g, ""));
    return { stipend: isNaN(val) ? null : val, currency: "USD" };
  }

  private parseDate(raw: string | null | undefined): string | null {
    if (!raw) return null;
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
    } catch {
      return null;
    }
  }

  /** Clamp any inferred type into the DB constraint set. */
  private toAllowedType(type: string): string {
    return ALLOWED_OPPORTUNITY_TYPES.has(type) ? type : "scholarship";
  }

  /** See parseDeadlineDetailed in opportunities/deadline.util.ts. */
  private parseDeadlineDate(
    raw: string | null | undefined,
    contextYear: number | null = null,
  ): string | null {
    return parseDeadlineDetailed(raw, contextYear).date;
  }

  /**
   * Strip call-to-action junk, trailing deadline fragments, and aggregator
   * branding from a scraped title so users see only the opportunity's name.
   */
  private cleanOpportunityTitle(raw: string | null | undefined): string {
    if (!raw) return "";
    let title = String(raw).replace(/\s+/g, " ").trim();

    title = title
      .replace(/^(?:hot|new|urgent)\s*[:\-–—]\s*/i, "")
      .replace(/^apply\s+now\s*[:\-–—]\s*/i, "")
      .replace(
        /\s*[-–—|:]\s*(?:apply\s+(?:now|here|today)|applications?\s+(?:are\s+)?(?:now\s+)?open|register\s+now|read\s+more|check\s+details).*$/i,
        "",
      )
      .replace(/\s*\((?:apply\s+now|now\s+open|open|ongoing)\)\s*$/i, "")
      .replace(/\s*[-–—|]\s*(?:deadline|closing\s+date|closes)\b.*$/i, "");

    // Trailing "| SiteName" / "- SiteName" aggregator suffixes.
    title = title.replace(
      new RegExp(`\\s*[-–—|:]\\s*(?:${SOURCE_BRAND_RE.source})\\s*$`, "i"),
      "",
    );

    return title
      .replace(/^[\s\-–—|:]+/, "")
      .replace(/[\s\-–—|:]+$/, "")
      .slice(0, 200)
      .trim();
  }

  private buildPageUrl(baseUrl: string, page: number): string {
    if (page === 1) return baseUrl;
    return baseUrl.includes("?")
      ? `${baseUrl}&page=${page}`
      : `${baseUrl.replace(/\/$/, "")}/page/${page}/`;
  }

  private resolveUrl(href: string, baseUrl: string): string {
    if (!href) return "";
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href.startsWith("http") ? href : "";
    }
  }

  private cleanText(text: string, maxChars = 500): string {
    return (text ?? "").replace(/\s+/g, " ").trim().substring(0, maxChars);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractAmount(text: string): number | null {
    const match = text.match(/[$€£]([\d,]+)/);
    if (match) {
      const n = parseFloat(match[1].replace(/,/g, ""));
      return isNaN(n) ? null : n;
    }
    return null;
  }

  private extractDeadline(text: string): string | null {
    return extractDeadlineText(text);
  }

  private extractLocation(text: string): string | undefined {
    const m =
      text.match(/location[:\s]*([^\n,]{3,40})/i) ||
      text.match(/based\s+in[:\s]*([^\n,]{3,40})/i);
    // No fabricated "Worldwide" default — unknown stays unknown.
    return m ? m[1].trim() : undefined;
  }

  // Field-of-study is only trusted from the title — descriptions mention
  // fields incidentally ("transform public health…") and mislabel generic
  // scholarships.
  private categorize(title = ""): string | null {
    for (const [category, pattern] of CATEGORY_PATTERNS) {
      if (pattern.test(title)) return category;
    }
    // No keyword hit — let the caller derive a label from the canonical
    // classification instead of defaulting to a generic "General".
    return null;
  }

  // ─── Source Status ────────────────────────────────────────────────────────

  private async updateSourceStatus(
    id: number,
    success: boolean,
    scraped: number,
    discovered = 0,
    error?: string,
  ): Promise<void> {
    if (!this.supabase || !id) return;
    const { data: current } = await this.supabase
      .from("scraping_sources")
      .select(
        "consecutive_failures,total_failed,total_scraped,total_urls_discovered",
      )
      .eq("id", id)
      .maybeSingle();

    const update: Record<string, unknown> = {
      last_scraped: new Date().toISOString(),
      total_urls_discovered:
        Number(current?.total_urls_discovered || 0) + discovered,
    };
    if (success) {
      update.last_success = update.last_scraped;
      update.last_error = null;
      update.consecutive_failures = 0;
      update.total_scraped = Number(current?.total_scraped || 0) + scraped;
    } else {
      update.last_error = error ?? null;
      update.consecutive_failures =
        Number(current?.consecutive_failures || 0) + 1;
      update.total_failed = Number(current?.total_failed || 0) + 1;
    }
    await this.supabase.from("scraping_sources").update(update).eq("id", id);
  }

  // ─── Public: Sources / Jobs / Stats ──────────────────────────────────────

  async getSources(): Promise<ScrapeSource[]> {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("scraping_sources")
      .select("*")
      .order("priority");
    if (error) {
      this.logger.error(error.message);
      return [];
    }
    return data ?? [];
  }

  async addSource(body: {
    name: string;
    url?: string;
    category?: string;
    tier?: number;
    parent_id?: number;
    is_group?: boolean;
  }) {
    if (!this.supabase)
      return { success: false, error: "No database configured" };
    // Groups have no real URL, but scraping_sources.url is UNIQUE — a literal ""
    // collides with every previously created group. Use a synthetic per-name URL.
    const url = body.is_group
      ? `group://${body.name.trim().toLowerCase().replace(/\s+/g, "-")}`
      : (body.url ?? "").trim();
    const { data, error } = await this.supabase
      .from("scraping_sources")
      .insert({
        name: body.name,
        url,
        category: body.category ?? "scholarship",
        tier: body.tier ?? 2,
        enabled: true,
        parent_id: body.parent_id || null,
        is_group: !!body.is_group,
      })
      .select()
      .single();
    if (error) {
      const isDuplicate =
        error.code === "23505" || /duplicate key/i.test(error.message);
      return {
        success: false,
        duplicate: isDuplicate,
        error: isDuplicate
          ? body.is_group
            ? `A group named "${body.name}" already exists`
            : "A source with this URL already exists"
          : error.message,
      };
    }
    return { success: true, data };
  }

  async deleteSource(id: number) {
    if (!this.supabase)
      return { success: false, error: "No database configured" };
    const { error } = await this.supabase
      .from("scraping_sources")
      .delete()
      .eq("id", id);
    return { success: !error, error: error?.message };
  }

  async updateSource(id: number, body: { enabled?: boolean }) {
    if (!this.supabase)
      return { success: false, error: "No database configured" };
    const { error } = await this.supabase
      .from("scraping_sources")
      .update(body)
      .eq("id", id);
    return { success: !error, error: error?.message };
  }

  async getJobs(limit = 20) {
    if (!this.supabase) return [];
    const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 200);
    const { data, error } = await this.supabase
      .from("scrape_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(cappedLimit);
    if (error) return [];
    return data ?? [];
  }

  async getJobOpportunities(jobId: string, limit = 200) {
    if (!this.supabase) return [];

    const cappedLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const { data, error } = await this.supabase
      .from("opportunities")
      .select("*")
      .eq("metadata->>scrape_job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (error) {
      this.logger.error(`Failed to load job opportunities: ${error.message}`);
      return [];
    }

    return data ?? [];
  }

  async getStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
  }> {
    if (!this.supabase) return { total: 0, bySource: {} };

    // Use aggregation query instead of fetching all rows
    const { data, error } = await this.supabase.rpc(
      "count_opportunities_by_source",
    );

    if (error) {
      this.logger.warn(
        `Stats query failed: ${error.message}, falling back to row fetch`,
      );
      // Memory-safe fallback: exact total via a head-only count, and a capped
      // sample for the per-source breakdown instead of loading every row.
      const FALLBACK_SAMPLE_LIMIT = 5_000;
      const [{ count: totalCount }, { data: fallbackData, error: fallbackError }] =
        await Promise.all([
          this.supabase
            .from("opportunities")
            .select("id", { count: "exact", head: true }),
          this.supabase
            .from("opportunities")
            .select("source")
            .order("created_at", { ascending: false })
            .limit(FALLBACK_SAMPLE_LIMIT),
        ]);
      if (fallbackError) return { total: totalCount ?? 0, bySource: {} };

      const bySource: Record<string, number> = {};
      for (const item of fallbackData ?? []) {
        const src = item.source ?? "manual";
        bySource[src] = (bySource[src] ?? 0) + 1;
      }
      return { total: totalCount ?? fallbackData?.length ?? 0, bySource };
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
        title: "International Scholarship for Students",
        organization: "Global Education Foundation",
        category: "Education",
        close_date: "2025-12-31",
        location: "Worldwide",
        description:
          "Fully funded scholarship for international students pursuing undergraduate studies.",
        metadata: {
          requirements: [
            "High school diploma",
            "English proficiency",
            "Leadership experience",
          ],
          benefits: ["Full tuition", "Living stipend", "Travel allowance"],
          application_process: [
            "Online application",
            "Essay submission",
            "Interview",
          ],
        },
        application_url: "https://example.com/apply",
        canonical_url: "https://example.com/apply",
        content_fingerprint:
          "international scholarship for students|global education foundation|2025-12-31",
        quality_score: 100,
        validation_status: "valid",
        stipend: 50000,
        currency: "USD",
        source: "scraper",
        created_at: now,
        updated_at: now,
        status: "active",
        tags: ["Scholarship", "International", "Fully Funded"],
      },
    ];

    // Mock data is for connectivity smoke tests only — never write it to a DB.
    return {
      success: true,
      sourcesScraped: 1,
      totalResults: mock.length,
      duration: 1,
      sources: ["Mock Source"],
      sourceResults: [
        {
          name: "Mock Source",
          url: "https://example.com",
          status: "success",
          itemsFound: mock.length,
          itemsSaved: mock.length,
          duration: 1,
        },
      ],
    };
  }
}
