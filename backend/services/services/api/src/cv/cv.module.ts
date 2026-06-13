import { Module } from "@nestjs/common";
import { CvController } from "./cv.controller";
import { CvService } from "./cv.service";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [CvController],
  providers: [CvService],
})
export class CvModule {}
