import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser, AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OpportunitySubmissionsService } from "./opportunity-submissions.service";
import {
  SubmitOpportunitySchema,
  RespondSubmissionSchema,
  ReviewSubmissionSchema,
  type SubmitOpportunityDto,
  type RespondSubmissionDto,
  type ReviewSubmissionDto,
} from "./dto/opportunity-submission.dto";

@Controller()
export class OpportunitySubmissionsController {
  constructor(private readonly service: OpportunitySubmissionsService) {}

  // ─── User routes (authenticated) ──────────────────────────────────────────

  @Post("opportunity-submissions")
  submit(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(SubmitOpportunitySchema))
    body: SubmitOpportunityDto,
  ) {
    return this.service.submit(userId, body);
  }

  @Get("opportunity-submissions/mine")
  listMine(@CurrentUser("id") userId: string) {
    return this.service.listMine(userId);
  }

  @Get("opportunity-submissions/:id")
  getMine(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.service.getMine(userId, id);
  }

  @Patch("opportunity-submissions/:id/respond")
  respond(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RespondSubmissionSchema))
    body: RespondSubmissionDto,
  ) {
    return this.service.respond(userId, id, body);
  }

  // ─── Admin routes ─────────────────────────────────────────────────────────

  @Get("admin/opportunity-submissions")
  @UseGuards(AdminGuard)
  listForAdmin(@Query("status") status?: string) {
    return this.service.listForAdmin(status);
  }

  @Get("admin/opportunity-submissions/:id")
  @UseGuards(AdminGuard)
  getForAdmin(@Param("id") id: string) {
    return this.service.getForAdmin(id);
  }

  @Patch("admin/opportunity-submissions/:id")
  @UseGuards(AdminGuard)
  review(
    @Param("id") id: string,
    @CurrentUser("id") adminId: string,
    @Body(new ZodValidationPipe(ReviewSubmissionSchema))
    body: ReviewSubmissionDto,
  ) {
    return this.service.review(id, adminId, body);
  }
}
