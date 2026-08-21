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
  Sparkles,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { usePaywall } from "../hooks/usePaywall";
import { cn } from "../lib/cn";
import AppFooter from "./AppFooter";
import OfflineBanner from "./OfflineBanner";

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
  { to: "/app/community", label: "navigation.community", icon: UsersRound },
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

const mobileNavItems: WorkspaceNavItem[] = [
  { to: "/dashboard", label: "navigation.home", icon: LayoutGrid, exact: true },
  { to: "/app/opportunities", label: "navigation.explore", icon: Briefcase },
  { to: "/app/community", label: "navigation.community", icon: UsersRound },
  { to: "/app/deadlines", label: "navigation.dates", icon: Calendar },
];

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

export function isWorkspaceRouteActive(
  pathname: string,
  to: string,
  exact?: boolean,
) {
  if (to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/app/home";
  }
  if (to === "/app/opportunities") {
    return (
      pathname === "/opportunities" ||
      pathname.startsWith("/app/opportunities") ||
      pathname.startsWith("/app/opportunity/")
    );
  }
  if (to === "/app/community") {
    return pathname === "/app/community" || pathname.startsWith("/app/community/");
  }
  if (to === "/app/applications") {
    return (
      pathname === "/applications" ||
      pathname === "/applied" ||
      pathname.startsWith("/app/applications")
    );
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

export function getWorkspaceTitleKey(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname === "/app/home") return null;
  if (pathname.startsWith("/app/opportunity/")) return "navigation.opportunityDetail";
  if (pathname.startsWith("/app/opportunities")) return "navigation.opportunities";
  if (pathname.startsWith("/app/community")) return "navigation.community";
  if (pathname.startsWith("/app/deadlines") || pathname === "/deadlines") return "navigation.deadlines";
  if (pathname.startsWith("/app/saved") || pathname === "/saved") return "navigation.saved";
  if (pathname.startsWith("/app/applications") || pathname === "/applications") return "navigation.applications";
  if (pathname.startsWith("/app/notifications") || pathname === "/notifications") return "navigation.notifications";
  if (pathname.startsWith("/app/profile") || pathname === "/profile") return "navigation.profile";
  if (pathname.startsWith("/app/settings") || pathname === "/settings") return "navigation.settings";
  return "common.appName";
}

export default function AppWorkspaceShell({ children }: AppWorkspaceShellProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { isPro, billingLoading } = usePaywall();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
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
  const initials =
    displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "E";
  const workspaceTitleKey = getWorkspaceTitleKey(pathname);
  const workspaceTitle = workspaceTitleKey ? t(workspaceTitleKey) : greetingLabel;
  const isHomeRoute = pathname === "/dashboard" || pathname === "/app/home";
  const isOpportunityDetailRoute = pathname.startsWith("/app/opportunity/");
  const isCommunityRoute = pathname === "/app/community" || pathname.startsWith("/app/community/");
  const showUpgradeCta = !isPro && !billingLoading;

  const goBack = () => navigate(-1);

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
    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const elapsed = Date.now() - start.time;
    if (deltaX >= 86 && deltaY <= 64 && elapsed <= 900) goBack();
  };

  const desktopLinkClass = (active: boolean) =>
    cn(
      "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]",
      isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center px-0",
      active
        ? "bg-brand-500 text-white"
        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
    );

  return (
    <div
      className="min-h-[100dvh] bg-surface-body text-text-primary"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <aside
        aria-hidden={isMobileMoreOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden border-r border-subtle bg-surface-layer transition-[width] duration-300 lg:block",
          isSidebarOpen ? "w-[272px]" : "w-[76px]",
        )}
        aria-label="Workspace navigation"
      >
        <div className={cn("flex h-full flex-col overflow-y-auto overflow-x-hidden py-4", isSidebarOpen ? "px-4" : "px-2")}>
          <div className={cn("mb-4 flex items-center border-b border-subtle pb-4", isSidebarOpen ? "justify-between gap-3" : "justify-center")}>
            <NavLink
              to="/dashboard"
              className={cn("flex min-w-0 items-center gap-3 rounded-xl", !isSidebarOpen && "justify-center")}
              aria-label="Edutu dashboard"
            >
              <img src="/edutu-logo.png" alt="Edutu Logo" className="h-10 w-10 shrink-0 object-contain" />
              {isSidebarOpen ? (
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight">Edutu</span>
                  <span className="block text-xs font-semibold text-text-muted">{t("workspace.section")}</span>
                </span>
              ) : null}
            </NavLink>
            {isSidebarOpen ? (
              <button type="button" onClick={() => setIsSidebarOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-elevated" aria-label="Collapse sidebar">
                <ChevronLeft size={17} />
              </button>
            ) : null}
          </div>

          {!isSidebarOpen ? (
            <button type="button" onClick={() => setIsSidebarOpen(true)} className="mb-3 flex h-10 w-full items-center justify-center rounded-xl text-text-secondary hover:bg-surface-elevated" aria-label="Open sidebar">
              <Menu size={18} />
            </button>
          ) : null}

          <div className={cn("mb-4 flex items-center gap-3", isSidebarOpen ? "px-1" : "justify-center")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-white">{initials}</span>
            {isSidebarOpen ? (
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                  <span className="truncate">{displayName}</span>
                  {isPro ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-2xs font-semibold uppercase text-brand-700">
                      <Sparkles size={9} /> Pro
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs leading-5 text-text-muted">{displayEmail}</span>
              </span>
            ) : null}
            <NotificationLink unreadCount={unreadCount} compact={!isSidebarOpen} />
          </div>

          <nav className="space-y-1" aria-label="Primary workspace pages">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = isWorkspaceRouteActive(pathname, item.to, item.exact);
              const label = t(item.label);
              return (
                <NavLink key={item.to} to={item.to} title={!isSidebarOpen ? label : undefined} className={desktopLinkClass(active)} aria-current={active ? "page" : undefined}>
                  <Icon size={18} className="shrink-0" />
                  {isSidebarOpen ? <span className="truncate">{label}</span> : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="my-4 h-px bg-surface-elevated" />

          <nav className="space-y-1" aria-label="Personal workspace pages">
            {isSidebarOpen ? <p className="px-3 pb-2 text-xs font-semibold text-text-muted">{t("workspace.section")}</p> : null}
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = isWorkspaceRouteActive(pathname, item.to, item.exact);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={!isSidebarOpen ? t(item.label) : undefined}
                  className={cn(
                    "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-500",
                    isSidebarOpen ? "justify-start gap-3 px-3" : "justify-center",
                    active ? "bg-brand-500/10 text-brand-700" : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                  )}
                >
                  <Icon size={17} className="shrink-0 text-brand-500" />
                  {isSidebarOpen ? <span className="truncate">{t(item.label)}</span> : null}
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-subtle pt-4">
            {showUpgradeCta ? (
              <NavLink
                to="/upgrade"
                title={!isSidebarOpen ? t("navigation.upgradeToPro") : undefined}
                className={cn(
                  "mb-2 flex h-10 w-full items-center rounded-xl bg-brand-500/10 text-sm font-semibold text-brand-700 hover:bg-brand-500/20",
                  isSidebarOpen ? "gap-3 px-3" : "justify-center",
                )}
              >
                <Sparkles size={17} />
                {isSidebarOpen ? <span>{t("navigation.upgradeToPro")}</span> : null}
              </NavLink>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className={cn(
                "flex h-10 w-full items-center rounded-xl text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60",
                isSidebarOpen ? "gap-3 px-3" : "justify-center",
              )}
            >
              <LogOut size={17} />
              {isSidebarOpen ? <span>{isSigningOut ? t("navigation.signingOut") : t("navigation.logOut")}</span> : null}
            </button>
          </div>
        </div>
      </aside>

      <div
        aria-hidden={isMobileMoreOpen}
        className={cn(
          "min-w-0 pt-16 transition-[padding] duration-300 lg:pb-0 lg:pt-0",
          isCommunityRoute
            ? "pb-0"
            : isOpportunityDetailRoute
              ? "pb-[calc(6.75rem+env(safe-area-inset-bottom))]"
              : "pb-[calc(5rem+env(safe-area-inset-bottom))]",
          isSidebarOpen ? "lg:pl-[272px]" : "lg:pl-[76px]",
        )}
      >
        <header className="fixed inset-x-0 top-0 z-50 border-b border-subtle bg-surface-layer/90 px-4 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {!isHomeRoute ? (
                <button type="button" onClick={goBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-elevated" aria-label="Go back">
                  <ChevronLeft size={22} />
                </button>
              ) : null}
              <NavLink to="/dashboard" className="flex min-w-0 items-center gap-3 rounded-xl" aria-label="Go to Edutu home">
                <img src="/edutu-logo.png" alt="Edutu" className="h-10 w-10 shrink-0 object-contain" />
                <span className="truncate text-xl font-semibold leading-6 tracking-tight">{workspaceTitle}</span>
              </NavLink>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationLink unreadCount={unreadCount} />
              <NavLink to="/app/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-sm" aria-label="Open profile">
                {initials}
              </NavLink>
            </div>
          </div>
        </header>

        <OfflineBanner />
        <div className="min-w-0">{children}</div>
        <AppFooter />
      </div>

      {isMobileMoreOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="mobile-workspace-menu-title" className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-surface-body text-text-primary lg:hidden">
          <div className="sticky top-0 z-10 border-b border-subtle bg-surface-layer/90 px-4 backdrop-blur-xl">
            <div className="flex h-16 items-center gap-3">
              <button type="button" onClick={() => setIsMobileMoreOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-elevated" aria-label="Close menu">
                <ChevronLeft size={22} />
              </button>
              <h2 id="mobile-workspace-menu-title" className="truncate text-lg font-semibold">{t("workspace.menu")}</h2>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4">
            <NavLink to="/app/profile" onClick={() => setIsMobileMoreOpen(false)} className="group mb-5 flex items-center gap-3 rounded-[24px] border border-subtle bg-surface-layer p-4 shadow-sm">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-lg font-semibold text-white">{initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{displayName}</span>
                <span className="mt-1 block truncate text-xs text-text-muted">{displayEmail}</span>
              </span>
              <ChevronRight size={17} className="text-text-muted" />
            </NavLink>

            <MenuSection
              label={t("navigation.explore")}
              items={primaryNavItems}
              pathname={pathname}
              onNavigate={() => setIsMobileMoreOpen(false)}
              t={t}
            />
            <div className="mt-5">
              <MenuSection
                label={t("workspace.section")}
                items={mobileSecondaryNavItems}
                pathname={pathname}
                onNavigate={() => setIsMobileMoreOpen(false)}
                t={t}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="mt-5 flex min-h-[64px] w-full items-center justify-between rounded-[24px] border border-danger/20 bg-danger/10 p-3.5 text-base font-semibold text-danger disabled:opacity-60"
            >
              <span className="flex items-center gap-3"><LogOut size={19} /> {isSigningOut ? t("navigation.signingOut") : t("navigation.logOut")}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {!isOpportunityDetailRoute && !isCommunityRoute ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:hidden">
          <div className="pointer-events-none h-8 bg-gradient-to-t from-surface-body to-transparent" aria-hidden="true" />
          <nav className="pointer-events-auto border-t border-subtle bg-surface-layer px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-10px_30px_-14px_rgba(2,6,23,0.35)]" aria-label="Mobile app navigation">
            <div className="grid grid-cols-5">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const active = isWorkspaceRouteActive(pathname, item.to, item.exact);
                return (
                  <NavLink key={item.to} to={item.to} className={cn("relative flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden px-1 text-2xs font-semibold", active ? "text-brand-600" : "text-text-muted")} aria-current={active ? "page" : undefined}>
                    <span className={cn("absolute top-0 h-0.5 w-7 rounded-full", active ? "bg-brand-500" : "opacity-0")} />
                    <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                    <span className="truncate">{t(item.label)}</span>
                  </NavLink>
                );
              })}
              <button type="button" onClick={() => setIsMobileMoreOpen(true)} className="relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-2xs font-semibold text-text-secondary" aria-label="Open more workspace pages">
                <Menu size={21} />
                <span>{t("navigation.more")}</span>
              </button>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function NotificationLink({ unreadCount, compact = false }: { unreadCount: number; compact?: boolean }) {
  return (
    <NavLink
      to="/app/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      className={({ isActive }) =>
        cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
          compact ? "hover:bg-surface-elevated" : "border border-subtle bg-surface-layer shadow-sm hover:bg-surface-elevated",
          isActive ? "text-brand" : "text-text-secondary",
        )
      }
    >
      <Bell size={19} />
      {unreadCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-surface-layer bg-danger px-1 text-2xs font-semibold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </NavLink>
  );
}

function MenuSection({
  label,
  items,
  pathname,
  onNavigate,
  t,
}: {
  label: string;
  items: WorkspaceNavItem[];
  pathname: string;
  onNavigate: () => void;
  t: (key: string) => string;
}) {
  return (
    <section>
      <p className="mb-2 px-1 text-2xs font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <div className="grid gap-2.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isWorkspaceRouteActive(pathname, item.to, item.exact);
          return (
            <NavLink key={item.to} to={item.to} onClick={onNavigate} className="flex min-h-[64px] items-center justify-between rounded-[24px] border border-subtle bg-surface-layer p-3.5 text-left text-text-secondary shadow-sm hover:bg-surface-elevated" aria-current={active ? "page" : undefined}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-brand-500/10 text-brand-600"><Icon size={19} /></span>
                <span className="truncate text-base font-semibold">{t(item.label)}</span>
              </span>
              <ChevronRight size={16} className="text-text-muted" />
            </NavLink>
          );
        })}
      </div>
    </section>
  );
}
