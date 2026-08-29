import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard, CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  AdminCreateCommunitySchema,
  AdminUpdateCommunitySchema,
  RejectCommunityCreationRequestSchema,
  ReplaceTrendingCommunitiesSchema,
  type AdminCreateCommunityDto,
  type AdminUpdateCommunityDto,
  type RejectCommunityCreationRequestDto,
  type ReplaceTrendingCommunitiesDto,
} from "./community-management.dto";
import {
  AdminCommunityManagementService,
  type AdminCommunityGroupFilter,
} from "./community-management.service";

type AdminActor = { authId?: string; id?: string; email?: string };
type RequestStatus = "all" | "pending" | "approved" | "rejected" | "cancelled";

@Controller("admin/community")
@UseGuards(AdminGuard)
export class AdminCommunityManagementController {
  constructor(private readonly management: AdminCommunityManagementService) {}

  @Get("groups")
  listGroups(
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("visibility") visibility?: string,
    @Query("scope") scope?: string,
    @Query("trending") trending?: string,
    @Query("limit") limit?: string,
  ) {
    const filter: AdminCommunityGroupFilter = {
      query: query?.trim() || undefined,
      status: this.groupStatus(status),
      visibility: this.visibility(visibility),
      scope: this.scope(scope),
      trending: this.boolean(trending),
      limit: this.limit(limit),
    };
    return this.management.listGroups(filter);
  }

  @Post("groups")
  createGroup(
    @CurrentUser() actor: AdminActor,
    @Body(new ZodValidationPipe(AdminCreateCommunitySchema))
    body: AdminCreateCommunityDto,
  ) {
    return this.management.create(this.actorId(actor), body);
  }

  @Patch("groups/:id")
  updateGroup(
    @CurrentUser() actor: AdminActor,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdminUpdateCommunitySchema))
    body: AdminUpdateCommunityDto,
  ) {
    return this.management.update(this.actorId(actor), id, body);
  }

  @Post("groups/:id/archive")
  archiveGroup(@CurrentUser() actor: AdminActor, @Param("id") id: string) {
    return this.management.archive(this.actorId(actor), id);
  }

  @Post("groups/:id/restore")
  restoreGroup(@CurrentUser() actor: AdminActor, @Param("id") id: string) {
    return this.management.restore(this.actorId(actor), id);
  }

  @Get("creation-requests")
  listCreationRequests(
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.management.listRequests(
      this.requestStatus(status),
      this.limit(limit) ?? 100,
    );
  }

  @Post("creation-requests/:id/approve")
  approveCreationRequest(
    @CurrentUser() actor: AdminActor,
    @Param("id") id: string,
  ) {
    return this.management.approve(this.actorId(actor), id);
  }

  @Post("creation-requests/:id/reject")
  rejectCreationRequest(
    @CurrentUser() actor: AdminActor,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectCommunityCreationRequestSchema))
    body: RejectCommunityCreationRequestDto,
  ) {
    return this.management.reject(this.actorId(actor), id, body.reason);
  }

  @Get("trending")
  listTrending() {
    return this.management.listTrending();
  }

  @Put("trending")
  replaceTrending(
    @CurrentUser() actor: AdminActor,
    @Body(new ZodValidationPipe(ReplaceTrendingCommunitiesSchema))
    body: ReplaceTrendingCommunitiesDto,
  ) {
    return this.management.replaceTrending(this.actorId(actor), body.groupIds);
  }

  private actorId(actor: AdminActor): string {
    return actor.authId || actor.id || actor.email || "unknown-admin";
  }

  private groupStatus(
    value?: string,
  ): "all" | "active" | "archived" | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return "all";
    if (
      normalized === "all" ||
      normalized === "active" ||
      normalized === "archived"
    ) {
      return normalized;
    }
    throw new BadRequestException("status must be all, active, or archived.");
  }

  private visibility(value?: string): "all" | "public" | "private" | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return "all";
    if (
      normalized === "all" ||
      normalized === "public" ||
      normalized === "private"
    ) {
      return normalized;
    }
    throw new BadRequestException(
      "visibility must be all, public, or private.",
    );
  }

  private scope(value?: string): "all" | "member" | "platform" | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return "all";
    if (
      normalized === "all" ||
      normalized === "member" ||
      normalized === "platform"
    ) {
      return normalized;
    }
    throw new BadRequestException("scope must be all, member, or platform.");
  }

  private requestStatus(value?: string): RequestStatus {
    const normalized = value?.trim().toLowerCase() || "pending";
    if (
      normalized === "all" ||
      normalized === "pending" ||
      normalized === "approved" ||
      normalized === "rejected" ||
      normalized === "cancelled"
    ) {
      return normalized;
    }
    throw new BadRequestException(
      "status must be pending, approved, rejected, cancelled, or all.",
    );
  }

  private boolean(value?: string): boolean | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
    throw new BadRequestException("trending must be true or false.");
  }

  private limit(value?: string): number | undefined {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException("limit must be a positive number.");
    }
    return Math.min(Math.floor(parsed), 200);
  }
}
