import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoadmapsService } from "./roadmaps.service";
import type {
  CreateRoadmapDto,
  UpdateRoadmapDto,
  RoadmapIntentDto,
  RoadmapFeedbackDto,
  AIAssistDto,
  AdoptRoadmapDto,
  UpdateRoadmapProgressDto,
} from "./dto/roadmap.dto";
import {
  AIAssistDtoSchema,
  AdoptRoadmapDtoSchema,
  CreateRoadmapDtoSchema,
  RoadmapFeedbackDtoSchema,
  RoadmapIntentDtoSchema,
  UpdateRoadmapDtoSchema,
  UpdateRoadmapProgressSchema,
} from "./dto/roadmap.dto";
import { CurrentUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { AdminGuard } from "../auth/admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("roadmaps")
export class RoadmapsController {
  constructor(private readonly roadmapsService: RoadmapsService) {}

  @Public()
  @Get()
  findAll(
    @Query("status") _status?: string,
    @Query("category") category?: string,
    @Query("difficulty") difficulty?: string,
    @Query("search") search?: string,
    @Query("featured") featured?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return this.roadmapsService.findAll({
      status: "published",
      category,
      difficulty,
      search,
      featured: featured === "true",
      limit,
      offset,
    });
  }

  @Public()
  @Get("slug/:slug")
  findBySlug(@Param("slug") slug: string) {
    return this.roadmapsService.findBySlug(slug);
  }

  @Public()
  @Get("templates")
  findTemplates(
    @Query("category") category?: string,
    @Query("difficulty") difficulty?: string,
    @Query("search") search?: string,
    @Query("featured") featured?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return this.roadmapsService.findTemplates({
      category,
      difficulty,
      search,
      featured: featured === "true",
      limit,
      offset,
    });
  }

  @Get("admin/list")
  @UseGuards(AdminGuard)
  findAllForAdmin(
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("difficulty") difficulty?: string,
    @Query("search") search?: string,
    @Query("featured") featured?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return this.roadmapsService.findAll({
      status,
      category,
      difficulty,
      search,
      featured: featured === "true",
      limit,
      offset,
    });
  }

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body(new ZodValidationPipe(CreateRoadmapDtoSchema))
    dto: CreateRoadmapDto,
    @CurrentUser("id") userId: string,
    @CurrentUser() user: any,
  ) {
    return this.roadmapsService.create(dto, userId, user?.firstName || "Admin");
  }

  @Post("creator")
  createByCreator(
    @Body(new ZodValidationPipe(CreateRoadmapDtoSchema))
    dto: CreateRoadmapDto,
    @CurrentUser("id") userId: string,
    @CurrentUser() user: any,
  ) {
    return this.roadmapsService.createByCreator(
      dto,
      userId,
      user?.firstName || "Edutu Creator",
    );
  }

  @Put(":id")
  @UseGuards(AdminGuard)
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateRoadmapDtoSchema))
    dto: UpdateRoadmapDto,
  ) {
    return this.roadmapsService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  remove(@Param("id") id: string) {
    return this.roadmapsService.remove(id);
  }

  @Post("adopt/:roadmapId")
  adopt(
    @Param("roadmapId") roadmapId: string,
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(AdoptRoadmapDtoSchema))
    dto: AdoptRoadmapDto,
  ) {
    return this.roadmapsService.adopt(userId, roadmapId, dto);
  }

  @Post("enroll/:roadmapId")
  enroll(
    @Param("roadmapId") roadmapId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.roadmapsService.enroll(userId, roadmapId);
  }

  @Get("my-enrollments")
  getMyEnrollments(@CurrentUser("id") userId: string) {
    return this.roadmapsService.getUserEnrollments(userId);
  }

  @Get("enrollments/:enrollmentId/calendar")
  getEnrollmentCalendar(
    @Param("enrollmentId") enrollmentId: string,
    @CurrentUser("id") userId: string,
  ) {
    return this.roadmapsService.getEnrollmentCalendar(userId, enrollmentId);
  }

  @Post("progress/:roadmapId")
  updateProgress(
    @Param("roadmapId") roadmapId: string,
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(UpdateRoadmapProgressSchema))
    body: UpdateRoadmapProgressDto,
  ) {
    return this.roadmapsService.updateProgress(
      userId,
      roadmapId,
      body.stepId,
      body.completed,
    );
  }

  @Post("intent")
  saveIntent(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(RoadmapIntentDtoSchema))
    dto: RoadmapIntentDto,
  ) {
    return this.roadmapsService.saveIntent(userId, dto);
  }

  @Get("intent")
  getIntent(@CurrentUser("id") userId: string) {
    return this.roadmapsService.getIntent(userId);
  }

  @Get("recommended")
  getRecommended(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: number,
  ) {
    return this.roadmapsService.getRecommendedRoadmaps(userId, limit);
  }

  @Post("feedback")
  submitFeedback(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(RoadmapFeedbackDtoSchema))
    dto: RoadmapFeedbackDto,
  ) {
    return this.roadmapsService.submitFeedback(userId, dto);
  }

  @Public()
  @Get("feedback/:roadmapId")
  getFeedbackSummary(@Param("roadmapId") roadmapId: string) {
    return this.roadmapsService.getFeedbackSummary(roadmapId);
  }

  @Public()
  @Post("ai/assist")
  generateAIMatch(
    @Body(new ZodValidationPipe(AIAssistDtoSchema))
    dto: AIAssistDto,
  ) {
    return this.roadmapsService.generateAIMatchQuestions(
      dto.topic,
      dto.category,
    );
  }

  @Get("stats")
  @UseGuards(AdminGuard)
  getStats() {
    return this.roadmapsService.getStats();
  }

  @Public()
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.roadmapsService.findPublishedById(id);
  }
}
