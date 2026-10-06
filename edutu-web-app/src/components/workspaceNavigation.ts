import {
  isWorkspaceFeatureEnabled,
  type WorkspaceFeature,
} from "../features/workspace/release";
export type WorkspaceNavIconKey =
  | "home"
  | "opportunities"
  | "myPlan"
  | "deadlines"
  | "saved"
  | "applications"
  | "profile"
  | "settings"
  | "coach"
  | "cv"
  | "documents"
  | "alerts"
  | "goals"
  | "copilot"
  | "wallet";
export interface WorkspaceNavItemConfig {
  to: string;
  label: string;
  mobileLabel?: string;
  icon: WorkspaceNavIconKey;
  exact?: boolean;
}
const enabled = (item: { to: string }) =>
  isWorkspaceFeatureEnabled(item.to.split("/").pop() as WorkspaceFeature);
export const mobilePrimaryWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/dashboard", label: "navigation.home", icon: "home", exact: true },
  {
    to: "/app/opportunities",
    label: "navigation.explore",
    icon: "opportunities",
  },
  {
    to: "/app/coach",
    label: "navigation.coach",
    mobileLabel: "navigation.coachShort",
    icon: "coach",
  },
].filter(enabled) as WorkspaceNavItemConfig[];
export function isMobilePrimaryWorkspaceRoute(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return mobilePrimaryWorkspaceNavItems.some((item) => {
    if (item.icon === "coach") return false;
    const aliases =
      item.to === "/dashboard"
        ? ["/dashboard", "/app/home"]
        : item.to === "/app/opportunities"
          ? ["/app/opportunities", "/opportunities"]
          : item.to === "/app/coach"
            ? ["/app/coach", "/chat"]
            : [item.to];
    return aliases.includes(path);
  });
}
export const primaryWorkspaceNavItems = mobilePrimaryWorkspaceNavItems.filter(
  (item) => item.icon !== "profile",
);
export const planWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/app/cv", label: "navigation.cv", icon: "cv" },
  { to: "/app/documents", label: "navigation.documents", icon: "documents" },
  { to: "/app/goals", label: "navigation.goals", icon: "goals" },
  {
    to: "/app/applications",
    label: "navigation.applications",
    icon: "applications",
  },
  { to: "/app/deadlines", label: "navigation.deadlines", icon: "deadlines" },
].filter(enabled) as WorkspaceNavItemConfig[];
export const personalWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/app/my-plan", label: "navigation.myPlan", icon: "myPlan" },
  ...planWorkspaceNavItems,
  { to: "/app/saved", label: "navigation.saved", icon: "saved" },
  { to: "/app/saved-searches", label: "navigation.alerts", icon: "alerts" },
  { to: "/app/wallet", label: "navigation.wallet", icon: "wallet" },
  { to: "/app/profile", label: "navigation.profile", icon: "profile" },
  { to: "/app/settings", label: "navigation.settings", icon: "settings" },
].filter(enabled) as WorkspaceNavItemConfig[];
export const mobileMoreWorkspaceNavItems = personalWorkspaceNavItems.filter(
  (item) => !mobilePrimaryWorkspaceNavItems.some((tab) => tab.to === item.to),
);
// The coach has a dedicated desktop rail item, while the compact mobile bar
// reserves its tabs for Home and Explore. Keep it reachable from More.
mobileMoreWorkspaceNavItems.unshift(
  ...mobilePrimaryWorkspaceNavItems.filter((item) => item.icon === "coach"),
);
const matches = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);
export function getWorkspaceArea(pathname: string): WorkspaceNavIconKey | null {
  if (pathname === "/dashboard" || pathname === "/app/home") return "home";
  if (matches(pathname, "/app/coach") || pathname === "/chat") return "coach";
  if (
    [
      "/app/my-plan",
      "/app/cv",
      "/app/ai-tools",
      "/app/documents",
      "/app/copilot",
      "/app/goals",
      "/app/applications",
      "/app/deadlines",
    ].some((route) => matches(pathname, route))
  )
    return "myPlan";
  if (
    ["/app/profile", "/app/settings", "/app/wallet", "/upgrade"].some((route) =>
      matches(pathname, route),
    )
  )
    return "profile";
  if (
    [
      "/app/opportunities",
      "/app/opportunity",
      "/opportunities",
      "/app/saved",
      "/app/saved-searches",
    ].some((route) => matches(pathname, route))
  )
    return "opportunities";
  return null;
}
export function isWorkspaceTabActive(
  pathname: string,
  item: WorkspaceNavItemConfig,
) {
  return getWorkspaceArea(pathname) === item.icon;
}

/** Header back follows an app parent or an explicit opening route, never browser history. */
export function getWorkspaceBackTarget(pathname: string, state: unknown): string | null {
  const back = state && typeof state === "object"
    ? (state as { workspaceBack?: unknown }).workspaceBack
    : undefined;
  if (back === "menu") return null;
  if (back && typeof back === "object") {
    const route = back as { pathname?: unknown; search?: unknown; hash?: unknown };
    const path = route.pathname;
    if (typeof path === "string" && (path === "/dashboard" || path.startsWith("/app/")) && path !== pathname) {
      const search = typeof route.search === "string" && route.search.startsWith("?") ? route.search : "";
      const hash = typeof route.hash === "string" && route.hash.startsWith("#") ? route.hash : "";
      return `${path}${search}${hash}`;
    }
  }
  if (pathname.startsWith("/app/opportunity/")) return "/app/opportunities";
  if (pathname === "/app/personalization") return "/app/profile";
  for (const parent of ["/app/my-plan", "/app/goals", "/app/copilot", "/app/documents", "/app/cv", "/app/profile", "/app/settings"]) {
    if (pathname.startsWith(`${parent}/`)) return parent;
  }
  return null;
}
