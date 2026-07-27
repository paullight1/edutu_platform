import { describe, expect, it, jest } from "@jest/globals";
import { OpportunityShareEnrichService } from "./opportunity-share-enrich.service";
import { shareEnrichSourceHash } from "./opportunity-share-enrich";

function makeService(aiJson: any) {
  const aiService = { generateJson: jest.fn(async () => aiJson) } as any;
  const service = new OpportunityShareEnrichService(aiService);
  // No Supabase in unit tests → persistence is a no-op, enrichment stays in-memory.
  (service as any).supabase = null;
  return { service, aiService };
}

const thin = {
  id: "opp-1",
  title: "Moroccan Government Scholarship 2026-27",
  summary: "A funded chance to study in Morocco.",
  description: "Covers tuition and a monthly stipend for international students.",
  organization: "Government of Morocco",
  metadata: {},
};

describe("OpportunityShareEnrichService", () => {
  it("fills missing benefits + eligibility from AI output", async () => {
    const { service, aiService } = makeService({
      benefits: ["Full tuition", "Monthly stipend"],
      eligibility: ["Open to international students"],
    });
    const result = await service.ensureEnriched(thin);
    expect(aiService.generateJson).toHaveBeenCalledTimes(1);
    expect(result.metadata.benefits).toEqual(["Full tuition", "Monthly stipend"]);
    expect(result.metadata.eligibility).toEqual([
      "Open to international students",
    ]);
    expect(result.metadata.ai_enriched.fields.sort()).toEqual([
      "benefits",
      "eligibility",
    ]);
  });

  it("skips the AI call when nothing is missing", async () => {
    const rich = {
      ...thin,
      metadata: { benefits: ["b"], eligibility: ["e"] },
    };
    const { service, aiService } = makeService({});
    const result = await service.ensureEnriched(rich);
    expect(aiService.generateJson).not.toHaveBeenCalled();
    expect(result).toBe(rich);
  });

  it("skips the AI call when a matching enrichment attempt is already cached", async () => {
    const cached = {
      ...thin,
      metadata: {
        ai_enriched: {
          sourceHash: shareEnrichSourceHash(thin),
          model: "deepseek-chat",
          fields: [],
          createdAt: "2026-07-22T00:00:00.000Z",
        },
      },
    };
    const { service, aiService } = makeService({ benefits: ["x"] });
    await service.ensureEnriched(cached);
    expect(aiService.generateJson).not.toHaveBeenCalled();
  });

  it("never throws when the AI call fails", async () => {
    const aiService = {
      generateJson: jest.fn(async () => {
        throw new Error("ai down");
      }),
    } as any;
    const service = new OpportunityShareEnrichService(aiService);
    (service as any).supabase = null;
    const result = await service.ensureEnriched(thin);
    expect(result).toBe(thin); // unchanged, no throw
  });
});
