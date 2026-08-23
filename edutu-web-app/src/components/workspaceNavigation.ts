export type WorkspaceNavIconKey =
  | "home"
  | "opportunities"
  | "community"
  | "deadlines"
  | "saved"
  | "applications"
  | "roadmaps"
  | "goals"
  | "profile"
  | "settings";

export interface WorkspaceNavItemConfig {
  to: string;
  label: string;
  icon: WorkspaceNavIconKey;
  exact?: boolean;
}

export const primaryWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/dashboard", label: "navigation.home", icon: "home", exact: true },
  {
    to: "/app/opportunities",
    label: "navigation.opportunities",
    icon: "opportunities",
  },
  {
    to: "/app/community",
    label: "navigation.community",
    icon: "community",
  },
  { to: "/app/deadlines", label: "navigation.deadlines", icon: "deadlines" },
];

/**
 * Personal workspace order follows the learner lifecycle: collect work,
 * progress it, access marketplace support, plan the next moves, then manage
 * identity/settings.
 */
export const personalWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/app/saved", label: "navigation.saved", icon: "saved" },
  {
    to: "/app/applications",
    label: "navigation.applications",
    icon: "applications",
  },
  { to: "/app/marketplace", label: "Marketplace", icon: "opportunities" },
  { to: "/app/wallet", label: "Wallet", icon: "saved" },
  { to: "/app/roadmaps", label: "navigation.plan", icon: "roadmaps" },
  { to: "/app/goals", label: "dashboard.stats.goalsActive", icon: "goals" },
  { to: "/app/profile", label: "navigation.profile", icon: "profile" },
  { to: "/app/settings", label: "navigation.settings", icon: "settings" },
];

export const mobilePrimaryWorkspaceNavItems: WorkspaceNavItemConfig[] = [
  { to: "/dashboard", label: "navigation.home", icon: "home", exact: true },
  {
    to: "/app/opportunities",
    label: "navigation.explore",
    icon: "opportunities",
  },
  {
    to: "/app/community",
    label: "navigation.community",
    icon: "community",
  },
  { to: "/app/deadlines", label: "navigation.dates", icon: "deadlines" },
];

export const mobileMoreWorkspaceNavItems = personalWorkspaceNavItems.filter(
  (item) => item.to !== "/app/profile",
);
