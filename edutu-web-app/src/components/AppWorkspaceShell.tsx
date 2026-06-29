import type { ReactNode, TouchEvent } from "react";
import { useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Bookmark,
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Send,
  Settings,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import { cn } from "../lib/cn";

interface AppWorkspaceShellProps {
  children: ReactNode;
}

type WorkspaceNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const primaryNavItems: WorkspaceNavItem[] = [
  { to: "/dashboard", label: "navigation.home", icon: LayoutGrid, exact: true },
  { to: "/app/opportunities", label: "navigation.opportunities", icon: Briefcase },
  { to: "/app/deadlines", label: "navigation.deadlines", icon: Calendar },
];

const secondaryNavItems: WorkspaceNavItem[] = [
  { to: "/app/saved", label: "navigation.saved", icon: Bookmark },
  { to: "/app/applications", label: "navigation.applications", icon: Send },
  { to: "/app/profile", label: "navigation.profile", icon: UserCheck },
  { to: "/app/settings", label: "navigation.settings", icon: Settings },
];

const mobileSecondaryNavItems = secondaryNavItems.filter(
  (item) => item.to !== "/app/profile",
);

const mobileNavItems = [
  { to: "/dashboard", label: "navigation.home", icon: LayoutGrid, exact: true },
  { to: "/app/opportunities", label: "navigation.explore", icon: Briefcase },
  { to: "/app/deadlines", label: "navigation.dates", icon: Calendar },
];

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

function isRouteActive(pathname: string, to: string, exact?: boolean) {
  if (to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/app/home";
  }

  if (to === "/app/opportunities") {
    return pathname === "/opportunities" || pathname.startsWith("/app/opportunities") || pathname.startsWith("/app/opportunity/");
  }

  if (to === "/app/applications") {
    return pathname === "/applications" || pathname === "/applied" || pathname.startsWith("/app/applications");
  }

  if (to === "/app/deadlines") {
    return pathname === "/deadlines" || pathname.startsWith("/app/deadlines");
  }

  if (to === "/app/saved") {
    return pathname === "/saved" || pathname.startsWith("/app/saved");
  }

  if (to === "/app/profile") {
    return pathname === "/profile" || pathname.startsWith("/app/profile");
  }

  if (to === "/app/settings") {
    return pathname === "/settings" || pathname.startsWith("/app/settings");
  }

  return exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

function getWorkspaceTitleKey(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname === "/app/home") return null;
  if (pathname.startsWith("/app/opportunity/")) return "navigation.opportunityDetail";
  if (pathname.startsWith("/app/opportunities")) return "navigation.opportunities";
  if (pathname.startsWith("/app/deadlines") || pathname === "/deadlines") return "navigation.deadlines";
  if (pathname.startsWith("/app/saved") || pathname === "/saved") return "navigation.saved";
  if (pathname.startsWith("/app/applications") || pathname === "/applications") return "navigation.applications";
  if (pathname.startsWith("/app/profile") || pathname === "/profile") return "navigation.profile";
  if (pathname.startsWith("/app/settings") || pathname === "/settings") return "navigation.settings";
  return "common.appName";
}

export default function AppWorkspaceShell({ children }: AppWorkspaceShellProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { isDarkMode } = useDarkMode();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1280;
  });
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const displayName = user?.name || "Edutu learner";
  const displayEmail = user?.email || "Welcome back";
  const greetingLabel = t("workspace.greeting", {
    name: getFirstName(displayName) || t("workspace.there"),
  });
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "E";
  const workspaceTitleKey = getWorkspaceTitleKey(pathname);
  const workspaceTitle = workspaceTitleKey ? t(workspaceTitleKey) : greetingLabel;
  const isHomeRoute = pathname === "/dashboard" || pathname === "/app/home";
  const isOpportunityDetailRoute = pathname.startsWith("/app/opportunity/");

  const goBack = () => {
    navigate(-1);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      setIsMobileMoreOpen(false);
      navigate("/");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch || isMobileMoreOpen || touch.clientX > 32) {
      swipeStartRef.current = null;
      return;
    }

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    const touch = event.changedTouches[0];
    swipeStartRef.current = null;

    if (!start || !touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const elapsed = Date.now() - start.time;

    if (deltaX >= 86 && deltaY <= 64 && elapsed <= 900) {
      goBack();
    }
  };

  const linkClassName = (active: boolean) =>
    cn(
      "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]",
      isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center px-0",
      active
        ? "bg-brand-500 text-white"
        : isDarkMode
          ? "text-slate-300 hover:bg-white/10 hover:text-white"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
    );

  return (
    <div
      className={cn("min-h-[100dvh] bg-white text-slate-950")}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <aside
        aria-hidden={isMobileMoreOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden border-r transition-[width] duration-300 lg:block",
          isSidebarOpen ? "w-[272px]" : "w-[76px]",
          "border-slate-200 bg-white",
        )}
        aria-label="Workspace navigation"
      >
        <div className={cn("flex h-full flex-col overflow-y-auto overflow-x-hidden py-4", isSidebarOpen ? "px-4" : "px-2")}>
          <div className={cn("mb-4 flex items-center border-b border-slate-100 pb-4", isSidebarOpen ? "justify-between gap-3" : "justify-center")}>
            <NavLink
              to="/dashboard"
              className={cn("flex min-w-0 items-center gap-3 rounded-xl transition", isSidebarOpen ? "px-1" : "justify-center")}
              aria-label="Edutu dashboard"
            >
              <img src="/edutu-logo.png" alt="Edutu Logo" className="h-10 w-10 shrink-0 object-contain" />
              {isSidebarOpen ? (
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight">Edutu</p>
                  <p className={cn("text-xs font-semibold text-slate-400")}>
                    {t("workspace.section")}
                  </p>
                </div>
              ) : null}
            </NavLink>
            {isSidebarOpen ? (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-slate-50")}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft size={17} />
              </button>
            ) : null}
          </div>

          {!isSidebarOpen ? (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className={cn("mb-3 flex h-10 w-full items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-50")}
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>
          ) : null}

          <div className={cn("mb-4 flex items-center gap-3", isSidebarOpen ? "px-1" : "justify-center px-0")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                {initials}
            </div>
            {isSidebarOpen ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className={cn("truncate text-xs leading-5 text-slate-500")}>
                  {displayEmail}
                </p>
              </div>
            ) : null}
            {isSidebarOpen ? (
              <NavLink
                to="/app/settings"
                aria-label="Notifications"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50",
                )}
              >
                <Bell size={17} />
              </NavLink>
            ) : (
              <NavLink
                to="/app/settings"
                aria-label="Notifications"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-50",
                )}
              >
                <Bell size={17} />
              </NavLink>
            )}
          </div>

          <nav className="space-y-1" aria-label="Primary workspace pages">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(pathname, item.to, item.exact);
              const itemLabel = t(item.label);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={!isSidebarOpen ? itemLabel : undefined}
                  className={linkClassName(active)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {isSidebarOpen ? (
                    <span className="truncate">
                      {itemLabel}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className={cn("my-4 h-px bg-slate-100")} />

          <div>
            {isSidebarOpen ? (
              <p className={cn("px-3 pb-2 text-xs font-semibold text-slate-400")}>
                {t("workspace.section")}
              </p>
            ) : null}
            <nav className="space-y-1" aria-label="Personal workspace pages">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(pathname, item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={!isSidebarOpen ? t(item.label) : undefined}
                    className={cn(
                      "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]",
                      isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center px-0",
                      active
                        ? "bg-brand-500/10 text-brand-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    )}
                    aria-current={active ? "page" : undefined}
                    aria-label={t(item.label)}
                  >
                    <Icon size={17} className="shrink-0 text-brand-500" />
                    {isSidebarOpen ? (
                      <span className="truncate">
                      {t(item.label)}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className={cn("mt-auto border-t border-slate-100 pt-4")}>
            {isSidebarOpen ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-rose-600 transition-all duration-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <LogOut size={17} className="shrink-0" />
                {isSigningOut ? t("navigation.signingOut") : t("navigation.logOut")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className={cn(
                  "flex h-10 w-full items-center justify-center rounded-xl text-rose-600 transition-all duration-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60",
                )}
                aria-label={t("navigation.logOut")}
              >
                <LogOut size={17} className="shrink-0" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div
        aria-hidden={isMobileMoreOpen}
        className={cn(
          "min-w-0 pt-16 transition-[padding] duration-300 lg:pb-0 lg:pt-0",
          isOpportunityDetailRoute
            ? "pb-[calc(6.75rem+env(safe-area-inset-bottom))]"
            : "pb-[calc(5rem+env(safe-area-inset-bottom))]",
          isSidebarOpen ? "lg:pl-[272px]" : "lg:pl-[76px]",
        )}
      >
        <header
          className={cn(
            "fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl lg:hidden",
          )}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {!isHomeRoute ? (
                <button
                  type="button"
                  onClick={goBack}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100",
                  )}
                  aria-label="Go back"
                >
                  <ChevronLeft size={22} />
                </button>
              ) : null}
              <NavLink
                to="/dashboard"
                className="flex min-w-0 items-center gap-3 rounded-xl transition active:scale-[0.98]"
                aria-label="Go to Edutu home"
              >
                <img
                  src="/edutu-logo.png"
                  alt="Edutu"
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <span className="min-w-0">
                  <span className="block truncate text-xl font-semibold leading-6 tracking-tight text-slate-900">
                    {workspaceTitle}
                  </span>
                </span>
              </NavLink>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NavLink
                to="/app/settings"
                aria-label="Notifications"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50",
                )}
              >
                <Bell size={20} />
              </NavLink>
              <NavLink
                to="/app/profile"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                aria-label="Open profile"
              >
                {initials}
              </NavLink>
            </div>
          </div>
        </header>
        {children}
      </div>

      {isMobileMoreOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-workspace-menu-title"
          className={cn(
            "fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-white text-slate-950 lg:hidden",
          )}
        >
          <div
            className={cn(
              "sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xl",
            )}
          >
            <div className="flex h-16 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100",
                )}
                aria-label="Close menu"
              >
                <ChevronLeft size={22} />
              </button>
              <h2
                id="mobile-workspace-menu-title"
                className="min-w-0 truncate text-lg font-semibold tracking-tight"
              >
                {t("workspace.menu")}
              </h2>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
            <NavLink
              to="/app/profile"
              onClick={() => setIsMobileMoreOpen(false)}
              className={cn(
                "group mb-5 flex items-center gap-3 rounded-[24px] border p-4 shadow-sm transition active:scale-[0.98]",
                "border-slate-200 bg-white",
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {displayName}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                  {displayEmail}
                </span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white">
                <ChevronRight size={17} />
              </span>
            </NavLink>

            <section>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t("navigation.explore")}
              </p>
              <div className="grid gap-2.5">
                {primaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isRouteActive(pathname, item.to, item.exact);
                  const itemLabel = t(item.label);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMoreOpen(false)}
                      className={cn(
                        "flex min-h-[64px] items-center justify-between rounded-[24px] border border-slate-200 bg-white p-3.5 text-left text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-brand-500/10 text-brand-600"
                        >
                          <Icon size={19} />
                        </span>
                        <span className="truncate text-[15px] font-semibold">
                          {itemLabel}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </NavLink>
                  );
                })}
              </div>
            </section>

            <section className="mt-5">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {t("workspace.section")}
              </p>
              <div className="grid gap-2.5">
                {mobileSecondaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isRouteActive(pathname, item.to, item.exact);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMoreOpen(false)}
                      className={cn(
                        "flex min-h-[64px] items-center justify-between rounded-[24px] border border-slate-200 bg-white p-3.5 text-left text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-brand-500/10 text-brand-600"
                        >
                          <Icon size={19} />
                        </span>
                        <span className="truncate text-[15px] font-semibold">
                          {t(item.label)}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </NavLink>
                  );
                })}
              </div>
            </section>

            <div className="pt-2.5">
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className={cn(
                  "flex min-h-[64px] w-full items-center justify-between rounded-[24px] border border-rose-100 bg-rose-50 p-3.5 text-[15px] font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-rose-500/10">
                    <LogOut size={19} />
                  </span>
                  {isSigningOut ? t("navigation.signingOut") : t("navigation.logOut")}
                </span>
                <ChevronRight size={16} className="text-rose-400" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isOpportunityDetailRoute ? (
        <nav
          aria-hidden={isMobileMoreOpen}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl lg:hidden",
          )}
          aria-label="Mobile app navigation"
        >
          <div className="grid grid-cols-4">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(pathname, item.to, item.exact);
              const itemLabel = t(item.label);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-[11px] font-semibold transition active:scale-[0.98]",
                    active
                      ? "text-brand-600"
                      : "text-slate-500 hover:text-slate-950",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={cn(
                      "absolute top-0 h-0.5 w-7 rounded-full transition-opacity",
                      active ? "bg-brand-500 opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <Icon size={21} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
                  <span className="truncate">{itemLabel}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => setIsMobileMoreOpen((value) => !value)}
              className={cn(
                "relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition active:scale-[0.98]",
                isMobileMoreOpen
                  ? "text-brand-600"
                  : "text-slate-700 hover:text-slate-950",
              )}
              aria-expanded={isMobileMoreOpen}
              aria-label="Open more workspace pages"
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-7 rounded-full transition-opacity",
                  isMobileMoreOpen ? "bg-brand-500 opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              />
              {isMobileMoreOpen ? (
                <X size={21} className="shrink-0" strokeWidth={2.5} />
              ) : (
                <Menu size={21} className="shrink-0" />
              )}
              <span className="truncate">{t("navigation.more")}</span>
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
