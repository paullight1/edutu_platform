import {
  buildOpportunityMetadataPatch,
  mergeOpportunityMetadata,
} from "./opportunity-metadata-merge";

const existingMetadata = {
  requirements: ["Existing verified requirement"],
  benefits: ["Existing verified benefit"],
  application_process: ["Existing application step"],
  application_fee: {
    is_free: true,
    amount: null,
    currency: null,
  },
  content_refinement: {
    version: "opportunity-content-v2",
    source_backed: true,
    paragraphCount: 3,
  },
  ai_enrichment: {
    attempted: true,
    source_text_used: true,
  },
  unrelated_key: {
    nested: "preserve me",
  },
};

describe("opportunity metadata patching", () => {
  it("omits absent structured fields from a partial edit", () => {
    const patch = buildOpportunityMetadataPatch({
      title: "Updated title only",
      summary: "A deliberately updated summary.",
    });

    expect(patch).toEqual({
      summary: "A deliberately updated summary.",
    });
    expect(patch).not.toHaveProperty("requirements");
    expect(patch).not.toHaveProperty("benefits");
    expect(patch).not.toHaveProperty("application_process");
    expect(patch).not.toHaveProperty("eligibility");
  });

  it("deep-merges a partial patch without deleting enriched metadata", () => {
    const merged = mergeOpportunityMetadata(
      existingMetadata,
      buildOpportunityMetadataPatch({
        summary: "An administrator-approved summary.",
      }),
    );

    expect(merged).toEqual({
      ...existingMetadata,
      summary: "An administrator-approved summary.",
    });
    expect(merged.requirements).toEqual(["Existing verified requirement"]);
    expect(merged.benefits).toEqual(["Existing verified benefit"]);
    expect(merged.application_process).toEqual([
      "Existing application step",
    ]);
    expect(merged.application_fee).toEqual(existingMetadata.application_fee);
    expect(merged.content_refinement).toEqual(
      existingMetadata.content_refinement,
    );
    expect(merged.unrelated_key).toEqual(existingMetadata.unrelated_key);
  });

  it("replaces only structured fields explicitly supplied by the administrator", () => {
    const merged = mergeOpportunityMetadata(
      existingMetadata,
      buildOpportunityMetadataPatch({
        requirements: [
          "  New verified requirement  ",
          "New verified requirement",
        ],
        applicationProcess: ["Complete the official form."],
      }),
    );

    expect(merged.requirements).toEqual(["New verified requirement"]);
    expect(merged.application_process).toEqual([
      "Complete the official form.",
    ]);
    expect(merged.benefits).toEqual(["Existing verified benefit"]);
    expect(merged.application_fee).toEqual(existingMetadata.application_fee);
    expect(merged.content_refinement).toEqual(
      existingMetadata.content_refinement,
    );
  });

  it("allows an explicit empty list to clear one structured section", () => {
    const patch = buildOpportunityMetadataPatch({ benefits: [] });
    const merged = mergeOpportunityMetadata(existingMetadata, patch);

    expect(patch).toEqual({ benefits: [] });
    expect(merged.benefits).toEqual([]);
    expect(merged.requirements).toEqual(["Existing verified requirement"]);
    expect(merged.application_process).toEqual([
      "Existing application step",
    ]);
  });

  it("merges nested objects while arrays remain replacement values", () => {
    const merged = mergeOpportunityMetadata(existingMetadata, {
      application_fee: { amount: 2500 },
      content_refinement: { paragraphCount: 5 },
    });

    expect(merged.application_fee).toEqual({
      is_free: true,
      amount: 2500,
      currency: null,
    });
    expect(merged.content_refinement).toEqual({
      version: "opportunity-content-v2",
      source_backed: true,
      paragraphCount: 5,
    });
  });

  it("accepts legacy aliases without duplicating metadata keys", () => {
    const patch = buildOpportunityMetadataPatch({
      eligibility_criteria: "Open to Nigerian students.",
      funding_type: "Fully funded",
      target_region: "Nigeria",
      application_process: ["Create an account", "Submit the form"],
    });

    expect(patch).toEqual({
      eligibility_criteria: "Open to Nigerian students.",
      funding_type: "Fully funded",
      target_region: "Nigeria",
      application_process: ["Create an account", "Submit the form"],
    });
  });
});
