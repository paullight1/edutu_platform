import { Module, type OnModuleDestroy } from "@nestjs/common";
import { AiModule } from "../ai";
import { SavedSearchesModule } from "../saved-searches/saved-searches.module";
import { OgController } from "./og.controller";
import { OpportunitiesController } from "./opportunities.controller";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityCatalogController } from "./opportunity-catalog.controller";
import { OpportunityCatalogService } from "./opportunity-catalog.service";
import { OpportunityContentRefinementService } from "./opportunity-content-refinement.service";
import { installOpportunityContentRefinementPolicy } from "./opportunity-content-refinement-policy";
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
    OpportunityContentRefinementService,
  ],
  exports: [
    OpportunitiesService,
    OpportunityCatalogService,
    OpportunityRankingService,
    OpportunityVerificationService,
    OpportunityShareCardService,
    OpportunityEmbeddingService,
    OpportunityContentRefinementService,
  ],
})
export class OpportunitiesModule implements OnModuleDestroy {
  private readonly restorePolicies: Array<() => void>;

  constructor(
    rankingService: OpportunityRankingService,
    opportunitiesService: OpportunitiesService,
    contentRefinementService: OpportunityContentRefinementService,
  ) {
    this.restorePolicies = [
      installOpportunityRankingRuntimePolicy(rankingService),
      installOpportunityContentRefinementPolicy(
        opportunitiesService,
        contentRefinementService,
      ),
    ];
  }

  onModuleDestroy(): void {
    for (const restore of [...this.restorePolicies].reverse()) restore();
  }
}
