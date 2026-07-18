import { Module } from "@nestjs/common";
import { ApplicationDocumentsService } from "./application-documents.service";

@Module({
  providers: [ApplicationDocumentsService],
  exports: [ApplicationDocumentsService],
})
export class ApplicationDocumentsModule {}
