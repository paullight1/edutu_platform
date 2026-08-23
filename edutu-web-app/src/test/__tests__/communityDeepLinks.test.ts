import { describe, expect, it } from "vitest";
import { resolveCommunityWebDeepLink } from "../../features/community/deepLinks";

describe("resolveCommunityWebDeepLink", () => {
  it.each([
    ["/discussions", "/app/community/groups"],
    ["/discussions/", "/app/community/groups"],
    ["/discussions/explore", "/app/community/explore"],
    ["/discussions/chats", "/app/community/chats"],
    [
      "/discussions/dm/11111111-1111-4111-8111-111111111111",
      "/app/community/dm/11111111-1111-4111-8111-111111111111",
    ],
    [
      "/discussions/22222222-2222-4222-8222-222222222222",
      "/app/community/groups/22222222-2222-4222-8222-222222222222",
    ],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveCommunityWebDeepLink(input)).toBe(expected);
  });

  it("rejects unknown and unsafe paths instead of guessing", () => {
    expect(resolveCommunityWebDeepLink("/discussions/dm")) .toBeNull();
    expect(resolveCommunityWebDeepLink("/discussions/a/b")) .toBeNull();
    expect(resolveCommunityWebDeepLink("/community")) .toBeNull();
  });
});
