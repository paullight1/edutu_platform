import type { LucideIcon } from "lucide-react";

export type AdminNavGroupId =
  | "content"
  | "people"
  | "app"
  | "money"
  | "engine";

export type AdminNavigationPlacement =
  | "primary"
  | "group"
  | "profile"
  | "hidden";

export type AdminRouteId =
  | "dashboard"
  | "opportunities"
  | "submissions"
  | "events"
  | "users"
  | "creators"
  | "roadmaps"
  | "marketplace"
  | "blog"
  | "impact-stories"
  | "settings"
  | "engine-sources"
  | "engine-runs"
  | "engine-status"
  | "app-home"
  | "app-campaigns"
  | "app-flags"
  | "app-widgets"
  | "app-control"
  | "notifications"
  | "monetization-overview"
  | "monetization-pricing"
  | "monetization-transactions"
  | "monetization-usage"
  | "profile"
  | "login"
  | "signup"
  | "reset-password";

export interface AdminRouteDefinition {
  id: AdminRouteId;
  path: string;
  label: string;
  title: string;
  groupId: AdminNavGroupId | null;
  icon: LucideIcon;
  exact?: boolean;
  navigation: AdminNavigationPlacement;
  authenticated: boolean;
}

export interface AdminRedirectDefinition {
  from: string;
  to: string;
}

// Deliberately incomplete RED-phase scaffold. The tests lock every route,
// redirect and matching rule before the route implementation moves.
export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [];
export const ADMIN_REDIRECTS: readonly AdminRedirectDefinition[] = [];
export const ALL_ADMIN_PATHS: readonly string[] = [];

export function routeForPath(_pathname: string): AdminRouteDefinition | null {
  return null;
}

export function groupForPath(_pathname: string): AdminNavGroupId | null {
  return null;
}
