import { Module } from "@nestjs/common";
import { RoadmapsService } from "./roadmaps.service";
import { RoadmapsController } from "./roadmaps.controller";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}
