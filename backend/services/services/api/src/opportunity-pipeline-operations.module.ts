import { Module } from "@nestjs/common";
import { OpportunityPipelineAnalyticsController } from "./analytics/opportunity-pipeline-analytics.controller";
import {
  DatabaseOpportunityPipelineAnalyticsSource,
  OpportunityPipelineAnalyticsService,
} from "./analytics/opportunity-pipeline-analytics.service";
import { OpportunityJourneyRemindersCron } from "./notifications/opportunity-journey-reminders.cron";
import {
  DatabaseOpportunityJourneyReminderSource,
  OpportunityJourneyRemindersService,
} from "./notifications/opportunity-journey-reminders.service";

@Module({
  controllers: [OpportunityPipelineAnalyticsController],
  providers: [
    DatabaseOpportunityJourneyReminderSource,
    {
      provide: OpportunityJourneyRemindersService,
      inject: [DatabaseOpportunityJourneyReminderSource],
      useFactory: (source: DatabaseOpportunityJourneyReminderSource) =>
        new OpportunityJourneyRemindersService(source),
    },
    OpportunityJourneyRemindersCron,
    DatabaseOpportunityPipelineAnalyticsSource,
    {
      provide: OpportunityPipelineAnalyticsService,
      inject: [DatabaseOpportunityPipelineAnalyticsSource],
      useFactory: (source: DatabaseOpportunityPipelineAnalyticsSource) =>
        new OpportunityPipelineAnalyticsService(source),
    },
  ],
  exports: [OpportunityJourneyRemindersService, OpportunityPipelineAnalyticsService],
})
export class OpportunityPipelineOperationsModule {}
