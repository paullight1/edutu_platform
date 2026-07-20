import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CopilotService } from "./copilot.service";
import {
  EssayFeedbackDtoSchema,
  GenerateKitDtoSchema,
  GenerateOutlineDtoSchema,
  SaveEssayDraftDtoSchema,
  UpdateChecklistDtoSchema,
  type EssayFeedbackDto,
  type GenerateKitDto,
  type GenerateOutlineDto,
  type SaveEssayDraftDto,
  type UpdateChecklistDto,
} from "./dto/copilot.dto";

@Controller("copilot")
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Get("kits")
  listKits(@CurrentUser("id") userId: string) {
    return this.copilotService.listKits(userId);
  }

  @Get("kits/:opportunityId")
  getKit(
    @CurrentUser("id") userId: string,
    @Param("opportunityId") opportunityId: string,
  ) {
    return this.copilotService.getKit(userId, opportunityId);
  }

  // Metering for these three routes lives INSIDE the service (not @AiMetered):
  // a cached kit makes no AI call and must be free, and the heuristic fallback
  // must refund. authId (raw Clerk id) is threaded so the profile read hits the
  // canonical row instead of an empty derived-uuid orphan.
  @Post("kits/:opportunityId/generate")
  generateKit(
    @CurrentUser("id") userId: string,
    @CurrentUser("authId") authId: string,
    @Param("opportunityId") opportunityId: string,
    @Body(new ZodValidationPipe(GenerateKitDtoSchema)) dto: GenerateKitDto,
  ) {
    return this.copilotService.generateKit(
      userId,
      opportunityId,
      dto?.refresh ?? false,
      authId,
    );
  }

  @Post("kits/:opportunityId/outline")
  generateOutline(
    @CurrentUser("id") userId: string,
    @CurrentUser("authId") authId: string,
    @Param("opportunityId") opportunityId: string,
    @Body(new ZodValidationPipe(GenerateOutlineDtoSchema))
    dto: GenerateOutlineDto,
  ) {
    return this.copilotService.generateOutline(
      userId,
      opportunityId,
      dto,
      authId,
    );
  }

  @Post("kits/:opportunityId/feedback")
  essayFeedback(
    @CurrentUser("id") userId: string,
    @Param("opportunityId") opportunityId: string,
    @Body(new ZodValidationPipe(EssayFeedbackDtoSchema)) dto: EssayFeedbackDto,
  ) {
    return this.copilotService.essayFeedback(userId, opportunityId, dto);
  }

  @Patch("kits/:opportunityId/essay")
  saveEssayDraft(
    @CurrentUser("id") userId: string,
    @Param("opportunityId") opportunityId: string,
    @Body(new ZodValidationPipe(SaveEssayDraftDtoSchema))
    dto: SaveEssayDraftDto,
  ) {
    return this.copilotService.saveEssayDraft(userId, opportunityId, dto);
  }

  @Patch("kits/:opportunityId/checklist")
  updateChecklist(
    @CurrentUser("id") userId: string,
    @Param("opportunityId") opportunityId: string,
    @Body(new ZodValidationPipe(UpdateChecklistDtoSchema))
    dto: UpdateChecklistDto,
  ) {
    return this.copilotService.updateChecklist(userId, opportunityId, dto);
  }

  @Delete("kits/:opportunityId")
  deleteKit(
    @CurrentUser("id") userId: string,
    @Param("opportunityId") opportunityId: string,
  ) {
    return this.copilotService.deleteKit(userId, opportunityId);
  }
}
