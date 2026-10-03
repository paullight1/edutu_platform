import { describe, expect, it } from "vitest";
import {
  mobileMoreWorkspaceNavItems,
  mobilePrimaryWorkspaceNavItems,
  personalWorkspaceNavItems,
  getWorkspaceArea,
} from "./workspaceNavigation";

describe("workspace navigation", () => {
  it("restores requested workspace features while keeping retired products hidden", () => {
    const routes = personalWorkspaceNavItems.map((item) => item.to);

    expect(routes).toContain("/app/goals");
    expect(routes).not.toContain("/app/roadmaps");
    expect(routes).not.toContain("/app/marketplace");
    expect(routes).toContain("/app/wallet");
  });

  it("keeps the learner plan in the compact mobile navigation", () => {
    expect(mobilePrimaryWorkspaceNavItems.map((item) => item.to)).toEqual([
      "/dashboard",
      "/app/opportunities",
      "/app/coach",
      "/app/my-plan",
      "/app/profile",
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
    expect(moreRoutes).not.toContain("/app/coach");
    expect(moreRoutes).not.toContain("/app/profile");
  });
  it.each([
    ["/app/cv", "myPlan"],
    ["/app/cv/123", "myPlan"],
    ["/app/documents", "myPlan"],
    ["/app/copilot/123", "myPlan"],
    ["/app/goals", "myPlan"],
    ["/app/saved-searches", "opportunities"],
    ["/app/wallet", "profile"],
    ["/app/coach", "coach"],
  ])("keeps %s in the correct navigation area", (path, area) => {
    expect(getWorkspaceArea(path)).toBe(area);
  });
});
