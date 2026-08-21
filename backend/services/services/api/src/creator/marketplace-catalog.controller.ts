import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { AdminGuard, CurrentUser, Public } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  MarketplaceCatalogQuerySchema,
  MarketplaceReviewSchema,
  type MarketplaceCatalogQueryDto,
  type MarketplaceReviewDto,
} from "./dto/marketplace.dto";
import { MarketplaceCatalogService } from "./marketplace-catalog.service";

@Controller("marketplace")
export class MarketplaceCatalogController {
  constructor(private readonly marketplace: MarketplaceCatalogService) {}

  @Public()
  @Get("listings")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async listPublic(
    @Res({ passthrough: true }) response: Response,
    @Query(new ZodValidationPipe(MarketplaceCatalogQuerySchema))
    query: MarketplaceCatalogQueryDto,
  ) {
    response.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120",
    );
    return this.marketplace.listPublic(query);
  }

  @Public()
  @Get("listings/:id")
  @Throttle({ default: { limit: 90, ttl: 60000 } })
  async getPublic(
    @Res({ passthrough: true }) response: Response,
    @Param("id", new ParseUUIDPipe({ version: "4" })) listingId: string,
  ) {
    response.setHeader(
      "Cache-Control",
      "public, max-age=30, stale-while-revalidate=120",
    );
    return this.marketplace.getPublic(listingId);
  }

  @Get("enrollments")
  listMyEnrollments(@CurrentUser("id") userId: string) {
    return this.marketplace.listEnrollments(userId);
  }

  @Get("admin/listings")
  @UseGuards(AdminGuard)
  listAdmin(@Query("status") status?: string) {
    return this.marketplace.listAdmin(status);
  }

  @Patch("admin/listings/:id")
  @UseGuards(AdminGuard)
  reviewListing(
    @Param("id", new ParseUUIDPipe({ version: "4" })) listingId: string,
    @CurrentUser("id") adminId: string,
    @Body(new ZodValidationPipe(MarketplaceReviewSchema))
    review: MarketplaceReviewDto,
  ) {
    return this.marketplace.reviewListing(listingId, adminId, review);
  }
}
