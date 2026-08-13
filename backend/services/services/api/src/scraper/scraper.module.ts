import { Module } from "@nestjs/common";
import { ScraperController } from "./scraper.controller";
import { ScraperService } from "./scraper.service";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { RobotsChecker } from "./robots-checker";
import { AiModule } from "../ai";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { ScraperEgressController } from "./scraper-egress.controller";
import { ScraperEgressService } from "./scraper-egress.service";
import { ScraperEgressLimiter } from "./scraper-egress.limiter";
import { loadScraperEgressConfig } from "./scraper-egress.config";

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
    ScraperService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
  ],
  exports: [
    ScraperService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
  ],
})
export class ScraperModule {}
