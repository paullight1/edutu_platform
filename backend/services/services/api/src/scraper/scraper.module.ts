import { Module } from "@nestjs/common";
import { AiModule } from "../ai";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { RobotsChecker } from "./robots-checker";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { ScraperController } from "./scraper.controller";
import { loadScraperEgressConfig } from "./scraper-egress.config";
import { ScraperEgressController } from "./scraper-egress.controller";
import { ScraperEgressLimiter } from "./scraper-egress.limiter";
import { ScraperEgressService } from "./scraper-egress.service";
import { ScraperService } from "./scraper.service";
import { ScraperSourceAdminService } from "./scraper-source-admin.service";

@Module({
  imports: [AiModule, OpportunitiesModule],
  controllers: [ScraperController, ScraperEgressController],
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
  ],
  exports: [
    ScraperService,
    ScraperSourceAdminService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
  ],
})
export class ScraperModule {}
