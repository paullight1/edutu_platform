import { Module } from "@nestjs/common";
import { RoadmapsService } from "./roadmaps.service";
import { RoadmapsController } from "./roadmaps.controller";
import { AiModule } from "../ai";
import { GoalsModule } from "../goals/goals.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [AiModule, GoalsModule, NotificationsModule],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}
