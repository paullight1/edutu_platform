import { describe, expect, it } from "vitest";
import { isCommunityProductPath } from "../../components/CommunityAppGate";

describe("CommunityAppGate route boundary", () => {
  it("leaves authenticated Community product routes to the modern app router", () => {
    expect(isCommunityProductPath("/app/community")).toBe(false);
    expect(isCommunityProductPath("/app/community/explore")).toBe(false);
    expect(isCommunityProductPath("/app/community/groups/group-1")).toBe(false);
    expect(isCommunityProductPath("/app/community/chats")).toBe(false);
  });

  it("keeps native Community calls in the lightweight route gate", () => {
    expect(isCommunityProductPath("/communities/calls/call-1")).toBe(true);
  });

  it("leaves public Community and newer product routes to the main app", () => {
    expect(isCommunityProductPath("/community")).toBe(false);
    expect(isCommunityProductPath("/opportunities")).toBe(false);
    expect(isCommunityProductPath("/marketplace")).toBe(false);
    expect(isCommunityProductPath("/dashboard")).toBe(false);
  });
});
