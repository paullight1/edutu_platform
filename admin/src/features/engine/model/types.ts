export type EngineResourceStatus =
  | "idle"
  | "loading"
  | "success"
  | "error";

export interface ScrapeSource {
  id: number;
  name: string;
  url: string;
  tier: number;
  category: string;
  enabled: boolean;
  priority: number;
  last_scraped: string | null;
  last_success: string | null;
  last_error: string | null;
  total_scraped: number;
  total_failed: number;
  parent_id?: number | null;
  is_group?: boolean;
}

export interface CreateScrapeSourceInput {
  name: string;
  url?: string;
  category: string;
  tier?: number;
  enabled?: boolean;
  priority?: number;
  parent_id?: number | null;
  is_group?: boolean;
}

export type UpdateScrapeSourceInput = Partial<CreateScrapeSourceInput>;

export interface OpportunityBatch {
  jobId: string | null;
  count: number;
  firstSeen: string | null;
  lastSeen: string | null;
  runType: string | null;
  startedAt: string | null;
}

export interface OpportunitySite {
  host: string;
  total: number;
  batches: OpportunityBatch[];
}

export interface EngineStats {
  total: number;
  bySource: Record<string, number>;
}

export interface OpportunityQualityScorecard {
  total: number;
  active: number;
  active_missing_deadline: number;
  active_imageless: number;
  duplicates: number;
  active_stale_14d: number;
  active_unknown_confidence: number;
  pending_review: number;
  active_listing_urls: number;
  html_titles: number;
  active_thin_description: number;
  active_verified_7d: number;
  newest_verification_at: string | null;
}

export interface EngineRuntimeIdentity {
  service: "edutu-api";
  environment: string;
  version: string;
  commit: string | null;
  startedAt: string;
}

export interface EngineStatus {
  success: boolean;
  runtime?: EngineRuntimeIdentity;
  database?: {
    configured: boolean;
    reachable?: boolean;
    error?: string;
  };
  ai?: {
    deepseekConfigured: boolean;
    geminiConfigured?: boolean;
    source: string;
    feature: string;
    provider: string;
    model: string;
    enabled: boolean;
  };
  scraper?: {
    schedulerEnabled: boolean;
    autoRunEnabled: boolean;
    cronSchedule: string;
    cronTimezone?: string;
    cronArmed?: boolean;
    nextRunAt?: string | null;
    egressRoute?: string;
    dataRetentionDays: number | null;
    recheckAfterDays?: number;
    enrichConcurrency: number;
    maxPagesCap: number;
    minPublishQualityScore: number;
  };
  error?: string;
}

export interface SourceResult {
  name: string;
  url: string;
  status: "success" | "failed" | "skipped" | "pending";
  itemsFound: number;
  itemsSaved: number;
  itemsSkipped?: number;
  error?: string;
  duration?: number;
}

export interface ScrapedOpportunity {
  id?: string | number;
  title: string;
  organization?: string;
  category?: string;
  deadline?: string | null;
  location?: string;
  description?: string;
  summary?: string;
  applyUrl?: string;
  apply_url?: string;
  imageUrl?: string;
  image_url?: string;
  application_url?: string;
  amount?: number | null;
  source: string;
  sourceUrl?: string;
  source_url?: string;
  requirements?: string[];
  benefits?: string[];
  application_process?: string[];
  eligibility?: Record<string, unknown>;
  funding_type?: string | null;
  target_region?: string | null;
  metadata?: {
    extraction_quality_score?: number;
    extraction_missing_fields?: string[];
    needs_review?: boolean;
    ai_improved_at?: string;
    [key: string]: unknown;
  };
}

export interface ScrapeResult {
  success: boolean;
  sourcesScraped?: number;
  totalResults?: number;
  itemsSkipped?: number;
  duration?: number;
  jobId?: string;
  sources?: string[];
  error?: string;
  sourceResults?: SourceResult[];
  opportunities?: ScrapedOpportunity[];
}

export interface ScrapeJob {
  id: string;
  source_id: number;
  source_name?: string;
  run_type: string;
  status: string;
  urls_discovered: number;
  urls_scraped: number;
  urls_saved?: number;
  urls_failed?: number;
  items_found?: number;
  source_results?:
    | string
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;
  errors: Array<string | Record<string, unknown>>;
  warnings: Array<string | Record<string, unknown>>;
  duration_seconds: number;
  started_at: string;
  completed_at: string | null;
}

export interface RunStatus {
  running: boolean;
  paused: boolean;
  stopping: boolean;
}

export interface AutomationSettings {
  auto_run_enabled: boolean;
  cron_schedule: string;
  data_retention_days: number | null;
  recheck_after_days: number;
}

export type UpdateAutomationSettingsInput = Partial<AutomationSettings>;

export interface SourceMutationResult {
  success: boolean;
  duplicate?: boolean;
  error?: string;
  data?: { id: number };
}

export interface DeleteSiteResult {
  success: boolean;
  deleted: number;
  error?: string;
}

export interface DeleteJobResult {
  success: boolean;
  error?: string;
}

export interface EnhancePreviewResult {
  success: boolean;
  opportunity?: ScrapedOpportunity;
  error?: string;
}

export interface BulkImportItem {
  title: string;
  summary?: string;
  description?: string;
  category?: string;
  organization?: string;
  location?: string;
  type: string;
  eligibilityCriteria?: string;
  fundingType?: string;
  targetRegion?: string;
  deadline?: string;
  sourceUrl: string;
  applyUrl: string;
  imageUrl?: string;
  eligibility?: Record<string, unknown>;
  isFeatured: boolean;
  isRemote: boolean;
  status: string;
  tags: string[];
}

export interface BulkImportResult {
  success: boolean;
  inserted?: number;
  skipped?: number;
  error?: string;
}

export interface PurgeResult {
  success: boolean;
  deletedCount: number;
}

export interface EngineStreamStartEvent {
  type: "start";
  sources?: string[];
}

export interface EngineStreamSourceStartEvent {
  type: "source-start";
  name: string;
}

export interface EngineStreamSourceSkipEvent {
  type: "source-skip";
  name?: string;
  skipped?: number;
}

export interface EngineStreamControlEvent {
  type: "control";
  state: "paused" | "running" | "stopping" | string;
}

export interface EngineStreamOpportunityEvent {
  type: "opportunity";
  opportunity: ScrapedOpportunity;
}

export interface EngineStreamSourceDoneEvent {
  type: "source-done";
  name: string;
  error?: string;
}

export interface EngineStreamDoneEvent {
  type: "done";
  result: ScrapeResult;
}

export interface EngineStreamErrorEvent {
  type: "error";
  error: string;
}

export type EngineStreamEvent =
  | EngineStreamStartEvent
  | EngineStreamSourceStartEvent
  | EngineStreamSourceSkipEvent
  | EngineStreamControlEvent
  | EngineStreamOpportunityEvent
  | EngineStreamSourceDoneEvent
  | EngineStreamDoneEvent
  | EngineStreamErrorEvent;

export interface OpenRunStreamOptions {
  sourceId?: number;
  allSources?: boolean;
  maxPages: number;
  incremental: boolean;
}

export interface EngineStreamHandlers {
  onEvent?(event: EngineStreamEvent): void;
}
