import { describe, expect, it } from "@jest/globals";
import {
  ShareEnrichmentSchema,
  missingShareFields,
  shareEnrichSourceHash,
  buildShareEnrichPrompt,
  mergeShareEnrichment,
} from "./opportunity-share-enrich";

const thin = {
  id: "opp-1",
  title: "Moroccan Government Scholarship Programme 2026-27",
  summary: "A funded chance to pursue higher studies in Morocco.",
  description: "Full scholarship covering tuition and a monthly stipend.",
  organization: "Government of Morocco",
  close_date: "2026-07-22",
  metadata: {},
};

describe("opportunity share enrichment", () => {
  it("reports benefits + eligibility as missing on a thin opportunity", () => {
    expect(missingShareFields(thin).sort()).toEqual([
      "benefits",
      "eligibility",
    ]);
  });

  it("reports nothing missing when data is already present", () => {
    const rich = {
      ...thin,
      metadata: {
        benefits: ["Full tuition"],
        eligibility: ["Open to international students"],
      },
    };
    expect(missingShareFields(rich)).toEqual([]);
  });

  it("hashes only the grounding inputs (stable across unrelated fields)", () => {
    const a = shareEnrichSourceHash(thin);
    const b = shareEnrichSourceHash({
      ...thin,
      metadata: { share_card: { url: "x" } },
    });
    expect(a).toBe(b);
    const c = shareEnrichSourceHash({ ...thin, title: "Different" });
    expect(c).not.toBe(a);
  });

  it("builds a grounded prompt that names only the missing fields", () => {
    const prompt = buildShareEnrichPrompt(thin, ["benefits", "eligibility"]);
    expect(prompt).toContain(
      "Moroccan Government Scholarship Programme 2026-27",
    );
    expect(prompt).toContain("benefits");
    expect(prompt).toContain("eligibility");
    expect(prompt.toLowerCase()).toContain("do not invent");
    expect(prompt.toLowerCase()).not.toContain("summary: (none)");
  });

  it("validates and coerces AI output, dropping blanks", () => {
    const parsed = ShareEnrichmentSchema.parse({
      benefits: ["  Full tuition  ", "", "Monthly stipend"],
      eligibility: ["International students"],
      extra: "ignored",
    });
    expect(parsed.benefits).toEqual(["Full tuition", "Monthly stipend"]);
    expect(parsed.eligibility).toEqual(["International students"]);
  });

  it("merges only the missing fields and never overwrites real data", () => {
    const opp = {
      ...thin,
      metadata: { benefits: ["Existing benefit"] }, // benefits present, eligibility missing
    };
    const { metadataPatch, filled } = mergeShareEnrichment(
      opp,
      { benefits: ["AI benefit"], eligibility: ["AI eligibility"] },
      "hash123",
      "deepseek-chat",
    );
    expect(filled).toEqual(["eligibility"]);
    expect(metadataPatch?.benefits).toEqual(["Existing benefit"]); // untouched
    expect(metadataPatch?.eligibility).toEqual(["AI eligibility"]);
    expect(metadataPatch?.ai_enriched).toMatchObject({
      sourceHash: "hash123",
      model: "deepseek-chat",
      fields: ["eligibility"],
    });
  });

  it("returns a patch that still records the attempt when nothing was groundable", () => {
    const opp = { ...thin, metadata: { benefits: ["b"], eligibility: ["e"] } };
    const { metadataPatch, filled } = mergeShareEnrichment(
      opp,
      { benefits: [], eligibility: [] },
      "hash123",
      "deepseek-chat",
    );
    expect(filled).toEqual([]);
    // Nothing to fill, but the attempt hash is still recorded so we don't retry forever.
    expect(metadataPatch?.ai_enriched?.sourceHash).toBe("hash123");
  });
});
