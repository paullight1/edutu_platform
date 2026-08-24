import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CommunityReportStatusSchema,
  EnforceCommunityReportSchema,
  UpdateCommunityReportSchema,
  type CommunityReportStatus,
  type EnforceCommunityReportDto,
  type UpdateCommunityReportDto,
} from "./community-safety.dto";
import { AdminCommunitySafetyService } from "./community-safety.service";

type AdminActor = {
  authId?: string;
  id?: string;
  email?: string;
};

@Controller("admin/community")
@UseGuards(AdminGuard)
export class AdminCommunitySafetyController {
  constructor(private readonly safety: AdminCommunitySafetyService) {}

  @Get("reports")
  listReports(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.safety.list(this.parseStatus(status), this.parseLimit(limit));
  }

  @Patch("reports/:id")
  updateReport(
    @CurrentUser() actor: AdminActor,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateCommunityReportSchema))
    body: UpdateCommunityReportDto,
  ) {
    return this.safety.setStatus(this.actorId(actor), id, body.status);
  }

  @Post("reports/:id/enforce")
  enforceReport(
    @CurrentUser() actor: AdminActor,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(EnforceCommunityReportSchema))
    body: EnforceCommunityReportDto,
  ) {
    return this.safety.enforce(this.actorId(actor), id, body.action);
  }

  private parseStatus(value?: string): CommunityReportStatus | "all" {
    const normalized = value?.trim().toLowerCase() || "open";
    if (normalized === "all") return "all";
    const parsed = CommunityReportStatusSchema.safeParse(normalized);
    if (!parsed.success) {
      throw new BadRequestException(
        "status must be open, reviewing, resolved, dismissed, or all.",
      );
    }
    return parsed.data;
  }

  private parseLimit(value?: string): number {
    if (!value) return 50;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException("limit must be a positive number.");
    }
    return Math.min(Math.floor(parsed), 100);
  }

  private actorId(actor: AdminActor): string {
    return actor.authId || actor.id || actor.email || "unknown-admin";
  }
}
