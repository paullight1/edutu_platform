import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ApplicationHistoryService } from "./application-history.service";
import {
  AddApplicationReflectionSchema,
  type AddApplicationReflectionDto,
} from "./dto/application-history.dto";
import {
  CreateApplicationSchema,
  SaveBookmarkSchema,
  UpdateApplicationSchema,
  type CreateApplicationDto,
  type SaveBookmarkDto,
  type UpdateApplicationDto,
  ApplicationEventSchema,
  type ApplicationEventDto,
} from "./dto/me.dto";
import { MeService } from "./me.service";
import { ApplicationListService } from "./application-list.service";
import {
  ApplicationListQuerySchema,
  type ApplicationListQuery,
} from "./dto/application-list.dto";

@Controller("me")
export class MeController {
  constructor(
    private readonly meService: MeService,
    private readonly applicationHistory: ApplicationHistoryService,
    private readonly applicationList: ApplicationListService,
  ) {}

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
  listApplications(@CurrentUser("authId") userId: string) {
    return this.meService.listApplications(userId);
  }

  @Post("applications")
  createApplication(
    @CurrentUser("authId") userId: string,
    @Body(new ZodValidationPipe(CreateApplicationSchema))
    body: CreateApplicationDto,
  ) {
    return this.meService.createApplication(userId, body);
  }

  @Get("applications/page")
  listApplicationPage(
    @CurrentUser("authId") userId: string,
    @Query(new ZodValidationPipe(ApplicationListQuerySchema))
    query: ApplicationListQuery,
  ) {
    return this.applicationList.page(userId, query);
  }

  @Get("applications/opportunity-ids")
  async applicationOpportunityIds(@CurrentUser("authId") userId: string) {
    return {
      opportunityIds: await this.applicationList.opportunityIds(userId),
    };
  }

  @Get("applications/:id/history")
  listApplicationHistory(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
  ) {
    return this.applicationHistory.list(userId, applicationId);
  }

  @Get("applications/:id")
  getApplication(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
  ) {
    return this.meService.getApplication(userId, applicationId);
  }

  @Post("applications/:id/events")
  recordApplicationEvent(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
    @Body(new ZodValidationPipe(ApplicationEventSchema))
    body: ApplicationEventDto,
  ) {
    return this.meService.recordApplicationEvent(userId, applicationId, body);
  }

  @Post("applications/:id/reflections")
  addApplicationReflection(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
    @Body(new ZodValidationPipe(AddApplicationReflectionSchema))
    body: AddApplicationReflectionDto,
  ) {
    return this.applicationHistory.addReflection(
      userId,
      applicationId,
      body.reflection,
    );
  }

  @Patch("applications/:id")
  updateApplication(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
    @Body(new ZodValidationPipe(UpdateApplicationSchema))
    body: UpdateApplicationDto,
  ) {
    return this.meService.updateApplication(userId, applicationId, body);
  }

  @Delete("applications/:id")
  deleteApplication(
    @CurrentUser("authId") userId: string,
    @Param("id", new ParseUUIDPipe({ version: "4" })) applicationId: string,
  ) {
    return this.meService.deleteApplication(userId, applicationId);
  }

  @Get("deadlines")
  listDeadlines(@CurrentUser("authId") userId: string) {
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
