import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import type { Response } from "express";
import {
  BulkImportSchema,
  CreateOpportunitySchema,
  UpdateOpportunitySchema,
  type BulkImportDto,
  type CreateOpportunityDto,
} from "./dto/create-opportunity.dto";
import {
  OpportunityPreferenceSchema,
  OpportunitySignalSchema,
  RecommendationQuerySchema,
  UserRecommendationRequestSchema,
  type OpportunityPreferenceDto,
  type OpportunitySignalDto,
  type RecommendationQueryDto,
  type UserRecommendationRequestDto,
} from "./dto/personalization.dto";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { CurrentUser, Public, AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("opportunities")
export class OpportunitiesController {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly opportunityVerificationService: OpportunityVerificationService,
  ) {}

  @Public()
  @Get()
  findAll(
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("status") status?: string,
    @Query("category") category?: string,
  ) {
    return this.opportunitiesService.findAll(limit, offset, status, category);
  }

  @Post("recommendations/query")
  @Public()
  queryRecommendations(
    @Body(new ZodValidationPipe(RecommendationQuerySchema))
    body: RecommendationQueryDto,
  ) {
    return this.opportunitiesService.queryRecommendations(body);
  }

  @Post("recommendations")
  getRecommendations(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(UserRecommendationRequestSchema))
    body: UserRecommendationRequestDto,
  ) {
    return this.opportunitiesService.getPersonalizedRecommendations(
      userId,
      body || {},
    );
  }

  @Get("preferences")
  getPreferences(@CurrentUser("id") userId: string) {
    return this.opportunitiesService.getUserOpportunityPreferences(userId);
  }

  @Patch("preferences")
  updatePreferences(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(OpportunityPreferenceSchema))
    body: OpportunityPreferenceDto,
  ) {
    return this.opportunitiesService.updateUserOpportunityPreferences(
      userId,
      body || {},
    );
  }

  @Post("signals")
  recordSignal(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(OpportunitySignalSchema))
    body: OpportunitySignalDto,
  ) {
    return this.opportunitiesService.recordUserOpportunitySignal(userId, body);
  }

  @Get("sync")
  @UseGuards(AdminGuard)
  triggerSync() {
    return this.opportunitiesService.syncOpportunities();
  }

  @Get("admin/list")
  @UseGuards(AdminGuard)
  findAdminList(
    @Query("limit") limit?: number,
    @Query("page") page?: number,
    @Query("cursor") cursor?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("sortBy") sortBy?: string,
  ) {
    return this.opportunitiesService.findAdminList({
      limit,
      page,
      cursor,
      search,
      status,
      category,
      sortBy,
    });
  }

  @Get("admin/stats")
  @UseGuards(AdminGuard)
  getAdminStats() {
    return this.opportunitiesService.getAdminStats();
  }

  @Delete("admin/purge")
  @UseGuards(AdminGuard)
  purgeAdminOpportunities(
    @Body()
    body: {
      olderThanDays?: number | null;
      missingImagesOnly?: boolean;
    } = {},
  ) {
    return this.opportunitiesService.purgeOpportunities(body);
  }

  @Post("admin/reclassify")
  @UseGuards(AdminGuard)
  reclassifyExisting(
    @Body() body: { limit?: number; dryRun?: boolean } = {},
  ) {
    return this.opportunitiesService.reclassifyExistingOpportunities(body);
  }

  @Post("admin/:id/enhance")
  @UseGuards(AdminGuard)
  async enhanceSavedOpportunity(@Param("id") id: string) {
    const result = await this.opportunitiesService.enhanceOpportunity(id);
    if (!result) {
      return { success: false, error: "Opportunity not found" };
    }
    return result;
  }

  @Post("admin/bulk-import")
  @UseGuards(AdminGuard)
  async adminBulkImport(
    @Body(new ZodValidationPipe(BulkImportSchema)) body: BulkImportDto,
  ) {
    return this.opportunitiesService.bulkImport(body.items);
  }

  @Get("admin/verification/stats")
  @UseGuards(AdminGuard)
  getVerificationStats() {
    return this.opportunityVerificationService.getStats();
  }

  @Post("admin/verification/run")
  @UseGuards(AdminGuard)
  runVerification(
    @CurrentUser("id") userId: string,
    @Body()
    body: {
      limit?: number;
      maxAgeHours?: number;
      concurrency?: number;
      dryRun?: boolean;
    },
  ) {
    return this.opportunityVerificationService.runBatch({
      ...body,
      runType: "manual",
      createdBy: userId,
    });
  }

  @Post("admin/verification/:id")
  @UseGuards(AdminGuard)
  async verifyOpportunity(
    @Param("id") id: string,
    @Body() body: { dryRun?: boolean },
  ) {
    const result = await this.opportunityVerificationService.verifyOne(
      id,
      Boolean(body?.dryRun),
    );

    if (!result) {
      return { success: false, error: "Opportunity not found" };
    }

    return { success: true, result };
  }

  @Get("apify-sync")
  @UseGuards(AdminGuard)
  async triggerApifySync(@Query("sources") sources?: string) {
    return this.opportunitiesService.syncFromApify(sources);
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.opportunitiesService.findOne(id);
  }

  @Public()
  @Post(":id/share-card")
  async ensureShareCard(@Param("id") id: string) {
    const result = await this.opportunitiesService.ensureShareCard(id);
    if (!result) {
      return { success: false, error: "Opportunity not found" };
    }
    return { success: true, ...result };
  }

  @Public()
  @Get(":id/share-pdf")
  async downloadSharePdf(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.opportunitiesService.getSharePdf(id);
      if (!result) {
        throw new NotFoundException("Opportunity not found");
      }

      response.setHeader("Content-Type", "application/pdf");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.fileName}"`,
      );
      response.setHeader("Cache-Control", "no-store");

      return new StreamableFile(result.buffer);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new ServiceUnavailableException("Share PDF unavailable");
    }
  }

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body(new ZodValidationPipe(CreateOpportunitySchema))
    createDto: CreateOpportunityDto,
  ) {
    return this.opportunitiesService.create(createDto);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateOpportunitySchema))
    updateData: Partial<CreateOpportunityDto>,
  ) {
    return this.opportunitiesService.update(id, updateData);
  }

  @Patch(":id/status")
  @UseGuards(AdminGuard)
  updateStatus(@Param("id") id: string, @Body("status") status: string) {
    if (
      !["pending", "active", "draft", "expired", "rejected"].includes(status)
    ) {
      throw new BadRequestException("Unsupported opportunity status");
    }

    return this.opportunitiesService.updateStatus(id, status);
  }

  @Post(":id/approve")
  @UseGuards(AdminGuard)
  approve(@Param("id") id: string) {
    return this.opportunitiesService.updateStatus(id, "active");
  }

  @Post(":id/reject")
  @UseGuards(AdminGuard)
  reject(@Param("id") id: string) {
    return this.opportunitiesService.updateStatus(id, "rejected");
  }

  @Post("bulk-import")
  @Public()
  async bulkImport(
    @Body(new ZodValidationPipe(BulkImportSchema)) body: BulkImportDto,
    @Headers("x-api-key") apiKeyHeader?: string,
  ) {
    const expectedApiKey = process.env.APIFY_WEBHOOK_API_KEY;
    if (!expectedApiKey) {
      throw new ServiceUnavailableException(
        "Bulk import is disabled: APIFY_WEBHOOK_API_KEY not configured",
      );
    }

    const providedApiKey = apiKeyHeader || body.apiKey;
    if (!providedApiKey || !this.safeEquals(providedApiKey, expectedApiKey)) {
      throw new UnauthorizedException("Invalid API key");
    }

    return this.opportunitiesService.bulkImport(body.items);
  }

  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  remove(@Param("id") id: string) {
    return this.opportunitiesService.remove(id);
  }
}
