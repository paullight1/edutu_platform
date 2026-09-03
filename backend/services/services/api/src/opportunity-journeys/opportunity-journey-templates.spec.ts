import {
  resolveOpportunityJourneyTemplate,
  resolveOpportunityTemplateKind,
} from "./opportunity-journey-templates";

describe("opportunity journey templates", () => {
  it.each([
    ["scholarship", "scholarship"],
    ["fully funded scholarship", "scholarship"],
    ["job", "employment"],
    ["graduate role", "employment"],
    ["internship", "employment"],
    ["fellowship", "fellowship"],
    ["leadership programme", "fellowship"],
    ["grant", "grant"],
    ["startup funding", "grant"],
    ["competition", "lightweight"],
    ["bootcamp", "lightweight"],
    ["course", "lightweight"],
    ["event", "lightweight"],
    [null, "lightweight"],
  ] as const)("maps %s to %s", (category, expected) => {
    expect(resolveOpportunityTemplateKind(category)).toBe(expected);
  });

  it.each([
    "scholarship",
    "employment",
    "fellowship",
    "grant",
    "lightweight",
  ] as const)(
    "returns an ordered %s template ending with the official application action",
    (kind) => {
      const tasks = resolveOpportunityJourneyTemplate(kind);
      expect(tasks.length).toBeGreaterThanOrEqual(4);
      expect(tasks.map((task) => task.position)).toEqual(
        tasks.map((_, index) => index),
      );
      expect(new Set(tasks.map((task) => task.position)).size).toBe(
        tasks.length,
      );
      expect(tasks.at(-1)).toMatchObject({
        taskType: "open_application",
        required: true,
      });
    },
  );

  it("keeps task wording concise and deterministic", () => {
    expect(resolveOpportunityJourneyTemplate("scholarship")).toEqual(
      resolveOpportunityJourneyTemplate("scholarship"),
    );
    expect(
      resolveOpportunityJourneyTemplate("scholarship").every(
        (task) => task.title.length <= 80,
      ),
    ).toBe(true);
  });
});
