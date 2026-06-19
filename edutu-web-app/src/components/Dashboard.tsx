import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Bell,
  Bookmark,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  LayoutGrid,
  List,
  Menu,
  Send,
  Settings,
  Sparkles,
  X,
  UserCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { EmptyState } from "./ui/EmptyState";
import NotificationInbox from "./NotificationInbox";
import CalendarStrip from "./CalendarStrip";
import MemberSettingsPanel from "./MemberSettingsPanel";
import type { CalendarEvent } from "./CalendarStrip";
import { useDarkMode } from "../hooks/useDarkMode";
import { useAnalytics } from "../hooks/useAnalytics";
import { useOpportunities } from "../hooks/useOpportunities";
import { usePersonalizedOpportunities } from "../hooks/usePersonalizedOpportunities";
import { useNotifications } from "../hooks/useNotifications";
import type { AppUser } from "../types/user";
import type { OnboardingProfileData } from "../types/onboarding";
import { getBookmarks } from "../services/bookmarks";
import { getApplications } from "../services/applications";
import { getDeadlines, type Deadline } from "../services/deadlines";
import { fetchBackendProfile } from "../services/profile";
import ImageWithFallback from "./ImageWithFallback";

const HOME_FEED_BATCH_SIZE = 8;
const HOME_FEED_PROMO_INTERVAL = 6;

interface DashboardProps {
  user: AppUser | null;
  onOpportunityClick: (opportunity: any) => void;
  onViewAllOpportunities: () => void;
  onNavigate?: (screen: string) => void;
  onboardingProfile?: OnboardingProfileData | null;
  onRedoOnboarding?: () => void;
  embeddedDesktopShell?: boolean;
}

type DashboardPanel =
  | "saved"
  | "applied"
  | "deadlines"
  | "profile"
  | "settings";

const PANEL_COPY: Record<DashboardPanel, { title: string; subtitle: string }> =
  {
    saved: {
      title: "Saved opportunities",
      subtitle: "Your shortlist and the next items worth reviewing.",
    },
    applied: {
      title: "Applications",
      subtitle: "Applications you are tracking from Edutu.",
    },
    deadlines: {
      title: "Deadlines",
      subtitle: "Upcoming opportunity, application, and goal dates in one place.",
    },
    profile: {
      title: "Profile match quality",
      subtitle: "The details Edutu uses to improve your recommendations.",
    },
    settings: {
      title: "Dashboard settings",
      subtitle: "Small controls that affect this workspace.",
    },
  };

export interface DashboardRef {
  refreshOpportunities: () => void;
}

const Dashboard = React.forwardRef<DashboardRef, DashboardProps>(
  function Dashboard(
    {
      user,
      onOpportunityClick,
      onViewAllOpportunities,
      onNavigate,
      onboardingProfile,
      embeddedDesktopShell = false,
    },
    ref,
  ) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
      if (typeof window === "undefined") return true;
      return window.innerWidth >= 1280;
    });
    const [activePanel, setActivePanel] = useState<DashboardPanel | null>(null);
    const [dismissBanner, setDismissBanner] = useState(false);
    const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
    const [homeFeedLimit, setHomeFeedLimit] = useState(HOME_FEED_BATCH_SIZE);
    const { isDarkMode } = useDarkMode();
    const { getToken } = useClerkAuth();
    const opportunitiesRefreshRef = useRef<() => void>();
    const homeFeedSentinelRef = useRef<HTMLDivElement | null>(null);
    const sidebarPreferenceRef = useRef(false);
    const [bookmarks, setBookmarks] = useState<any[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [dashboardDeadlines, setDashboardDeadlines] = useState<Deadline[]>(
      [],
    );
    const [profileScore, setProfileScore] = useState<{
      score: number;
      missingFields: string[];
      isMatchEnabled: boolean;
    } | null>(null);

    const { stats: analyticsStats } = useAnalytics();
    const { unreadCount } = useNotifications();

    const opportunities = useOpportunities();
    const personalized = usePersonalizedOpportunities();
    const {
      data: opportunityFeed,
      loading: opportunitiesLoading,
      refresh: hookRefreshOpportunities,
    } = onboardingProfile ? personalized : opportunities;

    useEffect(() => {
      opportunitiesRefreshRef.current = hookRefreshOpportunities;
    }, [hookRefreshOpportunities]);

    useEffect(() => {
      if (embeddedDesktopShell) {
        return;
      }

      const mediaQuery = window.matchMedia("(min-width: 1280px)");
      const syncSidebarToViewport = () => {
        if (!sidebarPreferenceRef.current) {
          setIsDesktopSidebarOpen(mediaQuery.matches);
        }
      };

      syncSidebarToViewport();
      mediaQuery.addEventListener("change", syncSidebarToViewport);
      return () =>
        mediaQuery.removeEventListener("change", syncSidebarToViewport);
    }, [embeddedDesktopShell]);

    useEffect(() => {
      if (!user?.id) {
        return;
      }
      const userId = user.id;

      async function loadProfileData() {
        try {
          const token = await getToken().catch(() => null);
          if (!token) return;
          const profile = await fetchBackendProfile(token);
          const percent = profile.completeness?.percent ?? 0;
          setProfileScore({
            score: percent,
            missingFields:
              profile.completeness?.missing.map((field) => field.label) ?? [],
            isMatchEnabled: percent >= 60,
          });
        } catch (e) {
          console.error("Failed to load profile completeness:", e);
        }
      }

      loadProfileData();
    }, [getToken, user?.id]);

    useEffect(() => {
      if (!user?.id) return;
      const userId = user.id;
      let isMounted = true;

      async function loadDeadlines() {
        try {
          const token = await getToken().catch(() => null);
          const [bookmarksData, appsData] = await Promise.all([
            getBookmarks(userId, token),
            getApplications(userId, token),
          ]);
          const deadlinesData = token
            ? await getDeadlines(userId, token)
            : { groups: [], summary: { total: 0, overdue: 0, urgent: 0, soon: 0, thisWeek: 0, critical: 0 } };
          if (isMounted) {
            setBookmarks(bookmarksData);
            setApplications(appsData);
            setDashboardDeadlines(
              deadlinesData.groups.flatMap((group) => group.deadlines),
            );
          }
        } catch (e) {
          console.error("Failed to load deadlines:", e);
        }
      }

      loadDeadlines();
      return () => {
        isMounted = false;
      };
    }, [getToken, user?.id]);

    const normalizedOpportunityFeed = useMemo(() => {
      if (!Array.isArray(opportunityFeed)) return [];
      return opportunityFeed
        .map((item: any) =>
          item && typeof item === "object" && "opportunity" in item
            ? item.opportunity
            : item,
        )
        .filter(Boolean);
    }, [opportunityFeed]);

    const visibleHomeOpportunities = useMemo(
      () => normalizedOpportunityFeed.slice(0, homeFeedLimit),
      [normalizedOpportunityFeed, homeFeedLimit],
    );

    const mobilePersonalizedOpportunities = useMemo(
      () => visibleHomeOpportunities.slice(0, 6),
      [visibleHomeOpportunities],
    );

    const mobileExploreOpportunities = useMemo(
      () => visibleHomeOpportunities.slice(2, Math.max(homeFeedLimit, 10)),
      [homeFeedLimit, visibleHomeOpportunities],
    );

    const homePromos = useMemo(
      () => [
        {
          title: "Track deadlines",
          copy: "Keep upcoming application dates visible before they slip past.",
          action: "Open tracker",
          screen: "deadlines",
        },
        {
          title: "Improve your matches",
          copy: "Complete your profile so Edutu can rank opportunities better.",
          action: "Review profile",
          screen: "profile",
        },
        {
          title: "Review your shortlist",
          copy: "Use saved items as a working list instead of hunting from scratch.",
          action: "Open saved",
          screen: "saved",
        },
      ],
      [],
    );

    const homeFeedItems = useMemo(() => {
      const items: Array<
        | { type: "opportunity"; key: string; opportunity: any }
        | { type: "promo"; key: string; promo: (typeof homePromos)[number] }
      > = [];

      visibleHomeOpportunities.forEach((opportunity: any, index) => {
        items.push({
          type: "opportunity",
          key: opportunity?.id
            ? `opportunity-${opportunity.id}`
            : `opportunity-${index}`,
          opportunity,
        });

        if ((index + 1) % HOME_FEED_PROMO_INTERVAL === 0) {
          items.push({
            type: "promo",
            key: `promo-${index}`,
            promo:
              homePromos[
                Math.floor(index / HOME_FEED_PROMO_INTERVAL) % homePromos.length
              ],
          });
        }
      });

      return items;
    }, [homePromos, visibleHomeOpportunities]);

    useEffect(() => {
      setHomeFeedLimit(HOME_FEED_BATCH_SIZE);
    }, [normalizedOpportunityFeed.length]);

    useEffect(() => {
      const sentinel = homeFeedSentinelRef.current;
      if (!sentinel || opportunitiesLoading) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (!entry.isIntersecting) return;

          setHomeFeedLimit((current) => {
            if (current >= normalizedOpportunityFeed.length) return current;
            return Math.min(
              current + HOME_FEED_BATCH_SIZE,
              normalizedOpportunityFeed.length,
            );
          });
        },
        { rootMargin: "420px 0px" },
      );

      observer.observe(sentinel);

      return () => observer.disconnect();
    }, [normalizedOpportunityFeed.length, opportunitiesLoading]);

    const formatUpdatedAt = (updatedAt: string) => {
      const diff = Date.now() - new Date(updatedAt).getTime();
      const mins = Math.floor(diff / (1000 * 60));
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return new Date(updatedAt).toLocaleDateString();
    };

    const upcomingDeadline = useMemo(() => {
      const upcoming = dashboardDeadlines
        .filter((item) => !Number.isNaN(new Date(item.deadline).getTime()))
        .sort((a, b) => a.daysUntil - b.daysUntil);

      if (upcoming.length === 0) {
        return null;
      }

      const nextItem = upcoming[0];

      return {
        id: nextItem.id,
        title: nextItem.title,
        date: nextItem.deadline,
        daysUntil: nextItem.daysUntil,
        type: nextItem.type,
        sourceId: nextItem.sourceId,
      };
    }, [dashboardDeadlines]);

    const menuItems = [
      { id: "home", label: "Home", icon: <LayoutGrid size={18} /> },
      {
        id: "opportunities",
        label: "Opportunities",
        icon: <Briefcase size={18} />,
      },
      { id: "saved", label: "Saved", icon: <Bookmark size={18} /> },
      { id: "applied", label: "Applications", icon: <Send size={18} /> },
      { id: "deadlines", label: "Deadlines", icon: <Calendar size={18} /> },
      { id: "profile", label: "Profile", icon: <UserCheck size={18} /> },
      { id: "settings", label: "Settings", icon: <Settings size={18} /> },
    ];

    const desktopPrimaryItems = [
      { id: "home", label: "Home", icon: <LayoutGrid size={18} /> },
      {
        id: "opportunities",
        label: "Opportunities",
        icon: <Briefcase size={18} />,
      },
      { id: "deadlines", label: "Deadlines", icon: <Calendar size={18} /> },
    ];

    const desktopPanelItems = [
      {
        id: "saved",
        label: "Saved",
        icon: <Bookmark size={17} />,
        count: bookmarks.length,
      },
      {
        id: "applied",
        label: "Applied",
        icon: <Send size={17} />,
        count: applications.length,
      },
      {
        id: "profile",
        label: "Profile",
        icon: <UserCheck size={17} />,
        count: profileScore?.score,
      },
      { id: "settings", label: "Settings", icon: <Settings size={17} /> },
    ];

    const mobileNavItems = [
      { id: "home", label: "Home", icon: <LayoutGrid size={20} /> },
      { id: "opportunities", label: "Explore", icon: <Briefcase size={20} /> },
      { id: "deadlines", label: "Dates", icon: <Calendar size={20} /> },
      { id: "more", label: "More", icon: <Menu size={20} /> },
    ];

    const stats = useMemo(() => {
      return [
        {
          label: "Opportunities explored",
          value: analyticsStats.opportunitiesExplored.toString(),
        },
        {
          label: "Saved opportunities",
          value: bookmarks.length.toString(),
        },
        {
          label: "Applications tracked",
          value: applications.length.toString(),
        },
        {
          label: "Next deadline",
          value: upcomingDeadline
            ? new Date(upcomingDeadline.date).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "None",
        },
      ];
    }, [
      analyticsStats.opportunitiesExplored,
      applications.length,
      bookmarks.length,
      upcomingDeadline,
    ]);

    const recentActivity = useMemo(() => {
      const savedItems = bookmarks.slice(0, 3).map((bookmark) => ({
        id: `bookmark-${bookmark.id}`,
        title: `Saved ${bookmark.opportunity_title}`,
        date: formatUpdatedAt(bookmark.created_at),
        timestamp: new Date(bookmark.created_at).getTime(),
        icon: <Bookmark size={16} />,
      }));

      const applicationItems = applications.slice(0, 3).map((application) => ({
        id: `application-${application.id}`,
        title: `Tracked ${application.opportunity_title}`,
        date: formatUpdatedAt(application.applied_at),
        timestamp: new Date(application.applied_at).getTime(),
        icon: <Send size={16} />,
      }));

      return [...savedItems, ...applicationItems]
        .filter((item) => Number.isFinite(item.timestamp))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5);
    }, [applications, bookmarks]);

    function openDashboardDestination(id: string) {
      setShowMobileMenu(false);

      if (id === "home") {
        setActivePanel(null);
        return;
      }

      if (id === "opportunities") {
        setActivePanel(null);
        onViewAllOpportunities();
        return;
      }

      if (id === "notifications") {
        setShowNotifications(true);
        return;
      }

      if (
        id === "deadlines"
      ) {
        setActivePanel(null);
        onNavigate?.(id);
        return;
      }

      if (
        id === "saved" ||
        id === "applied" ||
        id === "profile"
      ) {
        setActivePanel(null);
        onNavigate?.(id);
        return;
      }

      if (id === "settings") {
        setActivePanel(id);
        return;
      }

      onNavigate?.(id);
    }

    const handleMenuItemClick = (id: string) => {
      openDashboardDestination(id);
    };

    const handleCalendarEventClick = (event: CalendarEvent) => {
      if (event.type === "goal") {
        setActivePanel("deadlines");
        return;
      }

      if (event.sourceId) {
        onOpportunityClick({ id: event.sourceId, title: event.title });
        return;
      }

      if (event.type === "bookmark") {
        const bookmark = bookmarks.find((item) => item.id === event.id);
        if (bookmark?.opportunity_id) {
          onOpportunityClick({
            id: bookmark.opportunity_id,
            title: bookmark.opportunity_title,
            category: bookmark.opportunity_category,
          });
          return;
        }
        setActivePanel("saved");
        return;
      }

      const application = applications.find((item) => item.id === event.id);
      if (application?.opportunity_id) {
        onOpportunityClick({
          id: application.opportunity_id,
          title: application.opportunity_title,
          category: application.opportunity_category,
        });
        return;
      }
      setActivePanel("applied");
    };

    const deadlineItems = useMemo(() => {
      return dashboardDeadlines
        .map((deadline) => ({
          id: deadline.id,
          sourceId: deadline.sourceId,
          type: deadline.type,
          title: deadline.title,
          category: deadline.category,
          date: deadline.deadline,
          daysUntil: deadline.daysUntil,
        }))
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 8);
    }, [dashboardDeadlines]);

    const formatPanelDate = (date?: string | null) => {
      if (!date) return "No date";
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) return "No date";
      return parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    const openPanelOpportunity = (opportunity: {
      id?: string;
      title?: string;
      category?: string;
    }) => {
      if (!opportunity.id) return;
      setActivePanel(null);
      onOpportunityClick(opportunity);
    };

    const panelEmpty = (
      title: string,
      copy: string,
      actionLabel: string,
      onClick: () => void,
    ) => (
      <div
        className={`rounded-2xl border p-5 text-center ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl ${isDarkMode ? "bg-white/10 text-slate-300" : "bg-white text-slate-500"}`}
        >
          <Briefcase size={20} />
        </div>
        <h3 className="mt-4 text-sm font-black text-slate-950 dark:text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {copy}
        </p>
        <button
          type="button"
          onClick={onClick}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600"
        >
          {actionLabel}
        </button>
      </div>
    );

    const renderDashboardPanel = () => {
      if (!activePanel) return null;

      if (activePanel === "saved") {
        if (bookmarks.length === 0) {
          return panelEmpty(
            "No saved opportunities yet",
            "Save opportunities from the feed and they will appear here as your working shortlist.",
            "Browse opportunities",
            onViewAllOpportunities,
          );
        }

        return (
          <div className="space-y-3">
            {bookmarks.slice(0, 10).map((bookmark) => (
              <button
                key={bookmark.id}
                type="button"
                onClick={() =>
                  openPanelOpportunity({
                    id: bookmark.opportunity_id,
                    title: bookmark.opportunity_title,
                    category: bookmark.opportunity_category,
                  })
                }
                className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${isDarkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:shadow-sm"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black leading-5 text-slate-950 dark:text-white">
                      {bookmark.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {bookmark.opportunity_category || "Opportunity"}
                    </p>
                  </div>
                  <ChevronRight
                    size={17}
                    className="mt-1 shrink-0 text-slate-400"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <Calendar size={14} />
                  {formatPanelDate(bookmark.opportunity_deadline)}
                </div>
              </button>
            ))}
          </div>
        );
      }

      if (activePanel === "applied") {
        if (applications.length === 0) {
          return panelEmpty(
            "No tracked applications",
            "When you apply from an opportunity page, Edutu will keep the application visible here.",
            "Find an opportunity",
            onViewAllOpportunities,
          );
        }

        return (
          <div className="space-y-3">
            {applications.slice(0, 10).map((application) => (
              <button
                key={application.id}
                type="button"
                onClick={() =>
                  openPanelOpportunity({
                    id: application.opportunity_id,
                    title: application.opportunity_title,
                    category: application.opportunity_category,
                  })
                }
                className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${isDarkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:shadow-sm"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black leading-5 text-slate-950 dark:text-white">
                      {application.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold capitalize text-slate-500 dark:text-slate-400">
                      {application.status || "tracked"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-black text-emerald-600 dark:text-emerald-300">
                    Applied
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <Clock size={14} />
                  {formatPanelDate(application.applied_at)}
                </div>
              </button>
            ))}
          </div>
        );
      }

      if (activePanel === "deadlines") {
        if (deadlineItems.length === 0) {
          return panelEmpty(
            "No deadlines yet",
            "Save opportunities with deadlines and this panel becomes your planning list.",
            "Browse opportunities",
            onViewAllOpportunities,
          );
        }

        return (
          <div className="space-y-3">
            {deadlineItems.map(
              (item) =>
                item && (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.type === "goal") {
                        setActivePanel("deadlines");
                        return;
                      }

                      if (item.sourceId) {
                        openPanelOpportunity({
                          id: item.sourceId,
                          title: item.title,
                          category: item.category,
                        });
                      }
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${isDarkMode ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:shadow-sm"}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          item.daysUntil < 0
                            ? "bg-rose-500/10 text-rose-500"
                            : item.daysUntil <= 7
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-brand-500/10 text-brand-600 dark:text-brand-300"
                        }`}
                      >
                        <Calendar size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black leading-5 text-slate-950 dark:text-white">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {formatPanelDate(item.date)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {item.daysUntil < 0
                          ? "Past"
                          : item.daysUntil === 0
                            ? "Today"
                            : `${item.daysUntil}d`}
                      </span>
                    </div>
                  </button>
                ),
            )}
          </div>
        );
      }

      if (activePanel === "profile") {
        const score = profileScore?.score ?? 0;
        return (
          <div className="space-y-4">
            <div
              className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-base font-black text-white">
                  {(user?.name || user?.email || "E").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {user?.name || "Edutu learner"}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {user?.email || "Signed in member"}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Match readiness
                </p>
                <span className="text-sm font-black text-brand-600 dark:text-brand-300">
                  {score}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {score >= 60
                  ? "Your profile has enough detail for ranked recommendations."
                  : "Add the missing details below so recommendations are less generic."}
              </p>
            </div>

            {profileScore?.missingFields?.length ? (
              <div
                className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
              >
                <p className="text-sm font-black text-slate-950 dark:text-white">
                  Missing details
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profileScore.missingFields.map((field) => (
                    <span
                      key={field}
                      className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={onViewAllOpportunities}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-black text-white transition hover:bg-brand-600"
            >
              Browse matched opportunities
            </button>
          </div>
        );
      }

      return (
        <MemberSettingsPanel
          onOpenNotifications={() => openDashboardDestination("notifications")}
        />
      );
    };

    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-950 text-white" : "bg-slate-50 text-slate-900"} font-body transition-colors duration-500 overflow-x-hidden ${embeddedDesktopShell ? "pb-0 pt-0 lg:pb-12" : "pb-[calc(5rem+env(safe-area-inset-bottom))] pt-14 md:pt-16 lg:pb-12"}`}
      >
        {/* Background Mesh Gradient */}
        <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20 mesh-gradient" />

        {/* Header */}
        <header
          className={`fixed inset-x-0 top-0 z-50 backdrop-blur-xl border-b transition-all duration-300 ${embeddedDesktopShell ? "hidden" : ""} ${
            isDarkMode
              ? "bg-gray-950/95 border-white/5"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14 md:h-16">
              {/* Logo - No background color */}
              <div className="flex items-center gap-2 md:gap-3">
                <img
                  src="/edutu-logo.png"
                  alt="Edutu Logo"
                  className="h-8 w-8 md:h-10 md:w-10 object-contain"
                />
                <span
                  className={`text-xl md:text-2xl font-display font-bold tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}
                >
                  Edutu
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Notification Button */}
                <button
                  type="button"
                  onClick={() => setShowNotifications(true)}
                  className={`relative p-2.5 rounded-xl border transition-all ${
                    isDarkMode
                      ? "border-white/5 bg-white/5 hover:bg-white/10 text-slate-300"
                      : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  }`}
                  aria-label="Notifications"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 h-2.5 w-2.5 bg-rose-500 rounded-full border-2 border-white dark:border-gray-950" />
                  )}
                </button>

                {/* Mobile Menu Button */}
                <button
                  type="button"
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="lg:hidden p-2 rounded-xl transition-all"
                  style={{
                    backgroundColor: isDarkMode
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.03)",
                  }}
                  aria-label={showMobileMenu ? "Close menu" : "Open menu"}
                >
                  {showMobileMenu ? (
                    <X
                      size={20}
                      className={isDarkMode ? "text-white" : "text-slate-700"}
                    />
                  ) : (
                    <Menu
                      size={20}
                      className={isDarkMode ? "text-white" : "text-slate-700"}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {showMobileMenu && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMobileMenu(false)}
                className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
                aria-label="Close menu"
              />
              <motion.div
                initial={{ y: 32, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 32, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] border-t p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl lg:hidden ${isDarkMode ? "border-white/10 bg-gray-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}
              >
                <div
                  className={`mx-auto mb-4 h-1 w-11 rounded-full ${isDarkMode ? "bg-white/15" : "bg-slate-200"}`}
                />
                <div className="grid grid-cols-2 gap-2">
                  {menuItems.map((item) => {
                    const active =
                      item.id === activePanel ||
                      (item.id === "home" && activePanel === null);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMenuItemClick(item.id)}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${
                          active
                            ? "bg-brand-500 text-white"
                            : isDarkMode
                              ? "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                              : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {!embeddedDesktopShell ? (
          <>
            <button
              type="button"
              onClick={() => {
                sidebarPreferenceRef.current = true;
                setIsDesktopSidebarOpen((value) => !value);
              }}
              className={`hidden lg:flex fixed top-20 z-[55] h-11 w-11 items-center justify-center rounded-full border transition-all duration-300 ${isDesktopSidebarOpen ? "left-[258px]" : "left-[50px]"} ${
                isDarkMode
                  ? "border-white/10 bg-gray-900 text-white hover:bg-gray-800"
                  : "border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
              }`}
              aria-label={
                isDesktopSidebarOpen ? "Collapse sidebar" : "Open sidebar"
              }
              aria-expanded={isDesktopSidebarOpen}
            >
              {isDesktopSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>

            <aside
              className={`hidden lg:block fixed left-0 top-16 bottom-0 z-40 border-r transition-[width] duration-300 ${isDesktopSidebarOpen ? "w-[280px]" : "w-[72px]"} ${
                isDarkMode
                  ? "border-white/10 bg-gray-950"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className={`flex h-full flex-col overflow-y-auto overflow-x-hidden ${isDesktopSidebarOpen ? "px-4" : "px-2"} py-4`}>
                <div
                  className={`flex items-center gap-3 border-b pb-4 ${isDesktopSidebarOpen ? "px-1" : "justify-center px-0"} ${isDarkMode ? "border-white/10" : "border-slate-100"}`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500 text-sm font-black text-white">
                    {(user?.name || user?.email || "E").charAt(0).toUpperCase()}
                  </div>
                  {isDesktopSidebarOpen && (
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        {user?.name || "Edutu learner"}
                      </p>
                      <p
                        className={`truncate text-xs ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                      >
                        {user?.email || "Welcome back"}
                      </p>
                    </div>
                  )}
                </div>

                <nav
                  className="mt-4 space-y-1"
                  aria-label="Dashboard sidebar"
                >
                  {desktopPrimaryItems.map((item) => {
                    const active = item.id === "home" && activePanel === null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={!isDesktopSidebarOpen ? item.label : undefined}
                        onClick={() => openDashboardDestination(item.id)}
                        className={`flex h-11 w-full items-center rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] ${
                          isDesktopSidebarOpen ? "justify-start gap-3 px-3" : "justify-center px-0"
                        } ${
                          active
                            ? "bg-brand-500 text-white"
                            : isDarkMode
                              ? "text-slate-300 hover:bg-white/10 hover:text-white"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                        }`}
                        aria-label={item.label}
                      >
                        <span className="shrink-0">{item.icon}</span>
                        {isDesktopSidebarOpen && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </button>
                    );
                  })}
                </nav>

                <div
                  className={`my-4 h-px ${isDarkMode ? "bg-white/10" : "bg-slate-100"}`}
                />

                <div className="space-y-1">
                  {isDesktopSidebarOpen && (
                    <p
                      className={`px-3 pb-1 text-xs font-semibold ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
                    >
                      Workspace
                    </p>
                  )}
                  {desktopPanelItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={!isDesktopSidebarOpen ? item.label : undefined}
                      onClick={() => openDashboardDestination(item.id)}
                      className={`flex h-11 w-full items-center rounded-xl text-left transition-colors active:scale-[0.98] ${
                        isDesktopSidebarOpen ? "justify-between gap-3 px-3" : "justify-center px-0"
                      } ${
                        activePanel === item.id
                          ? "bg-brand-500/10 text-brand-700 dark:text-brand-200"
                          : isDarkMode
                            ? "text-slate-300 hover:bg-white/10 hover:text-white"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                      }`}
                      aria-label={item.label}
                    >
                      <span
                        className={`flex min-w-0 items-center ${isDesktopSidebarOpen ? "gap-3" : "justify-center"} text-sm font-semibold`}
                      >
                        <span className="shrink-0 text-brand-500">
                          {item.icon}
                        </span>
                        {isDesktopSidebarOpen && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </span>
                      {isDesktopSidebarOpen &&
                        typeof item.count === "number" && (
                          <span
                            className={`text-xs font-semibold ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                          >
                            {item.count}
                          </span>
                        )}
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </>
        ) : null}

        <AnimatePresence>
          {activePanel && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActivePanel(null)}
                className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
                aria-label="Close dashboard panel"
              />
              <motion.aside
                initial={{ opacity: 0, x: 28, y: 28 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: 28, y: 28 }}
                transition={{ duration: 0.22 }}
                className={`fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-hidden rounded-t-[24px] border-t shadow-2xl lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-16 lg:h-[calc(100dvh-4rem)] lg:max-h-none lg:w-[390px] lg:rounded-none lg:border-l lg:border-t-0 ${isDarkMode ? "border-white/10 bg-gray-950 text-white shadow-black/40" : "border-slate-200 bg-white text-slate-950 shadow-slate-300/70"}`}
                aria-label={`${PANEL_COPY[activePanel].title} panel`}
              >
                <div
                  className={`border-b p-5 ${isDarkMode ? "border-white/10" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
                      >
                        Dashboard panel
                      </p>
                      <h2 className="mt-1 text-lg font-black tracking-tight text-slate-950 dark:text-white">
                        {PANEL_COPY[activePanel].title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {PANEL_COPY[activePanel].subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePanel(null)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100"}`}
                      aria-label="Close panel"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="max-h-[calc(82dvh-116px)] overflow-y-auto p-5 lg:max-h-[calc(100dvh-11.25rem)]">
                  {renderDashboardPanel()}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div
          className={`mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8 transition-[padding] duration-300 ${embeddedDesktopShell ? "lg:pl-8" : isDesktopSidebarOpen ? "lg:pl-[312px]" : "lg:pl-[104px]"} ${activePanel ? "xl:pr-[420px]" : "xl:pr-8"}`}
        >
          <main className="min-w-0 px-0 py-5 space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 gap-3 sm:gap-4"
            >
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className={`min-h-[104px] rounded-lg border p-4 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}
                >
                  <p
                    className={`text-xs font-semibold leading-5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                  >
                    {stat.label}
                  </p>
                  <p className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                    {stat.value}
                  </p>
                </div>
              ))}
            </motion.section>

            <AnimatePresence>
              {profileScore && profileScore.score < 100 && !dismissBanner && (
                <motion.section
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.3 }}
                  className={`profile-completion-card rounded-[20px] p-5 border-l-4 ${isDarkMode ? "bg-amber-500/5 border-amber-500/50" : "bg-amber-50 border-amber-400"}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${isDarkMode ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-600"}`}
                    >
                      <UserCheck size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black tracking-wider text-slate-900 dark:text-white mb-1">
                            Complete your profile
                          </h3>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Unlock personalized matches at {profileScore.score}%
                          </p>
                          {profileScore.missingFields.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {profileScore.missingFields
                                .slice(0, 3)
                                .map((field) => (
                                  <span
                                    key={field}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDarkMode ? "bg-white/10 text-slate-300" : "bg-white text-slate-600"}`}
                                  >
                                    {field}
                                  </span>
                                ))}
                              {profileScore.missingFields.length > 3 && (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                                  +{profileScore.missingFields.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setDismissBanner(true)}
                          className={`p-1 rounded-lg transition-colors ${isDarkMode ? "hover:bg-white/10 text-slate-500" : "hover:bg-slate-100 text-slate-400"}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="mt-3 space-y-3">
                        <div className="h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${profileScore.score}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full rounded-full ${
                              profileScore.score >= 60
                                ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                                : "bg-gradient-to-r from-amber-500 to-amber-400"
                            }`}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => setActivePanel("profile")}
                            className="text-xs font-black tracking-widest text-brand-500 hover:text-brand-600 transition-colors"
                          >
                            Review profile
                          </button>
                          {!profileScore.isMatchEnabled && (
                            <span className="text-[10px] font-bold text-amber-500 tracking-wider">
                              Need 60% for matches
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {(bookmarks.length > 0 ||
              applications.length > 0 ||
              dashboardDeadlines.length > 0) && (
              <section>
                <CalendarStrip
                  bookmarks={bookmarks}
                  applications={applications}
                  deadlines={dashboardDeadlines}
                  onEventClick={handleCalendarEventClick}
                />
              </section>
            )}

            {/* Content Layout */}
            <div className="grid lg:grid-cols-12 gap-8 pb-8">
              <div
                className={`${recentActivity.length > 0 ? "lg:col-span-8" : "lg:col-span-12"} space-y-10`}
              >
                {/* Recommended Opportunities */}
                <section>
                  <div className="mb-5 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Briefcase size={19} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                            Recommended
                          </h2>
                          <p
                            className={`mt-0.5 text-xs font-normal ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}
                          >
                            Matched to your profile
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div
                          className={`hidden sm:flex items-center gap-1 rounded-2xl border p-1 ${isDarkMode ? "border-white/10 bg-white/5" : "border-slate-200 bg-white shadow-sm"}`}
                        >
                          <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                              viewMode === "grid"
                                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                                : isDarkMode
                                  ? "text-slate-400 hover:bg-white/10 hover:text-white"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                            aria-label="Grid view"
                          >
                            <LayoutGrid size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode("list")}
                            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                              viewMode === "list"
                                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                                : isDarkMode
                                  ? "text-slate-400 hover:bg-white/10 hover:text-white"
                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                            aria-label="List view"
                          >
                            <List size={15} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={onViewAllOpportunities}
                          className={`h-10 inline-flex items-center justify-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-all ${
                            isDarkMode
                              ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                              : "border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-950"
                          }`}
                          aria-label="View all opportunities"
                        >
                          View more <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 sm:hidden">
                    {opportunitiesLoading ? (
                      <div className="-mx-4 flex gap-3 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-44 w-[62vw] max-w-[250px] shrink-0 animate-pulse rounded-2xl ${isDarkMode ? "bg-white/5" : "bg-slate-200"}`}
                          />
                        ))}
                      </div>
                    ) : mobilePersonalizedOpportunities.length === 0 ? (
                      <div
                        className={`rounded-2xl border ${isDarkMode ? "border-white/10 bg-gray-900/60" : "border-slate-200 bg-white"}`}
                      >
                        <EmptyState
                          icon={<Briefcase size={28} />}
                          title="No recommendations yet"
                          description="Browse opportunities while Edutu prepares better matches."
                          action={{
                            label: "Browse opportunities",
                            onClick: onViewAllOpportunities,
                          }}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                                Personalized opportunities
                              </h3>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Swipe across your closest matches
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={onViewAllOpportunities}
                              className="text-xs font-bold text-brand-600 dark:text-brand-300"
                            >
                              View all
                            </button>
                          </div>
                          <div
                            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            aria-label="Personalized opportunities carousel"
                          >
                            {mobilePersonalizedOpportunities.map(
                              (opportunity: any, index: number) => (
                                <button
                                  key={
                                    opportunity?.id
                                      ? `mobile-personalized-${opportunity.id}`
                                      : `mobile-personalized-${index}`
                                  }
                                  type="button"
                                  onClick={() => onOpportunityClick(opportunity)}
                                  className={`flex h-44 w-[62vw] max-w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border text-left transition active:scale-[0.98] ${isDarkMode ? "border-white/10 bg-gray-900" : "border-slate-200 bg-white"}`}
                                >
                                  <div className="relative h-20 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                                    <ImageWithFallback
                                      src={opportunity.image}
                                      alt={
                                        opportunity.title
                                          ? `${opportunity.title} opportunity image`
                                          : "Opportunity image"
                                      }
                                      className="h-full w-full object-cover"
                                      fallbackClassName="h-full w-full"
                                    />
                                    <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-brand-600 backdrop-blur">
                                      {opportunity.category || "General"}
                                    </span>
                                  </div>
                                  <div className="flex min-h-0 flex-1 flex-col p-3">
                                    <h4 className="text-sm font-black leading-snug text-slate-950 line-clamp-2 dark:text-white">
                                      {opportunity.title}
                                    </h4>
                                    <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                      <span className="truncate">
                                        {opportunity.location || "Remote"}
                                      </span>
                                      <span className="shrink-0">
                                        {opportunity.deadline
                                          ? new Date(
                                              opportunity.deadline,
                                            ).toLocaleDateString("en-US", {
                                              month: "short",
                                              day: "numeric",
                                            })
                                          : "Ongoing"}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              ),
                            )}
                            <button
                              type="button"
                              onClick={onViewAllOpportunities}
                              className={`flex h-44 w-28 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border px-3 text-center text-xs font-black transition active:scale-[0.98] ${
                                isDarkMode
                                  ? "border-white/10 bg-white/5 text-slate-300"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              View all
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="mb-3">
                            <h3 className="text-lg font-black tracking-tight text-slate-950 dark:text-white">
                              More opportunities
                            </h3>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              Scroll down to keep reviewing cards
                            </p>
                          </div>
                          <div className="grid w-full grid-cols-[repeat(2,minmax(0,1fr))] items-stretch gap-3">
                            {mobileExploreOpportunities
                              .slice(0, 10)
                              .map((opportunity: any, index: number) => (
                                <React.Fragment
                                  key={
                                    opportunity?.id
                                      ? `mobile-feed-${opportunity.id}`
                                      : `mobile-feed-${index}`
                                  }
                                >
                                  {index === 2 && (
                                    <button
                                      type="button"
                                      onClick={() => openDashboardDestination("profile")}
                                      className="flex min-h-[188px] min-w-0 flex-col overflow-hidden rounded-2xl bg-slate-950 p-3 text-left text-white transition active:scale-[0.98] dark:bg-brand-500"
                                    >
                                      <span className="text-[11px] font-semibold text-white/70">
                                        Sponsored
                                      </span>
                                      <span className="mt-2 block text-[13px] font-black leading-tight text-white">
                                        Improve your matches
                                      </span>
                                      <span className="mt-2 line-clamp-4 text-[11px] leading-4 text-white/75">
                                        Complete your profile so Edutu can show stronger matches first.
                                      </span>
                                      <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-black text-white">
                                        Review profile <ChevronRight size={14} />
                                      </span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onOpportunityClick(opportunity)}
                                    className={`flex min-h-[188px] min-w-0 overflow-hidden rounded-2xl border text-left transition active:scale-[0.98] ${isDarkMode ? "border-white/10 bg-gray-900" : "border-slate-200 bg-white"}`}
                                  >
                                    <div className="flex w-full min-w-0 flex-col">
                                    <div className="aspect-[5/4] w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                                      <ImageWithFallback
                                        src={opportunity.image}
                                        alt={
                                          opportunity.title
                                            ? `${opportunity.title} opportunity image`
                                            : "Opportunity image"
                                        }
                                        className="h-full w-full object-cover"
                                        fallbackClassName="h-full w-full"
                                      />
                                    </div>
                                    <div className="flex min-h-0 flex-1 flex-col p-3">
                                      <span className="mb-1 block truncate text-[11px] font-bold leading-4 text-brand-600 dark:text-brand-300">
                                        {opportunity.category || "General"}
                                      </span>
                                      <span className="line-clamp-3 block text-[14px] font-black leading-[1.15] text-slate-950 dark:text-white">
                                        {opportunity.title}
                                      </span>
                                      <div className="mt-auto flex min-w-0 flex-col gap-0.5 pt-2 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                                        <span className="truncate">
                                          {opportunity.location || "Remote"}
                                        </span>
                                        <span className="truncate">
                                          {opportunity.deadline
                                            ? new Date(
                                                opportunity.deadline,
                                              ).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                              })
                                            : "Ongoing"}
                                        </span>
                                      </div>
                                    </div>
                                    </div>
                                  </button>
                                </React.Fragment>
                              ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {viewMode === "grid" ? (
                    <div className="hidden grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4 sm:grid">
                      {opportunitiesLoading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="min-h-[244px] overflow-hidden rounded-[20px] animate-pulse"
                          >
                            <div
                              className={`h-32 ${isDarkMode ? "bg-white/5" : "bg-slate-200"}`}
                            />
                            <div className="p-4 space-y-3">
                              <div
                                className={`h-3 rounded ${isDarkMode ? "bg-white/5" : "bg-slate-200"} w-1/2`}
                              />
                              <div
                                className={`h-4 rounded ${isDarkMode ? "bg-white/5" : "bg-slate-200"} w-4/5`}
                              />
                            </div>
                          </div>
                        ))
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`col-span-full rounded-[20px] border ${isDarkMode ? "border-white/10 bg-gray-900/60" : "border-slate-200 bg-white"}`}
                        >
                          <EmptyState
                            icon={<Briefcase size={32} />}
                            title="No recommendations yet"
                            description="Complete your profile or browse the full opportunity feed while Edutu prepares better matches."
                            action={{
                              label: "Browse opportunities",
                              onClick: onViewAllOpportunities,
                            }}
                            secondaryAction={{
                              label: "Improve profile",
                              onClick: () => setActivePanel("profile"),
                            }}
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item) => {
                          if (item.type === "promo") {
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() =>
                                  openDashboardDestination(item.promo.screen)
                                }
                                className="flex min-h-[244px] flex-col justify-between overflow-hidden rounded-[20px] border border-brand-500/20 bg-gradient-to-br from-brand-500 to-indigo-600 p-4 text-left text-white shadow-lg shadow-brand-500/15 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
                                      Edutu
                                    </p>
                                    <h3 className="mt-1 text-lg font-black tracking-tight">
                                      {item.promo.title}
                                    </h3>
                                    <p className="mt-1 text-sm leading-5 text-white/80">
                                      {item.promo.copy}
                                    </p>
                                  </div>
                                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                                    <ChevronRight size={20} />
                                  </span>
                                </div>
                                <span className="mt-4 inline-flex text-xs font-black text-white">
                                  {item.promo.action}
                                </span>
                              </button>
                            );
                          }

                          const { opportunity } = item;
                          return (
                            <button
                              type="button"
                              key={item.key}
                              onClick={() => onOpportunityClick(opportunity)}
                              className={`flex min-h-[244px] flex-col rounded-[20px] overflow-hidden border cursor-pointer group text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isDarkMode ? "bg-gray-900 border-white/5 hover:border-white/10 focus-visible:ring-offset-gray-950" : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70 focus-visible:ring-offset-slate-50"}`}
                            >
                              <div className="relative h-32 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <ImageWithFallback
                                  src={opportunity.image}
                                  alt={
                                    opportunity.title
                                      ? `${opportunity.title} opportunity image`
                                      : "Opportunity image"
                                  }
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                  fallbackClassName="w-full h-full"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
                                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black text-brand-600 backdrop-blur">
                                  {opportunity.category || "General"}
                                </span>
                              </div>
                              <div className="flex flex-1 flex-col p-3 sm:p-4">
                                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                                  {opportunity.title}
                                </h3>
                                <div className="mt-auto flex flex-col gap-1 pt-4 text-[10px] font-bold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                                  <span className="truncate">
                                    {opportunity.location || "Remote"}
                                  </span>
                                  <span>
                                    {opportunity.deadline
                                      ? new Date(
                                          opportunity.deadline,
                                        ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                        })
                                      : "Ongoing"}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div
                      className={`hidden overflow-hidden rounded-2xl border sm:block ${isDarkMode ? "border-white/10 bg-gray-900/40" : "border-slate-200 bg-white"}`}
                    >
                      {opportunitiesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-20 rounded-xl animate-pulse"
                            style={{
                              backgroundColor: isDarkMode
                                ? "#1a1a1a"
                                : "#f0f0f0",
                            }}
                          />
                        ))
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`rounded-[20px] border ${isDarkMode ? "border-white/10 bg-gray-900/60" : "border-slate-200 bg-white"}`}
                        >
                          <EmptyState
                            icon={<Briefcase size={32} />}
                            title="No recommendations yet"
                            description="Complete your profile or browse the full opportunity feed while Edutu prepares better matches."
                            action={{
                              label: "Browse opportunities",
                              onClick: onViewAllOpportunities,
                            }}
                            secondaryAction={{
                              label: "Improve profile",
                              onClick: () => setActivePanel("profile"),
                            }}
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item) => {
                          if (item.type === "promo") {
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() =>
                                  openDashboardDestination(item.promo.screen)
                                }
                                className="w-full border-b border-white/10 bg-brand-500 p-4 text-left text-white transition hover:bg-brand-600"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-semibold text-white/75">
                                      Edutu
                                    </p>
                                    <h3 className="mt-1 text-base font-black">
                                      {item.promo.title}
                                    </h3>
                                    <p className="mt-1 text-xs leading-5 text-white/80">
                                      {item.promo.copy}
                                    </p>
                                  </div>
                                  <ChevronRight
                                    size={20}
                                    className="shrink-0"
                                  />
                                </div>
                              </button>
                            );
                          }

                          const { opportunity } = item;
                          return (
                            <button
                              type="button"
                              key={item.key}
                              onClick={() => onOpportunityClick(opportunity)}
                              className={`grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b p-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/5 ${isDarkMode ? "border-white/10" : "border-slate-100"} cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950`}
                            >
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                                <ImageWithFallback
                                  src={opportunity.image}
                                  alt={
                                    opportunity.title
                                      ? `${opportunity.title} opportunity image`
                                      : "Opportunity image"
                                  }
                                  className="w-full h-full object-cover"
                                  fallbackClassName="w-full h-full"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-300">
                                    {opportunity.category || "Direct"}
                                  </span>
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 transition-colors line-clamp-1 group-hover:text-primary dark:text-white">
                                  {opportunity.title}
                                </h3>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <span>{opportunity.location || "Remote"}</span>
                                  <span>
                                    {opportunity.deadline
                                      ? new Date(
                                          opportunity.deadline,
                                        ).toLocaleDateString("en-US", {
                                          month: "short",
                                          day: "numeric",
                                        })
                                      : "Ongoing"}
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0">
                                <ChevronRight
                                  className="text-slate-300 group-hover:text-primary transition-colors"
                                  size={18}
                                />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                  <div
                    ref={homeFeedSentinelRef}
                    className="h-10"
                    aria-hidden="true"
                  />
                </section>
              </div>

              {recentActivity.length > 0 && (
                <aside className="lg:col-span-4 space-y-6">
                  <section
                    className={`rounded-[20px] border p-5 relative overflow-hidden ${isDarkMode ? "bg-gray-900 border-white/10" : "bg-white border-slate-200 shadow-sm"}`}
                  >
                    <div className="flex items-center justify-between mb-6 relative">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                          <Sparkles size={18} />
                        </div>
                        <div>
                          <h2 className="text-base font-black">
                            Recent activity
                          </h2>
                          <p className="text-xs text-slate-400">
                            Latest saved and tracked opportunities
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {bookmarks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActivePanel("saved")}
                            className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-500 transition hover:text-brand-600"
                          >
                            Saved
                          </button>
                        )}
                        {applications.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActivePanel("applied")}
                            className="text-[10px] font-black uppercase tracking-[0.12em] text-brand-500 transition hover:text-brand-600"
                          >
                            Applied
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 relative">
                      {recentActivity.map((win) => (
                        <div
                          key={win.id}
                          className="flex gap-3 items-center group/win p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
                        >
                          <div className="h-9 w-9 shrink-0 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                            {win.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate group-hover/win:text-brand-500 transition-colors">
                              {win.title}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">
                              {win.date}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-400 tracking-widest">
                      <span>Saved {bookmarks.length}</span>
                      <span>Applications {applications.length}</span>
                    </div>
                  </section>
                </aside>
              )}
            </div>
          </main>
        </div>

        {/* Footer with Dark Mode Toggle */}
        <footer
          className={`mx-auto hidden max-w-7xl px-4 py-6 sm:px-6 lg:block lg:px-8 border-t ${isDarkMode ? "border-white/5" : "border-slate-200"}`}
        >
          <div className="flex items-center justify-between">
            <p
              className={`text-xs ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
            >
              © {new Date().getFullYear()} Edutu. All rights reserved.
            </p>
          </div>
        </footer>

        {!embeddedDesktopShell && (
          <nav
            className={`fixed inset-x-0 bottom-0 z-40 border-t px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl lg:hidden ${isDarkMode ? "border-white/10 bg-gray-950/95" : "border-slate-200 bg-white/95"}`}
            aria-label="Mobile dashboard navigation"
          >
            <div className="grid grid-cols-4 gap-1">
              {mobileNavItems.map((item) => {
                const active =
                  item.id === activePanel ||
                  (item.id === "home" && activePanel === null) ||
                  (item.id === "more" && showMobileMenu);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === "more") {
                        setShowMobileMenu(true);
                        return;
                      }
                      openDashboardDestination(item.id);
                    }}
                    className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition active:scale-[0.98] ${
                      active
                        ? "bg-brand-500 text-white"
                        : isDarkMode
                          ? "text-slate-400 hover:bg-white/10 hover:text-white"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        <NotificationInbox
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
        />
      </div>
    );
  },
);

export default Dashboard;
