import { buildRefinedOpportunityMetadata } from "./opportunity-content-refinement.service";
import { OpportunityContentRefinementService } from "./opportunity-content-refinement.service";
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

  it("refines a pending-review opportunity through the admin record reader", async () => {
    const pending = {
      id: "pending-1",
      title: "Founder Growth Programme",
      status: "pending_review",
      summary:
        "This practical programme helps business owners improve operations, profitability and long-term growth through structured training, expert guidance and collaborative peer learning.",
      description:
        "The programme supports business owners with practical training. Participants learn how to improve operations and profitability.\n\nThey receive expert guidance and build useful peer networks. The programme supports sustainable growth over time.",
      metadata: {
        requirements: ["Applicants must own or manage a business."],
        benefits: ["Expert-led business training."],
        application_process: ["Complete the official application form."],
      },
    };
    const opportunitiesService = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneForAdmin: jest.fn().mockResolvedValue(pending),
      invalidateCatalogCache: jest.fn(),
    };
    const service = new OpportunityContentRefinementService(
      opportunitiesService as any,
      {} as any,
      {} as any,
    );

    await expect(service.refineOpportunity(pending.id)).resolves.toMatchObject({
      success: true,
      opportunity: {
        id: pending.id,
        status: "pending_review",
      },
    });
  });
});
