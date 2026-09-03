import { Injectable } from "@nestjs/common";
import { OpportunityIntentService } from "./opportunity-intent.service";
import { OpportunityJourneysService } from "./opportunity-journeys.service";
import { OpportunityShortlistService } from "./opportunity-shortlist.service";

export const OPPORTUNITY_HOME_LIMITS = Object.freeze({
  recommendationDefault: 3 as const,
  recommendationMaximum: 5 as const,
  primaryActiveMaximum: 1 as const,
  secondaryActiveMaximum: 2 as const,
});

@Injectable()
export class OpportunityHomeService {
  constructor(
    private readonly intentService: OpportunityIntentService,
    private readonly journeysService: OpportunityJourneysService,
    private readonly shortlistService: OpportunityShortlistService,
  ) {}

  async getHome(userId: string, requestedLimit = 3) {
    const recommendationLimit = Math.min(
      Math.max(Math.trunc(requestedLimit || 3), 1),
      OPPORTUNITY_HOME_LIMITS.recommendationMaximum,
    );

    const [intent, activePursuits, shortlist] = await Promise.all([
      this.intentService.getCurrentIntent(userId),
      this.journeysService.listJourneys(userId, "pursuing"),
      this.shortlistService.getShortlist(userId, recommendationLimit),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      intent,
      nextAction: activePursuits[0]?.nextAction ?? null,
      activePursuits: activePursuits.slice(0, 3),
      recommendations: shortlist.recommendations,
      recommendationBatchId: shortlist.batchId ?? null,
      engine: shortlist.engine ?? "unknown",
      degraded: shortlist.degraded,
      degradedReasons: shortlist.degradedReasons,
      limits: OPPORTUNITY_HOME_LIMITS,
    };
  }
}
