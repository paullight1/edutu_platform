import { extractAnswerBank, type AnswerBankKitRow } from "./copilot.service";

describe("extractAnswerBank", () => {
  const longDraft = "a".repeat(80);
  const shortDraft = "a".repeat(79);

  it("flattens essay entries across kits into the answer list", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "opp-1",
        opportunityTitle: "Rhodes Scholarship",
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        essays: [
          {
            promptId: "why-you",
            prompt: "Why are you a strong candidate?",
            draft: longDraft,
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      },
      {
        opportunityId: "opp-2",
        opportunityTitle: "Chevening",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
        essays: [
          {
            promptId: "leadership",
            prompt: "Describe your leadership.",
            draft: longDraft,
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        ],
      },
    ];

    const result = extractAnswerBank(rows);
    expect(result.count).toBe(2);
    expect(result.answers).toHaveLength(2);
    expect(result.answers[0]).toEqual({
      kitOpportunityId: "opp-2",
      opportunityTitle: "Chevening",
      promptId: "leadership",
      prompt: "Describe your leadership.",
      draft: longDraft,
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("excludes drafts whose trimmed length is under 80 chars", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "opp-1",
        opportunityTitle: "Rhodes",
        updatedAt: null,
        essays: [
          { promptId: "a", prompt: "A", draft: shortDraft },
          { promptId: "b", prompt: "B", draft: `   ${shortDraft}   ` }, // trims below 80
          { promptId: "c", prompt: "C", draft: longDraft },
        ],
      },
    ];

    const result = extractAnswerBank(rows);
    expect(result.count).toBe(1);
    expect(result.answers.map((a) => a.promptId)).toEqual(["c"]);
  });

  it("excludes entries with missing draft", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "opp-1",
        opportunityTitle: null,
        updatedAt: null,
        essays: [
          { promptId: "a", prompt: "A" }, // no draft
          { promptId: "b", prompt: "B", draft: longDraft },
        ],
      },
    ];

    const result = extractAnswerBank(rows);
    expect(result.count).toBe(1);
    expect(result.answers[0].promptId).toBe("b");
  });

  it("tolerates kits whose essays jsonb is null, non-array, or malformed", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "o1",
        opportunityTitle: "T1",
        updatedAt: null,
        essays: null,
      },
      {
        opportunityId: "o2",
        opportunityTitle: "T2",
        updatedAt: null,
        essays: { not: "an array" } as unknown,
      },
      {
        opportunityId: "o3",
        opportunityTitle: "T3",
        updatedAt: null,
        essays: "oops" as unknown,
      },
      {
        opportunityId: "o4",
        opportunityTitle: "T4",
        updatedAt: null,
        essays: [
          null,
          42,
          "str",
          { promptId: "keep", prompt: "P", draft: longDraft },
        ] as unknown[],
      },
    ];

    expect(() => extractAnswerBank(rows)).not.toThrow();
    const result = extractAnswerBank(rows);
    expect(result.count).toBe(1);
    expect(result.answers[0]).toMatchObject({
      kitOpportunityId: "o4",
      promptId: "keep",
    });
  });

  it("sorts by updatedAt desc with nulls last", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "opp",
        opportunityTitle: "T",
        updatedAt: null,
        essays: [
          {
            promptId: "old",
            prompt: "P",
            draft: longDraft,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          { promptId: "none", prompt: "P", draft: longDraft }, // no updatedAt anywhere -> null
          {
            promptId: "new",
            prompt: "P",
            draft: longDraft,
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      },
    ];

    const result = extractAnswerBank(rows);
    expect(result.answers.map((a) => a.promptId)).toEqual([
      "new",
      "old",
      "none",
    ]);
  });

  it("falls back to the kit row updatedAt when the essay entry has none", () => {
    const rows: AnswerBankKitRow[] = [
      {
        opportunityId: "opp",
        opportunityTitle: "T",
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        essays: [{ promptId: "a", prompt: "P", draft: longDraft }],
      },
    ];

    const result = extractAnswerBank(rows);
    expect(result.answers[0].updatedAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("returns an empty list and zero count for no kits", () => {
    expect(extractAnswerBank([])).toEqual({ answers: [], count: 0 });
  });
});
