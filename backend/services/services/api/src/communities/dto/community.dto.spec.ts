import {
  GroupFormSchema,
  GroupQuestionSchema,
  SendMessageSchema,
  SendCommentSchema,
  PinMessageSchema,
  ReportSchema,
} from "./community.dto";

function issueMessages(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues.map((i) => i.message) ?? [];
}

describe("GroupQuestionSchema", () => {
  it("accepts a valid short_text question", () => {
    const result = GroupQuestionSchema.safeParse({
      id: "q1",
      type: "short_text",
      label: "What is your goal?",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid long_text question", () => {
    const result = GroupQuestionSchema.safeParse({
      id: "q1",
      type: "long_text",
      label: "Tell us about yourself",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid single_select question with 2 options", () => {
    const result = GroupQuestionSchema.safeParse({
      id: "q1",
      type: "single_select",
      label: "Pick one",
      options: ["Yes", "No"],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "single_select") {
      // TS narrowing check: options is string[], not string[] | undefined.
      expect(result.data.options.length).toBe(2);
    }
  });

  describe("single_select option count", () => {
    it("rejects 0 options", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "single_select",
        label: "Pick one",
        options: [],
      });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(
        "single_select needs at least 2 options",
      );
    });

    it("rejects 1 option", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "single_select",
        label: "Pick one",
        options: ["Only one"],
      });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(
        "single_select needs at least 2 options",
      );
    });

    it("accepts 2 options", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "single_select",
        label: "Pick one",
        options: ["A", "B"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects 7 options", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "single_select",
        label: "Pick one",
        options: ["A", "B", "C", "D", "E", "F", "G"],
      });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(
        "single_select allows at most 6 options",
      );
    });

    it("accepts 6 options", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "single_select",
        label: "Pick one",
        options: ["A", "B", "C", "D", "E", "F"],
      });
      expect(result.success).toBe(true);
    });
  });

  it("rejects short_text carrying options", () => {
    const result = GroupQuestionSchema.safeParse({
      id: "q1",
      type: "short_text",
      label: "What is your goal?",
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "options is only allowed for single_select questions",
    );
  });

  it("rejects long_text carrying options", () => {
    const result = GroupQuestionSchema.safeParse({
      id: "q1",
      type: "long_text",
      label: "Tell us about yourself",
      options: ["A", "B"],
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "options is only allowed for single_select questions",
    );
  });

  describe("label bound (<=60 chars)", () => {
    it("accepts a 60-char label", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "short_text",
        label: "a".repeat(60),
      });
      expect(result.success).toBe(true);
    });

    it("rejects a 61-char label", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "q1",
        type: "short_text",
        label: "a".repeat(61),
      });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(
        "Question label must be 60 characters or fewer",
      );
    });
  });

  describe("id bound (<=40 chars)", () => {
    it("accepts a 40-char id", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "a".repeat(40),
        type: "short_text",
        label: "Label",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a 41-char id", () => {
      const result = GroupQuestionSchema.safeParse({
        id: "a".repeat(41),
        type: "short_text",
        label: "Label",
      });
      expect(result.success).toBe(false);
      expect(issueMessages(result)).toContain(
        "Question id must be 40 characters or fewer",
      );
    });
  });
});

describe("GroupFormSchema", () => {
  const question = (id: string) => ({
    id,
    type: "short_text" as const,
    label: `Question ${id}`,
  });

  it("accepts a form with 5 questions", () => {
    const result = GroupFormSchema.safeParse({
      questions: ["q1", "q2", "q3", "q4", "q5"].map(question),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a form with 6 questions", () => {
    const result = GroupFormSchema.safeParse({
      questions: ["q1", "q2", "q3", "q4", "q5", "q6"].map(question),
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "A form allows at most 5 questions",
    );
  });
});

// Sanity check that the unrelated schemas' existing limits weren't touched
// while editing this file.
describe("unrelated schema limits are unchanged", () => {
  it("SendMessageSchema.body rejects over 2000 chars", () => {
    const result = SendMessageSchema.safeParse({ body: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("ReportSchema.reason rejects over 280 chars", () => {
    const result = ReportSchema.safeParse({
      targetType: "message",
      targetId: "00000000-0000-0000-0000-000000000000",
      reason: "a".repeat(281),
    });
    expect(result.success).toBe(false);
  });
});

describe("SendMessageSchema opportunity posts", () => {
  const opportunityId = "11111111-1111-4111-8111-111111111111";

  it("accepts a one-click opportunity post without invented body copy", () => {
    expect(
      SendMessageSchema.parse({ kind: "opportunity", opportunityId }),
    ).toEqual({ kind: "opportunity", opportunityId });
  });

  it("allows a short optional member note", () => {
    expect(
      SendMessageSchema.parse({
        kind: "opportunity",
        opportunityId,
        body: "  Applications close soon.  ",
      }),
    ).toEqual({
      kind: "opportunity",
      opportunityId,
      body: "Applications close soon.",
    });
  });

  it("requires the id on opportunity posts and rejects ids on plain text", () => {
    expect(SendMessageSchema.safeParse({ kind: "opportunity" }).success).toBe(
      false,
    );
    expect(
      SendMessageSchema.safeParse({
        kind: "text",
        body: "Look at this",
        opportunityId,
      }).success,
    ).toBe(false);
  });
});

describe("community post engagement schemas", () => {
  it("accepts a trimmed one-level text comment and rejects extra fields", () => {
    expect(SendCommentSchema.parse({ body: "  Helpful answer  " })).toEqual({
      body: "Helpful answer",
    });
    expect(
      SendCommentSchema.safeParse({
        body: "Helpful answer",
        parentMessageId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(false);
  });

  it("rejects blank and overlong comments", () => {
    expect(SendCommentSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(
      SendCommentSchema.safeParse({ body: "a".repeat(2001) }).success,
    ).toBe(false);
  });

  it("accepts only an explicit boolean pin state", () => {
    expect(PinMessageSchema.parse({ pinned: true })).toEqual({ pinned: true });
    expect(PinMessageSchema.safeParse({ pinned: "true" }).success).toBe(false);
  });
});
