import { OpportunityJourneyCompatibilityService } from "./opportunity-journey-compatibility.service";
import { Module } from "@nestjs/common";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { OpportunitiesService } from "../opportunities/opportunities.service";
import { OpportunityHomeService } from "./opportunity-home.service";
import {
  DatabaseOpportunityIntentSource,
  OpportunityIntentService,
} from "./opportunity-intent.service";
import { OpportunityJourneyOperationsRepository } from "./opportunity-journey-operations.repository";
import { OpportunityJourneysRepository } from "./opportunity-journeys.repository";
import { OpportunityJourneysController } from "./opportunity-journeys.controller";
import { OpportunityJourneysService } from "./opportunity-journeys.service";
import { OpportunityShortlistService } from "./opportunity-shortlist.service";

@Module({
  imports: [OpportunitiesModule],
  controllers: [OpportunityJourneysController],
  providers: [
    OpportunityJourneyOperationsRepository,
    {
      provide: OpportunityJourneyCompatibilityService,
      inject: [OpportunityJourneyOperationsRepository],
      useFactory: (repository: OpportunityJourneyOperationsRepository) =>
        new OpportunityJourneyCompatibilityService(repository),
    },
    {
      provide: OpportunityJourneysRepository,
      useExisting: OpportunityJourneyOperationsRepository,
    },
    DatabaseOpportunityIntentSource,
    {
      provide: OpportunityIntentService,
      inject: [OpportunityJourneysRepository, DatabaseOpportunityIntentSource],
      useFactory: (
        repository: OpportunityJourneysRepository,
        source: DatabaseOpportunityIntentSource,
      ) => new OpportunityIntentService(repository, source),
    },
    {
      provide: OpportunityShortlistService,
      inject: [
        OpportunitiesService,
        OpportunityJourneyOperationsRepository,
        OpportunityIntentService,
      ],
      useFactory: (
        opportunitiesService: OpportunitiesService,
        repository: OpportunityJourneyOperationsRepository,
        intentService: OpportunityIntentService,
      ) =>
        new OpportunityShortlistService(
          opportunitiesService,
          repository,
          intentService,
        ),
    },
    OpportunityJourneysService,
    OpportunityHomeService,
  ],
  exports: [
    OpportunityIntentService,
    OpportunityShortlistService,
    OpportunityJourneysService,
    OpportunityHomeService,
  ],
})
export class OpportunityJourneysModule {}
