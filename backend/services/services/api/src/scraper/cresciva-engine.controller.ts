import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth";
import { CrescivaEngineGuard } from "./cresciva-engine.guard";
import { getScraperRuntimeIdentity } from "./scraper-runtime-identity";
import { ScraperService } from "./scraper.service";
import { ScraperSourceAdminService } from "./scraper-source-admin.service";

type RunInput = {
  sourceId?: number;
  allSources?: boolean;
  maxPages?: number;
  incremental?: boolean;
  opportunityScope?: "grants";
};

/** Narrow service API for Cresciva; the shared secret never reaches a browser. */
@Public()
@UseGuards(CrescivaEngineGuard)
@Controller("api/integrations/cresciva/engine")
export class CrescivaEngineController {
  constructor(
    private readonly scraper: ScraperService,
    private readonly sources: ScraperSourceAdminService,
  ) {}

  @Get("status")
  async status() {
    return {
      ...(await this.scraper.getEngineStatus()),
      runtime: getScraperRuntimeIdentity(),
      integration: {
        client: "cresciva",
        opportunityScope: "grants",
        tag: "grants",
      },
    };
  }

  @Get("sources")
  sourcesList() {
    return this.sources.getSources();
  }

  @Get("stats")
  stats() {
    return this.scraper.getStats();
  }

  @Get("opportunities")
  opportunities(@Query("limit") rawLimit?: string) {
    const limit = boundedInteger(rawLimit ?? "50", 1, 200, "limit");
    return this.scraper.getScopedOpportunities("grants", limit);
  }

  @Get("runs")
  runs(@Query("limit") rawLimit?: string) {
    const limit = boundedInteger(rawLimit ?? "20", 1, 100, "limit");
    return this.scraper.getScopedJobs(limit, "grants");
  }

  @Get("runs/:id/opportunities")
  runOpportunities(@Param("id") id: string) {
    if (!id.trim() || id.length > 160)
      throw new BadRequestException("Invalid run id");
    return this.scraper.getScopedJobOpportunities(id.trim(), "grants");
  }

  @Post("runs")
  @HttpCode(202)
  @Throttle({ default: { limit: 12, ttl: 3_600_000 } })
  start(@Body() body: RunInput = {}) {
    const maxPages = boundedInteger(body.maxPages ?? 3, 1, 20, "maxPages");
    const sourceId =
      body.sourceId === undefined
        ? undefined
        : boundedInteger(body.sourceId, 1, Number.MAX_SAFE_INTEGER, "sourceId");
    if (sourceId === undefined && body.allSources === false) {
      throw new BadRequestException("Choose a source or enable allSources");
    }

    const result = this.scraper.startScraperRun({
      sourceId,
      allSources: sourceId === undefined,
      maxPages,
      incremental: body.incremental !== false,
      runType: "manual",
      opportunityScope: "grants",
    });
    return {
      success: result.started,
      status: result.started ? "running" : "not_started",
      error: result.error,
      opportunityScope: "grants",
    };
  }
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  field: string,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new BadRequestException(
      `${field} must be an integer between ${min} and ${max}`,
    );
  }
  return parsed;
}
