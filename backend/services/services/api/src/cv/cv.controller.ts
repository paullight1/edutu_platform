import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { AiMetered } from "../monetization/ai-metered.decorator";
import { CvService } from "./cv.service";
import type { GenerateCVDraftDto, TailorCVDto } from "./dto/cv-ai.dto";
import type { SaveCVRecordDto } from "./dto/cv-record.dto";
import type { ExportUploadFile } from "./linkedin-import.service";

const createMemoryStorage =
  memoryStorage as unknown as () => import("multer").StorageEngine;

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
  @AiMetered("cvAi")
  generateDraft(
    @CurrentUser("id") userId: string,
    @Body() dto: GenerateCVDraftDto,
  ) {
    return this.cvService.generateDraft(userId, dto || {});
  }

  @Post("ai/tailor")
  @AiMetered("cvAi")
  tailor(@CurrentUser("id") userId: string, @Body() dto: TailorCVDto) {
    return this.cvService.tailor(userId, dto);
  }

  /**
   * First-party LinkedIn import: the user uploads their own export — either the
   * profile "Save to PDF" or the "Get a copy of your data" ZIP. Parsed entirely
   * on our side (no scraping vendor). Returns the parsed profile + mapped CV.
   */
  @Post("ai/import-linkedin-file")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: createMemoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  importLinkedInFile(
    @CurrentUser("id") userId: string,
    @UploadedFile() file?: ExportUploadFile,
  ) {
    return this.cvService.importLinkedInFile(userId, file);
  }
}
