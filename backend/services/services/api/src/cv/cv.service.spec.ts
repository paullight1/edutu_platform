import { ATS_CHECKLIST_IDS, CvService } from "./cv.service";
import type { AiService } from "../ai";
import type { LinkedInImportService } from "./linkedin-import.service";
import { db } from "../db";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({})),
}));

jest.mock("../db", () => ({
  db: { select: jest.fn() },
}));

const OPPORTUNITY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function mockOpportunityRow(row: Record<string, unknown> | null) {
  (db.select as jest.Mock).mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => ({
          execute: async () => (row ? [row] : []),
        }),
      }),
    }),
  });
}

function createService(generateJson: jest.Mock) {
  const aiService = { generateJson } as unknown as AiService;
  const linkedIn = {
    isProfileUrl: () => false,
  } as unknown as LinkedInImportService;
  return new CvService(aiService, linkedIn);
}

const baseCV = {
  header: { full_name: "Amara Okafor", email: "amara@example.com" },
  summary: "Data analyst focused on public health.",
  experience: [
    {
      id: "exp-1",
      company: "HealthCo",
      role: "Analyst",
      description: "Cleaned and validated national health records",
      highlights: ["Built dashboards for the ministry team"],
    },
  ],
  skills: ["SQL", "Python"],
};

const jobOpportunity = {
  id: OPPORTUNITY_ID,
  title: "Data Governance Analyst",
  organization: "Acme Health",
  category: "jobs",
  description: "Data Governance & Quality. SQL required.",
  skills: ["SQL", "Data Governance"],
};

describe("CvService.tailor", () => {
  it("normalizes the checklist to exactly the 10 canonical items and keeps existing fields", async () => {
    const generateJson = jest.fn().mockResolvedValue({
      tailored_cv: { summary: "Tailored" },
      match_score: 82,
      improvements: ["Wove in 'Data Governance' verbatim"],
      matched_keywords: ["SQL"],
      missing_keywords: ["Data Governance"],
      proposedTitle: "Data Governance Analyst",
      quantifyQuestions: [
        { target: "Built dashboards", question: "How many dashboards?" },
        { target: "a", question: "b" },
        { target: "c", question: "d" },
        { target: "e", question: "f" },
        { target: "overflow", question: "should be dropped" },
      ],
      atsChecklist: [
        {
          id: "verbatim_keywords",
          status: "fix",
          detail: "Add 'Data Governance' to the summary.",
          why: null,
        },
        { id: "title_match", status: "pass", detail: "Honest match.", why: "" },
        // duplicate should be ignored
        { id: "title_match", status: "fix", detail: "dupe" },
      ],
    });
    const service = createService(generateJson);

    const result = await service.tailor("user_1", {
      currentCV: baseCV,
      opportunity: jobOpportunity,
    });

    // Existing contract intact
    expect(result.match_score).toBe(82);
    expect(result.improvements).toEqual(["Wove in 'Data Governance' verbatim"]);
    expect(result.matched_keywords).toEqual(["SQL"]);
    expect(result.missing_keywords).toEqual(["Data Governance"]);
    expect(result.tailored_cv.summary).toBe("Tailored");

    // New contract
    expect(result.atsChecklist.map((item) => item.id)).toEqual([
      ...ATS_CHECKLIST_IDS,
    ]);
    const byId = new Map(result.atsChecklist.map((item) => [item.id, item]));
    expect(byId.get("title_match")?.status).toBe("pass");
    expect(byId.get("title_match")?.detail).toBe("Honest match.");
    expect(byId.get("verbatim_keywords")?.status).toBe("fix");
    // why falls back to the educational default when the model omits it
    expect(byId.get("verbatim_keywords")?.why).toMatch(/exact phrases/i);
    // items the model skipped are present as n/a with default label + why
    expect(byId.get("apply_fast")?.status).toBe("n/a");
    expect(byId.get("apply_fast")?.label).toBe("Apply fast");
    expect(byId.get("apply_fast")?.why).toMatch(/callback odds/i);
    // every item carries a label and a why
    for (const item of result.atsChecklist) {
      expect(item.label).toBeTruthy();
      expect(item.why).toBeTruthy();
    }

    expect(result.proposedTitle).toBe("Data Governance Analyst");
    expect(result.quantifyQuestions).toHaveLength(4);
  });

  it("nulls an absent proposedTitle (LLM null is stripped before Zod)", async () => {
    const generateJson = jest.fn().mockResolvedValue({
      tailored_cv: {},
      match_score: 50,
      proposedTitle: null,
    });
    const service = createService(generateJson);
    const result = await service.tailor("user_1", {
      currentCV: baseCV,
      opportunity: jobOpportunity,
    });
    expect(result.proposedTitle).toBeNull();
    expect(result.quantifyQuestions).toEqual([]);
  });

  it("falls back to a heuristic result with the full checklist when the AI fails", async () => {
    const generateJson = jest.fn().mockRejectedValue(new Error("boom"));
    const service = createService(generateJson);

    const result = await service.tailor("user_1", {
      currentCV: baseCV,
      opportunity: jobOpportunity,
    });

    expect(result.match_score).toBeGreaterThanOrEqual(0);
    expect(result.atsChecklist).toHaveLength(10);
    expect(result.atsChecklist.map((item) => item.id)).toEqual([
      ...ATS_CHECKLIST_IDS,
    ]);
    expect(result.proposedTitle).toBeNull();

    const byId = new Map(result.atsChecklist.map((item) => [item.id, item]));
    // Job opportunity → full ATS mode
    expect(byId.get("ats_format")?.status).toBe("pass");
    expect(byId.get("title_match")?.status).toBe("fix");
    // Contact details present in the base CV
    expect(byId.get("completeness")?.status).toBe("pass");
    // Both sample bullets lack numbers → quantify questions offered
    expect(byId.get("quantified_bullets")?.status).toBe("fix");
    expect(result.quantifyQuestions.length).toBeGreaterThan(0);
    expect(result.quantifyQuestions.length).toBeLessThanOrEqual(4);
    expect(result.quantifyQuestions[0].target).toContain("Cleaned");
  });

  it("softens ATS-specific items for scholarship-style opportunities", async () => {
    const generateJson = jest.fn().mockResolvedValue(null);
    const service = createService(generateJson);

    const result = await service.tailor("user_1", {
      currentCV: baseCV,
      opportunity: { ...jobOpportunity, category: "scholarships" },
    });

    // Human-reviewer prompt was requested from the LLM
    expect(generateJson.mock.calls[0][0].prompt).toContain("HUMAN REVIEWERS");
    expect(generateJson.mock.calls[0][0].feature).toBe("cv.tailor");

    const byId = new Map(result.atsChecklist.map((item) => [item.id, item]));
    expect(byId.get("title_match")?.status).toBe("n/a");
    expect(byId.get("structure_mirror")?.status).toBe("n/a");
    expect(byId.get("ats_format")?.status).toBe("n/a");
    // Keyword tailoring stays on even in human mode
    expect(byId.get("verbatim_keywords")?.status).toBeDefined();
  });
});

describe("CvService.generateCoverLetter", () => {
  const opportunityRow = {
    id: OPPORTUNITY_ID,
    title: "Data Governance Analyst",
    organization: "Acme Health",
    category: "jobs",
    canonicalCategory: "jobs",
    type: "job",
    summary: "Improve national data quality",
    description: "Own Data Governance & Quality workstreams.",
    location: "Lagos",
    deadline: null,
    fundingType: null,
    tags: [],
    skills: ["SQL"],
  };

  beforeEach(() => {
    mockOpportunityRow(opportunityRow);
  });

  it("returns the LLM cover letter through the cv.coverLetter feature", async () => {
    const generateJson = jest.fn().mockResolvedValue({
      cover_letter: "Acme Health's mission caught my eye...\n\nBest,\nAmara",
    });
    const service = createService(generateJson);

    const result = await service.generateCoverLetter("user_1", {
      opportunityId: OPPORTUNITY_ID,
      currentCV: baseCV,
    });

    expect(result).toEqual({
      coverLetter: "Acme Health's mission caught my eye...\n\nBest,\nAmara",
    });
    const options = generateJson.mock.calls[0][0];
    expect(options.feature).toBe("cv.coverLetter");
    expect(options.prompt).toContain("5 paragraphs");
    expect(options.prompt).toContain("Acme Health");
    expect(options.prompt).not.toContain("HUMAN REVIEWERS");
  });

  it("falls back to a grounded template letter when the AI fails", async () => {
    const generateJson = jest.fn().mockRejectedValue(new Error("down"));
    const service = createService(generateJson);

    const { coverLetter } = await service.generateCoverLetter("user_1", {
      opportunityId: OPPORTUNITY_ID,
      currentCV: baseCV,
    });

    expect(coverLetter).toContain("Data Governance Analyst");
    expect(coverLetter).toContain("Amara Okafor");
    // 5-paragraph structure (name sign-off joins the final paragraph)
    expect(coverLetter.split("\n\n").length).toBeGreaterThanOrEqual(5);
  });

  it("rejects when opportunityId is missing", async () => {
    const service = createService(jest.fn());
    await expect(
      service.generateCoverLetter("user_1", {
        opportunityId: "",
        currentCV: baseCV,
      }),
    ).rejects.toThrow("opportunityId is required");
  });

  it("rejects when neither currentCV nor a resolvable cvId is provided", async () => {
    const service = createService(jest.fn());
    await expect(
      service.generateCoverLetter("user_1", {
        opportunityId: OPPORTUNITY_ID,
      }),
    ).rejects.toThrow(/Provide currentCV/);
  });

  it("404s when the opportunity does not exist", async () => {
    mockOpportunityRow(null);
    const service = createService(jest.fn());
    await expect(
      service.generateCoverLetter("user_1", {
        opportunityId: OPPORTUNITY_ID,
        currentCV: baseCV,
      }),
    ).rejects.toThrow("Opportunity not found");
  });
});
