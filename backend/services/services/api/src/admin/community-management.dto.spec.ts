import {
  AdminCreateCommunitySchema,
  RejectCommunityCreationRequestSchema,
  ReplaceTrendingCommunitiesSchema,
} from "./community-management.dto";

describe("admin community management validation", () => {
  it("requires a useful rejection reason", () => {
    expect(() =>
      RejectCommunityCreationRequestSchema.parse({ reason: "no" }),
    ).toThrow();
    expect(
      RejectCommunityCreationRequestSchema.parse({
        reason: "Please explain the audience more clearly.",
      }),
    ).toEqual({ reason: "Please explain the audience more clearly." });
  });

  it("rejects duplicate communities in an ordered Trending selection", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(() =>
      ReplaceTrendingCommunitiesSchema.parse({ groupIds: [id, id] }),
    ).toThrow();
  });

  it("defaults an admin-created community to public and open", () => {
    expect(
      AdminCreateCommunitySchema.parse({ name: "Edutu Scholars" }),
    ).toMatchObject({
      name: "Edutu Scholars",
      visibility: "public",
      joinPolicy: "open",
      coverEmoji: "💬",
    });
  });
});
