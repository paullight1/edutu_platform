import {
  AI_ENRICHMENT_SCHEMA,
  OpportunitiesService,
} from "./opportunities.service";

describe("OpportunitiesService bulk AI completion", () => {
  it("uses an OpenAI-strict schema for the nested eligibility object", () => {
    expect(AI_ENRICHMENT_SCHEMA.properties.eligibility).toEqual({
      type: "object",
      properties: {
        level: { type: ["string", "null"] },
        nationality: { type: ["string", "null"] },
        field: { type: ["string", "null"] },
      },
      required: ["level", "nationality", "field"],
      additionalProperties: false,
    });
  });

  it("persists the complete AI description instead of cutting it at 500 characters", async () => {
    const longDescription = [
      "This scholarship supports ambitious international students who want to complete a rigorous degree at a participating university while developing strong academic foundations and contributing to a diverse learning community.",
      "Recipients receive structured academic support, access to experienced faculty members, and opportunities to participate in research, professional development, and cross-cultural activities throughout the programme.",
      "Applicants should prepare their academic records, identification documents, personal statement, and any programme-specific evidence requested on the official application portal before submitting the form.",
      "Selection is competitive and considers academic preparation, motivation, relevant achievements, and the applicant's ability to benefit from the chosen course of study.",
      "Candidates should review the official programme page carefully because document formats and assessment stages can vary by degree level and participating institution.",
      "Successful applicants will receive further enrolment guidance from the host institution after the final selection results are announced.",
    ].join(" ");
    const update = jest.fn((payload: Record<string, unknown>) => ({
      eq: () => ({
        select: () => ({
          single: async () => ({
            data: { id: "opp-long", ...payload },
            error: null,
          }),
        }),
      }),
    }));
    const service = new OpportunitiesService(
      { invalidateAllResponseCache: jest.fn() } as any,
      {
        generateJson: jest.fn().mockResolvedValue({
          summary:
            "A competitive international scholarship providing academic support, research access, and professional development for qualified students pursuing degree study at participating universities.",
          description: longDescription,
          organization: "Edutu Foundation",
          eligibilityCriteria: "Qualified international students may apply.",
          fundingType: "Fully funded",
          targetRegion: "International",
          deadline: "2027-03-01",
          requirements: ["Academic records", "Personal statement"],
          benefits: ["Tuition support", "Research access"],
          applicationProcess: ["Complete the official online application"],
          skills: ["Research", "Communication"],
          eligibility: { level: "Degree", nationality: "Any", field: "Any" },
          tags: ["Scholarship"],
          confidence: 0.9,
          notes: [],
        }),
      } as any,
      { ensureShareCardForOpportunity: jest.fn() } as any,
      {} as any,
      { embedOpportunity: jest.fn() } as any,
    );
    (service as any).supabase = { from: () => ({ update }) };
    service.findOneForAdmin = jest.fn().mockResolvedValue({
      id: "opp-long",
      title: "International Academic Scholarship 2027",
      summary: "Short source summary.",
      description: "Short source description.",
      status: "pending_review",
      metadata: {},
    });
    (service as any).resolveOpportunitySourceText = jest
      .fn()
      .mockResolvedValue("A sufficiently detailed source excerpt.");

    await service.enhanceOpportunity("opp-long");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ description: longDescription }),
    );
  });

  it("enhances selected opportunities sequentially and isolates row failures", async () => {
    const service = new OpportunitiesService(
      { invalidateAllResponseCache: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    let active = 0;
    let maxActive = 0;

    service.enhanceOpportunity = jest.fn(async (id: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;

      if (id === "0f4309b5-d5f2-4e1e-a732-4932730dc4b3") {
        return { success: false, error: "provider unavailable" } as any;
      }
      if (id === "0d3a64ae-31f6-4afe-9bbb-73aff87cea98") {
        throw new Error("row failed");
      }
      return { success: true } as any;
    });

    await expect(
      service.enhanceOpportunities(
        [
          "1827885d-2d96-469e-b7f4-c580dd537334",
          "0f4309b5-d5f2-4e1e-a732-4932730dc4b3",
          "0d3a64ae-31f6-4afe-9bbb-73aff87cea98",
        ],
        0,
      ),
    ).resolves.toEqual({ processed: 3, enhanced: 1, failed: 2 });
    expect(maxActive).toBe(1);
  });

  it("counts a refinement fallback with an AI error as a failed completion", async () => {
    const service = new OpportunitiesService(
      { invalidateAllResponseCache: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    service.enhanceOpportunity = jest.fn().mockResolvedValue({
      success: true,
      contentRefinement: {
        aiAttempted: true,
        aiError: "provider rate limited",
      },
    });

    await expect(service.enhanceOpportunities(["opp-1"], 0)).resolves.toEqual({
      processed: 1,
      enhanced: 0,
      failed: 1,
    });
  });

  it("serializes overlapping enhancement operations across requests", async () => {
    const service = new OpportunitiesService(
      { invalidateAllResponseCache: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | undefined;

    const first = service.runOpportunityEnhancementExclusive(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      active -= 1;
      return "first";
    });
    const second = service.runOpportunityEnhancementExclusive(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      active -= 1;
      return "second";
    });

    await Promise.resolve();
    expect(maxActive).toBe(1);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(maxActive).toBe(1);
  });
});
