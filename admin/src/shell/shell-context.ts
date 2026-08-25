import { createContext, useContext } from "react";
import type { AdminNavGroupId } from "../app/route-manifest";

export interface ShellContextValue {
  isDark: boolean;
  toggleTheme(): void;
  routeGroupId: AdminNavGroupId | null;
  selectedGroupId: AdminNavGroupId | null;
  isSectionOpen: boolean;
  toggleSection(groupId: AdminNavGroupId): void;
  collapseSection(): void;
  isMobileNavigationOpen: boolean;
  openMobileNavigation(): void;
  closeMobileNavigation(): void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used inside ShellProvider");
  }
  return context;
}
