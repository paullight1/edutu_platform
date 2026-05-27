import { Module } from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [OpportunitiesController],
  providers: [
    OpportunitiesService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
  ],
  exports: [
    OpportunitiesService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
  ],
})
export class OpportunitiesModule {}
