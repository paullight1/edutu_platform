import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth";
import { UploadsService } from "./uploads.service";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get()
  list(@CurrentUser("id") userId: string) {
    return this.uploadsService.list(userId);
  }

  @Post()
  createSignedUpload(
    @CurrentUser("id") userId: string,
    @Body()
    body: {
      fileName: string;
      mimeType: string;
      fileSize?: number;
      kind?: string;
      opportunityId?: string;
    },
  ) {
    return this.uploadsService.createSignedUpload(userId, body);
  }

  // Signed short-lived URL so the app can download/share the original file
  // ("My Documents"). Scoped to the caller's own uploads in the service.
  @Get(":id/download-url")
  downloadUrl(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.uploadsService.getDownloadUrl(userId, id);
  }

  // Parsing an uploaded file is cheap and can fail on a bad file, so it stays
  // free — the paid AI work is analyze_fit, which is metered in the tool layer.
  @Post(":id/ingest")
  ingest(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.uploadsService.ingest(userId, id);
  }
}
