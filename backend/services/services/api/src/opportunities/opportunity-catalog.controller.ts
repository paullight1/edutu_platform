import { Controller, Get, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { Public } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  OpportunityCatalogQuerySchema,
  type OpportunityCatalogQueryDto,
} from "./dto/catalog-query.dto";
import { OpportunityCatalogService } from "./opportunity-catalog.service";
import { stripInternalOpportunityFieldsBatch } from "./public-opportunity-projection";

@Controller("opportunities/catalog")
export class OpportunityCatalogController {
  constructor(private readonly catalog: OpportunityCatalogService) {}

  @Public()
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async list(
    @Res({ passthrough: true }) response: Response,
    @Query(new ZodValidationPipe(OpportunityCatalogQuerySchema))
    query: OpportunityCatalogQueryDto,
  ) {
    response.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120",
    );
    const page = await this.catalog.list(query);
    return {
      ...page,
      items: stripInternalOpportunityFieldsBatch(page.items),
    };
  }
}
