import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import {
  groupForPath,
  type AdminNavGroupId,
} from "../app/route-manifest";

interface ShellContextValue {
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

const ShellContext = createContext<ShellContextValue | null>(null);

function readThemePreference(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem("theme");
  return saved ? saved === "dark" : true;
}

function readSectionPreference(routeGroupId: AdminNavGroupId | null): boolean {
  if (!routeGroupId || typeof window === "undefined") return false;
  return window.localStorage.getItem("sidebar") !== "collapsed";
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const routeGroupId = groupForPath(location.pathname);
  const [isDark, setIsDark] = useState(readThemePreference);
  const [selectedGroupId, setSelectedGroupId] =
    useState<AdminNavGroupId | null>(routeGroupId);
  const [isSectionOpen, setIsSectionOpen] = useState(() =>
    readSectionPreference(routeGroupId),
  );
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      window.localStorage.setItem("theme", "dark");
      return;
    }

    document.documentElement.removeAttribute("data-theme");
    window.localStorage.setItem("theme", "light");
  }, [isDark]);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
    if (routeGroupId && isSectionOpen) {
      setSelectedGroupId(routeGroupId);
    }
  }, [location.pathname, routeGroupId, isSectionOpen]);

  const toggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, []);

  const toggleSection = useCallback(
    (groupId: AdminNavGroupId) => {
      if (isSectionOpen && selectedGroupId === groupId) {
        setIsSectionOpen(false);
        window.localStorage.setItem("sidebar", "collapsed");
        return;
      }

      setSelectedGroupId(groupId);
      setIsSectionOpen(true);
      window.localStorage.setItem("sidebar", "expanded");
    },
    [isSectionOpen, selectedGroupId],
  );

  const collapseSection = useCallback(() => {
    setIsSectionOpen(false);
    window.localStorage.setItem("sidebar", "collapsed");
  }, []);

  const openMobileNavigation = useCallback(() => {
    setIsMobileNavigationOpen(true);
  }, []);

  const closeMobileNavigation = useCallback(() => {
    setIsMobileNavigationOpen(false);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      isDark,
      toggleTheme,
      routeGroupId,
      selectedGroupId,
      isSectionOpen,
      toggleSection,
      collapseSection,
      isMobileNavigationOpen,
      openMobileNavigation,
      closeMobileNavigation,
    }),
    [
      closeMobileNavigation,
      collapseSection,
      isDark,
      isMobileNavigationOpen,
      isSectionOpen,
      openMobileNavigation,
      routeGroupId,
      selectedGroupId,
      toggleSection,
      toggleTheme,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used inside ShellProvider");
  }
  return context;
}
