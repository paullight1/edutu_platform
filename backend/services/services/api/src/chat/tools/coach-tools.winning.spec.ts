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
