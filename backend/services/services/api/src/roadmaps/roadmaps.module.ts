import { Module } from "@nestjs/common";
import { RoadmapsService } from "./roadmaps.service";
import { RoadmapsController } from "./roadmaps.controller";
import { AiModule } from "../ai";
import { GoalsModule } from "../goals/goals.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { MonetizationModule } from "../monetization/monetization.module";

@Module({
  imports: [AiModule, GoalsModule, NotificationsModule, OpportunitiesModule, MonetizationModule],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}
