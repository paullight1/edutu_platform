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
  { to: "/dashboard", label: "Home", icon: LayoutGrid, exact: true },
  { to: "/app/opportunities", label: "Opportunities", icon: Briefcase },
  { to: "/app/deadlines", label: "Deadlines", icon: Calendar },
];

const secondaryNavItems: WorkspaceNavItem[] = [
  { to: "/app/saved", label: "Saved", icon: Bookmark },
  { to: "/app/applications", label: "Applications", icon: Send },
  { to: "/app/profile", label: "Profile", icon: UserCheck },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

const mobileSecondaryNavItems = secondaryNavItems.filter(
  (item) => item.to !== "/app/profile",
);

const mobileNavItems = [
  { to: "/dashboard", label: "Home", icon: LayoutGrid, exact: true },
  { to: "/app/opportunities", label: "Explore", icon: Briefcase },
  { to: "/app/deadlines", label: "Dates", icon: Calendar },
];

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

function getWorkspaceTitle(pathname: string): string {
  if (pathname === "/dashboard" || pathname === "/app/home") return "Home";
  if (pathname.startsWith("/app/opportunity/")) return "Opportunity";
  if (pathname.startsWith("/app/opportunities")) return "Opportunities";
  if (pathname.startsWith("/app/deadlines") || pathname === "/deadlines") return "Deadlines";
  if (pathname.startsWith("/app/saved") || pathname === "/saved") return "Saved";
  if (pathname.startsWith("/app/applications") || pathname === "/applications") return "Applications";
  if (pathname.startsWith("/app/profile") || pathname === "/profile") return "Profile";
  if (pathname.startsWith("/app/settings") || pathname === "/settings") return "Settings";
  return "Edutu";
}

export default function AppWorkspaceShell({ children }: AppWorkspaceShellProps) {
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
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "E";
  const workspaceTitle = getWorkspaceTitle(pathname);
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
      className={cn("min-h-[100dvh]", isDarkMode ? "bg-gray-950 text-white" : "bg-slate-50 text-slate-950")}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden border-r transition-[width] duration-300 lg:block",
          isSidebarOpen ? "w-[272px]" : "w-[76px]",
          isDarkMode ? "border-white/10 bg-gray-950" : "border-slate-200 bg-white",
        )}
        aria-label="Workspace navigation"
      >
        <div className={cn("flex h-full flex-col overflow-y-auto overflow-x-hidden py-4", isSidebarOpen ? "px-4" : "px-2")}>
          <div className={cn("mb-4 flex items-center border-b pb-4", isSidebarOpen ? "justify-between gap-3" : "justify-center", isDarkMode ? "border-white/10" : "border-slate-100")}>
            <NavLink
              to="/dashboard"
              className={cn("flex min-w-0 items-center gap-3 rounded-xl transition", isSidebarOpen ? "px-1" : "justify-center")}
              aria-label="Edutu dashboard"
            >
              <img src="/edutu-logo.png" alt="Edutu Logo" className="h-10 w-10 shrink-0 object-contain" />
              {isSidebarOpen ? (
                <div className="min-w-0">
                  <p className="text-base font-black tracking-tight">Edutu</p>
                  <p className={cn("text-xs font-semibold", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                    Workspace
                  </p>
                </div>
              ) : null}
            </NavLink>
            {isSidebarOpen ? (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition", isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-50")}
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
              className={cn("mb-3 flex h-10 w-full items-center justify-center rounded-xl transition", isDarkMode ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-50")}
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>
          ) : null}

          <div className={cn("mb-4 flex items-center gap-3", isSidebarOpen ? "px-1" : "justify-center px-0")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-sm font-black text-white">
                {initials}
            </div>
            {isSidebarOpen ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className={cn("truncate text-xs leading-5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                  {displayEmail}
                </p>
              </div>
            ) : null}
          </div>

          <nav className="space-y-1" aria-label="Primary workspace pages">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(pathname, item.to, item.exact);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={!isSidebarOpen ? item.label : undefined}
                  className={linkClassName(active)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {isSidebarOpen ? (
                    <span className="truncate">
                      {item.label}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          <div className={cn("my-4 h-px", isDarkMode ? "bg-white/10" : "bg-slate-100")} />

          <div>
            {isSidebarOpen ? (
              <p className={cn("px-3 pb-2 text-xs font-semibold", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                Workspace
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
                    title={!isSidebarOpen ? item.label : undefined}
                    className={cn(
                      "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]",
                      isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center px-0",
                      active
                        ? "bg-brand-500/10 text-brand-700 dark:text-brand-200"
                        : isDarkMode
                          ? "text-slate-300 hover:bg-white/10 hover:text-white"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
                    )}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                  >
                    <Icon size={17} className="shrink-0 text-brand-500" />
                    {isSidebarOpen ? (
                      <span className="truncate">
                      {item.label}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {isSidebarOpen ? (
            <div className={cn("mt-auto border-t pt-4 text-xs font-medium leading-5", isDarkMode ? "border-white/10 text-slate-400" : "border-slate-100 text-slate-500")}>
              <div className="mb-1 flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              <Bell size={14} />
              Stay on track
              </div>
              Deadlines and applications stay visible as you work.
            </div>
          ) : null}
        </div>
      </aside>

      <div
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
            "fixed inset-x-0 top-0 z-50 border-b px-4 backdrop-blur-xl lg:hidden",
            isDarkMode ? "border-white/10 bg-gray-950/95" : "border-slate-200 bg-white/95",
          )}
        >
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {!isHomeRoute ? (
                <button
                  type="button"
                  onClick={goBack}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                    isDarkMode
                      ? "text-slate-200 hover:bg-white/10"
                      : "text-slate-700 hover:bg-slate-100",
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
                  <span className="block truncate text-xl font-black leading-6 tracking-tight text-slate-900 dark:text-white">
                    {workspaceTitle}
                  </span>
                </span>
              </NavLink>
            </div>
            <NavLink
              to="/app/profile"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white shadow-sm transition active:scale-[0.98]"
              aria-label="Open profile"
            >
              {initials}
            </NavLink>
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
            "fixed inset-0 z-[70] flex flex-col overflow-y-auto lg:hidden",
            isDarkMode
              ? "bg-gray-950 text-white"
              : "bg-slate-50 text-slate-950",
          )}
        >
          <div
            className={cn(
              "sticky top-0 z-10 border-b px-4 backdrop-blur-xl",
              isDarkMode ? "border-white/10 bg-gray-950/95" : "border-slate-200 bg-white/95",
            )}
          >
            <div className="flex h-16 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
                  isDarkMode
                    ? "text-slate-200 hover:bg-white/10"
                    : "text-slate-700 hover:bg-slate-100",
                )}
                aria-label="Close menu"
              >
                <ChevronLeft size={22} />
              </button>
              <h2
                id="mobile-workspace-menu-title"
                className="min-w-0 truncate text-lg font-black tracking-tight"
              >
                Menu
              </h2>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
            <NavLink
              to="/app/profile"
              onClick={() => setIsMobileMoreOpen(false)}
              className={cn(
                "group mb-5 flex items-center gap-3 rounded-[24px] border p-4 shadow-sm transition active:scale-[0.98]",
                isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white",
              )}
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-lg font-black text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">
                  {displayName}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {displayEmail}
                </span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 transition group-hover:bg-brand-500 group-hover:text-white dark:text-brand-200">
                <ChevronRight size={17} />
              </span>
            </NavLink>

            <section>
              <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Explore
              </p>
              <div className="grid gap-2.5">
                {primaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isRouteActive(pathname, item.to, item.exact);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMoreOpen(false)}
                      className={cn(
                        "flex min-h-[64px] items-center justify-between rounded-[24px] border p-3.5 text-left shadow-sm transition active:scale-[0.98]",
                        isDarkMode
                          ? "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-brand-500/10 text-brand-600 dark:text-brand-200"
                        >
                          <Icon size={19} />
                        </span>
                        <span className="truncate text-[15px] font-black">
                          {item.label}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </NavLink>
                  );
                })}
              </div>
            </section>

            <section className="mt-5">
              <p className="mb-2 px-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                Workspace
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
                        "flex min-h-[64px] items-center justify-between rounded-[24px] border p-3.5 text-left shadow-sm transition active:scale-[0.98]",
                        isDarkMode
                          ? "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-brand-500/10 text-brand-600 dark:text-brand-200"
                        >
                          <Icon size={19} />
                        </span>
                        <span className="truncate text-[15px] font-black">
                          {item.label}
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
                  "flex min-h-[64px] w-full items-center justify-between rounded-[24px] border p-3.5 text-[15px] font-black shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
                  isDarkMode
                    ? "border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/15"
                    : "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-rose-500/10">
                    <LogOut size={19} />
                  </span>
                  {isSigningOut ? "Signing out..." : "Log out"}
                </span>
                <ChevronRight size={16} className="text-rose-400" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isOpportunityDetailRoute ? (
        <nav
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 border-t px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl lg:hidden",
            isDarkMode ? "border-white/10 bg-gray-950/95" : "border-slate-200 bg-white/95",
          )}
          aria-label="Mobile app navigation"
        >
          <div className="grid grid-cols-4">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isRouteActive(pathname, item.to, item.exact);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-[11px] font-semibold transition active:scale-[0.98]",
                    active
                      ? "text-brand-600 dark:text-brand-300"
                      : isDarkMode
                        ? "text-slate-400 hover:text-white"
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
                  <span className="truncate">{item.label}</span>
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => setIsMobileMoreOpen((value) => !value)}
              className={cn(
                "relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition active:scale-[0.98]",
                isMobileMoreOpen
                  ? "text-brand-600 dark:text-brand-300"
                  : isDarkMode
                    ? "text-slate-400 hover:text-white"
                    : "text-slate-500 hover:text-slate-950",
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
              <span className="truncate">More</span>
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
