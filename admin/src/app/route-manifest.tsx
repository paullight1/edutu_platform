import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Banknote,
  BellRing,
  BookOpen,
  CalendarDays,
  Cpu,
  FileText,
  Flag,
  FolderOpen,
  Heart,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  LogIn,
  Megaphone,
  Mic,
  MessagesSquare,
  Radio,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Tag,
  Target,
  UserCircle,
  UserPlus,
  Users,
} from "lucide-react";

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
  | "communities"
  | "community-safety"
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

export interface AdminNavGroupDefinition {
  id: AdminNavGroupId;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_GROUPS: readonly AdminNavGroupDefinition[] = [
  { id: "content", label: "Content", icon: FolderOpen },
  { id: "people", label: "People", icon: Users },
  { id: "app", label: "App & Engagement", icon: Smartphone },
  { id: "money", label: "Monetization", icon: Banknote },
  { id: "engine", label: "Engine", icon: Cpu },
];

export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [
  {
    id: "dashboard",
    path: "/",
    label: "Dashboard",
    title: "Overview",
    groupId: null,
    icon: LayoutDashboard,
    exact: true,
    navigation: "primary",
    authenticated: true,
  },
  {
    id: "opportunities",
    path: "/opportunities",
    label: "Opportunities",
    title: "Opportunities",
    groupId: "content",
    icon: Target,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "submissions",
    path: "/submissions",
    label: "Submissions",
    title: "Submissions",
    groupId: "content",
    icon: Inbox,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "events",
    path: "/events",
    label: "Events",
    title: "Events",
    groupId: "content",
    icon: CalendarDays,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "roadmaps",
    path: "/roadmaps",
    label: "Roadmaps",
    title: "Roadmaps",
    groupId: "content",
    icon: BookOpen,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "marketplace",
    path: "/marketplace",
    label: "Marketplace",
    title: "Marketplace",
    groupId: "content",
    icon: ShoppingBag,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "blog",
    path: "/blog",
    label: "Blog",
    title: "Blog",
    groupId: "content",
    icon: FileText,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "impact-stories",
    path: "/impact-stories",
    label: "Impact Stories",
    title: "Impact Stories",
    groupId: "content",
    icon: Heart,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "users",
    path: "/users",
    label: "Users",
    title: "Users",
    groupId: "people",
    icon: Users,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "creators",
    path: "/creators",
    label: "Creators",
    title: "Creators",
    groupId: "people",
    icon: ShieldCheck,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "communities",
    path: "/communities",
    label: "Communities",
    title: "Communities",
    groupId: "people",
    icon: MessagesSquare,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "community-safety",
    path: "/community-safety",
    label: "Community Safety",
    title: "Community Safety",
    groupId: "people",
    icon: ShieldAlert,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "app-home",
    path: "/app/home",
    label: "Home Blocks",
    title: "Home Blocks",
    groupId: "app",
    icon: LayoutTemplate,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "app-campaigns",
    path: "/app/campaigns",
    label: "Campaigns",
    title: "Campaigns",
    groupId: "app",
    icon: Megaphone,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "app-flags",
    path: "/app/flags",
    label: "Feature Flags",
    title: "Feature Flags",
    groupId: "app",
    icon: Flag,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "app-widgets",
    path: "/app/widgets",
    label: "Widgets",
    title: "Widgets",
    groupId: "app",
    icon: Radio,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "app-control",
    path: "/app/control",
    label: "App Control",
    title: "App Control",
    groupId: "app",
    icon: ShieldAlert,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "notifications",
    path: "/notifications",
    label: "Notifications",
    title: "Notifications",
    groupId: "app",
    icon: BellRing,
    exact: true,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "monetization-overview",
    path: "/monetization",
    label: "Overview",
    title: "Monetization",
    groupId: "money",
    icon: Banknote,
    exact: true,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "monetization-pricing",
    path: "/monetization/pricing",
    label: "Pricing",
    title: "Pricing",
    groupId: "money",
    icon: Tag,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "monetization-transactions",
    path: "/monetization/transactions",
    label: "Transactions",
    title: "Transactions",
    groupId: "money",
    icon: Receipt,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "monetization-usage",
    path: "/monetization/usage",
    label: "Usage (Voice AI)",
    title: "Voice AI Usage",
    groupId: "money",
    icon: Mic,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "engine-sources",
    path: "/engine",
    label: "Sources",
    title: "Engine Sources",
    groupId: "engine",
    icon: Cpu,
    exact: true,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "engine-runs",
    path: "/engine/runs",
    label: "Live Runs",
    title: "Engine Runs",
    groupId: "engine",
    icon: Radio,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "engine-status",
    path: "/engine/status",
    label: "Status",
    title: "Engine Status",
    groupId: "engine",
    icon: Activity,
    navigation: "group",
    authenticated: true,
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    title: "Settings",
    groupId: null,
    icon: SlidersHorizontal,
    exact: true,
    navigation: "primary",
    authenticated: true,
  },
  {
    id: "profile",
    path: "/profile",
    label: "My Profile",
    title: "Profile",
    groupId: null,
    icon: UserCircle,
    exact: true,
    navigation: "profile",
    authenticated: true,
  },
  {
    id: "login",
    path: "/login",
    label: "Log In",
    title: "Log In",
    groupId: null,
    icon: LogIn,
    exact: true,
    navigation: "hidden",
    authenticated: false,
  },
  {
    id: "signup",
    path: "/signup",
    label: "Sign Up",
    title: "Sign Up",
    groupId: null,
    icon: UserPlus,
    exact: true,
    navigation: "hidden",
    authenticated: false,
  },
  {
    id: "reset-password",
    path: "/reset-password",
    label: "Reset Password",
    title: "Reset Password",
    groupId: null,
    icon: KeyRound,
    exact: true,
    navigation: "hidden",
    authenticated: false,
  },
];

export const ADMIN_REDIRECTS: readonly AdminRedirectDefinition[] = [
  { from: "/dashboard", to: "/" },
  { from: "/edutu-engine", to: "/engine" },
  { from: "/mobile-control", to: "/app/home" },
];

export const ALL_ADMIN_PATHS: readonly string[] = [
  ...ADMIN_ROUTES.map((route) => route.path),
  ...ADMIN_REDIRECTS.map((redirect) => redirect.from),
];

const ROUTES_BY_SPECIFICITY = [...ADMIN_ROUTES].sort(
  (left, right) => right.path.length - left.path.length,
);
const ROUTES_BY_ID = new Map(
  ADMIN_ROUTES.map((route) => [route.id, route] as const),
);

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/u, 1)[0] || "/";
  if (pathOnly === "/") return pathOnly;
  return pathOnly.replace(/\/+$/u, "") || "/";
}

function routeMatches(route: AdminRouteDefinition, pathname: string): boolean {
  if (route.path === "/") return pathname === "/";
  if (pathname === route.path) return true;
  if (route.exact) return false;
  return pathname.startsWith(`${route.path}/`);
}

export function getAdminRoute(id: AdminRouteId): AdminRouteDefinition {
  const route = ROUTES_BY_ID.get(id);
  if (!route) throw new Error(`Unknown admin route: ${id}`);
  return route;
}

export function adminRoutePath(id: AdminRouteId): string {
  return getAdminRoute(id).path;
}

export function routeForPath(pathname: string): AdminRouteDefinition | null {
  const normalized = normalizePathname(pathname);
  return (
    ROUTES_BY_SPECIFICITY.find((route) => routeMatches(route, normalized)) ??
    null
  );
}

export function groupForPath(pathname: string): AdminNavGroupId | null {
  return routeForPath(pathname)?.groupId ?? null;
}
