import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth";
import { DocumentsService } from "./documents.service";

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  list(@CurrentUser("id") userId: string) {
    return this.documentsService.list(userId);
  }

  @Get(":id")
  get(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.documentsService.get(userId, id);
  }

  @Post(":id/export")
  export(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() body: { format?: string },
  ) {
    const format = body?.format === "docx" ? "docx" : body?.format === "pdf" ? "pdf" : null;
    if (!format) {
      throw new BadRequestException("format must be 'pdf' or 'docx'");
    }
    return this.documentsService.exportDocument(userId, id, format);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.documentsService.remove(userId, id);
  }
}
