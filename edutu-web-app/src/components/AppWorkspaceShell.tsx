import type { ReactNode, TouchEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  MessageCircle,
  FileText,
  FolderOpen,
  Target,
  Wallet,
  Home,
  Compass,
  ArrowLeft,
  Archive,
  Bookmark,
  Calendar,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  LogOut,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  Send,
  Settings,
  Sparkles,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LiquidGlass } from "@liquidglassjs/react";
import "@liquidglassjs/core/css";
import "./workspaceGlass.css";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import { usePaywall } from "../hooks/usePaywall";
import { cn } from "../lib/cn";
import AiSparkGlyph from "./AiSparkGlyph";
import CommunityAnnouncement from "./CommunityAnnouncement";
import OfflineBanner from "./OfflineBanner";
import { WorkspaceNoticeProvider } from "./workspaceNoticeContext";
import {
  COACH_NEW_CONVERSATION_EVENT,
  COACH_OPEN_HISTORY_EVENT,
} from "../features/ai-coach/coachEvents";
import { CV_CREATE_EVENT } from "../features/cv/cvEvents";
import {
  mobileMoreWorkspaceNavItems,
  mobilePrimaryWorkspaceNavItems,
  personalWorkspaceNavItems,
  primaryWorkspaceNavItems,
  type WorkspaceNavIconKey,
  isWorkspaceTabActive,
  isMobilePrimaryWorkspaceRoute,
  getWorkspaceBackTarget,
} from "./workspaceNavigation";
import { OPEN_OPPORTUNITY_FILTERS_EVENT } from "./opportunitySearchEvents";

// Communities remain available in navigation, but the promotional announcement
// is temporarily hidden while that area is being prepared.
const SHOW_COMMUNITY_ANNOUNCEMENT = false;

interface AppWorkspaceShellProps {
  children: ReactNode;
}

const workspaceNavIcons: Record<WorkspaceNavIconKey, LucideIcon> = {
  coach: MessageCircle,
  cv: FileText,
  documents: FolderOpen,
  alerts: Bell,
  goals: Target,
  copilot: Sparkles,
  wallet: Wallet,
  home: Home,
  opportunities: Compass,
  myPlan: ClipboardList,
  deadlines: Calendar,
  saved: Bookmark,
  applications: Send,
  profile: UserCheck,
  settings: Settings,
};

const moreShortcutStyles: Partial<
  Record<WorkspaceNavIconKey, { icon: string; card: string; active: string }>
> = {
  applications: {
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
    card: "border-orange-200/80 bg-orange-50/70 dark:border-orange-400/15 dark:bg-orange-400/[0.06]",
    active: "border-orange-300 bg-orange-100/80 text-orange-800 dark:border-orange-300/30 dark:bg-orange-400/15 dark:text-orange-200",
  },
  saved: {
    icon: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    card: "border-blue-200/80 bg-blue-50/70 dark:border-blue-400/15 dark:bg-blue-400/[0.06]",
    active: "border-blue-300 bg-blue-100/80 text-blue-800 dark:border-blue-300/30 dark:bg-blue-400/15 dark:text-blue-200",
  },
  deadlines: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    card: "border-amber-200/80 bg-amber-50/75 dark:border-amber-400/15 dark:bg-amber-400/[0.06]",
    active: "border-amber-300 bg-amber-100/80 text-amber-800 dark:border-amber-300/30 dark:bg-amber-400/15 dark:text-amber-200",
  },
  alerts: {
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    card: "border-violet-200/80 bg-violet-50/70 dark:border-violet-400/15 dark:bg-violet-400/[0.06]",
    active: "border-violet-300 bg-violet-100/80 text-violet-800 dark:border-violet-300/30 dark:bg-violet-400/15 dark:text-violet-200",
  },
  cv: {
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
    card: "border-sky-200/80 bg-sky-50/75 dark:border-sky-400/15 dark:bg-sky-400/[0.06]",
    active: "border-sky-300 bg-sky-100/80 text-sky-800 dark:border-sky-300/30 dark:bg-sky-400/15 dark:text-sky-200",
  },
  documents: {
    icon: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
    card: "border-teal-200/80 bg-teal-50/75 dark:border-teal-400/15 dark:bg-teal-400/[0.06]",
    active: "border-teal-300 bg-teal-100/80 text-teal-800 dark:border-teal-300/30 dark:bg-teal-400/15 dark:text-teal-200",
  },
  goals: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    card: "border-emerald-200/80 bg-emerald-50/75 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]",
    active: "border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-400/15 dark:text-emerald-200",
  },
  copilot: {
    icon: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
    card: "border-fuchsia-200/80 bg-fuchsia-50/70 dark:border-fuchsia-400/15 dark:bg-fuchsia-400/[0.06]",
    active: "border-fuchsia-300 bg-fuchsia-100/80 text-fuchsia-800 dark:border-fuchsia-300/30 dark:bg-fuchsia-400/15 dark:text-fuchsia-200",
  },
};

const planStageStyles: Record<string, string> = {
  pursuing: "border-blue-200/80 bg-blue-50/75 dark:border-blue-400/15 dark:bg-blue-400/[0.06]",
  discover: "border-violet-200/80 bg-violet-50/75 dark:border-violet-400/15 dark:bg-violet-400/[0.06]",
  applied: "border-teal-200/80 bg-teal-50/75 dark:border-teal-400/15 dark:bg-teal-400/[0.06]",
  outcome: "border-amber-200/80 bg-amber-50/75 dark:border-amber-400/15 dark:bg-amber-400/[0.06]",
};

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

function isRouteActive(pathname: string, to: string, exact?: boolean) {
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

  return exact
    ? pathname === to
    : pathname === to || pathname.startsWith(`${to}/`);
}

function getWorkspaceTitleKey(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname === "/app/home") return null;
  if (pathname.startsWith("/app/opportunity/"))
    return "navigation.opportunityDetail";
  if (pathname.startsWith("/app/opportunities"))
    return "navigation.opportunities";
  if (pathname.startsWith("/app/my-plan/stage/")) {
    const stage = pathname.split("/")[4];
    if (["pursuing", "discover", "applied", "outcome"].includes(stage)) {
      return `myPlan.stages.${stage}`;
    }
  }
  if (pathname.startsWith("/app/my-plan")) return "navigation.myPlan";
  if (pathname.startsWith("/app/copilot")) return "navigation.copilot";
  if (pathname.startsWith("/app/community")) return "navigation.community";
  if (pathname.startsWith("/app/deadlines") || pathname === "/deadlines")
    return "navigation.deadlines";
  if (pathname.startsWith("/app/saved-searches")) return "navigation.alerts";
  if (pathname.startsWith("/app/saved") || pathname === "/saved")
    return "navigation.saved";
  if (pathname.startsWith("/app/applications") || pathname === "/applications")
    return "navigation.applications";
  if (
    pathname.startsWith("/app/notifications") ||
    pathname === "/notifications"
  )
    return "navigation.notifications";
  if (pathname.startsWith("/app/profile") || pathname === "/profile")
    return "navigation.profile";
  if (pathname.startsWith("/app/settings") || pathname === "/settings")
    return "navigation.settings";
  const feature = [
    ...primaryWorkspaceNavItems,
    ...personalWorkspaceNavItems,
  ].find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  if (feature) return feature.label;
  return "common.appName";
}

export default function AppWorkspaceShell({
  children,
}: AppWorkspaceShellProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { isPro, billingLoading } = usePaywall();
  // Only surface the upgrade CTA once we positively know the user isn't Pro,
  // so a paying subscriber never sees an "Upgrade" flash during the billing fetch.
  const showUpgradeCta = !isPro && !billingLoading;
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1280;
  });
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);
  const [isOpportunitySearchOpen, setIsOpportunitySearchOpen] = useState(false);
  const opportunitySearchInputRef = useRef<HTMLInputElement>(null);
  const [opportunitySearchDraft, setOpportunitySearchDraft] = useState("");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreDialogRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
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
  const workspaceTitle = workspaceTitleKey
    ? t(workspaceTitleKey)
    : greetingLabel;
  const isHomeRoute = pathname === "/dashboard" || pathname === "/app/home";
  const isOpportunityDetailRoute = pathname.startsWith("/app/opportunity/");
  const isCommunityRoute = pathname.startsWith("/app/community");
  const showMobileBottomNav = !isCommunityRoute && !isOpportunityDetailRoute;
  const moreNavGroups = [
    {
      label: "Applications & saved",
      items: mobileMoreWorkspaceNavItems.filter((item) =>
        ["applications", "saved", "deadlines", "goals"].includes(item.icon),
      ),
    },
    {
      label: "Documents & tools",
      items: mobileMoreWorkspaceNavItems.filter((item) =>
        ["cv", "documents"].includes(item.icon),
      ),
    },
    {
      label: "Account",
      items: mobileMoreWorkspaceNavItems.filter((item) =>
        ["wallet", "settings"].includes(item.icon),
      ),
    },
  ];
  const planStageShortcuts = [
    { stage: "pursuing", label: "Pursuing", icon: Target, iconClass: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
    { stage: "discover", label: "Shortlist", icon: Bookmark, iconClass: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
    { stage: "applied", label: "Applied", icon: Send, iconClass: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300" },
    { stage: "outcome", label: "Closed", icon: Archive, iconClass: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" },
  ];
  const isOpportunitiesRoute =
    pathname === "/opportunities" || pathname.startsWith("/app/opportunities");
  const isCoachRoute =
    pathname === "/app/coach" || pathname.startsWith("/app/coach/");
  const isMyPlanOverviewRoute = pathname === "/app/my-plan";
  const openOpportunitySearch = () => {
    setOpportunitySearchDraft(new URLSearchParams(location.search).get("search") ?? "");
    setIsOpportunitySearchOpen(true);
  };
  const updateOpportunitySearch = (value: string) => {
    setOpportunitySearchDraft(value);
    const params = new URLSearchParams(location.search);
    const query = value.trim();
    if (query) params.set("search", query);
    else params.delete("search");
    const queryString = params.toString();
    navigate(
      { pathname: location.pathname, search: queryString ? `?${queryString}` : "" },
      { replace: true },
    );
  };
  useEffect(() => {
    if (!isOpportunitySearchOpen) return;
    const frame = window.requestAnimationFrame(() => opportunitySearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpportunitySearchOpen]);

  useEffect(() => {
    if (!isOpportunitiesRoute) setIsOpportunitySearchOpen(false);
  }, [isOpportunitiesRoute]);

  const activatePageCreateAction = () => {
    document
      .querySelector<HTMLButtonElement>("[data-workspace-primary-action]")
      ?.click();
  };
  const contextualAction = (() => {
    if (isOpportunitiesRoute) {
      return {
        label: "Search opportunities",
        Icon: Search,
        onClick: openOpportunitySearch,
      };
    }
    const createPages = [
      { path: "/app/documents", label: t("workspaceCopy.uploadDocument", { defaultValue: "Upload document" }) },
      { path: "/app/cv", label: t("workspaceCopy.newCV", { defaultValue: "New CV" }) },
      { path: "/app/goals", label: t("workspaceCopy.addGoal", { defaultValue: "Add goal" }) },
      { path: "/app/saved-searches", label: t("workspaceCopy.newAlert", { defaultValue: "New alert" }) },
    ];
    const createPage = createPages.find(
      ({ path }) => pathname === path || pathname.startsWith(`${path}/`),
    );
    if (createPage) {
      return {
        label: createPage.label,
        Icon: Plus,
        onClick:
          createPage.path === "/app/cv"
            ? () => window.dispatchEvent(new Event(CV_CREATE_EVENT))
            : activatePageCreateAction,
      };
    }
    if (isCoachRoute) {
      return {
        label: t("coach.new", { defaultValue: "New conversation" }),
        Icon: Plus,
        onClick: () => window.dispatchEvent(new Event(COACH_NEW_CONVERSATION_EVENT)),
      };
    }
    if (isMyPlanOverviewRoute) {
      return {
        label: t("myPlan.exploreOpportunities"),
        Icon: Plus,
        onClick: () => navigate("/app/opportunities"),
      };
    }
    return null;
  })();

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsAccountMenuOpen(false);
      accountButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileMoreOpen) return;
    const trigger = moreButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = moreDialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsMobileMoreOpen(false);
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [
        ...dialog.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keys);
      trigger?.focus();
    };
  }, [isMobileMoreOpen]);

  const goBack = () => {
    if (isMobilePrimaryWorkspaceRoute(pathname)) return;
    const target = getWorkspaceBackTarget(pathname, location.state);
    const origin = location.state?.workspaceBack;
    if (target) navigate(target, { replace: true, state: origin && typeof origin === "object" ? origin.state : undefined });
    else setIsMobileMoreOpen(true);
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      setIsMobileMoreOpen(false);
      setIsAccountMenuOpen(false);
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
        : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
    );

  return (
    <WorkspaceNoticeProvider
      initialBlockingNoticePending={isHomeRoute && Boolean(user?.id)}
    >
      <div
        className={cn("min-h-[100dvh] bg-surface-body text-text-primary")}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {!isCommunityRoute ? (
          <aside
            aria-hidden={isMobileMoreOpen}
            className={cn(
              "fixed inset-y-0 left-0 z-50 hidden border-r transition-[width] duration-300 lg:block",
              isSidebarOpen ? "w-[272px]" : "w-[76px]",
              "border-subtle bg-surface-layer",
            )}
            aria-label="Workspace navigation"
          >
            <div
              className={cn(
                "flex h-full flex-col overflow-y-auto overflow-x-hidden py-4",
                isSidebarOpen ? "px-4" : "px-2",
              )}
            >
              <div
                className={cn(
                  "mb-4 flex items-center border-b border-subtle pb-4",
                  isSidebarOpen ? "justify-between gap-3" : "justify-center",
                )}
              >
                <NavLink
                  to="/dashboard"
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-xl transition",
                    isSidebarOpen ? "px-1" : "justify-center",
                  )}
                  aria-label="Edutu dashboard"
                >
                  <img
                    src="/edutu-logo-mark.png"
                    alt=""
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                  {isSidebarOpen ? (
                    <span className="min-w-0 text-base font-semibold tracking-tight">
                      Edutu
                    </span>
                  ) : null}
                </NavLink>
                {isSidebarOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(false)}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-surface-elevated",
                    )}
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
                  className={cn(
                    "mb-3 flex h-10 w-full items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated",
                  )}
                  aria-label="Open sidebar"
                >
                  <Menu size={18} />
                </button>
              ) : null}

              <nav className="space-y-1" aria-label="Primary workspace pages">
                {primaryWorkspaceNavItems.map((item) => {
                  const Icon = workspaceNavIcons[item.icon];
                  const active = isWorkspaceTabActive(pathname, item);
                  const itemLabel = t(item.label);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      state={item.to === "/app/coach" ? { coachBackground: location } : undefined}
                      title={!isSidebarOpen ? itemLabel : undefined}
                      className={linkClassName(active)}
                      aria-current={
                        active
                          ? pathname === item.to
                            ? "page"
                            : "location"
                          : undefined
                      }
                    >
                      <Icon size={18} className="shrink-0" />
                      {isSidebarOpen ? (
                        <span className="truncate">{itemLabel}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>

              <div className={cn("my-4 h-px bg-surface-elevated")} />

              <div>
                {isSidebarOpen ? (
                  <p
                    className={cn(
                      "px-3 pb-2 text-xs font-semibold text-text-muted",
                    )}
                  >
                    {t("planWorkspace.label")}
                  </p>
                ) : null}
                <nav
                  className="space-y-1"
                  aria-label="Personal workspace pages"
                >
                  {personalWorkspaceNavItems
                    .filter(
                      (item) =>
                        item.to !== "/app/profile" &&
                        item.to !== "/app/settings",
                    )
                    .map((item) => {
                      const Icon = workspaceNavIcons[item.icon];
                      const active = isRouteActive(pathname, item.to);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          state={item.to === "/app/coach" ? { coachBackground: location } : undefined}
                          title={!isSidebarOpen ? t(item.label) : undefined}
                          className={cn(
                            "flex h-10 w-full items-center rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]",
                            isSidebarOpen
                              ? "justify-start gap-3 px-3"
                              : "justify-center px-0",
                            active
                              ? "bg-brand-500/10 text-brand-700"
                              : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                          )}
                          aria-current={active ? "page" : undefined}
                          aria-label={t(item.label)}
                        >
                          <Icon size={17} className="shrink-0 text-brand-500" />
                          {isSidebarOpen ? (
                            <span className="truncate">{t(item.label)}</span>
                          ) : null}
                        </NavLink>
                      );
                    })}
                </nav>
              </div>

              <div className={cn("mt-auto border-t border-subtle pt-4")}>
                {showUpgradeCta ? (
                  isSidebarOpen ? (
                    <NavLink
                      to="/upgrade"
                      className="mb-2 flex h-10 w-full items-center gap-3 rounded-xl bg-brand-500/10 px-3 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-500/20"
                    >
                      <Sparkles size={17} className="shrink-0" />
                      <span className="truncate">
                        {t("navigation.upgradeToPro")}
                      </span>
                    </NavLink>
                  ) : (
                    <NavLink
                      to="/upgrade"
                      title={t("navigation.upgradeToPro")}
                      aria-label={t("navigation.upgradeToPro")}
                      className="mb-2 flex h-10 w-full items-center justify-center rounded-xl bg-brand-500/10 text-brand-700 transition-colors hover:bg-brand-500/20"
                    >
                      <Sparkles size={17} className="shrink-0" />
                    </NavLink>
                  )
                ) : null}
                <div ref={accountMenuRef} className="relative space-y-1.5">
                  {isAccountMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="Account options"
                      className="mb-2 rounded-xl border border-subtle bg-surface-layer p-1.5 shadow-elevated"
                    >
                      <NavLink
                        to="/app/profile"
                        role="menuitem"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                        aria-current={
                          isRouteActive(pathname, "/app/profile")
                            ? "page"
                            : undefined
                        }
                      >
                        <UserCheck size={17} className="text-brand-500" />
                        {t("navigation.profile")}
                      </NavLink>
                      <NavLink
                        to="/app/settings"
                        role="menuitem"
                        onClick={() => setIsAccountMenuOpen(false)}
                        className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                        aria-current={
                          isRouteActive(pathname, "/app/settings")
                            ? "page"
                            : undefined
                        }
                      >
                        <Settings size={17} className="text-brand-500" />
                        {t("navigation.settings")}
                      </NavLink>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleSignOut()}
                        disabled={isSigningOut}
                        className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <LogOut size={17} />
                        {isSigningOut
                          ? t("navigation.signingOut")
                          : t("navigation.logOut")}
                      </button>
                    </div>
                  ) : null}

                  <NavLink
                    to="/app/notifications"
                    state={{ workspaceBack: { pathname, search: location.search, hash: location.hash, state: location.state } }}
                    aria-label={
                      unreadCount > 0
                        ? `Notifications, ${unreadCount} unread`
                        : "Notifications"
                    }
                    className={({ isActive }) =>
                      cn(
                        "relative flex h-10 w-full items-center rounded-xl text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                        isSidebarOpen ? "gap-3 px-3" : "justify-center",
                        isActive
                          ? "bg-brand-500/10 text-brand-700"
                          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                      )
                    }
                  >
                    <Bell size={17} className="shrink-0" />
                    {isSidebarOpen ? <span>Notifications</span> : null}
                    {unreadCount > 0 ? (
                      <span
                        className="absolute right-2 top-1 flex min-w-[16px] items-center justify-center rounded-full border-2 border-surface-layer bg-danger px-1 text-2xs font-semibold leading-none text-white"
                        aria-hidden="true"
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </NavLink>

                  <button
                    ref={accountButtonRef}
                    type="button"
                    onClick={() => {
                      if (!isSidebarOpen) setIsSidebarOpen(true);
                      setIsAccountMenuOpen((open) => !open);
                    }}
                    aria-label={`Account options for ${displayName}`}
                    aria-haspopup="menu"
                    aria-expanded={isAccountMenuOpen}
                    className={cn(
                      "flex h-12 w-full items-center rounded-xl text-left transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      isSidebarOpen ? "gap-3 px-1.5" : "justify-center",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
                      {initials}
                    </span>
                    {isSidebarOpen ? (
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                          <span className="truncate">{displayName}</span>
                          {isPro ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-2xs font-semibold uppercase leading-none tracking-wide text-brand-700">
                              <Sparkles size={9} aria-hidden="true" />
                              Pro
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs leading-5 text-text-muted">
                          {displayEmail}
                        </span>
                      </span>
                    ) : null}
                    {isSidebarOpen ? (
                      <ChevronUp
                        size={16}
                        className={cn(
                          "shrink-0 text-text-muted transition-transform",
                          isAccountMenuOpen ? "rotate-180" : "",
                        )}
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <div
          aria-hidden={isMobileMoreOpen}
          className={cn(
            "min-w-0 transition-[padding] duration-300 lg:pb-0 lg:pt-0",
            isCommunityRoute
              ? "pb-0 pt-0 lg:pl-0"
              : "pt-[calc(4rem+env(safe-area-inset-top))]",
            !isCommunityRoute && isOpportunityDetailRoute
              ? "pb-[calc(6.75rem+env(safe-area-inset-bottom))]"
              : showMobileBottomNav
                ? "pb-[calc(5rem+env(safe-area-inset-bottom))]"
                : !isCommunityRoute
                  ? "pb-4"
                : null,
            !isCommunityRoute &&
              (isSidebarOpen ? "lg:pl-[272px]" : "lg:pl-[76px]"),
          )}
        >
          {!isCommunityRoute ? (
            <header
              className={cn(
                "fixed inset-x-0 top-0 z-50 border-b border-subtle bg-surface-layer/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden",
              )}
            >
              <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {!isMobilePrimaryWorkspaceRoute(pathname) ? (
                    <button
                      type="button"
                      onClick={goBack}
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated",
                      )}
                      aria-label="Go back"
                    >
                      <ChevronLeft size={22} />
                    </button>
                  ) : null}
                  {isHomeRoute || isOpportunitiesRoute ? (
                    <img
                      src="/edutu-logo-mark.png"
                      alt=""
                      aria-hidden="true"
                      className="h-8 w-8 shrink-0 object-contain"
                    />
                  ) : null}
                  <h1 className="m-0 min-w-0 truncate text-xl font-semibold leading-6 tracking-tight text-text-primary">
                    {workspaceTitle}
                  </h1>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isCoachRoute ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(
                            new Event(COACH_NEW_CONVERSATION_EVENT),
                          )
                        }
                        aria-label={t("coach.new", {
                          defaultValue: "New conversation",
                        })}
                        title={t("coach.new", {
                          defaultValue: "New conversation",
                        })}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      >
                        <Plus size={21} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(
                            new Event(COACH_OPEN_HISTORY_EVENT),
                          )
                        }
                        aria-label={t("coachPage.history", {
                          defaultValue: "Conversation history",
                        })}
                        title={t("coachPage.history", {
                          defaultValue: "History",
                        })}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      >
                        <History size={20} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <>
                      <NavLink
                        to="/app/notifications"
                        state={{ workspaceBack: { pathname, search: location.search, hash: location.hash, state: location.state } }}
                        aria-label={
                          unreadCount > 0
                            ? `Notifications, ${unreadCount} unread`
                            : "Notifications"
                        }
                        className={({ isActive }) =>
                          cn(
                            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
                            isActive
                              ? "bg-brand/10 text-brand"
                              : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                          )
                        }
                      >
                        <Bell size={20} />
                        {unreadCount > 0 ? (
                          <span
                            className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full border-2 border-surface-layer bg-danger px-1 text-2xs font-semibold leading-none text-white"
                            aria-hidden="true"
                          >
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        ) : null}
                      </NavLink>
                      {!showMobileBottomNav ? (
                        <button
                          ref={moreButtonRef}
                          type="button"
                          onClick={() => setIsMobileMoreOpen(true)}
                          aria-label="Open more workspace pages"
                          aria-expanded={isMobileMoreOpen}
                          aria-haspopup="dialog"
                          className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                        >
                          <Menu size={22} aria-hidden="true" />
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </header>
          ) : null}
          <OfflineBanner />

          <div className="min-w-0">{children}</div>
        </div>

        {isMobileMoreOpen ? (
          <div
            ref={moreDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-workspace-menu-title"
            className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-surface-body text-text-primary lg:hidden"
          >
            <div
              className={cn(
                "sticky top-0 z-10 border-b border-subtle bg-surface-layer/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl",
              )}
            >
              <div className="flex min-h-16 items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileMoreOpen(false)}
                  className="flex h-11 w-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  aria-label="Close menu"
                >
                  <ArrowLeft size={21} strokeWidth={1.8} />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 id="mobile-workspace-menu-title" className="truncate text-lg font-semibold tracking-tight">
                    {t("navigation.more", { defaultValue: "More" })}
                  </h2>
                  <p className="truncate text-[11px] leading-4 text-text-muted sm:text-xs">Your plan, tools, and account</p>
                </div>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5">
              <NavLink
                to="/app/profile"
                state={{ workspaceBack: "menu" }}
                onClick={() => setIsMobileMoreOpen(false)}
                className="group flex min-h-[76px] items-center gap-3 rounded-[18px] border border-brand/15 bg-brand/5 p-3.5 transition hover:bg-brand/10 active:scale-[0.99]"
                aria-current={isRouteActive(pathname, "/app/profile") ? "page" : undefined}
              >
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-sm font-semibold text-white">
                  <span>{initials}</span>
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text-primary">
                    {displayName}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-text-muted">
                    {displayEmail}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-brand" />
              </NavLink>

              <section aria-labelledby="more-plan-heading">
                <div className="mb-3">
                    <h3 id="more-plan-heading" className="font-display text-lg font-semibold tracking-tight text-text-primary">My Plan</h3>
                    <p className="mt-0.5 text-sm text-text-muted">Jump to a stage in your opportunity journey.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {planStageShortcuts.map(({ stage, label, icon: Icon, iconClass }) => (
                    <NavLink
                      key={stage}
                      to={`/app/my-plan/stage/${stage}`}
                      state={{ workspaceBack: "menu" }}
                      onClick={() => setIsMobileMoreOpen(false)}
                      className={cn(
                        "flex min-h-[52px] min-w-0 items-center gap-2 rounded-xl border px-2.5 text-xs font-semibold text-text-secondary transition hover:border-brand/25 hover:text-brand active:scale-[0.99]",
                        planStageStyles[stage],
                      )}
                    >
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconClass)}>
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">{t(`myPlan.stages.${stage}`, { defaultValue: label })}</span>
                      <ChevronRight size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
                    </NavLink>
                  ))}
                </div>
              </section>

              {moreNavGroups.map((group) => {
                const isAccountGroup = group.label === "Account";
                return (
                  <section key={group.label} aria-labelledby={`more-${group.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
                    <h3 id={`more-${group.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} className="mb-3 px-0.5 text-sm font-semibold text-text-primary">
                      {group.label}
                    </h3>
                    <div className={isAccountGroup ? "flex flex-col" : "grid grid-cols-2 gap-2"}>
                    {group.items.map((item) => {
                    const Icon = workspaceNavIcons[item.icon];
                    const active = isRouteActive(pathname, item.to, item.exact);
                    const style = moreShortcutStyles[item.icon];
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        state={item.to === "/app/coach" ? { coachBackground: location } : { workspaceBack: "menu" }}
                        onClick={() => setIsMobileMoreOpen(false)}
                        className={cn(
                          isAccountGroup
                            ? "flex min-h-14 min-w-0 items-center gap-3 border-b border-subtle px-2 py-3 text-left text-text-primary transition hover:text-brand active:scale-[0.99] last:border-b-0"
                            : "flex min-h-[76px] min-w-0 items-center gap-2.5 rounded-xl border p-3 text-left text-text-secondary transition hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.99]",
                          !isAccountGroup && (style?.card ?? "border-subtle bg-surface-layer"),
                          active && (isAccountGroup ? "text-brand" : (style?.active ?? "border-brand/30 bg-brand/5 text-brand")),
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <span className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          isAccountGroup ? "text-text-secondary" : (style?.icon ?? "bg-brand/10 text-brand"),
                        )}>
                          <Icon size={18} />
                        </span>
                        <span className={cn("min-w-0 flex-1 font-semibold leading-tight", isAccountGroup ? "text-sm" : "line-clamp-2 text-[13px]")}>
                          {item.icon === "documents"
                            ? t("navigation.documentShort", { defaultValue: "Document" })
                            : item.icon === "alerts"
                              ? t("navigation.alertsShort", { defaultValue: "Alerts" })
                              : t(item.label)}
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-text-muted" />
                      </NavLink>
                    );
                    })}
                    </div>
                  </section>
                );
              })}

              <div className="border-t border-subtle pt-4">
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={isSigningOut}
                  className="flex min-h-12 w-full items-center justify-between rounded-xl px-2 text-sm font-semibold text-danger transition hover:bg-danger/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center gap-2.5">
                    <LogOut size={18} />
                    {isSigningOut
                      ? t("navigation.signingOut")
                      : t("navigation.logOut")}
                  </span>
                  <ChevronRight size={16} className="text-danger/60" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showMobileBottomNav && !isOpportunityDetailRoute ? (
          // The More sheet owns focus while open.
          <div
            data-keyboard-hide={!isOpportunitySearchOpen ? "" : undefined}
            data-keyboard-avoid={isOpportunitySearchOpen ? "" : undefined}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden"
          >
            <nav
              className={cn(
                cn("pointer-events-auto mx-auto flex max-w-md items-center gap-2", isOpportunitySearchOpen && "justify-end"),
              )}
              aria-hidden={isMobileMoreOpen}
              aria-label="Mobile app navigation"
            >
              {!isOpportunitySearchOpen ? <LiquidGlass className="workspace-nav-glass min-w-0 flex-1" radius={36} strength={18} blur={10} tint={20} chroma={0.15} mode="frost">
              <div className="ps-glass__content grid min-w-0 grid-cols-3 p-1.5">
                {mobilePrimaryWorkspaceNavItems
                  .filter((item) => item.icon !== "coach")
                  .map((item) => {
                  const Icon = workspaceNavIcons[item.icon];
                  const active = isWorkspaceTabActive(pathname, item);
                  const itemLabel = t(item.label);
                  const mobileLabel = t(item.mobileLabel ?? item.label);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-label={itemLabel}
                      className={cn(
                        "relative flex h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] leading-none font-semibold tracking-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 active:scale-[0.97]",
                        active
                          ? "bg-brand/10 text-brand-700 dark:bg-brand/20 dark:text-brand-500"
                          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                      )}
                      aria-current={
                        active
                          ? pathname === item.to
                            ? "page"
                            : "location"
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "flex h-6 w-8 items-center justify-center rounded-full",
                        )}
                        aria-hidden="true"
                      >
                        <Icon size={22} strokeWidth={active ? 2.3 : 1.8} />
                      </span>
                      <span className="max-w-full truncate">{mobileLabel}</span>
                    </Link>
                  );
                  })}
                <button
                  ref={moreButtonRef}
                  type="button"
                  onClick={() => setIsMobileMoreOpen(true)}
                  aria-label={t("navigation.more", { defaultValue: "More" })}
                  aria-expanded={isMobileMoreOpen}
                  aria-haspopup="dialog"
                  className={cn(
                    "relative flex h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-[11px] font-semibold leading-none tracking-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 active:scale-[0.97]",
                    isMobileMoreOpen || !isMobilePrimaryWorkspaceRoute(pathname)
                      ? "bg-brand/10 text-brand-700 dark:bg-brand/20 dark:text-brand-500"
                      : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
                  )}
                >
                  <span className="flex h-6 w-8 items-center justify-center rounded-full" aria-hidden="true">
                    <Menu size={22} strokeWidth={isMobileMoreOpen || !isMobilePrimaryWorkspaceRoute(pathname) ? 2.3 : 1.8} />
                  </span>
                  <span className="max-w-full truncate">{t("navigation.more", { defaultValue: "More" })}</span>
                </button>
              </div>
              </LiquidGlass> : null}
              <LiquidGlass
                className={cn("workspace-nav-glass workspace-nav-glass--action h-[60px] shrink-0 overflow-hidden", isOpportunitySearchOpen ? "w-full" : "w-[60px]")}
                style={{ width: isOpportunitySearchOpen ? "min(420px, calc(100vw - 24px))" : 60, transition: "width 360ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                radius={30} strength={16} blur={8} tint={12} chroma={0.15} mode="frost"
              >
              <div className="ps-glass__content h-full">
              {isOpportunitySearchOpen ? (
                <form
                  role="search"
                  onSubmit={(event) => event.preventDefault()}
                  className="flex h-full min-w-0 items-center gap-1.5 px-3"
                >
                  <Search size={20} className="shrink-0 text-white/90" aria-hidden="true" />
                  <label className="sr-only" htmlFor="glass-opportunity-search">Search opportunities</label>
                  <input
                    ref={opportunitySearchInputRef}
                    id="glass-opportunity-search"
                    type="search"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    value={opportunitySearchDraft}
                    onChange={(event) => updateOpportunitySearch(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") setIsOpportunitySearchOpen(false); }}
                    placeholder="Search opportunities"
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/70 [color-scheme:dark]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      opportunitySearchInputRef.current?.blur();
                      window.dispatchEvent(new Event(OPEN_OPPORTUNITY_FILTERS_EVENT));
                    }}
                    aria-label="Filter opportunities"
                    className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <SlidersHorizontal size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpportunitySearchOpen(false)}
                    aria-label="Close search"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </form>
              ) : contextualAction ? (
                <button
                  type="button"
                  onClick={contextualAction.onClick}
                  aria-label={contextualAction.label}
                  title={contextualAction.label}
                  className="flex h-[60px] w-[60px] items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                >
                  <contextualAction.Icon size={28} strokeWidth={2.2} aria-hidden="true" />
                </button>
              ) : mobilePrimaryWorkspaceNavItems
                .filter((item) => item.icon === "coach")
                .map((item) => {
                  const active = isWorkspaceTabActive(pathname, item);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-label={t(item.label)}
                      title={t(item.label)}
                      state={{ coachBackground: location }}
                      aria-current={active ? (pathname === item.to ? "page" : "location") : undefined}
                      className={cn(
                        "flex h-[60px] w-[60px] items-center justify-center rounded-full text-white transition hover:bg-white/10 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                        active && "bg-white/10",
                      )}
                    >
                      <AiSparkGlyph size={28} color="#FFFFFF" filled />
                    </Link>
                  );
                })}
              </div>
              </LiquidGlass>
            </nav>
          </div>
        ) : null}

        {!isCommunityRoute && SHOW_COMMUNITY_ANNOUNCEMENT ? (
          <CommunityAnnouncement />
        ) : null}
      </div>
    </WorkspaceNoticeProvider>
  );
}
