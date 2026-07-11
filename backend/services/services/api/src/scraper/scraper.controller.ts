import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  Patch,
  Logger,
  UseGuards,
  Sse,
  Query,
  type MessageEvent,
} from "@nestjs/common";
import { Observable, Subject } from "rxjs";
import { Throttle } from "@nestjs/throttler";
import { ScraperService, ScrapeSource } from "./scraper.service";
import { Public, AdminGuard } from "../auth";

@Controller("api/scraper")
@UseGuards(AdminGuard)
export class ScraperController {
  private readonly logger = new Logger(ScraperController.name);
  constructor(private readonly scraperService: ScraperService) {}

  @Post("run")
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async runScraper(
    @Body()
    body: {
      sourceId?: number;
      allSources?: boolean;
      maxPages?: number;
      background?: boolean;
    },
  ) {
    const options = {
      sourceId: body.sourceId,
      allSources: body.allSources,
      maxPages: body.maxPages || 3,
    };

    // Non-blocking path for long crawls (e.g. allSources): return immediately
    // and let the client poll GET /api/scraper/jobs. Avoids gateway timeouts on
    // multi-minute runs. Default stays synchronous for backward compatibility.
    if (body.background) {
      const { started, error } = this.scraperService.startScraperRun(options);
      return {
        success: started,
        status: started ? "running" : "not_started",
        message: started
          ? "Scrape started in the background. Poll /api/scraper/jobs for progress."
          : error,
        error: started ? undefined : error,
      };
    }

    try {
      return await this.scraperService.runScraper(options);
    } catch (error) {
      this.logger.error(`Scraper run failed: ${error.message}`);
      return {
        success: false,
        error: error.message || "An error occurred",
      };
    }
  }

  /**
   * Server-Sent Events stream of a live scrape: emits `start`, `source-start`,
   * `opportunity` (one per enriched item), `source-done`, and finally `done` /
   * `error`. The admin UI reads this with fetch()+ReadableStream so it can send
   * auth headers (EventSource cannot). Guarded by the class-level AdminGuard.
   */
  @Sse("run/stream")
  runScraperStream(
    @Query()
    query: { sourceId?: string; allSources?: string; maxPages?: string },
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const options = {
      sourceId: query.sourceId ? Number(query.sourceId) : undefined,
      allSources: query.sourceId ? false : true,
      maxPages: query.maxPages ? Number(query.maxPages) : 3,
    };
    const emit = (data: unknown) => subject.next({ data } as MessageEvent);

    this.scraperService
      .runScraper(options, (event) => emit(event))
      .then((result) => {
        emit({ type: "done", result });
        subject.complete();
      })
      .catch((error) => {
        this.logger.error(`Scraper stream failed: ${error?.message}`);
        emit({ type: "error", error: error?.message || "Scrape failed" });
        subject.complete();
      });

    return subject.asObservable();
  }

  // ─── Live run controls (pause / resume / stop the in-flight scrape) ────────
  @Post("run/pause")
  pauseRun() {
    return this.scraperService.pauseRun();
  }

  @Post("run/resume")
  resumeRun() {
    return this.scraperService.resumeRun();
  }

  @Post("run/stop")
  stopRun() {
    return this.scraperService.stopRun();
  }

  @Get("run/status")
  runStatus() {
    return this.scraperService.getRunStatus();
  }

  @Post("backfill")
  @Throttle({ default: { limit: 12, ttl: 3600000 } })
  async backfill(@Body() body: { limit?: number }) {
    try {
      return await this.scraperService.backfillIncompleteOpportunities(
        body?.limit,
      );
    } catch (error: any) {
      this.logger.error(`Backfill failed: ${error.message}`);
      return {
        success: false,
        error: error.message || "Backfill failed",
      };
    }
  }

  @Post("enhance-preview")
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  async enhancePreview(@Body() body: Record<string, any>) {
    try {
      return await this.scraperService.enhancePreviewOpportunity(body || {});
    } catch (error: any) {
      this.logger.error(`Enhance preview failed: ${error.message}`);
      return {
        success: false,
        error: error.message || "Could not improve opportunity",
      };
    }
  }

  @Get("engine-status")
  async getEngineStatus() {
    try {
      return await this.scraperService.getEngineStatus();
    } catch (error) {
      this.logger.error(`Get engine status failed: ${error.message}`);
      return {
        success: false,
        error: error.message || "Could not read scraper engine status",
      };
    }
  }

  @Get("sources")
  async getSources() {
    try {
      return await this.scraperService.getSources();
    } catch (error) {
      this.logger.error(`Get sources failed: ${error.message}`);
      return [];
    }
  }

  @Post("sources")
  async addSource(
    @Body()
    body: {
      name: string;
      url?: string;
      category?: string;
      tier?: number;
      parent_id?: number;
      is_group?: boolean;
    },
  ) {
    try {
      if (!body.name || (!body.url && !body.is_group)) {
        return {
          success: false,
          error: "Name and URL are required unless this is a group source",
        };
      }
      return await this.scraperService.addSource(body);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Delete("sources/:id")
  async deleteSource(@Param("id") id: string) {
    try {
      return await this.scraperService.deleteSource(Number(id));
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Patch("sources/:id")
  async updateSource(
    @Param("id") id: string,
    @Body() body: { enabled?: boolean },
  ) {
    try {
      return await this.scraperService.updateSource(Number(id), body);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get("jobs")
  async getJobs(@Query("limit") limit?: string) {
    try {
      return await this.scraperService.getJobs(Number(limit) || 20);
    } catch (error) {
      this.logger.error(`Get jobs failed: ${error.message}`);
      return [];
    }
  }

  @Get("jobs/:id/opportunities")
  async getJobOpportunities(@Param("id") id: string) {
    try {
      return await this.scraperService.getJobOpportunities(id);
    } catch (error) {
      this.logger.error(`Get job opportunities failed: ${error.message}`);
      return [];
    }
  }

  @Delete("jobs/:id")
  async deleteJob(@Param("id") id: string) {
    try {
      return await this.scraperService.deleteJobWithOpportunities(id);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  @Get("stats")
  async getStats() {
    try {
      return await this.scraperService.getStats();
    } catch (error) {
      this.logger.error(`Get stats failed: ${error.message}`);
      return { total: 0, bySource: {} };
    }
  }

  @Get("settings")
  async getSettings() {
    try {
      return await this.scraperService.getSettings();
    } catch (error) {
      return {
        auto_run_enabled: false,
        cron_schedule: "0 0 * * *",
        data_retention_days: null,
      };
    }
  }

  @Post("settings")
  async updateSettings(
    @Body()
    body: {
      auto_run_enabled?: boolean;
      cron_schedule?: string;
      data_retention_days?: number | null;
    },
  ) {
    try {
      return await this.scraperService.updateSettings(body);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
