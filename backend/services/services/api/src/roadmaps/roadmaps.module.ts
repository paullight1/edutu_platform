import { Module } from "@nestjs/common";
import { RoadmapsService } from "./roadmaps.service";
import { RoadmapsController } from "./roadmaps.controller";
import { AiModule } from "../ai";
import { GoalsModule } from "../goals/goals.module";

@Module({
  imports: [AiModule, GoalsModule],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}
