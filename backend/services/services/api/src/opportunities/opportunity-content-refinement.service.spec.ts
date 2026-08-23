import { buildRefinedOpportunityMetadata } from "./opportunity-content-refinement.service";
import { buildOpportunityContentUpdate } from "./opportunity-content-refinement";

describe("OpportunityContentRefinementService metadata", () => {
  it("preserves operational metadata while replacing unsafe content sections", () => {
    const original = {
      title: "Programme",
      description: "Old copy.",
      funding_type: "Free training",
      metadata: {
        classification_locked: true,
        requirements: ["Original requirement."],
        benefits: ["Original benefit."],
        application_process: ["Original step."],
      },
    };
    const candidate = {
      ...original,
      description:
        "Advertisement\nThe programme gives founders practical training. Participants receive expert guidance and peer learning. Apply now.",
      metadata: {
        ...original.metadata,
        ai_source_text_used: false,
        requirements: ["Invented first-class degree requirement."],
        benefits: ["Invented international travel."],
      },
    };
    const refinement = buildOpportunityContentUpdate(original, candidate);

    const metadata = buildRefinedOpportunityMetadata(
      original,
      candidate,
      refinement,
    );

    expect(metadata.classification_locked).toBe(true);
    expect(metadata.requirements).toEqual(["Original requirement."]);
    expect(metadata.benefits).toEqual(["Original benefit."]);
    expect(metadata.application_process).toEqual(["Original step."]);
    expect(metadata.funding_type).toBe("Free training");
    expect(metadata.content_format_version).toBe("opportunity-content-v2");
    expect(metadata.content_refinement.source_backed).toBe(false);
  });
});
