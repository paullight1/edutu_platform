import { CoachToolsService } from "./coach-tools.service";
import type { CoachToolContext } from "./coach-tool.types";

// The win-coach tools' argument validation and registration are what we assert
// here; their DB/AI paths are covered by the service specs they delegate to.
function makeService(): CoachToolsService {
  const noop = {} as never;
  return new CoachToolsService(
    noop, // rankingService
    noop, // profileService
    noop, // goalsService
    noop, // roadmapsService
    noop, // monetizationService
    noop, // documentsService
    noop, // cvService
    noop, // shareCardService
    noop, // applicationDocs
    noop, // uploads
    noop, // aiService
  );
}

const ctx = { userId: "user_1" } as unknown as CoachToolContext;

describe("win-coach tools", () => {
  const service = makeService();

  it("registers all six win-coach tools", () => {
    const names = service.getDefinitions().map((tool) => tool.name);
    for (const name of [
      "list_applications",
      "get_application_status",
      "read_document",
      "link_document_to_application",
      "mark_submitted",
      "analyze_fit",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("mark_submitted rejects a non-uuid application_id", async () => {
    const out = await service.execute(
      "mark_submitted",
      JSON.stringify({ application_id: "nope", role: "cv" }),
      ctx,
    );
    expect(out).toContain("Invalid arguments");
  });

  it("read_document rejects passing both ids at once", async () => {
    const out = await service.execute(
      "read_document",
      JSON.stringify({
        upload_id: "11111111-1111-1111-1111-111111111111",
        document_id: "22222222-2222-2222-2222-222222222222",
      }),
      ctx,
    );
    expect(out).toContain("Invalid arguments");
  });

  it("analyze_fit is described in terms of fit", () => {
    const def = service
      .getDefinitions()
      .find((tool) => tool.name === "analyze_fit");
    expect(def?.description.toLowerCase()).toContain("fit");
  });
});

/**
 * A fit verdict that ignores the calendar produces a to-do list, not a plan:
 * "retake IELTS, secure two referees" reads identically whether the user has
 * three weeks or three days. The runway has to reach the model.
 */
describe("analyze_fit is deadline-aware", () => {
  const OPPORTUNITY_ID = "33333333-3333-4333-8333-333333333333";

  function makeFitService(deadline: string | null) {
    const generateJson = jest.fn().mockResolvedValue({ verdict: "ok" });
    const noop = {} as never;
    const service = new CoachToolsService(
      noop,
      noop,
      noop,
      noop,
      {
        meter: async () => ({ ledgerId: "l1" }),
        refund: async () => undefined,
      } as never,
      noop,
      noop,
      noop,
      noop,
      noop,
      { generateJson } as never,
    );

    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { title: "Some Fellowship", deadline },
            }),
          }),
          in: async () => ({ data: [{ user_id: "user_1", country: "NG" }] }),
        }),
      }),
    };

    return { service, generateJson, supabase };
  }

  async function promptFor(deadline: string | null) {
    const { service, generateJson, supabase } = makeFitService(deadline);
    await service.execute(
      "analyze_fit",
      JSON.stringify({ opportunity_id: OPPORTUNITY_ID }),
      { userId: "user_1", supabase } as unknown as CoachToolContext,
    );
    return generateJson.mock.calls[0][0].prompt as string;
  }

  it("tells the model how many days are left for an open deadline", async () => {
    const inTenDays = new Date(
      Date.now() + 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const prompt = await promptFor(inTenDays);
    expect(prompt).toMatch(/DEADLINE: (9|10|11) day\(s\) away/);
    expect(prompt).toContain("soonest-first");
  });

  it("says so plainly when the deadline has already passed", async () => {
    const longGone = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const prompt = await promptFor(longGone);
    expect(prompt).toContain("CLOSED");
  });

  it("treats a missing deadline as evergreen rather than inventing one", async () => {
    const prompt = await promptFor(null);
    expect(prompt).toContain("none published");
  });
});

/**
 * offer_roadmap is a pure signal — the model's language-independent way of
 * saying "this turn is about a plan" before anything is created. It replaces
 * the app's English-only regex, so it must be registered, free of side effects,
 * and callable with no arguments at all.
 */
describe("offer_roadmap signal tool", () => {
  const service = makeService();

  it("is registered", () => {
    expect(service.getDefinitions().map((tool) => tool.name)).toContain(
      "offer_roadmap",
    );
  });

  it("succeeds with no arguments and touches nothing", async () => {
    // Every collaborator is a `never` stub: if the tool called into one of
    // them this would throw, so a clean result proves it has no side effects.
    const out = await service.execute("offer_roadmap", "", ctx);
    expect(JSON.parse(out)).toMatchObject({ ok: true });
  });
});
