import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  CreateApplicationSchema,
  SaveBookmarkSchema,
  UpdateApplicationSchema,
  type CreateApplicationDto,
  type SaveBookmarkDto,
  type UpdateApplicationDto,
} from "./dto/me.dto";
import { MeService } from "./me.service";

@Controller("me")
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get("opportunities/bookmarks")
  listBookmarks(@CurrentUser("id") userId: string) {
    return this.meService.listBookmarks(userId);
  }

  @Get("opportunities/:id/bookmark")
  getBookmarkStatus(
    @CurrentUser("id") userId: string,
    @Param("id") opportunityId: string,
  ) {
    return this.meService.getBookmarkStatus(userId, opportunityId);
  }

  @Post("opportunities/:id/bookmark")
  saveBookmark(
    @CurrentUser("id") userId: string,
    @Param("id") opportunityId: string,
    @Body(new ZodValidationPipe(SaveBookmarkSchema)) body: SaveBookmarkDto,
  ) {
    return this.meService.saveBookmark(userId, opportunityId, body);
  }

  @Delete("opportunities/:id/bookmark")
  removeBookmark(
    @CurrentUser("id") userId: string,
    @Param("id") opportunityId: string,
  ) {
    return this.meService.removeBookmark(userId, opportunityId);
  }

  @Get("applications")
  listApplications(@CurrentUser("id") userId: string) {
    return this.meService.listApplications(userId);
  }

  @Post("applications")
  createApplication(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(CreateApplicationSchema))
    body: CreateApplicationDto,
  ) {
    return this.meService.createApplication(userId, body);
  }

  @Patch("applications/:id")
  updateApplication(
    @CurrentUser("id") userId: string,
    @Param("id") applicationId: string,
    @Body(new ZodValidationPipe(UpdateApplicationSchema))
    body: UpdateApplicationDto,
  ) {
    return this.meService.updateApplication(userId, applicationId, body);
  }

  @Delete("applications/:id")
  deleteApplication(
    @CurrentUser("id") userId: string,
    @Param("id") applicationId: string,
  ) {
    return this.meService.deleteApplication(userId, applicationId);
  }

  @Get("deadlines")
  listDeadlines(@CurrentUser("id") userId: string) {
    return this.meService.listDeadlines(userId);
  }

  @Get("status-panel")
  getStatusPanel(
    @CurrentUser("id") userId: string,
    @CurrentUser("authId") authUserId?: string,
  ) {
    return this.meService.getStatusPanel(userId, authUserId);
  }
}
