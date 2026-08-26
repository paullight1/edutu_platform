import { describe, expect, it } from "vitest";
import {
  mobilePrimaryWorkspaceNavItems,
  personalWorkspaceNavItems,
} from "./workspaceNavigation";

describe("workspace navigation", () => {
  it("keeps planning surfaces directly discoverable", () => {
    const routes = personalWorkspaceNavItems.map((item) => item.to);

    expect(routes).toContain("/app/goals");
    expect(routes).toContain("/app/roadmaps");
    expect(routes.indexOf("/app/goals")).toBeLessThan(routes.indexOf("/app/settings"));
    expect(routes.indexOf("/app/roadmaps")).toBeLessThan(routes.indexOf("/app/settings"));
  });

  it("keeps dates off the compact mobile navigation", () => {
    expect(mobilePrimaryWorkspaceNavItems.map((item) => item.to)).toEqual([
      "/dashboard",
      "/app/opportunities",
      "/app/community",
    ]);
  });
});
