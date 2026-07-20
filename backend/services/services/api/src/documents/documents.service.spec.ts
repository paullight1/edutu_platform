import { db } from "../db";
import { DocumentsService } from "./documents.service";

const mockSupabaseFrom = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  })),
}));

jest.mock("../db", () => ({
  db: {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedDb = db as unknown as {
  insert: jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

describe("DocumentsService.generateSop", () => {
  const generateJson = jest.fn();
  const aiService = { generateJson } as unknown as import("../ai").AiService;
  let service: DocumentsService;

  const insertedRow = {
    id: "doc-1",
    userId: "user_1",
    type: "sop",
    title: "Statement of Purpose",
    content: { kind: "text_doc", sections: [] },
    opportunityId: null,
    version: 1,
    history: [],
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    updatedAt: new Date("2026-07-20T00:00:00.000Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    // profiles lookup → some data; opportunities branch not exercised (no id).
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: { full_name: "Ada", major: "CS" } }),
    };
    mockSupabaseFrom.mockReturnValue(chain);

    generateJson.mockResolvedValue({
      sections: [
        { heading: "Introduction", body: "i".repeat(60) },
        { heading: "Background", body: "b".repeat(60) },
        { heading: "Goals", body: "g".repeat(60) },
      ],
    });

    mockedDb.insert.mockReturnValue({
      values: () => ({
        returning: () => ({
          execute: () => Promise.resolve([insertedRow]),
        }),
      }),
    });

    service = new DocumentsService(aiService);
  });

  it("hardens the prompt against invention when notes are present", async () => {
    await service.generateSop("user_1", { notes: "I built a solar lamp." });

    expect(generateJson).toHaveBeenCalledTimes(1);
    const prompt = generateJson.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Use ONLY the applicant's notes");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("[ask:");
  });

  it("passes the applicant's own notes into the LLM prompt", async () => {
    await service.generateSop("user_1", {
      notes: "I built a solar lamp for my village.",
    });
    const prompt = generateJson.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("solar lamp for my village");
  });
});
