import { describe, expect, it } from "vitest";
import {
  ADMIN_REDIRECTS,
  ADMIN_ROUTES,
  ALL_ADMIN_PATHS,
  groupForPath,
  routeForPath,
} from "./route-manifest";

const EXPECTED_ROUTE_PATHS = [
  "/",
  "/app/campaigns",
  "/app/control",
  "/app/flags",
  "/app/home",
  "/app/widgets",
  "/blog",
  "/creators",
  "/engine",
  "/engine/runs",
  "/engine/status",
  "/events",
  "/impact-stories",
  "/login",
  "/marketplace",
  "/monetization",
  "/monetization/pricing",
  "/monetization/transactions",
  "/monetization/usage",
  "/notifications",
  "/opportunities",
  "/profile",
  "/reset-password",
  "/roadmaps",
  "/settings",
  "/signup",
  "/submissions",
  "/users",
] as const;

const EXPECTED_REDIRECTS = [
  { from: "/dashboard", to: "/" },
  { from: "/edutu-engine", to: "/engine" },
  { from: "/mobile-control", to: "/app/home" },
] as const;

describe("admin route manifest", () => {
  it("preserves every existing concrete route exactly once", () => {
    const paths = ADMIN_ROUTES.map((route) => route.path).sort();

    expect(paths).toEqual([...EXPECTED_ROUTE_PATHS].sort());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("preserves every compatibility redirect without adding silent rewrites", () => {
    expect(ADMIN_REDIRECTS).toEqual(EXPECTED_REDIRECTS);
  });

  it("publishes the complete concrete and redirect-source path inventory", () => {
    expect([...ALL_ADMIN_PATHS].sort()).toEqual(
      [
        ...EXPECTED_ROUTE_PATHS,
        ...EXPECTED_REDIRECTS.map((redirect) => redirect.from),
      ].sort(),
    );
    expect(new Set(ALL_ADMIN_PATHS).size).toBe(ALL_ADMIN_PATHS.length);
  });

  it("uses longest-prefix matching for nested Engine routes", () => {
    expect(routeForPath("/engine/runs")?.id).toBe("engine-runs");
    expect(routeForPath("/engine/runs/job-123")?.id).toBe("engine-runs");
    expect(routeForPath("/engine/status")?.id).toBe("engine-status");
    expect(groupForPath("/engine/status")).toBe("engine");
  });

  it("uses longest-prefix matching for monetization routes", () => {
    expect(routeForPath("/monetization/pricing")?.id).toBe(
      "monetization-pricing",
    );
    expect(routeForPath("/monetization/pricing/plans")?.id).toBe(
      "monetization-pricing",
    );
    expect(groupForPath("/monetization/usage")).toBe("money");
  });

  it("keeps root exact and returns null for unknown locations", () => {
    expect(routeForPath("/")?.id).toBe("dashboard");
    expect(routeForPath("/unknown")).toBeNull();
    expect(groupForPath("/settings")).toBeNull();
    expect(groupForPath("/login")).toBeNull();
  });
});
