import { describe, expect, it } from "vitest";
import {
  getWorkspaceTitleKey,
  isWorkspaceRouteActive,
} from "../../components/AppWorkspaceShell";

describe("community workspace navigation", () => {
  it("keeps the Community destination active for every nested member route", () => {
    expect(isWorkspaceRouteActive("/app/community", "/app/community")).toBe(true);
    expect(isWorkspaceRouteActive("/app/community/explore", "/app/community")).toBe(true);
    expect(isWorkspaceRouteActive("/app/community/groups/abc", "/app/community")).toBe(true);
    expect(isWorkspaceRouteActive("/app/community/dm/conversation", "/app/community")).toBe(true);
    expect(isWorkspaceRouteActive("/app/opportunities", "/app/community")).toBe(false);
  });

  it("uses the Community workspace title for nested routes", () => {
    expect(getWorkspaceTitleKey("/app/community/explore")).toBe("navigation.community");
    expect(getWorkspaceTitleKey("/app/community/groups/abc")).toBe("navigation.community");
  });
});
