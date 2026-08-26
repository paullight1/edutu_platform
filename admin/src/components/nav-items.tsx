import type { LucideIcon } from "lucide-react";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_ROUTES,
  getAdminRoute,
  groupForPath as manifestGroupForPath,
  type AdminNavGroupId,
  type AdminRouteDefinition,
  type AdminRouteId,
} from "../app/route-manifest";

export type NavLeaf = { label: string; to: string; icon?: LucideIcon };
export type NavGroup = {
  id: AdminNavGroupId;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};
export type NavEntry =
  | ({ kind: "leaf" } & NavLeaf & { icon: LucideIcon })
  | ({ kind: "group" } & NavGroup);

function leafFromRoute(route: AdminRouteDefinition): NavLeaf & {
  icon: LucideIcon;
} {
  return {
    label: route.label,
    to: route.path,
    icon: route.icon,
  };
}

function primaryLeaf(id: AdminRouteId): NavEntry {
  return {
    kind: "leaf",
    ...leafFromRoute(getAdminRoute(id)),
  };
}

const groupedRoutes = (groupId: AdminNavGroupId) =>
  ADMIN_ROUTES.filter(
    (route) => route.navigation === "group" && route.groupId === groupId,
  ).map(leafFromRoute);

export const NAV: NavEntry[] = [
  primaryLeaf("dashboard"),
  ...ADMIN_NAV_GROUPS.map<NavEntry>((group) => ({
    kind: "group",
    id: group.id,
    label: group.label,
    icon: group.icon,
    children: groupedRoutes(group.id),
  })),
  primaryLeaf("settings"),
];

export function groupForPath(pathname: string): string | null {
  return manifestGroupForPath(pathname);
}
