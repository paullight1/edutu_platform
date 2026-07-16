import { Module } from "@nestjs/common";
import { OpportunitySubmissionsController } from "./opportunity-submissions.controller";
import { OpportunitySubmissionsService } from "./opportunity-submissions.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { SettingsModule } from "../settings/settings.module";

// MonetizationService (submission fee) comes from the global MonetizationModule.
@Module({
  imports: [NotificationsModule, OpportunitiesModule, SettingsModule],
  controllers: [OpportunitySubmissionsController],
  providers: [OpportunitySubmissionsService],
  exports: [OpportunitySubmissionsService],
})
export class OpportunitySubmissionsModule {}
