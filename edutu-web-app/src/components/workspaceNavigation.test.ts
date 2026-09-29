import { describe, expect, it } from "vitest";
import {
  mobileMoreWorkspaceNavItems,
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

  it("keeps the learner plan in the compact mobile navigation", () => {
    expect(mobilePrimaryWorkspaceNavItems.map((item) => item.to)).toEqual([
      "/dashboard",
      "/app/opportunities",
      "/app/my-plan",
    ]);
  });

  it("keeps the More menu focused on destinations not already in mobile tabs", () => {
    const moreRoutes = mobileMoreWorkspaceNavItems.map((item) => item.to);

    expect(moreRoutes).toContain("/app/deadlines");
    expect(moreRoutes).toContain("/app/saved");
    expect(moreRoutes).toContain("/app/applications");
    expect(moreRoutes).not.toContain("/dashboard");
    expect(moreRoutes).not.toContain("/app/opportunities");
    expect(moreRoutes).not.toContain("/app/community");
    expect(moreRoutes).not.toContain("/app/my-plan");
  });
});
