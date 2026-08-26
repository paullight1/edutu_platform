import React, { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  BadgeDollarSign,
  Briefcase,
  Calendar,
  ChevronRight,
  Clock,
  Download,
  GraduationCap,
  LayoutGrid,
  List,
  Share2,
  Shuffle,
  Sparkles,
  Target,
  X,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { StateView, useScreenState } from "./state";
import CalendarStrip from "./CalendarStrip";
import EventsHomeSection from "./EventsHomeSection";
import MemberSettingsPanel from "./MemberSettingsPanel";
import type { CalendarEvent } from "./CalendarStrip";
import { useDarkMode } from "../hooks/useDarkMode";
import { useOpportunities } from "../hooks/useOpportunities";
import { useNavigate } from "react-router-dom";
import { usePersonalizedOpportunities } from "../hooks/usePersonalizedOpportunities";
import { usePersonalization } from "../hooks/usePersonalization";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePWA } from "../hooks/usePWA";
import { useToast } from "./ui/ToastProvider";
import type { AppUser } from "../types/user";
import type { OnboardingProfileData } from "../types/onboarding";
import {
  addBookmark,
  getBookmarks,
  removeBookmark,
  type BookmarkRecord,
} from "../services/bookmarks";
import { ImpressionTracker } from "./opportunity/ImpressionTracker";
import { getApplications, type ApplicationRecord } from "../services/applications";
import { getDeadlines, type Deadline } from "../services/deadlines";
import { fetchBackendProfile, type BackendProfile } from "../services/profile";
import { fetchHeroBanners } from "../services/webConfig";
import type { UserProfileForRecommendations } from "../services/personalizedRecommendations";
import type { Opportunity } from "../types/opportunity";
import { isOpportunityExpired } from "../services/opportunities";
import {
  shareOpportunity,
  shareOutcomeMessage,
} from "../services/opportunityShare";
import DashboardOpportunityCard from "./dashboard/DashboardOpportunityCard";
import { ProfileCompletionPrompt } from "./dashboard/ProfileCompletionPrompt";
import {
  dismissProfilePromptForSession,
  readDismissedProfilePromptSession,
  shouldShowProfileCompletionPrompt,
} from "./dashboard/profileCompletionPromptState";
import {
  createOpportunityShuffleSeed,
  shuffleOpportunityFeed,
} from "../lib/opportunityShuffle";

// The home feed is a fixed shortlist, not an endless scroll: six randomized
// picks per visit, with "View all" as the way deeper into the catalogue.
const HOME_FEED_SIZE = 6;
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

function opportunitySearchText(opportunity: Opportunity) {
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
  opportunity: Opportunity,
  category: DiscoveryCategory,
) {
  const text = opportunitySearchText(opportunity);

  return category.keywords.some((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword.toLowerCase())}\\b`, "i").test(text),
  );
}

function getDiscoveryCategoryRoute(category: DiscoveryCategory) {
  return `opportunities?category=${encodeURIComponent(category.id)}`;
}

type BannerAd = {
  image: string;
  url: string;
  alt: string;
  eyebrow?: string;
  title: string;
  subtitle: string;
  cta?: string;
};

// These launch creatives are right-sized for the 1200 × 300 dashboard card.
// Copy stays in HTML so it remains crisp, accessible, and easy to update.
const DEFAULT_BANNERS: BannerAd[] = [
  {
    image: "/advertising/dashboard-launch-mobile.png",
    url: "/download",
    alt: "Edutu mobile app floating above a glowing horizon with opportunity cards",
    eyebrow: "Coming soon to the web",
    title: "Edutu is landing in your browser",
    subtitle: "AI coaching, CV tools, and smarter application support are on the way.",
    cta: "See what is coming",
  },
  {
    image: "/advertising/dashboard-ai-matching.png",
    url: "/opportunities",
    alt: "Learner profile connected to scholarships and global opportunities by an AI compass",
    eyebrow: "AI-powered matching",
    title: "Find your next open door",
    subtitle: "Personalized scholarships, fellowships, and internships for your goals.",
    cta: "Explore opportunities",
  },
  {
    image: "/advertising/dashboard-mobile-features.png",
    url: "/download",
    alt: "Edutu mobile opportunity feed with saved cards, deadlines, and an application path",
    eyebrow: "Edutu mobile",
    title: "Save it. Track it. Make a move.",
    subtitle: "Keep every deadline and application in view — with the web experience coming soon.",
    cta: "Explore the app",
  },
  {
    image: "/advertising/dashboard-edutu-for-you.png",
    url: "/edutuforyou",
    alt: "African learners standing before a bright doorway to global opportunity",
    eyebrow: "Edutu For You",
    title: "One million young people. One open door.",
    subtitle: "Our impact program brings global opportunity closer to African learners.",
    cta: "See the impact",
  },
];

const BannerCarousel = React.memo(function BannerCarousel({
  banners,
  mobileHeight,
}: {
  banners: BannerAd[];
  mobileHeight?: string;
}) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setCurrent((prev) => (prev < banners.length ? prev : 0));
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || isPaused || reduceMotion) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length, isPaused, reduceMotion]);

  useEffect(() => {
    // Fetch the upcoming slide ahead of the rotation so it never flashes in.
    if (banners.length <= 1) return;
    const next = new Image();
    next.src = banners[(current + 1) % banners.length].image;
  }, [banners, current]);

  if (banners.length === 0) return null;

  const activeBanner = banners[current];
  const isExternal = activeBanner.url?.startsWith("http");

  return (
    <div
      className="group relative w-full overflow-hidden rounded-[20px] bg-[#06152f] shadow-[0_18px_45px_-28px_rgba(6,21,47,0.9)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={
        mobileHeight
          ? { height: mobileHeight, maxWidth: '800px', margin: '0 auto' }
          : {}
      }
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.a
          key={`${activeBanner.image}-${current}`}
          href={activeBanner.url || undefined}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          aria-label={activeBanner.title}
          className={`relative block w-full overflow-hidden ${
            activeBanner.url ? "cursor-pointer" : "pointer-events-none"
          }`}
          style={mobileHeight ? { height: mobileHeight } : { aspectRatio: "1200 / 300" }}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <img
            src={activeBanner.image}
            alt={activeBanner.alt}
            className="absolute inset-0 h-full w-full object-cover"
            loading={current === 0 ? "eager" : "lazy"}
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06152f]/95 via-[#06152f]/65 to-[#06152f]/5" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
          <div className="absolute inset-0 flex items-center px-5 py-4 sm:px-8">
            <div className="max-w-[72%] text-left sm:max-w-[58%]">
              {activeBanner.eyebrow ? (
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[#ffd166] sm:text-xs">
                  {activeBanner.eyebrow}
                </span>
              ) : null}
              <span className="mt-1 block text-base font-bold leading-tight tracking-tight text-white drop-shadow-sm sm:text-2xl">
                {activeBanner.title}
              </span>
              <span className="mt-1 block max-w-[32rem] text-[0.68rem] font-medium leading-relaxed text-white/80 drop-shadow-sm sm:text-sm">
                {activeBanner.subtitle}
              </span>
              {activeBanner.cta ? (
                <span className="mt-2 inline-flex rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[0.6rem] font-semibold text-white backdrop-blur-sm sm:mt-3 sm:px-3 sm:py-1.5 sm:text-xs">
                  {activeBanner.cta}
                  <ChevronRight size={13} className="ml-1" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </div>
        </motion.a>
      </AnimatePresence>

      {banners.length > 1 ? (
        <div className="absolute bottom-3 right-4 rounded-full bg-black/25 px-2.5 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Dashboard promotions">
            {banners.map((banner, index) => (
              <button
                key={banner.image}
                type="button"
                role="tab"
                aria-selected={index === current}
                aria-label={`Show promotion ${index + 1}`}
                onClick={() => {
                  setCurrent(index);
                  setIsPaused(false);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  index === current ? "w-1.5 bg-white" : "w-1.5 bg-white/45 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        Promotion {current + 1} of {banners.length}: {activeBanner.title}
      </span>
    </div>
  );
});

interface DashboardProps {
  user: AppUser | null;
  // Partial: callers navigating from a bookmark/application/deadline row only
  // have an id (+ maybe title/category), not a full feed row. The consumer
  // in App.tsx only reads `id` and forwards the rest as route state.
  onOpportunityClick: (opportunity: Partial<Opportunity>) => void;
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

/**
 * NOTE: not implemented. Dashboard forwards a ref but never calls
 * useImperativeHandle, so a caller passing a ref would get null here and
 * `ref.current.refreshOpportunities()` would throw. No caller passes one
 * today. Either implement it or drop the forwardRef.
 */
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
    // Unused: there is no useImperativeHandle here, so the DashboardRef
    // contract below is not actually implemented. No caller passes a ref
    // today, so nothing is broken — but see the note on DashboardRef.
    _ref,
  ) {
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
    const prefersReducedMotion = useReducedMotion();
    const { t } = useTranslation();
    const { getToken, sessionId } = useClerkAuth();
    const toast = useToast();
    const routerNavigate = useNavigate();
    const {
      preferences: personalizationPreferences,
      personalizeFeed,
      trackInteraction,
      explainOpportunity,
      isPersonalized,
      ready: personalizationReady,
    } = usePersonalization();
    const opportunitiesRefreshRef = useRef<() => void>();
    const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);

    const isOppBookmarked = useCallback(
      (opportunityId: string) =>
        bookmarks.some(
          (b) => b.opportunity_id === opportunityId,
        ),
      [bookmarks],
    );

    const handleToggleBookmark = useCallback(
      async (opportunity: Opportunity, e: React.MouseEvent) => {
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
          (b) => b.opportunity_id === opportunity.id,
        );
        try {
          if (saved) {
            await removeBookmark(user.id, opportunity.id, token);
            setBookmarks((prev) =>
              prev.filter((b) => b.id !== saved.id),
            );
            trackInteraction(opportunity, "bookmark", {
              value: -1,
              context: "unsave",
            });
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
            trackInteraction(opportunity, "bookmark");
            toast.success("Saved", "Added to your shortlist.");
          }
        } catch (err) {
          console.error("Failed to toggle bookmark:", err);
          toast.error("Could not save", "Please try again in a moment.");
        }
      },
      [bookmarks, getToken, toast, trackInteraction, user?.id],
    );

    const handleShareOpportunity = useCallback(
      async (opportunity: Opportunity, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        trackInteraction(opportunity, "share");
        const outcome = await shareOpportunity(opportunity);
        const message = shareOutcomeMessage(outcome);
        if (message) {
          (message.type === "success" ? toast.success : toast.error)(
            message.message,
          );
        }
      },
      [toast, trackInteraction],
    );

    const handleOpenOpportunity = useCallback(
      (opportunity: Opportunity) => {
        if (opportunity?.id) {
          trackInteraction(opportunity, "view", { context: "card_open" });
        }
        onOpportunityClick(opportunity);
      },
      [onOpportunityClick, trackInteraction],
    );
    const [applications, setApplications] = useState<ApplicationRecord[]>([]);
    const [dashboardDeadlines, setDashboardDeadlines] = useState<Deadline[]>(
      [],
    );
    const [profileScore, setProfileScore] = useState<{
      score: number;
      missingFields: string[];
      isMatchEnabled: boolean;
    } | null>(null);
    const [dismissedProfilePromptSessionId, setDismissedProfilePromptSessionId] =
      useState<string | null>(() =>
        readDismissedProfilePromptSession(
          typeof window === "undefined" ? null : window.sessionStorage,
        ),
      );
    const [backendProfile, setBackendProfile] = useState<BackendProfile | null>(null);
    // Hero banners are admin-managed (Settings → Web hero banners); the
    // hardcoded defaults only show until the public config loads or when the
    // admin list is empty/unreachable.
    const [heroBanners, setHeroBanners] = useState<BannerAd[]>(DEFAULT_BANNERS);

    const profilePromptSessionId =
      sessionId ?? (user?.id ? `user:${user.id}` : null);
    const showProfileCompletionPrompt = shouldShowProfileCompletionPrompt({
      isSignedIn: Boolean(user?.id),
      profileScore: profileScore?.score ?? null,
      dismissed:
        Boolean(profilePromptSessionId) &&
        dismissedProfilePromptSessionId === profilePromptSessionId,
    });

    const dismissProfileCompletionPrompt = useCallback(() => {
      if (!profilePromptSessionId) return;
      setDismissedProfilePromptSessionId(profilePromptSessionId);
      dismissProfilePromptForSession(
        typeof window === "undefined" ? null : window.sessionStorage,
        profilePromptSessionId,
      );
    }, [profilePromptSessionId]);

    const startProfileCompletion = useCallback(() => {
      dismissProfileCompletionPrompt();
      routerNavigate("/app/personalization");
    }, [dismissProfileCompletionPrompt, routerNavigate]);

    useEffect(() => {
      let cancelled = false;
      fetchHeroBanners().then((remote) => {
        if (cancelled || remote.length === 0) return;
        setHeroBanners(
          remote.map((banner) => ({
            image: banner.imageUrl,
            url: banner.linkUrl || "",
            alt: banner.title,
            title: banner.title,
            subtitle: banner.subtitle || "",
          })),
        );
      });
      return () => {
        cancelled = true;
      };
    }, []);

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
      // Preferences captured on the personalization screen take precedence;
      // the legacy onboardingProfile prop is kept as a fallback.
      if (
        personalizationPreferences &&
        (personalizationPreferences.interests.length > 0 ||
          personalizationPreferences.careerGoals.length > 0)
      ) {
        const prefs = personalizationPreferences;
        return {
          ...(prefs.interests.length ? { interests: prefs.interests } : {}),
          ...(prefs.preferredCategories.length
            ? { preferredCategories: prefs.preferredCategories }
            : {}),
          ...(prefs.careerGoals.length
            ? { careerGoals: prefs.careerGoals }
            : {}),
          ...(prefs.educationLevel
            ? { educationLevel: prefs.educationLevel }
            : {}),
          ...(prefs.location ? { location: prefs.location } : {}),
          ...(prefs.experienceLevel
            ? { experienceLevel: prefs.experienceLevel }
            : {}),
        };
      }
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
    }, [onboardingProfile, personalizationPreferences]);

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
        // The feed yields either a bare row or a scored { opportunity } wrapper
        // depending on whether recommendations are on — unwrap to the row.
        .map((item: Opportunity | { opportunity: Opportunity }) =>
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

      return normalizedOpportunityFeed.filter((opportunity: Opportunity) =>
        opportunityMatchesDiscoveryCategory(
          opportunity,
          selectedDiscoveryCategory,
        ),
      );
    }, [normalizedOpportunityFeed, selectedDiscoveryCategory]);

    // Rank by personalization score; only same-score tiers rotate between
    // visits so relevance survives while the feed still feels fresh.
    const shuffledOpportunityFeed = useMemo(
      () =>
        isPersonalized
          ? personalizeFeed(filteredOpportunityFeed, { seed: homeShuffleSeed })
          : shuffleOpportunityFeed(filteredOpportunityFeed, homeShuffleSeed),
      [filteredOpportunityFeed, homeShuffleSeed, isPersonalized, personalizeFeed],
    );

    // "Your Best Shots" — the top 3 genuinely winnable matches (score >= 60).
    // Deliberately tiny: the product promise is narrowing, not more scrolling.
    const bestShots = useMemo(() => {
      if (!user?.id || !isPersonalized) return [];
      return normalizedOpportunityFeed
        .filter((opportunity: Opportunity) => !isOpportunityExpired(opportunity))
        .map((opportunity: Opportunity) => ({
          opportunity,
          match: explainOpportunity(opportunity),
        }))
        .filter((item) => item.match.score >= 60)
        .sort((a, b) => b.match.score - a.match.score)
        .slice(0, 3);
    }, [explainOpportunity, isPersonalized, normalizedOpportunityFeed, user?.id]);

    const visibleHomeOpportunities = useMemo(
      () => shuffledOpportunityFeed.slice(0, HOME_FEED_SIZE),
      [shuffledOpportunityFeed],
    );

    // The feed's failure state, shared by all three render sites below. A
    // discovery category is a filter, so selecting one and finding nothing is
    // a filtered empty rather than "you have no recommendations" — a
    // distinction the primitive this replaces could not express.
    const feedState = useScreenState({
      data: normalizedOpportunityFeed,
      error: opportunityFeedError,
      filtersActive: Boolean(selectedDiscoveryCategory),
    });
    const feedEmptyState = { kind: "empty", reason: selectedDiscoveryCategory ? "filtered" : "firstRun" } as const;

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

    const mobilePersonalizedOpportunities = visibleHomeOpportunities;

    // The "More opportunities" grid reaches past the six-card shortlist so it
    // still has something new to show below the carousel.
    const mobileExploreOpportunities = useMemo(
      () => shuffledOpportunityFeed.slice(HOME_FEED_SIZE, HOME_FEED_SIZE + 6),
      [shuffledOpportunityFeed],
    );

    const mobileMoreOpportunityItems = useMemo(() => {
      const items: Array<{ key: string; opportunity: Opportunity }> = [];

      mobileExploreOpportunities.slice(0, 10).forEach((opportunity: Opportunity, index: number) => {
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
      return visibleHomeOpportunities.map((opportunity: Opportunity, index) => ({
        type: "opportunity" as const,
        key: opportunity?.id
          ? `opportunity-${opportunity.id}`
          : `opportunity-${index}`,
        opportunity,
      }));
    }, [visibleHomeOpportunities]);

    function handleShuffleOpportunities() {
      setHomeShuffleSeed(createOpportunityShuffleSeed());
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
        className={`rounded-2xl border border-subtle bg-surface-elevated p-5 text-center`}
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-text-muted`}
        >
          <Briefcase size={20} />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-text-primary">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-muted">
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
                className={`w-full rounded-2xl border border-subtle bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-text-primary">
                      {bookmark.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-text-muted">
                      {bookmark.opportunity_category || "Opportunity"}
                    </p>
                  </div>
                  <ChevronRight
                    size={17}
                    className="mt-1 shrink-0 text-text-muted"
                  />
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-text-muted">
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
                className={`w-full rounded-2xl border border-subtle bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-text-primary">
                      {application.opportunity_title}
                    </p>
                    <p className="mt-1 text-xs font-semibold capitalize text-text-muted">
                      {application.status || "tracked"}
                    </p>
                  </div>
                  <span className="rounded-lg bg-success/10 px-2 py-1 text-2xs font-semibold text-success">
                    Applied
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-text-muted">
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
                    className={`w-full rounded-2xl border border-subtle bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          item.daysUntil < 0
                            ? "bg-danger/10 text-danger"
                            : item.daysUntil <= 7
                              ? "bg-warning/10 text-warning"
                              : "bg-brand-500/10 text-brand-600"
                        }`}
                      >
                        <Calendar size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-5 text-text-primary">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs font-medium text-text-muted">
                          {formatPanelDate(item.date)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-surface-elevated px-2 py-1 text-2xs font-semibold text-text-secondary">
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
              className={`rounded-2xl border border-subtle bg-white p-4`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-base font-semibold text-white">
                  {(user?.name || user?.email || "E").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {user?.name || "Edutu learner"}
                  </p>
                  <p className="truncate text-xs font-semibold text-text-muted">
                    {user?.email || "Signed in member"}
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`rounded-2xl border border-subtle bg-white p-4`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text-primary">
                  Match readiness
                </p>
                <span className="text-sm font-semibold text-brand-600">
                  {score}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${score}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                {score >= 60
                  ? "Your profile has enough detail for ranked recommendations."
                  : "Add the missing details below so recommendations are less generic."}
              </p>
            </div>

            {profileScore?.missingFields?.length ? (
              <div
                className={`rounded-2xl border border-subtle bg-white p-4`}
              >
                <p className="text-sm font-semibold text-text-primary">
                  Missing details
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profileScore.missingFields.map((field) => (
                    <span
                      key={field}
                      className="rounded-lg bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setActivePanel(null);
                routerNavigate("/app/profile");
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Complete my profile
            </button>
            <button
              type="button"
              onClick={onViewAllOpportunities}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated"
            >
              Browse matched opportunities
            </button>
          </div>
        );
      }

      return <MemberSettingsPanel />;
    };

    return (
      <div
        className={`min-h-screen bg-surface-body text-text-primary font-body transition-colors duration-500 overflow-x-hidden ${embeddedDesktopShell ? "pb-0 pt-0 lg:pb-12" : "pb-[calc(5rem+env(safe-area-inset-bottom))] pt-14 md:pt-16 lg:pb-12"}`}
      >
        <ProfileCompletionPrompt
          open={showProfileCompletionPrompt}
          missingFields={profileScore?.missingFields ?? []}
          onComplete={startProfileCompletion}
          onDismiss={dismissProfileCompletionPrompt}
        />

        {/* Background Mesh Gradient */}
        <div className="fixed inset-0 pointer-events-none opacity-30 dark:opacity-20 mesh-gradient" />

        <AnimatePresence>
          {activePanel && (
            <>
              <motion.button
                type="button"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActivePanel(null)}
                className="fixed inset-0 z-40 bg-surface-overlay backdrop-blur-[2px] lg:hidden"
                aria-label="Close dashboard panel"
              />
              <motion.aside
                initial={prefersReducedMotion ? false : { opacity: 0, x: 28, y: 28 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: 28, y: 28 }}
                transition={{ duration: 0.22 }}
                className={`fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-hidden rounded-t-[24px] border-t border-subtle bg-surface-layer text-text-primary shadow-elevated lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-0 lg:h-[100dvh] lg:max-h-none lg:w-[390px] lg:rounded-none lg:border-l lg:border-t-0`}
                aria-label={`${PANEL_COPY[activePanel].title} panel`}
              >
                <div
                  className={`border-b border-subtle p-5`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={`text-2xs font-semibold uppercase tracking-[0.18em] text-text-muted`}
                      >
                        Dashboard panel
                      </p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-primary">
                        {PANEL_COPY[activePanel].title}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-text-muted">
                        {PANEL_COPY[activePanel].subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActivePanel(null)}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-surface-elevated`}
                      aria-label="Close panel"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="max-h-[calc(82dvh-116px)] overflow-y-auto p-5 lg:max-h-[calc(100dvh-7.25rem)]">
                  {renderDashboardPanel()}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <div
          className={`mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-8 transition-[padding] duration-300 ${activePanel ? "lg:pr-[420px]" : "lg:pr-8"}`}
        >
          <main className="min-w-0 px-0 py-5 space-y-6">
            <motion.section
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold tracking-tight text-text-primary">
                  {t("dashboard.sections.exploreOpportunities")}
                </h2>
                {selectedDiscoveryCategory ? (
                  <button
                    type="button"
                    onClick={() => setActiveDiscoveryCategory(null)}
                    className={`h-8 shrink-0 rounded-full border border-subtle bg-white px-3 text-xs font-semibold text-text-secondary shadow-sm transition hover:bg-surface-elevated active:scale-[0.98]`}
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
                          ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-body"
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
                        loading="lazy"
                        decoding="async"
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
                        <span className="min-w-0 flex-1 text-sm font-semibold leading-4 text-white md:flex-none md:text-sm">
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
                  initial={prefersReducedMotion ? false : { opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 100 }}
                  transition={{ duration: 0.3 }}
                  className="profile-completion-card relative overflow-hidden rounded-[20px] border border-subtle bg-surface-layer shadow-soft"
                >
                  <button
                    type="button"
                    onClick={() => setActivePanel("profile")}
                    className="group flex w-full items-center gap-3.5 p-4 pr-11 text-left transition hover:bg-surface-elevated/60"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                      <UserCheck size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {t("dashboard.completeProfile")}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-brand-600">
                          {profileScore.score}%
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-text-muted">
                        {!profileScore.isMatchEnabled
                          ? t("dashboard.needForMatches")
                          : profileScore.missingFields.length > 0
                            ? `Next: ${profileScore.missingFields[0]}`
                            : t("dashboard.profileBanner.unlock", {
                                score: profileScore.score,
                              })}
                      </span>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                        <motion.span
                          initial={prefersReducedMotion ? false : { width: 0 }}
                          animate={{ width: `${profileScore.score}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className={`block h-full rounded-full ${
                            profileScore.score >= 60
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                              : "bg-gradient-to-r from-amber-500 to-amber-400"
                          }`}
                        />
                      </span>
                    </span>
                    <ChevronRight
                      size={17}
                      className="shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-500"
                    />
                  </button>
                  <button
                    onClick={() => setDismissBanner(true)}
                    aria-label="Dismiss profile banner"
                    className="absolute right-2 top-2 rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-elevated"
                  >
                    <X size={14} />
                  </button>
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

            <EventsHomeSection variant="app" />

            {user?.id &&
              personalizationReady &&
              !isPersonalized &&
              !(profileScore && profileScore.score < 100 && !dismissBanner) && (
              <section>
                <button
                  type="button"
                  onClick={() => routerNavigate("/app/personalization")}
                  className="group flex w-full items-center gap-4 rounded-[24px] border border-subtle bg-gradient-to-r from-surface-brand to-surface p-4 text-left shadow-sm transition hover:border-brand-500/40 hover:shadow-md"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                    <Sparkles size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-text-primary">
                      Personalize your feed
                    </span>
                    <span className="mt-0.5 block text-xs font-medium leading-5 text-text-muted">
                      Pick your interests and goals so every opportunity here
                      is matched to you.
                    </span>
                  </span>
                  <ChevronRight
                    size={18}
                    className="shrink-0 text-brand-500 transition group-hover:translate-x-0.5"
                  />
                </button>
              </section>
            )}

            {showHomeScreenPrompt ? (
              <section className="sm:hidden">
                <div
                  className={`relative overflow-hidden rounded-[24px] border border-subtle bg-white p-4 shadow-sm`}
                >
                  <button
                    type="button"
                    onClick={closeHomeScreenPrompt}
                    className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-elevated hover:text-text-secondary`}
                    aria-label="Dismiss add to home screen prompt"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-start gap-3 pr-8">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                      {isInstallable ? <Download size={19} /> : <Share2 size={19} />}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-text-primary">
                        Add Edutu to Home Screen
                      </h2>
                      <p className="mt-1 text-xs font-semibold leading-5 text-text-muted">
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
                        <div className="flex-1 rounded-2xl bg-brand-500/10 px-3 py-2 text-xs font-semibold leading-5 text-brand-700">
                        Tap Share, then Add to Home Screen.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={closeHomeScreenPrompt}
                      className={`h-10 rounded-2xl bg-surface-elevated px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-brand`}
                    >
                      Later
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="sm:hidden mb-6">
              <BannerCarousel banners={heroBanners} mobileHeight="150px" />
            </section>

            {/* Your Best Shots — the winnable shortlist, always above the feed */}
            {user?.id && personalizationReady && !opportunitiesLoading ? (
              <motion.section
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                aria-labelledby="best-shots-heading"
              >
                <div className="rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                      <Target size={19} />
                    </span>
                    <div className="min-w-0">
                      <h2
                        id="best-shots-heading"
                        className="text-lg font-semibold tracking-tight text-text-primary"
                      >
                        Your Best Shots
                      </h2>
                      <p className="mt-0.5 text-xs font-medium leading-5 text-text-muted">
                        Fewer, winnable — these are yours.
                      </p>
                    </div>
                  </div>

                  {bestShots.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {bestShots.map(({ opportunity }) => (
                        <DashboardOpportunityCard
                          key={opportunity.id}
                          opportunity={opportunity}
                          variant="grid"
                          isBookmarked={isOppBookmarked(opportunity.id)}
                          isDarkMode={isDarkMode}
                          onOpen={handleOpenOpportunity}
                          onToggleBookmark={handleToggleBookmark}
                          onShare={handleShareOpportunity}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-subtle bg-surface-elevated p-5 text-center">
                      <p className="text-sm font-semibold text-text-primary">
                        No strong matches yet — and that&apos;s fixable.
                      </p>
                      <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-5 text-text-muted">
                        The more Edutu knows about your field, goals and region,
                        the sharper this shortlist gets.
                      </p>
                      <button
                        type="button"
                        onClick={() => routerNavigate("/app/personalization")}
                        className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-[0.98]"
                      >
                        <Sparkles size={15} />
                        Complete your profile
                      </button>
                    </div>
                  )}
                </div>
              </motion.section>
            ) : null}

            {/* Content Layout — Recent Activity moved to the profile page,
                so the feed always gets the full width. */}
            <div className="grid lg:grid-cols-12 gap-8 pb-8">
              <div className="lg:col-span-12 space-y-10">
                {/* Recommended Opportunities */}
                <section>
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-success/10 text-success">
                          <Briefcase size={19} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold tracking-tight text-text-primary">
                            {t("dashboard.sections.recommendedPicks")}
                          </h2>
                          <p
                            className={`truncate text-xs font-normal text-text-muted`}
                          >
                            {selectedDiscoveryCategory
                              ? selectedDiscoveryCategory.title
                              : t("dashboard.forYou")}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div
                          className={`hidden sm:flex items-center gap-1 rounded-2xl border border-subtle bg-white p-1 shadow-sm`}
                        >
                          <button
                            type="button"
                            onClick={() => setViewMode("grid")}
                            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-all ${
                              viewMode === "grid"
                                ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20"
                                : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
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
                                : "text-text-muted hover:bg-surface-elevated hover:text-text-primary"
                            }`}
                            aria-label="List view"
                          >
                            <List size={15} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={handleShuffleOpportunities}
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-white text-xs font-semibold text-text-secondary shadow-sm transition-all hover:border-strong hover:text-text-primary active:scale-[0.98] sm:h-10 sm:w-auto sm:rounded-2xl sm:px-3`}
                          aria-label="Shuffle recommended opportunities"
                          title={t("dashboard.shuffle")}
                        >
                          <Shuffle size={14} />
                          <span className="hidden sm:inline">{t("dashboard.shuffle")}</span>
                        </button>
                        <button
                          type="button"
                          onClick={onViewAllOpportunities}
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-white text-xs font-semibold text-text-secondary shadow-sm transition-all hover:border-strong hover:text-text-primary sm:h-10 sm:w-auto sm:rounded-2xl sm:px-3`}
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
                            className={`h-44 w-[62vw] max-w-[250px] shrink-0 animate-pulse rounded-2xl bg-surface-elevated`}
                          />
                        ))}
                      </div>
                    ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                      <div
                        className={`rounded-2xl border border-subtle bg-white`}
                      >
                        <StateView
                          state={feedState}
                          flow="home"
                          onRetry={hookRefreshOpportunities}
                        />
                      </div>
                    ) : mobilePersonalizedOpportunities.length === 0 ? (
                      <div
                        className={`rounded-2xl border border-subtle bg-white`}
                      >
                        <StateView
                          state={feedEmptyState}
                          flow="home"
                          title={opportunityEmptyTitle}
                          body={opportunityEmptyDescription}
                          actionLabel={opportunityEmptyAction.label}
                          onAction={opportunityEmptyAction.onClick}
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <div
                            className="mobile-personalized-carousel -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            aria-label="Personalized opportunities carousel"
                          >
                            {mobilePersonalizedOpportunities.map(
                              (opportunity: Opportunity, index: number) => (
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
                                  onOpen={handleOpenOpportunity}
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
                              className="mobile-personalized-card flex h-44 w-28 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface-elevated px-3 text-center text-xs font-semibold text-text-secondary transition active:scale-[0.98]"
                            >
                              {selectedDiscoveryCategory ? t("dashboard.empty.showAll") : t("dashboard.viewAll")}
                              <ChevronRight size={16} />
                            </button>
                          </div>

                          <div className="mb-3 min-w-0">
                            <h3 className="text-lg font-semibold tracking-tight text-text-primary">
                              {selectedDiscoveryCategory
                                ? t("dashboard.categoryOpportunities", { category: selectedDiscoveryCategory.title })
                                : t("dashboard.moreOpportunities")}
                            </h3>
                            <p className="text-xs font-medium text-text-muted">
                              {selectedDiscoveryCategory
                                ? t("dashboard.filteredBySelection")
                                : t("dashboard.scrollDown")}
                            </p>
                          </div>
                          <div className="mobile-more-opportunities-grid grid w-full grid-cols-2 items-stretch gap-3 overflow-hidden">
                            {mobileMoreOpportunityItems.map((item) => {
                              const { opportunity } = item;

                              return (
                                <DashboardOpportunityCard
                                  key={item.key}
                                  opportunity={opportunity}
                                  variant="mobileGrid"
                                  isBookmarked={isOppBookmarked(opportunity.id)}
                                  isDarkMode={isDarkMode}
                                  onOpen={handleOpenOpportunity}
                                  onToggleBookmark={handleToggleBookmark}
                                  onShare={handleShareOpportunity}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={onViewAllOpportunities}
                            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-subtle bg-white text-sm font-semibold text-text-secondary shadow-sm transition hover:border-strong hover:bg-surface-elevated active:scale-[0.99]"
                          >
                            {t("dashboard.viewMore")}
                            <ChevronRight size={17} strokeWidth={2.4} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="hidden sm:block mb-6">
                    <BannerCarousel banners={heroBanners} />
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
                              className={`h-32 bg-surface-elevated`}
                            />
                            <div className="p-4 space-y-3">
                              <div
                                className={`h-3 w-1/2 rounded bg-surface-elevated`}
                              />
                              <div
                                className={`h-4 w-4/5 rounded bg-surface-elevated`}
                              />
                            </div>
                          </div>
                        ))
                      ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                        <div
                          className={`col-span-full rounded-[20px] border border-subtle bg-white`}
                        >
                          <StateView
                            state={feedState}
                            flow="home"
                            onRetry={hookRefreshOpportunities}
                          />
                        </div>
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`col-span-full rounded-[20px] border border-subtle bg-white`}
                        >
                          <StateView
                            state={feedEmptyState}
                            flow="home"
                            title={opportunityEmptyTitle}
                            body={opportunityEmptyDescription}
                            actionLabel={opportunityEmptyAction.label}
                            onAction={opportunityEmptyAction.onClick}
                            secondaryActionLabel={
                              selectedDiscoveryCategory
                                ? t("dashboard.browseAll")
                                : t("dashboard.improveProfile")
                            }
                            onSecondaryAction={
                              selectedDiscoveryCategory
                                ? onViewAllOpportunities
                                : () => setActivePanel("profile")
                            }
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item, feedIndex) => {
                          const { opportunity } = item;
                          return (
                            <ImpressionTracker
                              key={item.key}
                              opportunityId={opportunity.id}
                              surface="web_home_grid"
                              position={feedIndex}
                              getToken={getToken}
                            >
                              <DashboardOpportunityCard
                                opportunity={opportunity}
                                variant="grid"
                                isBookmarked={isOppBookmarked(opportunity.id)}
                                isDarkMode={isDarkMode}
                                onOpen={handleOpenOpportunity}
                                onToggleBookmark={handleToggleBookmark}
                                onShare={handleShareOpportunity}
                              />
                            </ImpressionTracker>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div
                      className={`hidden overflow-hidden rounded-2xl border border-subtle bg-white sm:block`}
                    >
                      {opportunitiesLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-20 rounded-xl animate-pulse bg-surface-elevated"
                          />
                        ))
                      ) : feedErrorMessage && normalizedOpportunityFeed.length === 0 ? (
                        <div
                          className={`rounded-[20px] border border-subtle bg-white`}
                        >
                          <StateView
                            state={feedState}
                            flow="home"
                            onRetry={hookRefreshOpportunities}
                          />
                        </div>
                      ) : homeFeedItems.length === 0 ? (
                        <div
                          className={`rounded-[20px] border border-subtle bg-white`}
                        >
                          <StateView
                            state={feedEmptyState}
                            flow="home"
                            title={opportunityEmptyTitle}
                            body={opportunityEmptyDescription}
                            actionLabel={opportunityEmptyAction.label}
                            onAction={opportunityEmptyAction.onClick}
                            secondaryActionLabel={
                              selectedDiscoveryCategory
                                ? t("dashboard.browseAll")
                                : t("dashboard.improveProfile")
                            }
                            onSecondaryAction={
                              selectedDiscoveryCategory
                                ? onViewAllOpportunities
                                : () => setActivePanel("profile")
                            }
                          />
                        </div>
                      ) : (
                        homeFeedItems.map((item, feedIndex) => {
                          const { opportunity } = item;
                          return (
                            <ImpressionTracker
                              key={item.key}
                              opportunityId={opportunity.id}
                              surface="web_home_list"
                              position={feedIndex}
                              getToken={getToken}
                            >
                              <DashboardOpportunityCard
                                opportunity={opportunity}
                                variant="list"
                                isBookmarked={isOppBookmarked(opportunity.id)}
                                isDarkMode={isDarkMode}
                                onOpen={handleOpenOpportunity}
                                onToggleBookmark={handleToggleBookmark}
                                onShare={handleShareOpportunity}
                              />
                            </ImpressionTracker>
                          );
                        })
                      )}
                    </div>
                  )}
                </section>

              </div>

            </div>
          </main>
        </div>

        {/* Footer now comes from AppWorkspaceShell (AppFooter) so every
            screen gets it, not just the dashboard. */}
      </div>
    );
  },
);

export default Dashboard;
