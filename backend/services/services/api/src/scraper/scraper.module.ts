import { Module } from "@nestjs/common";
import { ScraperController } from "./scraper.controller";
import { ScraperService } from "./scraper.service";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { RobotsChecker } from "./robots-checker";
import { AiModule } from "../ai";
import { OpportunitiesModule } from "../opportunities/opportunities.module";

@Module({
  imports: [AiModule, OpportunitiesModule],
  controllers: [ScraperController],
  providers: [
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
