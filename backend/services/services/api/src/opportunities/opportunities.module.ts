import { Module, type OnModuleDestroy } from "@nestjs/common";
import { AiModule } from "../ai";
import { SavedSearchesModule } from "../saved-searches/saved-searches.module";
import { OgController } from "./og.controller";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityCatalogController } from "./opportunity-catalog.controller";
import { OpportunityCatalogService } from "./opportunity-catalog.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityRankingService } from "./opportunity-ranking.service";
import { installOpportunityRankingRuntimePolicy } from "./opportunity-ranking-runtime-policy";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
import { OpportunityVerificationService } from "./opportunity-verification.service";

@Module({
  imports: [AiModule, SavedSearchesModule],
  controllers: [
    OpportunitiesController,
    OpportunityCatalogController,
    OgController,
  ],
  providers: [
    OpportunitiesService,
    OpportunityCatalogService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityShareEnrichService,
    OpportunityEmbeddingService,
  ],
  exports: [
    OpportunitiesService,
    OpportunityCatalogService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityEmbeddingService,
  ],
})
export class OpportunitiesModule implements OnModuleDestroy {
  private readonly restoreRankingPolicy: () => void;

  constructor(rankingService: OpportunityRankingService) {
    this.restoreRankingPolicy =
      installOpportunityRankingRuntimePolicy(rankingService);
  }

  onModuleDestroy(): void {
    this.restoreRankingPolicy();
  }
}
