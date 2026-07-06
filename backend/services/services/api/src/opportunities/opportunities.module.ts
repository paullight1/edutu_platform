import { Module } from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { AiModule } from "../ai";

@Module({
  imports: [AiModule],
  controllers: [OpportunitiesController],
  providers: [
    OpportunitiesService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityEmbeddingService,
  ],
  exports: [
    OpportunitiesService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityEmbeddingService,
  ],
})
export class OpportunitiesModule {}
