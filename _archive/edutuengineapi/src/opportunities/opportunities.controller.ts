import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { ApiScope } from "../auth/api-scope.decorator.js";
import { OpportunitiesService } from "./opportunities.service.js";
import { ApiKeyStore } from "../auth/api-key.store.js";
import type { ApiConsumerContext } from "../auth/current-api-consumer.decorator.js";
import { CurrentApiConsumer } from "../auth/current-api-consumer.decorator.js";

const SORT_OPTIONS = new Set([
  "updated_desc",
  "updated_asc",
  "deadline_asc",
  "deadline_desc",
]);

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseIntQuery(value: string | undefined, defaultValue: number, maxValue: number) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, 1), maxValue);
}

@Controller("v1")
export class OpportunitiesController {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly store: ApiKeyStore,
  ) {}

  @Get("opportunities")
  @ApiScope("opportunities:read")
  async listOpportunities(
    @CurrentApiConsumer() consumer: ApiConsumerContext,
    @Query() query: Record<string, string>,
  ) {
    const parsed = {
      q: query.q?.trim(),
      category: query.category?.trim(),
      country: query.country?.trim(),
      remote: parseBoolean(query.remote),
      deadline_after: query.deadline_after?.trim(),
      deadline_before: query.deadline_before?.trim(),
      difficulty: query.difficulty?.trim(),
      limit: parseIntQuery(query.limit, 20, 50),
      cursor: query.cursor?.trim(),
      sort: SORT_OPTIONS.has(query.sort || "updated_desc")
        ? (query.sort || "updated_desc")
        : "updated_desc",
    };

    return this.opportunitiesService.listOpportunities(parsed, consumer);
  }

  @Get("opportunities/sync")
  @ApiScope("opportunities:sync")
  async syncOpportunities(
    @CurrentApiConsumer() consumer: ApiConsumerContext,
    @Query() query: Record<string, string>,
  ) {
    const parsed = {
      updated_after: query.updated_after?.trim(),
      limit: parseIntQuery(query.limit, 30, 100),
      cursor: query.cursor?.trim(),
      sort: SORT_OPTIONS.has(query.sort || "updated_desc")
        ? (query.sort || "updated_desc")
        : "updated_desc",
    };

    return this.opportunitiesService.syncOpportunities(parsed, consumer);
  }

  @Get("opportunities/:id")
  @ApiScope("opportunities:read")
  async getOpportunity(
    @CurrentApiConsumer() _consumer: ApiConsumerContext,
    @Param("id") id: string,
  ) {
    const opportunity = await this.opportunitiesService.getOpportunity(id);
    if (!opportunity) throw new NotFoundException("Opportunity not found");
    return opportunity;
  }

  @Get("categories")
  @ApiScope("opportunities:read")
  async listCategories(@CurrentApiConsumer() consumer: ApiConsumerContext) {
    const categories = await this.opportunitiesService.listCategories();
    return {
      ...categories,
      object: "list",
      meta: {
        generatedAt: new Date().toISOString(),
        requestId: consumer?.requestId,
      },
    };
  }

  @Get("usage")
  @ApiScope("usage:read")
  async getUsage(@CurrentApiConsumer() consumer: ApiConsumerContext) {
    return this.opportunitiesService.getUsage(consumer, this.store);
  }
}
