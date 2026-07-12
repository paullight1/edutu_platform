import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { AiModule } from "../ai";
import { OpportunityAlertsService } from "./opportunity-alerts.service";
import { AlertsController } from "./alerts.controller";

@Module({
  imports: [NotificationsModule, OpportunitiesModule, AiModule],
  controllers: [AlertsController],
  providers: [OpportunityAlertsService],
  exports: [OpportunityAlertsService],
})
export class AlertsModule {}
