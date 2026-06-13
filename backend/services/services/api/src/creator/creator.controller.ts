import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  Query,
  ForbiddenException,
} from "@nestjs/common";
import { CreatorService } from "./creator.service";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreatorApplicationSchema,
  CreatorReviewSchema,
  MarketplaceListingSchema,
  type CreatorApplicationDto,
  type CreatorReviewDto,
  type MarketplaceListingDto,
} from "./dto/creator.dto";

@Controller()
export class CreatorController {
  constructor(private readonly creatorService: CreatorService) {}

  @Get("wallet")
  getWallet(@CurrentUser("id") userId: string) {
    return this.creatorService.getWallet(userId);
  }

  @Post("creator/apply")
  applyToBeCreator(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(CreatorApplicationSchema))
    body: CreatorApplicationDto,
  ) {
    return this.creatorService.submitApplication(userId, body);
  }

  @Get("creator/status")
  getCreatorStatus(@CurrentUser("id") userId: string) {
    return this.creatorService.getApplicationStatus(userId);
  }

  @Get("creator/dashboard")
  getDashboard(@CurrentUser("id") userId: string) {
    return this.creatorService.getCreatorDashboard(userId);
  }

  @Post("marketplace/listings")
  createListing(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(MarketplaceListingSchema))
    body: MarketplaceListingDto,
  ) {
    return this.creatorService.createListing(userId, body);
  }

  @Post("marketplace/:id/enroll")
  enroll(@CurrentUser("id") userId: string, @Param("id") listingId: string) {
    return this.creatorService.enrollInListing(userId, listingId);
  }

  @Get("admin/creator-applications")
  listApplications(
    @CurrentUser("id") adminId: string,
    @CurrentUser() user: { role?: string },
    @Query("status") status?: string,
  ) {
    const currentUserRole = (user as { role?: string } | undefined)?.role;

    if (currentUserRole !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return this.creatorService.listApplications(status);
  }

  @Patch("admin/creator-applications/:id")
  reviewApplication(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @CurrentUser() user: { role?: string },
    @Body(new ZodValidationPipe(CreatorReviewSchema))
    body: CreatorReviewDto,
  ) {
    const currentUserRole = (user as { role?: string } | undefined)?.role;

    if (currentUserRole !== "admin") {
      throw new ForbiddenException("Admin access required");
    }
    return this.creatorService.reviewApplication(
      id,
      adminId,
      body.decision,
      body.adminNote,
    );
  }
}
