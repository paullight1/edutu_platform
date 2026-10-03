import { Module } from "@nestjs/common";
import { CvEditorService } from './cv-editor.service';
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";
import { LinkedInImportService } from "./linkedin-import.service";
import { AiModule } from "../ai";
import { MonetizationModule } from "../monetization/monetization.module";

@Module({
  imports: [AiModule, MonetizationModule],
  controllers: [CvController],
  providers: [CvEditorService, CvService, LinkedInImportService],
  exports: [CvService],
})
export class CvModule {}
