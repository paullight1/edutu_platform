import {
  useCallback,
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
import { ShellContext, type ShellContextValue } from "./shell-context";

function readThemePreference(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem("theme");
  return saved ? saved === "dark" : true;
}

function readSectionPreference(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("sidebar") !== "collapsed";
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const routeGroupId = groupForPath(location.pathname);
  const [isDark, setIsDark] = useState(readThemePreference);
  const [sectionPreferenceOpen, setSectionPreferenceOpen] = useState(
    readSectionPreference,
  );
  const [manualGroupSelection, setManualGroupSelection] = useState<{
    path: string;
    groupId: AdminNavGroupId;
  } | null>(null);
  const [mobileNavigationPath, setMobileNavigationPath] = useState<
    string | null
  >(null);

  const selectedGroupId =
    manualGroupSelection?.path === location.pathname
      ? manualGroupSelection.groupId
      : routeGroupId;
  const isSectionOpen = sectionPreferenceOpen && selectedGroupId !== null;
  const isMobileNavigationOpen =
    mobileNavigationPath === location.pathname;

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      window.localStorage.setItem("theme", "dark");
      return;
    }

    document.documentElement.removeAttribute("data-theme");
    window.localStorage.setItem("theme", "light");
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, []);

  const toggleSection = useCallback(
    (groupId: AdminNavGroupId) => {
      if (isSectionOpen && selectedGroupId === groupId) {
        setSectionPreferenceOpen(false);
        window.localStorage.setItem("sidebar", "collapsed");
        return;
      }

      setManualGroupSelection({ path: location.pathname, groupId });
      setSectionPreferenceOpen(true);
      window.localStorage.setItem("sidebar", "expanded");
    },
    [isSectionOpen, location.pathname, selectedGroupId],
  );

  const collapseSection = useCallback(() => {
    setSectionPreferenceOpen(false);
    window.localStorage.setItem("sidebar", "collapsed");
  }, []);

  const openMobileNavigation = useCallback(() => {
    setMobileNavigationPath(location.pathname);
  }, [location.pathname]);

  const closeMobileNavigation = useCallback(() => {
    setMobileNavigationPath(null);
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
