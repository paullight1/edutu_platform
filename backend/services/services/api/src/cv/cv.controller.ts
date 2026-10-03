import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { CurrentUser } from "../auth/current-user.decorator";
import { AiMetered } from "../monetization/ai-metered.decorator";
import { WebPaidToolsGuard } from "../monetization/web-paid-tools.guard";
import { CvEditorService, type EditorInput } from "./cv-editor.service";
import { CvService } from "./cv.service";
import type {
  GenerateCVDraftDto,
  GenerateCoverLetterDto,
  TailorCVDto,
} from "./dto/cv-ai.dto";
import type { SaveCVRecordDto } from "./dto/cv-record.dto";
import type { ExportUploadFile } from "./linkedin-import.service";

const createMemoryStorage =
  memoryStorage as unknown as () => import("multer").StorageEngine;

@Controller(["cv", "web-tools/cv"])
@UseGuards(WebPaidToolsGuard)
export class CvController {
  constructor(
    private readonly cvService: CvService,
    private readonly editor: CvEditorService,
  ) {}

  @Get("editor")
  listEditor(@CurrentUser("authId") authId: string) {
    return this.editor.list(authId);
  }
  @Post("editor")
  createEditor(
    @CurrentUser("authId") authId: string,
    @CurrentUser("id") userId: string,
    @Body() input: EditorInput,
  ) {
    return this.editor.create(authId, input, userId);
  }
  @Get("editor/:id")
  getEditor(@CurrentUser("authId") authId: string, @Param("id") id: string) {
    return this.editor.get(authId, id);
  }
  @Patch("editor/:id")
  updateEditor(
    @CurrentUser("authId") authId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() input: EditorInput,
  ) {
    return this.editor.update(authId, id, input, userId);
  }
  @Delete("editor/:id")
  deleteEditor(@CurrentUser("authId") authId: string, @Param("id") id: string) {
    return this.editor.remove(authId, id);
  }

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
   * 5-paragraph, <400-word cover letter in a human tone, grounded in the CV
   * and the opportunity record. Same metering as the other CV AI endpoints.
   */
  @Post("ai/cover-letter")
  @AiMetered("cvAi")
  coverLetter(
    @CurrentUser("authId") userId: string,
    @Body() dto: GenerateCoverLetterDto,
  ) {
    return this.cvService.generateCoverLetter(userId, dto);
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
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  importLinkedInFile(
    @CurrentUser("id") userId: string,
    @UploadedFile() file?: ExportUploadFile,
  ) {
    return this.cvService.importLinkedInFile(userId, file);
  }
}
