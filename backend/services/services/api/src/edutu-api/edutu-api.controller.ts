import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { Public } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApiScope } from "./api-scope.decorator";
import {
  CurrentApiConsumer,
  type ApiConsumerContext,
} from "./current-api-consumer.decorator";
import type {
  ListOpportunitiesQuery,
  PartnerEventDto,
  ThirdPartyRecommendationRequest,
} from "./dto/edutu-api.dto";
import {
  ListOpportunitiesQuerySchema,
  PartnerEventSchema,
  ThirdPartyRecommendationRequestSchema,
} from "./dto/edutu-api.dto";
import { EdutuApiKeyGuard } from "./edutu-api-key.guard";
import { EdutuApiService } from "./edutu-api.service";
import { EdutuApiExceptionFilter } from "./edutu-api-exception.filter";
import { EdutuApiUsageInterceptor } from "./edutu-api-usage.interceptor";

@Public()
@UseFilters(EdutuApiExceptionFilter)
@UseGuards(EdutuApiKeyGuard)
@UseInterceptors(EdutuApiUsageInterceptor)
@Controller("v1")
export class EdutuApiController {
  constructor(private readonly edutuApiService: EdutuApiService) {}

  @Get("health")
  health(@CurrentApiConsumer() consumer: ApiConsumerContext) {
    return {
      object: "health",
      status: "ok",
      service: "edutu-api",
      consumer: {
        name: consumer.name,
        plan: consumer.plan,
      },
    };
  }

  @Get("opportunities")
  @ApiScope("opportunities:read")
  listOpportunities(
    @Query(new ZodValidationPipe(ListOpportunitiesQuerySchema))
    query: ListOpportunitiesQuery,
    @CurrentApiConsumer() consumer: ApiConsumerContext,
  ) {
    return this.edutuApiService.listOpportunities(query, consumer);
  }

  @Get("opportunities/stats")
  @ApiScope("opportunities:read")
  getOpportunityStats(@CurrentApiConsumer() consumer: ApiConsumerContext) {
    return this.edutuApiService.getOpportunityStats(consumer);
  }

  @Get("opportunities/:id")
  @ApiScope("opportunities:read")
  async getOpportunity(
    @Param("id") id: string,
    @CurrentApiConsumer() consumer: ApiConsumerContext,
  ) {
    const opportunity = await this.edutuApiService.getOpportunity(id, consumer);
    if (!opportunity) {
      throw new NotFoundException("Opportunity not found");
    }
    return opportunity;
  }

  @Post("recommendations")
  @ApiScope("recommendations:read")
  getRecommendations(
    @Body(new ZodValidationPipe(ThirdPartyRecommendationRequestSchema))
    body: ThirdPartyRecommendationRequest,
    @CurrentApiConsumer() consumer: ApiConsumerContext,
  ) {
    return this.edutuApiService.getRecommendations(body || {}, consumer);
  }

  @Post("events")
  @ApiScope("events:write")
  recordEvent(
    @Body(new ZodValidationPipe(PartnerEventSchema))
    body: PartnerEventDto,
    @CurrentApiConsumer() consumer: ApiConsumerContext,
  ) {
    return this.edutuApiService.recordPartnerEvent(body, consumer);
  }
}
