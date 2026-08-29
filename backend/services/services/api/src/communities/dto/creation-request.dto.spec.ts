import {
  CreateCommunityRequestSchema,
  UpdateCommunityRequestCoverSchema,
} from "./creation-request.dto";

describe("community creation request validation", () => {
  it("normalizes the same bounded proposal fields as live groups", () => {
    expect(
      CreateCommunityRequestSchema.parse({
        name: "  Scholarship Builders  ",
        description: "  Prepare strong applications together.  ",
      }),
    ).toEqual({
      name: "Scholarship Builders",
      description: "Prepare strong applications together.",
      visibility: "public",
      joinPolicy: "open",
      coverEmoji: "💬",
    });
  });

  it("rejects an unsafe or non-HTTPS cover resource", () => {
    expect(() =>
      UpdateCommunityRequestCoverSchema.parse({
        coverImageResourceUrl: "http://files.example.test/cover.png",
      }),
    ).toThrow();
  });
});
