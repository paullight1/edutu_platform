import type {
  AutomationSettings,
  BulkImportItem,
  BulkImportResult,
  CreateScrapeSourceInput,
  DeleteJobResult,
  DeleteSiteResult,
  EngineStats,
  EngineStatus,
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

function notImplemented(): never {
  throw new Error("Engine API adapter is not implemented");
}

export const engineApi = {
  getStatus(): Promise<EngineStatus> {
    return Promise.reject(notImplemented());
  },
  listSources(): Promise<ScrapeSource[]> {
    return Promise.reject(notImplemented());
  },
  createSource(_input: CreateScrapeSourceInput): Promise<SourceMutationResult> {
    return Promise.reject(notImplemented());
  },
  updateSource(
    _id: number,
    _input: UpdateScrapeSourceInput,
  ): Promise<SourceMutationResult> {
    return Promise.reject(notImplemented());
  },
  deleteSource(_id: number): Promise<SourceMutationResult> {
    return Promise.reject(notImplemented());
  },
  listJobs(_limit = 100): Promise<ScrapeJob[]> {
    return Promise.reject(notImplemented());
  },
  getJobOpportunities(_id: string): Promise<ScrapedOpportunity[]> {
    return Promise.reject(notImplemented());
  },
  deleteJob(_id: string): Promise<DeleteJobResult> {
    return Promise.reject(notImplemented());
  },
  getStats(): Promise<EngineStats> {
    return Promise.reject(notImplemented());
  },
  listSites(): Promise<OpportunitySite[]> {
    return Promise.reject(notImplemented());
  },
  deleteSiteOpportunities(_host: string): Promise<DeleteSiteResult> {
    return Promise.reject(notImplemented());
  },
  getRunStatus(): Promise<RunStatus> {
    return Promise.reject(notImplemented());
  },
  pauseRun(): Promise<void> {
    return Promise.reject(notImplemented());
  },
  resumeRun(): Promise<void> {
    return Promise.reject(notImplemented());
  },
  stopRun(): Promise<void> {
    return Promise.reject(notImplemented());
  },
  getAutomationSettings(): Promise<AutomationSettings> {
    return Promise.reject(notImplemented());
  },
  updateAutomationSettings(
    _input: UpdateAutomationSettingsInput,
  ): Promise<{ success: boolean; error?: string }> {
    return Promise.reject(notImplemented());
  },
  enhancePreview(
    _opportunity: ScrapedOpportunity,
  ): Promise<EnhancePreviewResult> {
    return Promise.reject(notImplemented());
  },
  bulkImport(_items: BulkImportItem[]): Promise<BulkImportResult> {
    return Promise.reject(notImplemented());
  },
  purgeOpportunities(_olderThanDays: number): Promise<PurgeResult> {
    return Promise.reject(notImplemented());
  },
  openRunStream(
    _options: OpenRunStreamOptions,
    _handlers: EngineStreamHandlers = {},
    _signal?: AbortSignal,
  ): Promise<ScrapeResult> {
    return Promise.reject(notImplemented());
  },
};
