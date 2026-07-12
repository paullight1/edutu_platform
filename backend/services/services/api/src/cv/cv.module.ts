import { Module } from "@nestjs/common";
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";
import { LinkedInImportService } from "./linkedin-import.service";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [CvController],
  providers: [CvService, LinkedInImportService],
  exports: [CvService],
})
export class CvModule {}
