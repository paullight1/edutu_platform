import { CoachToolsService } from "./coach-tools.service";
import type { CoachToolContext } from "./coach-tool.types";

describe("CoachToolsService draft_sop — interview-first", () => {
  const meter = jest.fn();
  const refund = jest.fn();
  const generateSop = jest.fn();
  const list = jest.fn();

  let service: CoachToolsService;
  let ctx: CoachToolContext;
  let collectDocuments: jest.Mock;

  const stub = {} as never;

  beforeEach(() => {
    jest.resetAllMocks();
    meter.mockResolvedValue({ id: "charge-1" });
    list.mockResolvedValue([]);

    const monetizationService = { meter, refund } as never;
    const documentsService = { generateSop, list } as never;

    service = new CoachToolsService(
      stub, // rankingService
      stub, // profileService
      stub, // goalsService
      stub, // roadmapsService
      monetizationService,
      documentsService,
      stub, // cvService
      stub, // shareCardService
    );

    collectDocuments = jest.fn();
    ctx = {
      userId: "user_1",
      supabase: stub,
      collectOpportunities: jest.fn(),
      collectDeviceActions: jest.fn(),
      collectActionButtons: jest.fn(),
      collectDocuments,
      collectImages: jest.fn(),
    };
  });

  it("with empty notes and no prior SOP → returns the interview ask, never touches the ghostwriter", async () => {
    const raw = await service.execute("draft_sop", JSON.stringify({}), ctx);
    const result = JSON.parse(raw);

    expect(result.action_required).toBe("interview_first");
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions).toHaveLength(4);

    // No draft, no charge, no LLM call.
    expect(generateSop).not.toHaveBeenCalled();
    expect(meter).not.toHaveBeenCalled();
    expect(collectDocuments).not.toHaveBeenCalled();
  });

  it("names the four micro-interview questions concretely", async () => {
    const raw = await service.execute("draft_sop", JSON.stringify({}), ctx);
    const questions = (JSON.parse(raw).questions as string[]).join(" \n ");

    expect(questions).toMatch(/moment|sparked|started/i);
    expect(questions).toMatch(/hardest/i);
    expect(questions).toMatch(/this program|this opportunity|specifically/i);
    expect(questions).toMatch(/do with it|goal|impact/i);
  });

  it("with notes present → drafts (LLM path runs) and returns the document", async () => {
    generateSop.mockResolvedValue({
      id: "doc-9",
      type: "sop",
      title: "SOP",
      version: 1,
    });

    const raw = await service.execute(
      "draft_sop",
      JSON.stringify({
        notes: "I built a solar lamp for my village after a blackout.",
      }),
      ctx,
    );
    const result = JSON.parse(raw);

    expect(meter).toHaveBeenCalledWith("user_1", "cvAi");
    expect(generateSop).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        notes: expect.stringContaining("solar lamp"),
      }),
    );
    expect(result.document_id).toBe("doc-9");
    expect(collectDocuments).toHaveBeenCalledTimes(1);
  });

  it("with empty notes but an existing SOP to build from → drafts instead of re-interviewing", async () => {
    list.mockResolvedValue([{ type: "sop", opportunityId: null }]);
    generateSop.mockResolvedValue({
      id: "doc-10",
      type: "sop",
      title: "SOP",
      version: 2,
    });

    const raw = await service.execute("draft_sop", JSON.stringify({}), ctx);
    const result = JSON.parse(raw);

    expect(generateSop).toHaveBeenCalledTimes(1);
    expect(result.document_id).toBe("doc-10");
  });
});
