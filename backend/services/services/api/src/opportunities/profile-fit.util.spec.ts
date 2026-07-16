import {
  matchEducationLevel,
  matchedGoals,
  mergePreferencePatch,
} from "./profile-fit.util";

describe("matchEducationLevel", () => {
  it("matches an undergraduate degree against bachelor-level text", () => {
    expect(
      matchEducationLevel(
        "Undergraduate",
        "open to bachelor students in their final year",
      ),
    ).toBe("undergraduate");
  });

  it("does not treat 'undergraduate' text as a graduate-level hit", () => {
    expect(
      matchEducationLevel("Masters", "scholarship for undergraduate students"),
    ).toBeNull();
  });

  it("matches masters/postgraduate degrees against graduate-level text", () => {
    expect(
      matchEducationLevel(
        "MSc Economics",
        "fully funded masters program in europe",
      ),
    ).toBe("graduate");
    expect(
      matchEducationLevel("Postgraduate", "open to postgraduate applicants"),
    ).toBe("graduate");
  });

  it("matches doctoral degrees", () => {
    expect(
      matchEducationLevel("PhD candidate", "phd fellowship with stipend"),
    ).toBe("doctoral");
  });

  it("returns null when the degree is missing or the text has no level", () => {
    expect(matchEducationLevel(null, "bachelor scholarship")).toBeNull();
    expect(matchEducationLevel("", "bachelor scholarship")).toBeNull();
    expect(
      matchEducationLevel("Undergraduate", "grant for community projects"),
    ).toBeNull();
  });
});

describe("matchedGoals", () => {
  const goalList = [
    { title: "Win a scholarship", description: null },
    { title: "Get an internship", description: null },
    { title: "Study abroad", description: "preferably in canada" },
  ];

  it("matches goals whose significant terms appear in the text", () => {
    const hits = matchedGoals(
      goalList,
      "fully funded scholarship for african students to study in canada",
    );
    expect(hits.map((goal) => goal.title)).toEqual([
      "Win a scholarship",
      "Study abroad",
    ]);
  });

  it("ignores stopwords and short connectives", () => {
    // "with", "your", "a" alone must not create a match.
    expect(
      matchedGoals(
        [{ title: "Win a goal with your team" }],
        "program with support for your community",
      ),
    ).toEqual([]);
  });

  it("handles null/empty goal lists", () => {
    expect(matchedGoals(null, "scholarship")).toEqual([]);
    expect(matchedGoals([], "scholarship")).toEqual([]);
  });
});

describe("mergePreferencePatch", () => {
  it("keeps stored fields the patch does not mention", () => {
    const merged = mergePreferencePatch(
      {
        preferredCategories: ["Jobs"],
        excludedCategories: ["Events"],
        remoteOnly: true,
      },
      { preferredCategories: ["Scholarships"] },
    );
    expect(merged).toEqual({
      preferredCategories: ["Scholarships"],
      excludedCategories: ["Events"],
      remoteOnly: true,
    });
  });

  it("lets an explicit null clear a nullable field", () => {
    const merged = mergePreferencePatch(
      { maxDeadlineDays: 30 },
      { maxDeadlineDays: null },
    );
    expect(merged.maxDeadlineDays).toBeNull();
  });

  it("works with no stored row", () => {
    expect(
      mergePreferencePatch(null, { preferredRegions: ["Canada"] }),
    ).toEqual({ preferredRegions: ["Canada"] });
  });
});
