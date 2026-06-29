import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  BadgeDollarSign,
  Bookmark,
  Briefcase,
  Calendar,
  ChevronRight,
  ChevronLeft,
  Clock,
  Download,
  GraduationCap,
  LayoutGrid,
  List,
  Send,
  Share2,
  Shuffle,
  Sparkles,
  X,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { EmptyState, ErrorState } from "./ui/EmptyState";
import NotificationInbox from "./NotificationInbox";
import CalendarStrip from "./CalendarStrip";
import MemberSettingsPanel from "./MemberSettingsPanel";
import type { CalendarEvent } from "./CalendarStrip";
import { useDarkMode } from "../hooks/useDarkMode";
import { useOpportunities } from "../hooks/useOpportunities";
import { usePersonalizedOpportunities } from "../hooks/usePersonalizedOpportunities";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePWA } from "../hooks/usePWA";
import { useToast } from "./ui/ToastProvider";
import type { AppUser } from "../types/user";
import type { OnboardingProfileData } from "../types/onboarding";
import { addBookmark, getBookmarks, removeBookmark } from "../services/bookmarks";
import { getApplications } from "../services/applications";
import { getDeadlines, type Deadline } from "../services/deadlines";
import { fetchBackendProfile, type BackendProfile } from "../services/profile";
import type { UserProfileForRecommendations } from "../services/personalizedRecommendations";

import ImageWithFallback from "./ImageWithFallback";

const HOME_FEED_BATCH_SIZE = 8;
const HOME_FEED_PROMO_INTERVAL = 6;
const HOME_SCREEN_PROMPT_DISMISSED_KEY = "edutu_home_screen_prompt_dismissed";



type DiscoveryCategoryId =
  | "scholarships"
  | "internships"
  | "programs"
  | "fellowships";

type DiscoveryCategory = {
  id: DiscoveryCategoryId;
  title: string;
  image: string;
  icon: LucideIcon;
  keywords: string[];
};

const DISCOVERY_CATEGORIES: DiscoveryCategory[] = [
  {
    id: "scholarships",
    title: "Scholarships",
    image: "/discovery/scholarships.png",
    icon: GraduationCap,
    keywords: ["scholarship", "scholarships", "scholar", "scholars"],
  },
  {
    id: "internships",
    title: "Internships",
    image: "/discovery/internships.png",
    icon: Briefcase,
    keywords: ["internship", "internships", "intern", "trainee"],
  },
  {
    id: "programs",
    title: "Programs",
    image: "/discovery/grants.png",
    icon: BadgeDollarSign,
    keywords: [
      "program",
      "programs",
      "programme",
      "programmes",
      "course",
      "courses",
      "bootcamp",
      "training",
      "academy",
      "summit",
      "school",
    ],
  },
  {
    id: "fellowships",
    title: "Fellowships",
    image: "/discovery/fellowships.png",
    icon: Users,
    keywords: ["fellowship", "fellowships", "fellow", "residency"],
  },
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function opportunitySearchText(opportunity: any) {
  const values = [
    opportunity?.category,
    opportunity?.title,
    opportunity?.organization,
    ...(Array.isArray(opportunity?.tags) ? opportunity.tags : []),
  ];

  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function opportunityMatchesDiscoveryCategory(
  opportunity: any,
  category: DiscoveryCategory,
) {
  const text = opportunitySearchText(opportunity);

  return category.keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "i").test(text),
  );
}

function createOpportunityShuffleSeed() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] || Date.now();
  }

  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function shuffleOpportunityFeed<T>(items: T[], seed: number): T[] {
  const nextItems = [...items];
  const random = seededRandom(seed);

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [
      nextItems[swapIndex],
      nextItems[index],
    ];
  }

  return nextItems;
}

function getDiscoveryCategoryRoute(category: DiscoveryCategory) {
  return `opportunities?category=${encodeURIComponent(category.id)}`;
}

type DashboardOpportunityCardVariant =
  | "carousel"
  | "mobileGrid"
  | "grid"
  | "list";

interface DashboardOpportunityCardProps {
  opportunity: any;
  variant: DashboardOpportunityCardVariant;
  isBookmarked: boolean;
  isDarkMode: boolean;
  onOpen: (opportunity: any) => void;
  onToggleBookmark: (opportunity: any, event: React.MouseEvent) => void;
  onShare: (opportunity: any, event: React.MouseEvent) => void;
}

function formatOpportunityDeadline(deadline?: string) {
  return deadline
    ? new Date(deadline).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Ongoing";
}

const DashboardOpportunityCard = React.memo(function DashboardOpportunityCard({
  opportunity,
  variant,
  isBookmarked,
  isDarkMode,
  onOpen,
  onToggleBookmark,
  onShare,
}: DashboardOpportunityCardProps) {
  const openLabel = `Open ${opportunity?.title ?? "opportunity"}`;
  const bookmarkLabel = isBookmarked ? "Remove bookmark" : "Save opportunity";



  if (variant === "list") {
    return (
      <article
        className={`group relative grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 p-3 text-left transition-colors last:border-b-0 hover:bg-slate-50`}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-gray-950"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="pointer-events-none relative z-10 h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
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
        <div className="pointer-events-none relative z-10 flex-1 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-600">
              {opportunity.category || "Direct"}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900 transition-colors line-clamp-1 group-hover:text-primary text-slate-900">
            {opportunity.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{opportunity.location || "Remote"}</span>
            <span>{formatOpportunityDeadline(opportunity.deadline)}</span>
          </div>
        </div>
        <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1">
          <ChevronRight
            className="pointer-events-none text-slate-300 group-hover:text-primary transition-colors"
            size={18}
          />
        </div>
      </article>
    );
  }

  if (variant === "carousel") {
    return (
      <article
        className={`mobile-personalized-card relative flex h-44 w-[62vw] max-w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition active:scale-[0.98]`}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="pointer-events-none relative z-10 h-20 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
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
        <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col p-3">
          <h4 className="text-sm font-semibold leading-snug text-slate-950 line-clamp-2 text-slate-900">
            {opportunity.title}
          </h4>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="truncate">{opportunity.location || "Remote"}</span>
            <span className="shrink-0">
              {formatOpportunityDeadline(opportunity.deadline)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "mobileGrid") {
    return (
      <article
        className={`mobile-more-opportunity-card relative flex min-h-[188px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.98]`}
        style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}
      >
        <button
          type="button"
          onClick={() => onOpen(opportunity)}
          className="absolute inset-0 z-0 cursor-pointer"
          aria-label={openLabel}
        >
          <span className="sr-only">{openLabel}</span>
        </button>
        <div className="mobile-more-opportunity-media pointer-events-none relative z-10 h-[76px] w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
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
        <div className="pointer-events-none relative z-10 flex min-h-0 min-w-0 flex-1 flex-col p-2.5">
          <span className="mb-1 block truncate text-[10px] font-bold leading-4 text-brand-600">
            {opportunity.category || "General"}
          </span>
          <span className="line-clamp-3 block min-w-0 break-words text-[13px] font-semibold leading-[1.16] text-slate-950 text-slate-900">
            {opportunity.title}
          </span>
          <div className="mt-auto flex min-w-0 flex-col gap-0.5 pt-2 text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
            <span className="truncate">{opportunity.location || "Remote"}</span>
            <span className="truncate">
              {formatOpportunityDeadline(opportunity.deadline)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`group relative flex min-h-[244px] flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/70`}
    >
      <button
        type="button"
        onClick={() => onOpen(opportunity)}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
        aria-label={openLabel}
      >
        <span className="sr-only">{openLabel}</span>
      </button>
      <div className="pointer-events-none relative z-10 h-32 shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
        <ImageWithFallback
          src={opportunity.image}
          alt={
            opportunity.title
              ? `${opportunity.title} opportunity image`
              : "Opportunity image"
          }
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          fallbackClassName="w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-brand-600 backdrop-blur">
          {opportunity.category || "General"}
        </span>
      </div>
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 transition-colors line-clamp-2 leading-snug group-hover:text-primary text-slate-900">
          {opportunity.title}
        </h3>
        <div className="mt-auto flex flex-col gap-1 pt-4 text-[10px] font-medium text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span className="truncate">{opportunity.location || "Remote"}</span>
          <span>{formatOpportunityDeadline(opportunity.deadline)}</span>
        </div>
      </div>
    </article>
  );
});

type BannerAd = {
  image: string;
  url: string;
  alt: string;
};

const DEFAULT_BANNERS: BannerAd[] = [
  {
    image: "https://images.pexels.com/photos/267885/pexels-photo-267885.jpeg",
    url: "https://edutu.org",
    alt: "Scholarship opportunities",
  },
  {
    image: "https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg",
    url: "https://edutu.org",
    alt: "Study abroad programs",
  },
  {
    image: "https://images.pexels.com/photos/1595391/pexels-photo-1595391.jpeg",
    url: "https://edutu.org",
    alt: "Career development",
  },
];

function BannerCarousel({ banners, mobileHeight }: { banners: BannerAd[]; mobileHeight?: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const goTo = (index: number) => setCurrent(index);
  const goPrev = () => setCurrent((prev) => (prev - 1 + banners.length) % banners.length);
  const goNext = () => setCurrent((prev) => (prev + 1) % banners.length);

  if (banners.length === 0) return null;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[20px] bg-slate-100"
      style={
        mobileHeight
          ? { height: mobileHeight, maxWidth: '800px', margin: '0 auto' }
          : {}
      }
    >
      <div
        className="relative block w-full overflow-hidden"
        style={mobileHeight ? { height: mobileHeight } : { aspectRatio: "1200 / 300" }}
      >
        <img
          src={banners[current].image}
          alt={banners[current].alt}
          className="h-full w-full object-cover"
          style={{ position: "absolute", inset: 0 }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-lg font-bold tracking-tight text-white drop-shadow-sm sm:text-2xl">
            Welcome to Edutu
          </span>
          <span className="mt-1 text-xs font-medium text-white/80 drop-shadow-sm sm:text-sm">
            Discover global opportunities, scholarships, and career growth
          </span>
        </div>
      </div>
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
            aria-label="Previous banner"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
            aria-label="Next banner"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                className={`h-2 rounded-full transition-all ${
                  index === current ? "w-6 bg-white" : "w-2 bg-white/50"
                }`}
                aria-label={`Go to banner ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
    const [activePanel, setActivePanel] = useState<DashboardPanel | null>(null);
    const [dismissBanner, setDismissBanner] = usePersistentState<boolean>(
      "edutu_dashboard_banner_dismissed",
      false,
    );
    const [dismissActivityStrip, setDismissActivityStrip] =
      usePersistentState<boolean>(
        "edutu_dashboard_activity_strip_dismissed",
        false,
      );
    const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
    const [homeFeedLimit, setHomeFeedLimit] = useState(HOME_FEED_BATCH_SIZE);
    const [homeShuffleSeed, setHomeShuffleSeed] = useState(() =>
      createOpportunityShuffleSeed(),
    );
    const [dismissHomeScreenPrompt, setDismissHomeScreenPrompt] = useState(() => {
      if (typeof window === "undefined") return false;
      return (
        window.localStorage.getItem(HOME_SCREEN_PROMPT_DISMISSED_KEY) === "1"
      );
    });
    const [activeDiscoveryCategory, setActiveDiscoveryCategory] =
      useState<DiscoveryCategoryId | null>(null);
    const { isDarkMode } = useDarkMode();
    const { t } = useTranslation();
    const { getToken } = useClerkAuth();
    const toast = useToast();
    const opportunitiesRefreshRef = useRef<() => void>();
    const homeFeedSentinelRef = useRef<HTMLDivElement | null>(null);
    const [bookmarks, setBookmarks] = useState<any[]>([]);

    const isOppBookmarked = useCallback(
      (opportunityId: string) =>
        bookmarks.some(
          (b: any) => b.opportunity_id === opportunityId,
        ),
      [bookmarks],
    );

    const handleToggleBookmark = useCallback(
      async (opportunity: any, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (!user?.id) {
          toast.warning("Sign in required", "Please sign in to save opportunities.");
          return;
        }
        const token = await getToken().catch(() => null);
        if (!token) {
          toast.warning("Sign in required", "Please sign in to save opportunities.");
          return;
        }
        const saved = bookmarks.find(
          (b: any) => b.opportunity_id === opportunity.id,
        );
        try {
          if (saved) {
            await removeBookmark(user.id, opportunity.id, token);
            setBookmarks((prev: any[]) =>
              prev.filter((b: any) => b.id !== saved.id),
            );
            toast.success("Removed from saved");
          } else {
            await addBookmark(
              user.id,
              {
                id: opportunity.id,
                title: opportunity.title,
                category: opportunity.category,
                deadline: opportunity.deadline,
                location: opportunity.location,
              },
              token,
            );
            const fresh = await getBookmarks(user.id, token);
            setBookmarks(fresh);
            toast.success("Saved", "Added to your shortlist.");
          }
        } catch (err) {
          console.error("Failed to toggle bookmark:", err);
          toast.error("Could not save", "Please try again in a moment.");
        }
      },
      [bookmarks, getToken, toast, user?.id],
    );

    const handleShareOpportunity = useCallback(
      async (opportunity: any, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const shareUrl = `${window.location.origin}/share/opportunity/${opportunity.id}`;
        const text = `Check out this opportunity on Edutu: ${opportunity.title}`;
        try {
          if (navigator.share) {
            await navigator.share({
              title: opportunity.title,
              text,
              url: shareUrl,
            });
          } else {
            await navigator.clipboard.writeText(`${text}\n\n${shareUrl}`);
            toast.success("Link copied", "Share it with anyone you like.");
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          console.error("Failed to share opportunity:", err);
          toast.error("Could not share", "Please try again in a moment.");
        }
      },
      [toast],
    );
    const [applications, setApplications] = useState<any[]>([]);
    const [dashboardDeadlines, setDashboardDeadlines] = useState<Deadline[]>(
      [],
    );
    const [profileScore, setProfileScore] = useState<{
      score: number;
      missingFields: string[];
      isMatchEnabled: boolean;
    } | null>(null);
    const [backendProfile, setBackendProfile] = useState<BackendProfile | null>(null);

    const {
      isInstallable,
      isInstalled,
      isManualInstallAvailable,
      promptInstall,
    } = usePWA();

    const opportunities = useOpportunities();
    const personalized = usePersonalizedOpportunities();
    const {
      setUserProfile: setPersonalizedUserProfile,
      error: personalizedError,
    } = personalized;
    const { error: fallbackFeedError } = opportunities;
    const {
      data: opportunityFeed,
      loading: opportunitiesLoading,
      error: opportunityFeedError,
      refresh: hookRefreshOpportunities,
    } = user?.id ? personalized : opportunities;
    const feedErrorMessage = user?.id
      ? personalizedError
      : fallbackFeedError ?? opportunityFeedError;

    useEffect(() => {
      opportunitiesRefreshRef.current = hookRefreshOpportunities;
    }, [hookRefreshOpportunities]);

    useEffect(() => {
      setHomeShuffleSeed(createOpportunityShuffleSeed());
      setHomeFeedLimit(HOME_FEED_BATCH_SIZE);
    }, [user?.id]);

    useEffect(() => {
      if (!user?.id) {
        setBackendProfile(null);
        setProfileScore(null);
        return;
      }
      let isMounted = true;

      async function loadProfileData() {
        try {
          const token = await getToken().catch(() => null);
          if (!token) return;
          const profile = await fetchBackendProfile(token);
          if (!isMounted) return;
          const percent = profile.completeness?.percent ?? 0;
          setBackendProfile(profile);
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

      return () => {
        isMounted = false;
      };
    }, [getToken, user?.id]);

    const personalizedUserId = user?.id;
    const userCourseOfStudy = user?.courseOfStudy;
    const userRef = useRef(user);
    userRef.current = user;

    const backendRecommendationData = useMemo<Partial<UserProfileForRecommendations>>(
      () => {
        if (!personalizedUserId) return {};

        const profileRecord = (backendProfile ?? {}) as Record<string, unknown>;
        const backendSkills = Array.isArray(profileRecord.skills)
          ? profileRecord.skills.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : [];
        const backendInterests = Array.isArray(profileRecord.interests)
          ? profileRecord.interests.filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
          : [];
        const backendField =
          typeof profileRecord.fieldOfStudy === "string"
            ? profileRecord.fieldOfStudy
            : typeof profileRecord.field_of_study === "string"
              ? profileRecord.field_of_study
              : typeof profileRecord.course_of_study === "string"
                ? profileRecord.course_of_study
                : userCourseOfStudy;
        const backendCountry =
          typeof profileRecord.country === "string"
            ? profileRecord.country
            : undefined;

        return {
          ...(backendField ? { courseOfStudy: backendField } : {}),
          ...(backendCountry ? { location: backendCountry } : {}),
          ...(backendSkills.length || backendInterests.length
            ? {
                interests: Array.from(new Set([...backendSkills, ...backendInterests])),
                preferredCategories: Array.from(new Set([...backendSkills, ...backendInterests])),
              }
            : {}),
        };
      },
      [backendProfile, personalizedUserId, userCourseOfStudy],
    );

    const onboardingRecommendationData = useMemo<
      Partial<UserProfileForRecommendations> | undefined
    >(() => {
      if (!onboardingProfile) return undefined;
      return {
        courseOfStudy: onboardingProfile.courseOfStudy,
        interests: onboardingProfile.interests,
        preferredCategories: onboardingProfile.interests,
        careerGoals: onboardingProfile.goals,
        educationLevel: onboardingProfile.educationLevel,
        location: onboardingProfile.location,
        experienceLevel: onboardingProfile.experience,
      };
    }, [onboardingProfile]);

    useEffect(() => {
      if (!personalizedUserId) return;
      const currentUser = userRef.current;
      if (!currentUser) return;
      setPersonalizedUserProfile(
        currentUser,
        backendRecommendationData,
        onboardingRecommendationData,
      );
    }, [
      personalizedUserId,
      backendRecommendationData,
      onboardingRecommendationData,
      setPersonalizedUserProfile,
    ]);

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

    const selectedDiscoveryCategory =
      DISCOVERY_CATEGORIES.find(
        (category) => category.id === activeDiscoveryCategory,
      ) ?? null;

    const filteredOpportunityFeed = useMemo(() => {
      if (!selectedDiscoveryCategory) return normalizedOpportunityFeed;

      return normalizedOpportunityFeed.filter((opportunity: any) =>
        opportunityMatchesDiscoveryCategory(
          opportunity,
          selectedDiscoveryCategory,
        ),
      );
    }, [normalizedOpportunityFeed, selectedDiscoveryCategory]);

    const shuffledOpportunityFeed = useMemo(
      () => shuffleOpportunityFeed(filteredOpportunityFeed, homeShuffleSeed),
      [filteredOpportunityFeed, homeShuffleSeed],
    );

    const visibleHomeOpportunities = useMemo(
      () => shuffledOpportunityFeed.slice(0, homeFeedLimit),
      [homeFeedLimit, shuffledOpportunityFeed],
    );

    const opportunityEmptyTitle = selectedDiscoveryCategory
      ? t("dashboard.empty.noCategoryFound", { category: selectedDiscoveryCategory.title.toLowerCase() })
      : t("dashboard.empty.noRecommendations");
    const opportunityEmptyDescription = selectedDiscoveryCategory
      ? t("dashboard.empty.tryAnotherCategory")
      : t("dashboard.empty.noRecommendationsDescription");
    const opportunityEmptyAction = selectedDiscoveryCategory
      ? {
          label: t("dashboard.empty.showAll"),
          onClick: () => setActiveDiscoveryCategory(null),
        }
      : {
          label: t("dashboard.empty.browseOpportunities"),
          onClick: onViewAllOpportunities,
        };

    const mobilePersonalizedOpportunities = useMemo(
      () => visibleHomeOpportunities.slice(0, 6),
      [visibleHomeOpportunities],
    );

    const mobileExploreOpportunities = useMemo(
      () => visibleHomeOpportunities.slice(2, Math.max(homeFeedLimit, 10)),
      [homeFeedLimit, visibleHomeOpportunities],
    );

    const mobileMoreOpportunityItems = useMemo(() => {
      const items: Array<{ key: string; opportunity: any }> = [];

      mobileExploreOpportunities.slice(0, 10).forEach((opportunity: any, index: number) => {
        items.push({
          key: opportunity?.id
            ? `mobile-feed-${opportunity.id}`
            : `mobile-feed-${index}`,
          opportunity,
        });
      });

      return items;
    }, [mobileExploreOpportunities]);

    const homeFeedItems = useMemo(() => {
      return visibleHomeOpportunities.map((opportunity: any, index) => ({
        type: "opportunity" as const,
        key: opportunity?.id
          ? `opportunity-${opportunity.id}`
          : `opportunity-${index}`,
        opportunity,
      }));
    }, [visibleHomeOpportunities]);

    useEffect(() => {
      setHomeFeedLimit(HOME_FEED_BATCH_SIZE);
    }, [activeDiscoveryCategory, shuffledOpportunityFeed.length]);

    useEffect(() => {
      const sentinel = homeFeedSentinelRef.current;
      if (!sentinel || opportunitiesLoading) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (!entry.isIntersecting) return;

          setHomeFeedLimit((current) => {
            if (current >= shuffledOpportunityFeed.length) return current;
            return Math.min(
              current + HOME_FEED_BATCH_SIZE,
              shuffledOpportunityFeed.length,
            );
          });
        },
        { rootMargin: "420px 0px" },
      );

      observer.observe(sentinel);

      return () => observer.disconnect();
    }, [opportunitiesLoading, shuffledOpportunityFeed.length]);

    const formatUpdatedAt = (updatedAt: string) => {
      const diff = Date.now() - new Date(updatedAt).getTime();
      const mins = Math.floor(diff / (1000 * 60));
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return new Date(updatedAt).toLocaleDateString();
    };

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

    function handleShuffleOpportunities() {
      setHomeShuffleSeed(createOpportunityShuffleSeed());
      setHomeFeedLimit(HOME_FEED_BATCH_SIZE);
    }

    const showHomeScreenPrompt =
      !dismissHomeScreenPrompt &&
      !isInstalled &&
      (isInstallable || isManualInstallAvailable);

    const closeHomeScreenPrompt = () => {
      setDismissHomeScreenPrompt(true);
      window.localStorage.setItem(HOME_SCREEN_PROMPT_DISMISSED_KEY, "1");
    };

    const handleInstallPrompt = async () => {
      if (!isInstallable) return;
      const accepted = await promptInstall();
      if (accepted) {
        closeHomeScreenPrompt();
      }
    };

    function handleDiscoveryCategoryClick(category: DiscoveryCategory) {
      onNavigate?.(getDiscoveryCategoryRoute(category));
    }

    const handleCalendarEventClick = (event: CalendarEvent) => {
      if (event.type === "goal") {
        onNavigate?.("deadlines");
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
        className={`rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center`}
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-500`}
        >
          <Briefcase size={20} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-950 text-slate-900">
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
                className={`w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-slate-950 text-slate-900">
                      {bookmark.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {bookmark.opportunity_category || "Opportunity"}
                    </p>
                  </div>
                  <ChevronRight
                    size={17}
                    className="mt-1 shrink-0 text-slate-500"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
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
                className={`w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-slate-950 text-slate-900">
                      {application.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold capitalize text-slate-500 dark:text-slate-400">
                      {application.status || "tracked"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                    Applied
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
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
                        setActivePanel(null);
                        onNavigate?.("deadlines");
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
                    className={`w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
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
                        <p className="text-sm font-semibold leading-5 text-slate-950 text-slate-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {formatPanelDate(item.date)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
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
              className={`rounded-2xl border border-slate-200 bg-white p-4`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-base font-semibold text-white">
                  {(user?.name || user?.email || "E").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950 text-slate-900">
                    {user?.name || "Edutu learner"}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {user?.email || "Signed in member"}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-2xl border border-slate-200 bg-white p-4`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-950 text-slate-900">
                  Match readiness
                </p>
                <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">
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
                className={`rounded-2xl border border-slate-200 bg-white p-4`}
              >
                <p className="text-sm font-semibold text-slate-950 text-slate-900">
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
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
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
        className={`min-h-screen bg-white text-slate-900 font-body transition-colors duration-500 overflow-x-hidden ${embeddedDesktopShell ? "pb-0 pt-0 lg:pb-12" : "pb-[calc(5rem+env(safe-area-inset-bottom))] pt-14 md:pt-16 lg:pb-12"}`}
      >
        {/* Background Mesh Gradient */}
        <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20 mesh-gradient" />

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
                className={`fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-hidden rounded-t-[24px] border-t border-slate-200 bg-white text-slate-950 shadow-2xl shadow-slate-300/70 lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-16 lg:h-[calc(100dvh-4rem)] lg:max-h-none lg:w-[390px] lg:rounded-none lg:border-l lg:border-t-0`}
                aria-label={`${PANEL_COPY[activePanel].title} panel`}
              >
                <div
                  className={`border-b border-slate-200 p-5`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500`}
                      >
                        Dashboard panel
                      </p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 text-slate-900">
                        {PANEL_COPY[activePanel].title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {PANEL_COPY[activePanel].subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePanel(null)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-slate-100`}
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
          className={`mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8 transition-[padding] duration-300 ${embeddedDesktopShell ? "lg:pl-8" : ""} ${activePanel ? "xl:pr-[420px]" : "xl:pr-8"}`}
        >
          <main className="min-w-0 px-0 py-5 space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-slate-950 text-slate-900">
                  {t("dashboard.sections.exploreOpportunities")}
                </h2>
                {selectedDiscoveryCategory ? (
                  <button
                    type="button"
                    onClick={() => setActiveDiscoveryCategory(null)}
                    className={`h-8 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]`}
                  >
                    {t("common.all")}
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {DISCOVERY_CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const active = activeDiscoveryCategory === category.id;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => handleDiscoveryCategoryClick(category)}
                      className={`group relative min-h-[88px] overflow-hidden rounded-[20px] border border-white/20 bg-slate-950 text-left text-white shadow-sm transition active:scale-[0.98] md:min-h-[112px] ${
                        active
                          ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-gray-950"
                          : "hover:-translate-y-0.5"
                      }`}
                      aria-pressed={active}
                      aria-label={`Explore ${category.title}`}
                    >
                      <img
                        src={category.image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        aria-hidden="true"
                      />
                      <div
                        className={`absolute inset-0 transition ${
                          active ? "bg-slate-950/0" : "bg-slate-950/10"
                        }`}
                      />
                      <div className="relative flex min-h-[88px] items-center gap-1.5 px-3.5 py-3 md:min-h-[112px] md:flex-col md:items-start md:justify-end md:gap-3 md:p-4">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white backdrop-blur-sm md:h-12 md:w-12 ${
                            active ? "bg-white/24" : "bg-white/14"
                          }`}
                        >
                          <Icon size={25} strokeWidth={1.7} />
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-semibold leading-4 text-white md:flex-none md:text-sm">
                          {category.title}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.section>

            <AnimatePresence>
              {profileScore && profileScore.score < 100 && !dismissBanner && (
                <motion.section
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.3 }}
                  className={`profile-completion-card rounded-[20px] border border-amber-200 bg-amber-50 p-5`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600`}
                    >
                      <UserCheck size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold tracking-wider text-slate-900 text-slate-900 mb-1">
                            {t("dashboard.completeProfile")}
                          </h3>
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {t("dashboard.profileBanner.unlock", { score: profileScore.score })}
                          </p>
                          {profileScore.missingFields.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {profileScore.missingFields
                                .slice(0, 3)
                                .map((field) => (
                                  <span
                                    key={field}
                                    className={`rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600`}
                                  >
                                    {field}
                                  </span>
                                ))}
                              {profileScore.missingFields.length > 3 && (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                                  {t("dashboard.moreCount", { count: profileScore.missingFields.length - 3 })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setDismissBanner(true)}
                          className={`rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100`}
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
                            className="text-xs font-semibold tracking-widest text-brand-500 hover:text-brand-600 transition-colors"
                          >
                            {t("dashboard.reviewProfile")}
                          </button>
                          {!profileScore.isMatchEnabled && (
                            <span className="text-[10px] font-bold text-amber-500 tracking-wider">
                              {t("dashboard.needForMatches")}
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
              dashboardDeadlines.length > 0) &&
              !dismissActivityStrip && (
              <section>
                <CalendarStrip
                  bookmarks={bookmarks}
                  applications={applications}
                  deadlines={dashboardDeadlines}
                  compact
                  onClose={() => setDismissActivityStrip(true)}
                  onEventClick={handleCalendarEventClick}
                />
              </section>
            )}

            {showHomeScreenPrompt ? (
              <section className="sm:hidden">
                <div
                  className={`relative overflow-hidden rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm`}
                >
                  <button
                    type="button"
                    onClick={closeHomeScreenPrompt}
                    className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700`}
                    aria-label="Dismiss add to home screen prompt"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-start gap-3 pr-8">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                      {isInstallable ? <Download size={19} /> : <Share2 size={19} />}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-950 text-slate-900">
                        Add Edutu to Home Screen
                      </h2>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                        Keep opportunities, saved picks, and deadlines one tap
                        away.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {isInstallable ? (
                      <button
                        type="button"
                        onClick={handleInstallPrompt}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 active:scale-[0.98]"
                      >
                        <Download size={16} />
                        Add app
                      </button>
                    ) : (
                        <div className="flex-1 rounded-2xl bg-brand-500/10 px-3 py-2 text-xs font-bold leading-5 text-brand-700">
                        Tap Share, then Add to Home Screen.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={closeHomeScreenPrompt}
                      className={`h-10 rounded-2xl bg-slate-100 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-200`}
                    >
                      Later
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="sm:hidden mb-6">
              <BannerCarousel banners={DEFAULT_BANNERS} mobileHeight="150px" />
            </section>

            {/* Content Layout */}
            <div className="grid lg:grid-cols-12 gap-8 pb-8">
              <div
                className={`${recentActivity.length > 0 ? "lg:col-span-8" : "lg:col-span-12"} space-y-10`}
              >
                {/* Recommended Opportunities */}
                <section>
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Briefcase size={19} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950 text-slate-900">
                            {t("dashboard.sections.recommendedPicks")}
                          </h2>
                          <p
                            className={`truncate text-xs font-normal text-slate-500`}
                          >
                            {selectedDiscoveryCategory
                              ? selectedDiscoveryCategory.title
                              : t("dashboard.forYou")}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div
                          className={`hidden sm:flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm`}
                        >
                          <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                              viewMode === "grid"
                                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
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
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                            aria-label="List view"
                          >
                            <List size={15} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleShuffleOpportunities}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-950 active:scale-[0.98] sm:w-auto sm:rounded-2xl sm:px-3`}
                          aria-label="Shuffle recommended opportunities"
                          title={t("dashboard.shuffle")}
                        >
                          <Shuffle size={14} />
                          <span className="hidden sm:inline">{t("dashboard.shuffle")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={onViewAllOpportunities}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:text-slate-950 sm:w-auto sm:rounded-2xl sm:px-3`}
                          aria-label="View all opportunities"
                          title={t("dashboard.viewMore")}
                        >
                          <span className="hidden sm:inline">{t("dashboard.viewMore")}</span>
                          <ChevronRight size={16} />
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
                            className={`h-44 w-[62vw] max-w-[250px] shrink-0 animate-pulse rounded-2xl bg-slate-200`}
                          />
                        ))}
                      </div>
                    ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                      <div
                        className={`rounded-2xl border border-slate-200 bg-white`}
                      >
                        <ErrorState
                          message={feedErrorMessage}
                          onRetry={hookRefreshOpportunities}
                        />
                      </div>
                    ) : mobilePersonalizedOpportunities.length === 0 ? (
                      <div
                        className={`rounded-2xl border border-slate-200 bg-white`}
                      >
                        <EmptyState
                          icon={<Briefcase size={28} />}
                          title={opportunityEmptyTitle}
                          description={opportunityEmptyDescription}
                          action={opportunityEmptyAction}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <div
                            className="mobile-personalized-carousel -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-scroll overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            aria-label="Personalized opportunities carousel"
                          >
                            {mobilePersonalizedOpportunities.map(
                              (opportunity: any, index: number) => (
                                <DashboardOpportunityCard
                                  key={
                                    opportunity?.id
                                      ? `mobile-personalized-${opportunity.id}`
                                      : `mobile-personalized-${index}`
                                  }
                                  opportunity={opportunity}
                                  variant="carousel"
                                  isBookmarked={isOppBookmarked(opportunity.id)}
                                  isDarkMode={isDarkMode}
                                  onOpen={onOpportunityClick}
                                  onToggleBookmark={handleToggleBookmark}
                                  onShare={handleShareOpportunity}
                                />
                              ),
                            )}
                            <button
                              type="button"
                              onClick={
                                selectedDiscoveryCategory
                                  ? () => setActiveDiscoveryCategory(null)
                                  : onViewAllOpportunities
                              }
                              className={`mobile-personalized-card flex h-44 w-28 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border px-3 text-center text-xs font-semibold transition active:scale-[0.98] ${
                                isDarkMode
                                  ? "border-white/10 bg-white/5 text-slate-300"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {selectedDiscoveryCategory ? t("dashboard.empty.showAll") : t("dashboard.viewAll")}
                              <ChevronRight size={16} />
                            </button>
                          </div>

                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-lg font-semibold tracking-tight text-slate-950 text-slate-900">
                                {selectedDiscoveryCategory
                                  ? t("dashboard.categoryOpportunities", { category: selectedDiscoveryCategory.title })
                                  : t("dashboard.moreOpportunities")}
                              </h3>
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {selectedDiscoveryCategory
                                  ? t("dashboard.filteredBySelection")
                                  : t("dashboard.scrollDown")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={onViewAllOpportunities}
                              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                                isDarkMode
                                  ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                                  : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-950"
                              }`}
                              aria-label="View more opportunities"
                            >
                              <ChevronRight size={18} strokeWidth={2.4} />
                            </button>
                          </div>
                          <div
                            className="mobile-more-opportunities-grid"
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(2, minmax(0, calc((100vw - 2.75rem) / 2)))",
                              gap: "0.75rem",
                              width: "calc(100vw - 2rem)",
                              maxWidth: "calc(100vw - 2rem)",
                              alignItems: "stretch",
                              overflow: "hidden",
                            }}
                          >
                            {mobileMoreOpportunityItems.map((item) => {
                              const { opportunity } = item;

                              return (
                                <DashboardOpportunityCard
                                  key={item.key}
                                  opportunity={opportunity}
                                  variant="mobileGrid"
                                  isBookmarked={isOppBookmarked(opportunity.id)}
                                  isDarkMode={isDarkMode}
                                  onOpen={onOpportunityClick}
                                  onToggleBookmark={handleToggleBookmark}
                                  onShare={handleShareOpportunity}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={onViewAllOpportunities}
                            className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition active:scale-[0.99] ${
                              isDarkMode
                                ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
                                : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {t("dashboard.viewMore")}
                            <ChevronRight size={17} strokeWidth={2.4} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="hidden sm:block mb-6">
                    <BannerCarousel banners={DEFAULT_BANNERS} />
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
                              className={`h-32 bg-slate-200`}
                            />
                            <div className="p-4 space-y-3">
                              <div
                                className={`h-3 w-1/2 rounded bg-slate-200`}
                              />
                              <div
                                className={`h-4 w-4/5 rounded bg-slate-200`}
                              />
                            </div>
                          </div>
                        ))
                      ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                        <div
                          className={`col-span-full rounded-[20px] border border-slate-200 bg-white`}
                        >
                          <ErrorState
                            message={feedErrorMessage}
                            onRetry={hookRefreshOpportunities}
                          />
                        </div>
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`col-span-full rounded-[20px] border border-slate-200 bg-white`}
                        >
                          <EmptyState
                            icon={<Briefcase size={32} />}
                            title={opportunityEmptyTitle}
                            description={opportunityEmptyDescription}
                            action={opportunityEmptyAction}
                            secondaryAction={
                              selectedDiscoveryCategory
                                ? {
                                    label: t("dashboard.browseAll"),
                                    onClick: onViewAllOpportunities,
                                  }
                                : {
                                    label: t("dashboard.improveProfile"),
                                    onClick: () => setActivePanel("profile"),
                                  }
                            }
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item) => {
                          const { opportunity } = item;
                          return (
                            <DashboardOpportunityCard
                              key={item.key}
                              opportunity={opportunity}
                              variant="grid"
                              isBookmarked={isOppBookmarked(opportunity.id)}
                              isDarkMode={isDarkMode}
                              onOpen={onOpportunityClick}
                              onToggleBookmark={handleToggleBookmark}
                              onShare={handleShareOpportunity}
                            />
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div
                      className={`hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block`}
                    >
                      {opportunitiesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-20 rounded-xl animate-pulse"
                            style={{
                              backgroundColor: "#f0f0f0",
                            }}
                          />
                        ))
                      ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                        <div
                          className={`rounded-[20px] border border-slate-200 bg-white`}
                        >
                          <ErrorState
                            message={feedErrorMessage}
                            onRetry={hookRefreshOpportunities}
                          />
                        </div>
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`rounded-[20px] border border-slate-200 bg-white`}
                        >
                          <EmptyState
                            icon={<Briefcase size={32} />}
                            title={opportunityEmptyTitle}
                            description={opportunityEmptyDescription}
                            action={opportunityEmptyAction}
                            secondaryAction={
                              selectedDiscoveryCategory
                                ? {
                                    label: t("dashboard.browseAll"),
                                    onClick: onViewAllOpportunities,
                                  }
                                : {
                                    label: t("dashboard.improveProfile"),
                                    onClick: () => setActivePanel("profile"),
                                  }
                            }
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item) => {
                          const { opportunity } = item;
                          return (
                            <DashboardOpportunityCard
                              key={item.key}
                              opportunity={opportunity}
                              variant="list"
                              isBookmarked={isOppBookmarked(opportunity.id)}
                              isDarkMode={isDarkMode}
                              onOpen={onOpportunityClick}
                              onToggleBookmark={handleToggleBookmark}
                              onShare={handleShareOpportunity}
                            />
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
                    className={`relative overflow-hidden rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm`}
                  >
                    <div className="flex items-center justify-between mb-6 relative">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                          <Sparkles size={18} />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold">
                            {t("dashboard.sections.recentActivity")}
                          </h2>
                          <p className="text-xs text-slate-500">
                            {t("dashboard.latestActivity")}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {bookmarks.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActivePanel("saved")}
                            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 transition hover:text-brand-600"
                          >
                            {t("navigation.saved")}
                          </button>
                        )}
                        {applications.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActivePanel("applied")}
                            className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-500 transition hover:text-brand-600"
                          >
                            {t("navigation.applied")}
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
                            <p className="text-xs font-medium truncate group-hover/win:text-brand-500 transition-colors">
                              {win.title}
                            </p>
                            <p className="text-[10px] font-medium text-slate-500">
                              {win.date}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] font-medium text-slate-500 tracking-widest">
                      <span>{t("dashboard.savedCount", { count: bookmarks.length })}</span>
                      <span>{t("dashboard.applicationsCount", { count: applications.length })}</span>
                    </div>
                  </section>
                </aside>
              )}
            </div>
          </main>
        </div>

        {/* Footer with Dark Mode Toggle */}
        <footer
          className={`mx-auto hidden max-w-7xl border-t border-slate-200 px-4 py-6 sm:px-6 lg:block lg:px-8`}
        >
          <div className="flex items-center justify-between">
            <p
              className="text-xs text-slate-500"
            >
              © {new Date().getFullYear()} Edutu. All rights reserved.
            </p>
          </div>
        </footer>

        <NotificationInbox
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
        />
      </div>
    );
  },
);

export default Dashboard;
