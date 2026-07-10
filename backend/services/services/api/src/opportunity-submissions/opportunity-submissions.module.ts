import { Module } from "@nestjs/common";
import { OpportunitySubmissionsController } from "./opportunity-submissions.controller";
import { OpportunitySubmissionsService } from "./opportunity-submissions.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { OpportunitiesModule } from "../opportunities/opportunities.module";

@Module({
  imports: [NotificationsModule, OpportunitiesModule],
  controllers: [OpportunitySubmissionsController],
  providers: [OpportunitySubmissionsService],
  exports: [OpportunitySubmissionsService],
})
export class OpportunitySubmissionsModule {}
