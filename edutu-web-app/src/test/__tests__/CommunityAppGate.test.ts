import { describe, expect, it } from "vitest";
import { isCommunityProductPath } from "../../components/CommunityAppGate";

describe("CommunityAppGate route boundary", () => {
  it("owns only authenticated Community workspace and call paths", () => {
    expect(isCommunityProductPath("/app/community")).toBe(true);
    expect(isCommunityProductPath("/app/community/groups/group-1")).toBe(true);
    expect(isCommunityProductPath("/app/community/messages")).toBe(true);
    expect(isCommunityProductPath("/communities/calls/call-1")).toBe(true);
  });

  it("leaves public Community and newer product routes to the main app", () => {
    expect(isCommunityProductPath("/community")).toBe(false);
    expect(isCommunityProductPath("/opportunities")).toBe(false);
    expect(isCommunityProductPath("/marketplace")).toBe(false);
    expect(isCommunityProductPath("/dashboard")).toBe(false);
  });
});
