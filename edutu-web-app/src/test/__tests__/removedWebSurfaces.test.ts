import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const submitOpportunitySource = readFileSync(
  resolve(process.cwd(), "src/components/SubmitOpportunityPage.tsx"),
  "utf8",
);
const pushWorkerSource = readFileSync(
  resolve(process.cwd(), "public/push-sw.js"),
  "utf8",
);
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const upgradeSource = readFileSync(
  resolve(process.cwd(), "src/components/UpgradePage.tsx"),
  "utf8",
);

const retiredModules = [
  "src/components/GoalsPage.tsx",
  "src/components/RoadmapsPage.tsx",
  "src/components/MarketplacePage.tsx",
  "src/components/MarketplaceDetailPage.tsx",
  "src/components/MarketplaceCreatePage.tsx",
  "src/components/WalletPage.tsx",
  "src/hooks/useGoals.tsx",
  "src/hooks/useUserStats.ts",
  "src/services/marketplace.ts",
] as const;

const removedRoutes = [
  "/goals",
  "/app/goals",
  "/roadmaps",
  "/roadmaps/:id",
  "/app/roadmaps",
  "/roadmap-templates",
  "/app/roadmap-templates",
  "/marketplace",
  "/marketplace/:id",
  "/app/marketplace",
  "/app/marketplace/new",
  "/app/marketplace/:id",
  "/wallet",
  "/app/wallet",
] as const;

describe("retired web product surfaces", () => {
  it("does not register their public or workspace routes", () => {
    for (const route of removedRoutes) {
      expect(appSource).not.toContain(`path="${route}"`);
    }
  });

  it("does not link credit errors to the retired wallet", () => {
    expect(submitOpportunitySource).not.toContain('to="/app/wallet"');
  });

  it("does not use Goals as the push-notification fallback", () => {
    expect(pushWorkerSource).not.toContain('new URL("/goals"');
    expect(pushWorkerSource).toContain('new URL("/dashboard"');
  });

  it("does not load goal data globally after the Goals surface is removed", () => {
    expect(mainSource).not.toContain("GoalsProvider");
  });

  it("removes the retired web-only modules", () => {
    for (const modulePath of retiredModules) {
      expect(existsSync(resolve(process.cwd(), modulePath))).toBe(false);
    }
  });

  it("does not advertise the retired roadmap feature on the upgrade page", () => {
    expect(upgradeSource.toLowerCase()).not.toContain("roadmap");
  });
});
