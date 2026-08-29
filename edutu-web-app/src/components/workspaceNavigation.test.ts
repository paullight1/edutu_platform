import { describe, expect, it } from "vitest";
import {
  mobilePrimaryWorkspaceNavItems,
  personalWorkspaceNavItems,
} from "./workspaceNavigation";

describe("workspace navigation", () => {
  it("does not expose retired product surfaces", () => {
    const routes = personalWorkspaceNavItems.map((item) => item.to);

    expect(routes).not.toContain("/app/goals");
    expect(routes).not.toContain("/app/roadmaps");
    expect(routes).not.toContain("/app/marketplace");
    expect(routes).not.toContain("/app/wallet");
  });

  it("keeps dates off the compact mobile navigation", () => {
    expect(mobilePrimaryWorkspaceNavItems.map((item) => item.to)).toEqual([
      "/dashboard",
      "/app/opportunities",
      "/app/community",
    ]);
  });
});
