import { Module } from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunitiesController } from "./opportunities.controller";
import { OgController } from "./og.controller";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { AiModule } from "../ai";
import { SavedSearchesModule } from "../saved-searches/saved-searches.module";

@Module({
  imports: [AiModule, SavedSearchesModule],
  controllers: [OpportunitiesController, OgController],
  providers: [
    OpportunitiesService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityShareEnrichService,
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
