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
} from "@nestjs/common";
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
    },
  ) {
    try {
      const result = await this.scraperService.runScraper({
        sourceId: body.sourceId,
        allSources: body.allSources,
        maxPages: body.maxPages || 3,
      });

      return result;
    } catch (error) {
      this.logger.error(`Scraper run failed: ${error.message}`);
      return {
        success: false,
        error: error.message || "An error occurred",
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
  async getJobs() {
    try {
      return await this.scraperService.getJobs();
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
