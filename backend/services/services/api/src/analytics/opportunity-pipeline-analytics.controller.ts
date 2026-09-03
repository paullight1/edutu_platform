import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { OpportunityPipelineAnalyticsService } from "./opportunity-pipeline-analytics.service";

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({
      code: "INVALID_REPORT_DATE",
      message: `Invalid report date: ${value}`,
    });
  }
  return parsed;
}

@Controller("admin/analytics/opportunity-pipeline")
@UseGuards(AdminGuard)
export class OpportunityPipelineAnalyticsController {
  constructor(
    private readonly analytics: OpportunityPipelineAnalyticsService,
  ) {}

  @Get()
  getSummary(
    @Query("from") fromValue?: string,
    @Query("to") toValue?: string,
  ) {
    const to = parseDate(toValue, new Date());
    const defaultFrom = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const from = parseDate(fromValue, defaultFrom);
    if (from > to) {
      throw new BadRequestException({
        code: "INVALID_REPORT_RANGE",
        message: "Report start must not be after report end.",
      });
    }
    return this.analytics.getSummary({ from, to });
  }
}
