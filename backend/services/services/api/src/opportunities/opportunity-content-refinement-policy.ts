import type { OpportunitiesService } from "./opportunities.service";
import type { OpportunityContentRefinementService } from "./opportunity-content-refinement.service";

type EnhanceMethod = (id: string) => Promise<any>;
type BackfillMethod = (options?: { limit?: number }) => Promise<any>;

type MutableOpportunityService = OpportunitiesService & {
  enhanceOpportunity: EnhanceMethod;
  backfillEnrichment: BackfillMethod;
};

const POLICY_MARK = Symbol.for("edutu.opportunity-content-refinement-policy");

type PolicyState = {
  restore: () => void;
};

/**
 * Keep the public/admin route contract unchanged while placing deterministic
 * copy cleanup and factual safeguards around the existing source-fetching AI
 * enhancer. The module already uses this runtime-policy pattern for ranking.
 */
export function installOpportunityContentRefinementPolicy(
  service: OpportunitiesService,
  refinementService: OpportunityContentRefinementService,
): () => void {
  const mutable = service as MutableOpportunityService & {
    [POLICY_MARK]?: PolicyState;
  };

  const currentPolicy = mutable[POLICY_MARK];
  if (currentPolicy) return currentPolicy.restore;

  const originalEnhance = mutable.enhanceOpportunity;
  const originalBackfill = mutable.backfillEnrichment;
  const boundEnhance: EnhanceMethod = originalEnhance.bind(service);
  const inFlightEnhancements = new Map<string, Promise<any>>();

  const wrappedEnhance: EnhanceMethod = async (id) => {
    const existing = inFlightEnhancements.get(id);
    if (existing) return existing;

    const running = service.runOpportunityEnhancementExclusive(() =>
      refinementService.refineOpportunity(id, {
        aiEnhance: boundEnhance,
        forceAi: true,
      }),
    );
    inFlightEnhancements.set(id, running);
    try {
      return await running;
    } finally {
      if (inFlightEnhancements.get(id) === running) {
        inFlightEnhancements.delete(id);
      }
    }
  };

  const wrappedBackfill: BackfillMethod = (options = {}) =>
    refinementService.backfill(options, {
      aiEnhance: (id) =>
        service.runOpportunityEnhancementExclusive(() => boundEnhance(id)),
    });

  mutable.enhanceOpportunity = wrappedEnhance;
  mutable.backfillEnrichment = wrappedBackfill;

  const restore = () => {
    if (mutable.enhanceOpportunity === wrappedEnhance) {
      mutable.enhanceOpportunity = originalEnhance;
    }
    if (mutable.backfillEnrichment === wrappedBackfill) {
      mutable.backfillEnrichment = originalBackfill;
    }
    inFlightEnhancements.clear();
    delete mutable[POLICY_MARK];
  };

  mutable[POLICY_MARK] = { restore };
  return restore;
}
