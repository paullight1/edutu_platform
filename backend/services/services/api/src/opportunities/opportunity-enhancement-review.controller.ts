import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ApplyOpportunityEnhancementSchema,
  type ApplyOpportunityEnhancementDto,
} from "./opportunity-enhancement-review.dto";
import { OpportunityEnhancementReviewService } from "./opportunity-enhancement-review.service";

@Controller("opportunities/admin")
@UseGuards(AdminGuard)
export class OpportunityEnhancementReviewController {
  constructor(
    private readonly reviewService: OpportunityEnhancementReviewService,
  ) {}

  @Post(":id/enhance-preview")
  createPreview(@Param("id") id: string) {
    return this.reviewService.createPreview(id);
  }

  @Post(":id/apply-enhancement")
  applyPreview(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApplyOpportunityEnhancementSchema))
    body: ApplyOpportunityEnhancementDto,
  ) {
    return this.reviewService.applyPreview(id, body);
  }
}
