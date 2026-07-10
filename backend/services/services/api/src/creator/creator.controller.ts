import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CreatorService } from "./creator.service";
import { CurrentUser, AdminGuard } from "../auth";
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

  // Admin gate mirrors every other admin endpoint: AdminGuard grants access via
  // the ADMIN_EMAILS allowlist OR an admin/moderator role. The prior manual
  // `role === "admin"` check ignored ADMIN_EMAILS, so email-allowlisted admins
  // were wrongly rejected here ("Admin access required") while every other
  // admin page worked.
  @Get("admin/creator-applications")
  @UseGuards(AdminGuard)
  listApplications(@Query("status") status?: string) {
    return this.creatorService.listApplications(status);
  }

  @Patch("admin/creator-applications/:id")
  @UseGuards(AdminGuard)
  reviewApplication(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body(new ZodValidationPipe(CreatorReviewSchema))
    body: CreatorReviewDto,
  ) {
    return this.creatorService.reviewApplication(
      id,
      adminId,
      body.decision,
      body.adminNote,
    );
  }
}
