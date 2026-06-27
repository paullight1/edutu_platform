import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { CvService } from "./cv.service";
import type { GenerateCVDraftDto, TailorCVDto } from "./dto/cv-ai.dto";
import type { SaveCVRecordDto } from "./dto/cv-record.dto";

@Controller("cv")
export class CvController {
  constructor(private readonly cvService: CvService) {}

  @Get()
  list(@CurrentUser("id") userId: string) {
    return this.cvService.listRecords(userId);
  }

  @Get(":id")
  get(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.cvService.getRecord(userId, id);
  }

  @Post()
  create(@CurrentUser("id") userId: string, @Body() dto: SaveCVRecordDto) {
    return this.cvService.createRecord(userId, dto || {});
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.cvService.deleteRecord(userId, id);
  }

  @Post("ai/draft")
  generateDraft(
    @CurrentUser("id") userId: string,
    @Body() dto: GenerateCVDraftDto,
  ) {
    return this.cvService.generateDraft(userId, dto || {});
  }

  @Post("ai/tailor")
  tailor(@CurrentUser("id") userId: string, @Body() dto: TailorCVDto) {
    return this.cvService.tailor(userId, dto);
  }
}
