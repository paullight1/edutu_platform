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
import { Throttle } from "@nestjs/throttler";
import { timingSafeEqual } from "crypto";
import type { Response } from "express";
import {
  BulkCategorySchema,
  BulkIdsSchema,
  BulkImportSchema,
  BulkStatusSchema,
  CreateOpportunitySchema,
  UpdateOpportunitySchema,
  type BulkCategoryDto,
  type BulkIdsDto,
  type BulkImportDto,
  type BulkStatusDto,
  type CreateOpportunityDto,
} from "./dto/create-opportunity.dto";
import { normalizeCategory } from "./opportunity-categorization";
import {
  OpportunityPreferenceSchema,
  OpportunitySignalBatchSchema,
  OpportunitySignalSchema,
  RecommendationQuerySchema,
  UserRecommendationRequestSchema,
  type OpportunityPreferenceDto,
  type OpportunitySignalBatchDto,
  type OpportunitySignalDto,
  type RecommendationQueryDto,
  type UserRecommendationRequestDto,
} from "./dto/personalization.dto";
import {
  SearchOpportunitiesSchema,
  type SearchOpportunitiesDto,
} from "./dto/search-opportunities.dto";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { CurrentUser, Public, AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { stripInternalOpportunityFieldsBatch } from "./public-opportunity-projection";

// Caps for the anonymous/learner public feed. The paid API (/v1) is uncapped
// and returns the full normalized DTO; this surface only powers browse UI.
const PUBLIC_FEED_MAX_LIMIT = 60;
// Deep enough for the whole catalog to stay browsable as it grows (offset cap
// + one page ~= 2100 rows) while still bounding anonymous harvesting depth.
const PUBLIC_FEED_MAX_OFFSET = 2040;

@Controller("opportunities")
export class OpportunitiesController {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly opportunityVerificationService: OpportunityVerificationService,
    private readonly opportunityEmbeddingService: OpportunityEmbeddingService,
  ) {}

  @Public()
  // The browse UI walks this feed page-by-page (each page is hard-capped at
  // PUBLIC_FEED_MAX_LIMIT rows), so a single full-catalog load fans out into
  // ~10-15 requests. Keep the ceiling high enough for one paginated load plus
  // a background revalidation, while still bounding scraping.
  @Throttle({ default: { limit: 80, ttl: 60000 } })
  @Get()
  async findAll(
    @Res({ passthrough: true }) response: Response,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("category") category?: string,
  ) {
    // The catalog is near-static (changes on admin writes + the daily sync).
    // Let browsers/CDN absorb repeat reads; Express adds a matching ETag and
    // answers If-None-Match with 304 automatically.
    response.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300",
    );
    // Public learner feed: active records only, capped page size and depth,
    // and internal/paid-trust fields stripped so the catalog can't be
    // harvested for free at parity with the paid API.
    const cappedLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      PUBLIC_FEED_MAX_LIMIT,
    );
    const cappedOffset = Math.min(
      Math.max(Number(offset) || 0, 0),
      PUBLIC_FEED_MAX_OFFSET,
    );

    const rows = await this.opportunitiesService.findAll(
      cappedLimit,
      cappedOffset,
      "active",
      category,
    );
    return stripInternalOpportunityFieldsBatch(rows);
  }

  @Public()
  // Hybrid search (FTS + trigram + optional semantic leg, RRF-fused) with a
  // graceful ILIKE fallback until the search migration lands. Declared before
  // @Get(":id") so "search" is never captured as an id.
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("search")
  async search(
    @Query(new ZodValidationPipe(SearchOpportunitiesSchema))
    query: SearchOpportunitiesDto,
  ) {
    const rows = await this.opportunitiesService.hybridSearch(
      query.q,
      { category: query.category },
      Math.min(query.limit ?? 20, PUBLIC_FEED_MAX_LIMIT),
      Math.min(query.offset ?? 0, PUBLIC_FEED_MAX_OFFSET),
    );
    return stripInternalOpportunityFieldsBatch(rows);
  }

  @Post("recommendations/query")
  @Public()
  // Anonymous + does a candidate scan per call, so keep it tight. The LLM
  // re-rank is not reachable here (service gates it behind an authenticated
  // userId), so this endpoint can never drive provider spend.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @Post("match-scores")
  // Batch scoring for client badge hydration: same pipeline as the feed,
  // applied to specific ids (browse page, detail deep links). Capped at 50.
  getMatchScores(
    @CurrentUser("id") userId: string,
    @Body() body: { opportunityIds?: string[] },
  ) {
    const ids = Array.isArray(body?.opportunityIds)
      ? body.opportunityIds.filter((id) => typeof id === "string").slice(0, 50)
      : [];
    return this.opportunitiesService.scoreOpportunitiesForUser(userId, ids);
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

  @Post("signals/batch")
  // Impression beacons: one request per feed render, not per card.
  recordSignalBatch(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(OpportunitySignalBatchSchema))
    body: OpportunitySignalBatchDto,
  ) {
    return this.opportunitiesService.recordUserOpportunitySignals(
      userId,
      body.signals,
    );
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
  reclassifyExisting(@Body() body: { limit?: number; dryRun?: boolean } = {}) {
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

  @Post("admin/bulk-status")
  @UseGuards(AdminGuard)
  adminBulkStatus(
    @Body(new ZodValidationPipe(BulkStatusSchema)) body: BulkStatusDto,
  ) {
    const normalized = this.normalizeAdminStatus(body.status);
    return this.opportunitiesService.bulkUpdateStatus(body.ids, normalized);
  }

  @Post("admin/bulk-category")
  @UseGuards(AdminGuard)
  adminBulkCategory(
    @Body(new ZodValidationPipe(BulkCategorySchema)) body: BulkCategoryDto,
  ) {
    const canonical = normalizeCategory(body.category);
    if (!canonical || canonical === "other") {
      throw new BadRequestException("Unsupported opportunity category");
    }
    return this.opportunitiesService.bulkUpdateCategory(body.ids, canonical);
  }

  @Post("admin/bulk-delete")
  @UseGuards(AdminGuard)
  adminBulkDelete(
    @Body(new ZodValidationPipe(BulkIdsSchema)) body: BulkIdsDto,
  ) {
    return this.opportunitiesService.bulkRemove(body.ids);
  }

  // Canonical vocabulary (matches admin UI + DB queries keyed on
  // pending_review/closed); legacy spellings are normalized, not rejected.
  private normalizeAdminStatus(status: string): string {
    const legacyStatusMap: Record<string, string> = {
      pending: "pending_review",
      expired: "closed",
    };
    const normalized = legacyStatusMap[status] ?? status;

    if (
      !["pending_review", "active", "draft", "closed", "rejected"].includes(
        normalized,
      )
    ) {
      throw new BadRequestException("Unsupported opportunity status");
    }
    return normalized;
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

  @Post("admin/embeddings/backfill")
  @UseGuards(AdminGuard)
  adminEmbeddingsBackfill(
    @Body() body: { limit?: number; reembed?: boolean },
  ) {
    return this.opportunityEmbeddingService.backfillOpportunityEmbeddings(
      body ?? {},
    );
  }

  @Post("admin/enrichment/backfill")
  @UseGuards(AdminGuard)
  adminEnrichmentBackfill(@Body() body: { limit?: number }) {
    return this.opportunitiesService.backfillEnrichment(body ?? {});
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
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=300",
    );
    const row = await this.opportunitiesService.findOne(id);
    return (
      stripInternalOpportunityFieldsBatch(
        (row ? [row] : []) as Record<string, unknown>[],
      )[0] ?? null
    );
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
    return this.opportunitiesService.updateStatus(
      id,
      this.normalizeAdminStatus(status),
    );
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
