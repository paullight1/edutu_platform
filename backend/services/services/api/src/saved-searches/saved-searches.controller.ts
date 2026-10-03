import { UseGuards } from "@nestjs/common";
import { WebPaidToolsGuard } from "../monetization/web-paid-tools.guard";
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
import {
  CreateSavedSearchDtoSchema,
  UpdateSavedSearchDtoSchema,
  type CreateSavedSearchDto,
  type UpdateSavedSearchDto,
} from "./dto/saved-search.dto";
import { SavedSearchesService } from "./saved-searches.service";

@Controller(["saved-searches", "web-tools/saved-searches"])
@UseGuards(WebPaidToolsGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearchesService: SavedSearchesService) {}

  @Get()
  list(@CurrentUser("id") userId: string) {
    return this.savedSearchesService.list(userId);
  }

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body(new ZodValidationPipe(CreateSavedSearchDtoSchema))
    dto: CreateSavedSearchDto,
  ) {
    return this.savedSearchesService.create(userId, dto);
  }

  @Get(":id/matches")
  preview(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.savedSearchesService.preview(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateSavedSearchDtoSchema))
    dto: UpdateSavedSearchDto,
  ) {
    return this.savedSearchesService.update(userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.savedSearchesService.remove(userId, id);
  }
}
