import { Module, type OnModuleDestroy } from "@nestjs/common";
import { AiModule } from "../ai";
import { OpportunityEnhancementReviewController } from "../opportunities/opportunity-enhancement-review.controller";
import { OpportunityEnhancementReviewRepository } from "../opportunities/opportunity-enhancement-review.repository";
import { OpportunityEnhancementReviewService } from "../opportunities/opportunity-enhancement-review.service";
import { OpportunitySourceEvidenceService } from "../opportunities/opportunity-source-evidence.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { RobotsChecker } from "./robots-checker";
import { installSafeImageAxiosBridge } from "./safe-image-axios-bridge";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { ScraperController } from "./scraper.controller";
import { loadScraperEgressConfig } from "./scraper-egress.config";
import { ScraperEgressController } from "./scraper-egress.controller";
import { ScraperEgressLimiter } from "./scraper-egress.limiter";
import { ScraperEgressService } from "./scraper-egress.service";
import { installScraperRuntimePolicy } from "./scraper-runtime-policy";
import { ScraperService } from "./scraper.service";
import { ScraperSourceAdminService } from "./scraper-source-admin.service";

@Module({
  imports: [AiModule, OpportunitiesModule],
  controllers: [
    ScraperController,
    ScraperEgressController,
    OpportunityEnhancementReviewController,
  ],
  providers: [
    { provide: "SCRAPER_EGRESS_CONFIG", useFactory: loadScraperEgressConfig },
    {
      provide: ScraperEgressLimiter,
      useFactory: (config: ReturnType<typeof loadScraperEgressConfig>) =>
        new ScraperEgressLimiter({
          limit: config.enabled ? config.rateLimitPerMinute : 1,
        }),
      inject: ["SCRAPER_EGRESS_CONFIG"],
    },
    {
      provide: ScraperEgressService,
      useFactory: (
        config: ReturnType<typeof loadScraperEgressConfig>,
        limiter: ScraperEgressLimiter,
      ) => new ScraperEgressService(config, { limiter }),
      inject: ["SCRAPER_EGRESS_CONFIG", ScraperEgressLimiter],
    },
    {
      provide: ScraperSourceAdminService,
      useValue: ScraperSourceAdminService.fromEnvironment(),
    },
    ScraperService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
    OpportunitySourceEvidenceService,
    OpportunityEnhancementReviewRepository,
    OpportunityEnhancementReviewService,
  ],
  exports: [
    ScraperService,
    ScraperSourceAdminService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
    OpportunityEnhancementReviewService,
  ],
})
export class ScraperModule implements OnModuleDestroy {
  private readonly restoreSafeImageBridge = installSafeImageAxiosBridge();
  private readonly restoreRuntimePolicy: () => void;

  constructor(scraperService: ScraperService) {
    this.restoreRuntimePolicy = installScraperRuntimePolicy(scraperService);
  }

  onModuleDestroy(): void {
    this.restoreRuntimePolicy();
    this.restoreSafeImageBridge();
  }
}
