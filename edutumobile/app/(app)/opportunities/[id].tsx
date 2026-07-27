import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Share,
  Image,
  StyleSheet,
  Alert,
  Platform,
  Modal,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  MapPin,
  Users,
  ExternalLink,
  Share2,
  Bookmark,
  BookmarkCheck,
  Award,
  Globe,
  TrendingUp,
  Target,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
  Zap,
  FileText,
  ListChecks,
  Bell,
  AlertCircle,
  Info,
  Plus,
  Check,
  EyeOff,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useTheme } from "../../../components/context/ThemeContext";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { withAlpha } from "../../../components/ui/BottomScrim";
import { BrandedLoader } from "../../../components/ui/BrandedLoader";
import { supabase } from "../../../lib/supabase";
import { useGuestMode } from "../../../lib/guestModeStore";
import { useAuthWall } from "../../../components/context/AuthWallContext";
import {
  getOpportunityWithStatus,
  getCachedOpportunitiesSnapshot,
  getCachedOpportunity,
} from "@edutu/core/src/services/opportunities";
import {
  isOpportunitySaved,
  saveOpportunity,
  unsaveOpportunity,
} from "../../../packages/core/src/services/bookmarks";
import { trackOpportunityApplication } from "../../../packages/core/src/services/applications";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { dismissOpportunity } from "@edutu/core/src/services/dismissedOpportunities";
import type { DismissReason } from "@edutu/core/src/services/opportunitySignals";
import { DismissReasonSheet } from "../../../components/opportunity/DismissReasonSheet";
import { OpportunityHero } from "../../../components/opportunity/OpportunityHero";
import { DecisionStrip } from "../../../components/opportunity/DecisionStrip";
import { FitPanel } from "../../../components/opportunity/FitPanel";
import { FactRows, type Fact } from "../../../components/opportunity/FactRows";
import { CollapsibleSection } from "../../../components/opportunity/CollapsibleSection";
import { RequirementChecklist } from "../../../components/opportunity/RequirementChecklist";
import { StickyApplyBar } from "../../../components/opportunity/StickyApplyBar";
import {
  MATCH_TIER_KEY,
  cleanLocation,
  decodeMaybe,
  getMatchTier,
  previewText,
} from "../../../lib/opportunityDisplay";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { useGoals } from "@edutu/core/src/hooks/useGoals";
import { useCredits } from "@edutu/core/src/hooks/useCredits";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { LinearGradient } from "expo-linear-gradient";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { getConfig } from "../../../lib/config";
import i18n from "../../../lib/i18n";
import {
  generateRoadmap,
  AIGeneratedRoadmap,
  ApplicantProfile,
} from "@edutu/core/src/services/aiRoadmapGenerator";
import { isAiBillingError } from "@edutu/core/src/services/productApi";
import { useUpgradeSheet } from "../../../components/context/UpgradeSheetContext";
import { useStaggeredReveal } from "../../../packages/core/src/hooks/useStaggeredReveal";
import { RoadmapTimeline } from "../../../components/roadmap/RoadmapTimeline";
import {
  RoadmapIntake,
  type RoadmapIntakeValue,
} from "../../../components/roadmap/RoadmapIntake";
import { exportRoadmapToCalendar } from "../../../lib/roadmapCalendar";
import { notificationService } from "../../../lib/notifications";
import { syncRoadmapToCalendar } from "../../../lib/calendarSync";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import { AiOrbBadge } from "../../../components/ui/AiOrbBadge";
import { AiActionBar } from "../../../components/ai/AiActionBar";
import { AiAssistRow, AiAssistTile } from "../../../components/ai/AiAssistTile";
import {
  BubbleChatQuestionIcon,
  Navigation03Icon,
  Target02Icon,
} from "../../../components/ui/icons";
import { accentGradient } from "../../../lib/themeGradient";
import type { AiAction, AiActionResult } from "../../../components/ai/AiActionBar";
import { DocumentUpload } from "../../../components/ai/DocumentUpload";
import { useAiAction } from "../../../hooks/useAiAction";
// The chat screen consumes this on mount to open a specific thread; it is the
// only hand-off channel it exposes (named for its first caller, voice mode).
import { setVoiceModeThread as setPendingChatThread } from "../../../lib/voiceModeStore";
import Reanimated, {
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
  Path,
} from "react-native-svg";

// Public Edutu opportunity page. Shares must point here — a branded landing that
// tracks and routes to Apply — NOT the raw third-party application link.
const EDUTU_WEB_URL = "https://www.edutu.org";
const TUNE_DISMISS_KEY = "edutu:tunePlanDismissed";
// Scroll depth at which the in-flow primary CTA has left the viewport and the
// sticky bar takes over. Roughly hero + title + decision block.
const STICKY_BAR_REVEAL_Y = 420;
function buildOpportunityShareUrl(id: string): string {
  return `${EDUTU_WEB_URL}/opportunity/${encodeURIComponent(id)}`;
}

type RoadmapStep =
  | "overview"
  | "milestones"
  | "weekly"
  | "checklist"
  | "confirm";

// Phases shown while the plan generates. They map to real work: build the dated
// scaffold, then personalize the narrative with the backend LLM.
// Each entry is an i18n key in the 'opps' namespace, translated at render time.
const GENERATION_PHASES = [
  "detail.generating.phase1",
  "detail.generating.phase2",
  "detail.generating.phase3",
  "detail.generating.phase4",
] as const;

const SHARE_TEXT_LIMITS = {
  summary: 360,
  section: 132,
  apply: 160,
};

function cleanShareText(
  value?: string | null,
  fallback = i18n.t("opps:detail.share.notSpecified"),
): string {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || fallback;
}

function clampShareText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function formatShareDeadline(deadline?: string | null): string {
  if (!deadline) return i18n.t("opps:detail.share.rollingNotSpecified");
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  // Day-month-year (e.g. "31 July 2026") to match Edutu's audience.
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getShareFunding(opportunity: Opportunity): string {
  if (opportunity.stipend) {
    const amount = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(opportunity.stipend);
    return `${opportunity.currency || ""} ${amount}`.trim();
  }

  const fundedBenefit = opportunity.benefits?.find((benefit) =>
    /fund|stipend|tuition|grant|award/i.test(benefit),
  );
  return cleanShareText(
    fundedBenefit,
    opportunity.category?.toLowerCase().includes("scholarship")
      ? i18n.t("opps:detail.share.fundingAvailable")
      : i18n.t("opps:detail.share.openOpportunity"),
  );
}

function getShareEligibility(opportunity: Opportunity): string {
  const eligibility = opportunity.eligibility || {};
  const countries = eligibility.countries;
  const level =
    eligibility.level || eligibility.degree || eligibility.education_level;

  if (Array.isArray(countries) && countries.length > 0) {
    return countries.length > 3
      ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`
      : countries.join(", ");
  }

  if (typeof countries === "string") return countries;
  if (typeof level === "string") return level;
  return opportunity.location || i18n.t("opps:detail.share.openToEligible");
}

function getShareBullets(
  items?: string[],
  fallback?: string,
  limit = 5,
): string[] {
  const cleaned = (items || [])
    .map((item) =>
      clampShareText(cleanShareText(item, ""), SHARE_TEXT_LIMITS.section),
    )
    .filter(Boolean);

  if (cleaned.length > 0) return cleaned.slice(0, limit);
  return fallback
    ? [clampShareText(cleanShareText(fallback), SHARE_TEXT_LIMITS.section)]
    : [i18n.t("opps:detail.share.detailsInApp")];
}

/**
 * WhatsApp-native fallback caption for the detail screen (used only when the
 * backend share-card call fails — otherwise the backend's canonical shareText
 * ships). WhatsApp markdown (*bold*, _italic_, "- " bullets); each optional
 * row is conditional so no empty label is rendered. This is the text caption —
 * the rendered ViewShot card below builds its own labelled tiles separately.
 */
function buildMobileOpportunityShareText(opportunity: Opportunity): string {
  const title = cleanShareText(
    opportunity.title,
    i18n.t("opps:detail.share.fallbackTitle"),
  );
  const summary = clampShareText(
    cleanShareText(opportunity.aiSummary || opportunity.description || "", ""),
    SHARE_TEXT_LIMITS.summary,
  );
  const type = cleanShareText(opportunity.category, "");
  const duration = cleanShareText(
    (opportunity as any).duration ||
      (opportunity as any).program_duration ||
      "",
    "",
  );
  const audience = cleanShareText(
    (opportunity as any).targetAudience ||
      (opportunity as any).target_audience ||
      "",
    "",
  );
  const deadline = formatShareDeadline(opportunity.deadline);
  const gains = (opportunity.benefits || [])
    .map((benefit) =>
      clampShareText(cleanShareText(benefit, ""), SHARE_TEXT_LIMITS.section),
    )
    .filter(Boolean)
    .slice(0, 5);

  const lines: string[] = [`*${title}*`];

  if (summary) lines.push("", `_${summary}_`);

  const facts: string[] = [];
  if (type) facts.push(`- *${i18n.t("opps:detail.share.typeLabel")}:* ${type}`);
  if (duration) {
    facts.push(`- *${i18n.t("opps:detail.share.durationLabel")}:* ${duration}`);
  }
  if (audience) {
    facts.push(`- *${i18n.t("opps:detail.share.audienceLabel")}:* ${audience}`);
  }
  facts.push(`- *${i18n.t("opps:detail.share.deadlineLabel")}:* ${deadline}`);
  lines.push("", ...facts);

  if (gains.length > 0) {
    lines.push(
      "",
      `*${i18n.t("opps:detail.share.whatYouGain")}:*`,
      "",
      ...gains.map((gain) => `- ${gain}`),
    );
  }

  lines.push(
    "",
    `*${i18n.t("opps:detail.share.applyHere")}:*`,
    "",
    buildOpportunityShareUrl(opportunity.id),
  );

  return lines.join("\n");
}

async function getBackendSharePayload(
  opportunity: Opportunity,
): Promise<{
  imageUrl: string | null;
  shareText: string;
  shareUrl?: string | null;
}> {
  const fallbackText = buildMobileOpportunityShareText(opportunity);
  if (opportunity.shareImageUrl) {
    return { imageUrl: opportunity.shareImageUrl, shareText: fallbackText };
  }

  try {
    const response = await fetch(
      `${getConfig().apiBaseUrl}/opportunities/${opportunity.id}/share-card`,
      {
        method: "POST",
      },
    );
    if (!response.ok) return { imageUrl: null, shareText: fallbackText };

    const payload = await response.json();
    return {
      imageUrl:
        typeof payload?.shareCard?.url === "string"
          ? payload.shareCard.url
          : null,
      shareText:
        typeof payload?.shareText === "string"
          ? payload.shareText
          : fallbackText,
      shareUrl: typeof payload?.shareUrl === "string" ? payload.shareUrl : null,
    };
  } catch {
    return { imageUrl: null, shareText: fallbackText };
  }
}

async function downloadShareImage(
  url: string,
  opportunityId: string,
): Promise<{ uri: string; mimeType: string } | null> {
  try {
    const extension = url.toLowerCase().includes(".svg") ? "svg" : "png";
    const mimeType = extension === "svg" ? "image/svg+xml" : "image/png";
    const target = new File(
      Paths.cache,
      `edutu-opportunity-${opportunityId}.${extension}`,
    );
    const file = await File.downloadFileAsync(url, target);
    return { uri: file.uri, mimeType };
  } catch {
    return null;
  }
}

// Glossy AI orb — purple/blue gradient glass sphere with a frosted 4-point
// sparkle at its core (echoes the reference "AI" logo). Self-contained: the
// SVG draws the whole orb, so the FAB behind it stays transparent.
function AiOrbIcon({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        {/* deep purple body, lighter toward the upper-left */}
        <RadialGradient id="orbBody" cx="38%" cy="30%" r="78%">
          <Stop offset="0%" stopColor="#d7cbff" />
          <Stop offset="38%" stopColor="#9a86f2" />
          <Stop offset="70%" stopColor="#6d54e6" />
          <Stop offset="100%" stopColor="#4331c9" />
        </RadialGradient>
        {/* electric-blue swirl in the lower-right */}
        <RadialGradient id="orbBlue" cx="74%" cy="66%" r="46%">
          <Stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
          <Stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
        </RadialGradient>
        {/* glossy top-left sheen */}
        <RadialGradient id="orbGloss" cx="30%" cy="22%" r="42%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.6} />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
        {/* bright rim light at the bottom */}
        <RadialGradient id="orbRim" cx="50%" cy="50%" r="50%">
          <Stop offset="82%" stopColor="#ffffff" stopOpacity={0} />
          <Stop offset="97%" stopColor="#ffffff" stopOpacity={0.5} />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity={0.1} />
        </RadialGradient>
      </Defs>

      <Circle cx="24" cy="24" r="23.5" fill="url(#orbBody)" />
      <Circle cx="24" cy="24" r="23.5" fill="url(#orbBlue)" />
      <Circle cx="24" cy="24" r="23.5" fill="url(#orbGloss)" />
      <Circle cx="24" cy="24" r="23.5" fill="url(#orbRim)" />

      {/* frosted 4-point sparkle */}
      <Path
        d="M24 8.5C25.1 18.6 29.4 22.9 39.5 24C29.4 25.1 25.1 29.4 24 39.5C22.9 29.4 18.6 25.1 8.5 24C18.6 22.9 22.9 18.6 24 8.5Z"
        fill="#ffffff"
        fillOpacity={0.9}
      />
    </Svg>
  );
}

// Floating "jump to AI" button — a bouncing gradient AI orb that opens the AI
// co-pilot (personalized checklist, essay questions, outlines, roadmap…).
function AiCopilotFab({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  const jump = useSharedValue(0);

  useEffect(() => {
    jump.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 420, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 520, easing: Easing.bounce }),
          withTiming(0, { duration: 900 }), // brief rest between hops
        ),
        -1,
        false,
      ),
    );
  }, [jump]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: jump.value }],
  }));

  return (
    <Reanimated.View
      style={[styles.aiFab, animatedStyle]}
      entering={FadeInDown.duration(400).delay(300)}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.aiFabBtn, { shadowColor: "#6d54e6" }]}
      >
        <AiOrbIcon size={56} />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

export default function OpportunityDetailScreen() {
  const { t } = useTranslation("opps");
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getToken, isSignedIn } = useAuth();
  const { isDark, colors } = useTheme();
  const upgradeSheet = useUpgradeSheet();
  // Win-coach inline actions for this opportunity; a freshly uploaded CV is
  // passed to the fit check so the AI reasons over the user's real document.
  const [winCoachUploadId, setWinCoachUploadId] = useState<string | undefined>(
    undefined,
  );
  // Thread the win-coach replies landed in, so the user can open them in chat
  // instead of losing the advice when the sheet closes.
  const [winCoachThreadId, setWinCoachThreadId] = useState<string | null>(null);
  const runWinCoach = useAiAction({
    surface: "opportunity_detail",
    opportunityId: id,
    uploadId: winCoachUploadId,
  });

  // Guests may read + share this opportunity, but applying, saving, dismissing,
  // planning, and AI all require an account — raise the wall instead.
  const { isGuest } = useGuestMode();
  const authWall = useAuthWall();
  const isGuestBrowsing = !isSignedIn && isGuest;
  // Narrowed locals so memoized callbacks depend on exactly these values —
  // reading `user.id`/`user.unsafeMetadata` inside a callback makes the
  // compiler infer a dependency on the whole `user` object.
  const userId = user?.id;
  const userUnsafeMetadata = user?.unsafeMetadata;
  const { createGoal, updateGoal } = useGoals(supabase, user?.id || null);
  const { credits } = useCredits(supabase, user?.id || null);
  const { isPro } = useProStatus(supabase, user?.id || null);
  const ROADMAP_CREDIT_COST = 10;

  // Mount-time clock snapshot for render-side deadline math: day-granularity
  // arithmetic doesn't need a live clock, and Date.now() during render is impure.
  const [now] = useState(() => Date.now());
  // Scroll offset drives the hero parallax (shared value, UI thread) and the
  // sticky action bar (React state, flipped only on threshold crossings so a
  // 60 fps scroll doesn't re-render the screen).
  const scrollY = useSharedValue(0);
  const [stickyVisible, setStickyVisible] = useState(false);
  const stickyVisibleRef = useRef(false);
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated SharedValue write; the library's documented imperative API
      scrollY.value = y;
      const shouldShow = y > STICKY_BAR_REVEAL_Y;
      if (shouldShow !== stickyVisibleRef.current) {
        stickyVisibleRef.current = shouldShow;
        setStickyVisible(shouldShow);
      }
    },
    [scrollY],
  );
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  // True only when the fetch failed for network reasons AND nothing is cached —
  // distinguishes "couldn't load" (retryable) from a definitive "not found".
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const shareCardRef = React.useRef<React.ComponentRef<typeof ViewShot>>(null);

  const [showRoadmapModal, setShowRoadmapModal] = useState(false);
  const [roadmapStep, setRoadmapStep] = useState<RoadmapStep>("overview");
  const [generatedRoadmap, setGeneratedRoadmap] =
    useState<AIGeneratedRoadmap | null>(null);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  const [intake, setIntake] = useState<RoadmapIntakeValue>({});
  // "Tune your plan" is optional and secondary — keep it collapsed by default,
  // and let the user dismiss it for good so it doesn't always take up space.
  const [tuneExpanded, setTuneExpanded] = useState(false);
  const [tuneDismissed, setTuneDismissed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TUNE_DISMISS_KEY)
      .then((value) => {
        if (value === "true") setTuneDismissed(true);
      })
      .catch(() => undefined);
  }, []);

  const dismissTune = useCallback(() => {
    setTuneExpanded(false);
    setTuneDismissed(true);
    AsyncStorage.setItem(TUNE_DISMISS_KEY, "true").catch(() => undefined);
  }, []);
  const [completedMilestoneIds, setCompletedMilestoneIds] = useState<string[]>(
    [],
  );
  const [selectedChecklistItems, setSelectedChecklistItems] = useState<
    string[]
  >([]);
  const [customMilestones, setCustomMilestones] = useState<any[]>([]);
  const [addingCustomMilestone, setAddingCustomMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDesc, setNewMilestoneDesc] = useState("");

  // Advance the generation phases while the plan is being built, so the wait
  // reads as authored progress rather than a static spinner. The phase reset
  // happens via adjust-during-render (React's documented alternative to a
  // state-syncing effect); the effect only schedules the interval.
  const [prevGeneratingRoadmap, setPrevGeneratingRoadmap] = useState(generatingRoadmap);
  if (prevGeneratingRoadmap !== generatingRoadmap) {
    setPrevGeneratingRoadmap(generatingRoadmap);
    if (!generatingRoadmap) setGenerationPhase(0);
  }
  useEffect(() => {
    if (!generatingRoadmap) return;
    const timer = setInterval(() => {
      setGenerationPhase((phase) =>
        Math.min(phase + 1, GENERATION_PHASES.length - 1),
      );
    }, 850);
    return () => clearInterval(timer);
  }, [generatingRoadmap]);

  // Milestones assemble one-by-one when the user opens the milestones step.
  const milestoneRevealCount = useStaggeredReveal(customMilestones.length, {
    enabled: roadmapStep === "milestones",
  });

  const viewRecordedRef = useRef(false);
  const [dismissSheetVisible, setDismissSheetVisible] = useState(false);
  /** Set when the detail actually renders content; read at unmount for dwell. */
  const dwellRef = useRef<{ opportunityId: string; startedAt: number } | null>(null);
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    // Written post-commit rather than during render: a concurrent render that
    // React discards must not leave its getToken behind in the ref.
    getTokenRef.current = getToken;
  });

  const backgroundColor = colors.background;
  const textPrimary = colors.foreground;
  const textSecondary = isDark ? "#94A3B8" : "#64748B";
  const cardBg = colors.card;
  const borderColor = colors.border;

  useEffect(() => {
    let cancelled = false;
    const fetchOpportunity = async () => {
      if (!id) return;
      setLoading(true);
      setLoadFailed(false);

      // Paint instantly from cache so the detail never sits on a blank spinner
      // (or the "not found" scaffold) while the fresh record loads. Prefer the
      // full per-id detail cache — it also covers opportunities opened from a
      // deep link / push / widget that aren't in the list snapshot — then fall
      // back to the lighter list snapshot.
      try {
        const cachedDetail = await getCachedOpportunity(id);
        if (cachedDetail && !cancelled) {
          setOpportunity(cachedDetail);
          setLoading(false);
        } else {
          const snapshot = await getCachedOpportunitiesSnapshot(user?.id);
          const cached = snapshot.find((o) => o.id === id);
          if (cached && !cancelled) {
            setOpportunity(cached);
            setLoading(false);
          }
        }
      } catch {
        // Cache is best-effort; ignore and fall through to the network fetch.
      }

      try {
        const { opportunity: data, status } = await getOpportunityWithStatus(id, supabase);
        if (!cancelled) {
          if (data) {
            setOpportunity(data);
          } else if (status === "error") {
            // Network failure with no cached copy: show the retryable error
            // screen instead of the definitive "not found" scaffold.
            setLoadFailed(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch opportunity:", error);
        if (!cancelled) {
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchOpportunity();
    return () => {
      cancelled = true;
    };
  }, [id, user?.id, retryNonce]);

  useEffect(() => {
    const checkSaved = async () => {
      if (!user || !id) return;
      const isSaved = await isOpportunitySaved(supabase, user.id, id, getToken);
      setBookmarked(isSaved);
    };
    checkSaved();
  }, [getToken, user, id]);

  useEffect(() => {
    if (!id || !opportunity || viewRecordedRef.current) return;
    viewRecordedRef.current = true;
    dwellRef.current = { opportunityId: id, startedAt: Date.now() };
    void recordOpportunitySignal(
      {
        opportunityId: id,
        signalType: "view",
        signalValue: 2,
        source: "mobile_detail",
        context: "detail_loaded",
        details: {
          title: opportunity.title,
          match: opportunity.match,
        },
      },
      getToken,
    );
  }, [getToken, id, opportunity]);

  // Dwell: time actually spent on the detail is a stronger interest tell than
  // opening it. Sent once on unmount, bucketed (1: 10–30s, 2: 30–90s, 3: 90s+)
  // so the ranking weight scales with real reading time.
  useEffect(() => {
    return () => {
      const dwell = dwellRef.current;
      if (!dwell) return;
      const seconds = Math.round((Date.now() - dwell.startedAt) / 1000);
      if (seconds < 10) return;
      const bucket = seconds >= 90 ? 3 : seconds >= 30 ? 2 : 1;
      void recordOpportunitySignal(
        {
          opportunityId: dwell.opportunityId,
          signalType: "dwell",
          signalValue: bucket,
          source: "mobile_detail",
          context: "detail_dwell",
          details: { seconds },
        },
        getTokenRef.current,
      );
    };
  }, []);

  const toggleBookmark = async () => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('save');
      return;
    }
    if (!user || !id) return;
    setBookmarkLoading(true);
    try {
      if (bookmarked) {
        await unsaveOpportunity(supabase, user.id, id, getToken);
        void recordOpportunitySignal(
          {
            opportunityId: id,
            signalType: "save",
            signalValue: -1,
            source: "mobile_detail",
            context: "detail_unsave",
          },
          getToken,
        );
        setBookmarked(false);
        Alert.alert(t("detail.alerts.removedTitle"), t("detail.alerts.removedMsg"));
      } else {
        await saveOpportunity(supabase, user.id, id, getToken);
        void recordOpportunitySignal(
          {
            opportunityId: id,
            signalType: "save",
            signalValue: 3,
            source: "mobile_detail",
            context: "detail_save",
          },
          getToken,
        );
        setBookmarked(true);
        Alert.alert(t("detail.alerts.savedTitle"), t("detail.alerts.savedMsg"));
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      Alert.alert(t("common:states.error"), t("detail.alerts.saveFailed"));
    } finally {
      setBookmarkLoading(false);
    }
  };

  // "Not interested" — opens the typed-reason sheet instead of a blunt
  // confirm: the reason routes differently in the ranking engine (taste vs
  // eligibility vs dedup), so asking why makes every dismissal a better
  // training signal AND protects users from accidentally burying a category.
  const handleNotInterested = useCallback(() => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('browse');
      return;
    }
    if (!user?.id || !id) return;
    setDismissSheetVisible(true);
  }, [isGuestBrowsing, authWall, user?.id, id]);

  const handleDismissReason = useCallback((reason: DismissReason) => {
    setDismissSheetVisible(false);
    if (!userId || !id) return;
    void dismissOpportunity(userId, id, getToken, "detail_not_interested", reason);
    router.back();
  }, [userId, id, getToken, router]);

  const handleApply = useCallback(async () => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('apply');
      return;
    }
    // Guard against any stray whitespace in a scraped/cached link — a raw space
    // makes the URL unclickable and Linking.openURL reject it.
    const applyUrl = opportunity?.applyUrl
      ? opportunity.applyUrl.replace(/[\s\u200B\u200C\u200D\uFEFF]+/g, "")
      : opportunity?.applyUrl;
    if (applyUrl && id) {
      let applyUrlHost: string | undefined;
      try {
        applyUrlHost = new URL(applyUrl).hostname;
      } catch {
        applyUrlHost = undefined;
      }
      // Fire tracking in the background — never block opening the apply link on
      // network round-trips (the product API can cold-start in production).
      void recordOpportunitySignal(
        {
          opportunityId: id,
          signalType: "apply",
          signalValue: 5,
          source: "mobile_detail",
          context: "apply_url_open",
          details: {
            applyUrlHost,
          },
        },
        getToken,
      );
      if (userId) {
        void trackOpportunityApplication(
          supabase,
          userId,
          {
            opportunityId: id,
            status: "submitted",
            metadata: {
              source: "mobile_detail",
              applyUrlHost,
              title: opportunity?.title,
            },
          },
          getToken,
        ).catch((error) => {
          console.warn("Failed to track application:", error);
        });
      }
      try {
        await Linking.openURL(applyUrl);
      } catch (error) {
        console.error("Failed to open URL:", error);
      }
    }
  }, [isGuestBrowsing, authWall, getToken, id, opportunity, userId]);

  const handleWinCoachRun = useCallback(
    async (action: AiAction): Promise<AiActionResult> => {
      const result = await runWinCoach(action);
      if (result.threadId) setWinCoachThreadId(result.threadId);
      return result;
    },
    [runWinCoach],
  );

  const openWinCoachThread = useCallback(
    (threadId: string) => {
      setPendingChatThread(threadId);
      router.push("/chat" as never);
    },
    [router],
  );

  const goToPaywall = useCallback(() => {
    router.push("/paywall" as never);
  }, [router]);

  // Continues the win-coach conversation in full chat. It seeds the composer
  // via `prefill` — the same param the coach pushes use — which NEVER
  // auto-sends: opening a screen must not spend the user's AI credits. When a
  // win-coach action already ran here, the same thread is carried over so the
  // follow-up lands in that conversation instead of a fresh orphan.
  const askEdutuMore = useCallback(() => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('ai');
      return;
    }
    if (!opportunity) return;

    if (winCoachThreadId) setPendingChatThread(winCoachThreadId);
    router.push({
      pathname: "/chat",
      params: {
        prefill: t("detail.askMorePrefill", { title: opportunity.title }),
      },
    } as never);
  }, [isGuestBrowsing, authWall, opportunity, router, t, winCoachThreadId]);

  const handleShare = useCallback(async () => {
    if (!opportunity) return;
    void recordOpportunitySignal({
      opportunityId: opportunity.id,
      signalType: "share",
      signalValue: 2,
      source: "mobile_detail",
      context: "detail_share",
    }, getToken);
    try {
      const sharePayload = await getBackendSharePayload(opportunity);
      const link =
        sharePayload.shareUrl || buildOpportunityShareUrl(opportunity.id);
      // The caption always carries the summary AND the Edutu link, so a share is
      // never just a bare image. Guarantee the link is present even if a custom
      // shareText somehow omitted it.
      const message = sharePayload.shareText.includes(link)
        ? sharePayload.shareText
        : `${sharePayload.shareText}\n${link}`;

      // Android: Expo's share APIs can't put an image AND text/link in a single
      // intent (expo-sharing = file only, RN Share = text only). A silent
      // image-only share is exactly the reported bug, so we share the caption +
      // link — which unfurls to the branded share-card image via the opportunity
      // page's Open Graph tags.
      if (Platform.OS !== "ios") {
        await Share.share({ title: opportunity.title, message });
        return;
      }

      // iOS: one share sheet carries the branded image AND the caption/link.
      if (sharePayload.imageUrl) {
        const downloaded = await downloadShareImage(
          sharePayload.imageUrl,
          opportunity.id,
        );
        if (downloaded) {
          await Share.share({
            title: opportunity.title,
            message,
            url: downloaded.uri,
          });
          return;
        }
      }

      // iOS fallback: render the on-device card and attach it with the caption.
      const canShareFile = await Sharing.isAvailableAsync();
      if (canShareFile) {
        setSharingCard(true);
        requestAnimationFrame(async () => {
          try {
            const uri = await captureRef(shareCardRef, {
              format: "png",
              quality: 1,
              result: "tmpfile",
            });
            await Share.share({ title: opportunity.title, message, url: uri });
          } finally {
            setSharingCard(false);
          }
        });
        return;
      }

      // Last resort: caption + link only.
      await Share.share({ title: opportunity.title, message });
    } catch (error) {
      console.error("Failed to share:", error);
      setSharingCard(false);
    }
  }, [opportunity, getToken]);

  const generateAIPath = useCallback(async () => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('ai');
      return;
    }
    if (!opportunity) return;

    // Pre-flight UX check only — the backend now debits credits itself and
    // answers 402/429 when the user can't afford the action (handled below).
    if (!isPro && credits < ROADMAP_CREDIT_COST) {
      Alert.alert(
        t("detail.alerts.insufficientCreditsTitle"),
        t("detail.alerts.insufficientCreditsMsg", { cost: ROADMAP_CREDIT_COST, credits }),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          { text: t("detail.alerts.getCredits"), onPress: () => router.push("/wallet") },
          { text: t("common:adBanner.upgradePro.actionLabel"), onPress: () => router.push("/paywall") },
        ],
      );
      return;
    }

    setGeneratingRoadmap(true);
    setRoadmapStep("overview");

    try {
      // Applicant snapshot personalizes both the local plan and the AI prompt.
      const metadata = (userUnsafeMetadata || {}) as Record<string, unknown>;
      const profile: ApplicantProfile | undefined =
        Object.keys(metadata).length > 0
          ? {
              country: typeof metadata.country === "string" ? metadata.country : undefined,
              pursuit: typeof metadata.pursuit === "string" ? metadata.pursuit : undefined,
              gradeLevel: typeof metadata.gradeLevel === "string" ? metadata.gradeLevel : undefined,
              schoolName: typeof metadata.schoolName === "string" ? metadata.schoolName : undefined,
              isGraduate:
                typeof metadata.isGraduate === "boolean"
                  ? metadata.isGraduate
                  : metadata.isGraduate === "true"
                    ? true
                    : undefined,
              interests: Array.isArray(metadata.interests) ? (metadata.interests as string[]) : undefined,
              ambitions: Array.isArray(metadata.ambitions) ? (metadata.ambitions as string[]) : undefined,
            }
          : undefined;

      // Real generation: deterministic dated scaffold + backend LLM enrichment,
      // tuned by the user's time/level intake and profile. Falls back to the
      // offline scaffold automatically if the API is unreachable.
      const roadmap = await generateRoadmap(opportunity, {
        ...intake,
        profile,
        // /roadmaps/ai/* is authenticated + credit-metered server-side.
        getAuthToken: getToken,
      });
      setGeneratedRoadmap(roadmap);
      setCustomMilestones(roadmap.milestones);
      setCompletedMilestoneIds([]);
      setSelectedChecklistItems(roadmap.checklist.map((c) => c.id));
    } catch (error) {
      // Server billing refusal (402 insufficient credits / 429 fair-use limit).
      if (!isAiBillingError(error)) throw error;
      // Prefer the shared upgrade bottom sheet; the alert stays as a fallback
      // if the provider isn't mounted for any reason.
      if (upgradeSheet) {
        upgradeSheet.show(error.message);
      } else {
        Alert.alert(
          t("detail.alerts.insufficientCreditsTitle"),
          error.message,
          [
            { text: t("common:actions.cancel"), style: "cancel" },
            { text: t("detail.alerts.getCredits"), onPress: () => router.push("/wallet") },
            { text: t("common:adBanner.upgradePro.actionLabel"), onPress: () => router.push("/paywall") },
          ],
        );
      }
    } finally {
      setGeneratingRoadmap(false);
    }
  }, [isGuestBrowsing, authWall, opportunity, isPro, credits, getToken, router, intake, userUnsafeMetadata, t, upgradeSheet]);

  const handleExportCalendar = useCallback(async () => {
    if (!generatedRoadmap || !opportunity) return;
    // Reflect any edits the user made to the milestone list.
    const result = await exportRoadmapToCalendar(
      { ...generatedRoadmap, milestones: customMilestones },
      opportunity.title,
    );
    if (result.reason === "unsupported") {
      Alert.alert(
        t("detail.alerts.useMobileTitle"),
        t("detail.alerts.useMobileMsg"),
      );
    } else if (!result.ok && result.reason === "error") {
      Alert.alert(
        t("detail.alerts.exportFailedTitle"),
        t("detail.alerts.exportFailedMsg"),
      );
    }
  }, [generatedRoadmap, customMilestones, opportunity, t]);

  const handleTrackWithRoadmap = useCallback(async () => {
    if (isGuestBrowsing) {
      authWall?.promptAuth('browse');
      return;
    }
    if (!user || !opportunity || !generatedRoadmap) return;

    try {
      const { data: existing } = await supabase
        .from("user_opportunity_bookmarks")
        .select("*")
        .eq("user_id", toSafeUUID(user.id))
        .eq("roadmap_id", id)
        .single();

      if (existing) {
        Alert.alert(
          t("detail.alerts.alreadyTrackedTitle"),
          t("detail.alerts.alreadyTrackedMsg"),
        );
        return;
      }

      await supabase.from("user_opportunity_bookmarks").insert([
        {
          user_id: toSafeUUID(user.id),
          roadmap_id: id,
          status: "bookmarked",
        },
      ]);

      const resourceText = generatedRoadmap.resources
        .slice(0, 4)
        .map(
          (resource) =>
            `${resource.title}: ${resource.url || resource.description}`,
        )
        .join("\n");
      const selectedChecklist = generatedRoadmap.checklist.filter((item) =>
        selectedChecklistItems.includes(item.id),
      );
      const goalsToCreate = [
        {
          title: t("detail.goals.submitTitle", { title: opportunity.title }),
          description: t("detail.goals.submitDescription", {
            strategy: generatedRoadmap.winningStrategy,
            resources: resourceText,
          }),
          deadline: generatedRoadmap.submissionTargetDate,
          priority: "high" as const,
        },
        ...customMilestones.map((m, i) => ({
          title: m.title,
          description: m.description || "",
          deadline: m.date,
          priority:
            i === customMilestones.length - 1
              ? ("high" as const)
              : ("medium" as const),
        })),
        // Profile gaps become early, high-priority goals — closing them is what
        // turns a generic application into a winning one.
        ...generatedRoadmap.profileGaps.map((gapItem) => ({
          title: t("detail.goals.closeGap", { gap: gapItem.gap.slice(0, 80) }),
          description: gapItem.action,
          deadline: customMilestones[1]?.date || generatedRoadmap.submissionTargetDate,
          priority: "high" as const,
        })),
        ...generatedRoadmap.dailyPlan.map((day) => ({
          title: day.title,
          description: t("detail.goals.dailyDescription", {
            description: day.description,
            focus: day.focus,
            minutes: day.durationMinutes,
          }),
          deadline: day.date,
          priority:
            day.focus === "submission" || day.focus === "writing"
              ? ("high" as const)
              : ("medium" as const),
        })),
        ...selectedChecklist.map((item) => ({
          title: item.title,
          description: t("detail.goals.checklistDescription", { title: opportunity.title }),
          deadline: undefined,
          priority: "low" as const,
        })),
      ];

      const createdGoals = [];
      for (const goalInput of goalsToCreate) {
        const createdGoal = await createGoal({
          title: goalInput.title,
          description: goalInput.description,
          category: opportunity.title,
          deadline: goalInput.deadline,
          priority: goalInput.priority,
          source: "imported",
          templateId: id,
          roadmap_id: id,
          opportunity_title: opportunity.title,
          reminder_enabled: Boolean(goalInput.deadline),
          reminder_date: goalInput.deadline,
        });
        createdGoals.push(createdGoal);
      }

      for (const goal of createdGoals) {
        if (goal.deadline) {
          const nid = await notificationService.scheduleGoalReminder(
            goal.id,
            goal.title,
            goal.deadline,
          );
          if (nid) {
            await updateGoal(goal.id, {
              notification_id: nid,
              reminder_enabled: true,
            });
          }
        }
      }

      setShowRoadmapModal(false);
      setBookmarked(true);
      setRoadmapStep("overview");

      Alert.alert(
        t("detail.alerts.roadmapCreatedTitle"),
        t("detail.alerts.roadmapCreatedMsg", { count: createdGoals.length }),
        [
          {
            text: t("detail.alerts.addToCalendar"),
            onPress: async () => {
              const result = await syncRoadmapToCalendar(
                opportunity.title,
                generatedRoadmap,
              );
              if (result.ok) {
                Alert.alert(
                  t("detail.alerts.calendarSyncedTitle"),
                  t("detail.alerts.calendarSyncedMsg", { count: result.eventCount }),
                );
              } else {
                Alert.alert(
                  t("detail.alerts.calendarSyncFailedTitle"),
                  result.reason || t("detail.alerts.calendarSyncFailedMsg"),
                );
              }
            },
          },
          { text: t("detail.alerts.viewGoals"), onPress: () => router.push("/goals") },
          { text: t("detail.alerts.stayHere"), style: "cancel" },
        ],
      );
    } catch (error: any) {
      console.error("Failed to track with roadmap:", error);
      Alert.alert(t("common:states.error"), error.message || t("detail.alerts.createRoadmapFailed"));
    }
  }, [
    isGuestBrowsing,
    authWall,
    user,
    opportunity,
    generatedRoadmap,
    customMilestones,
    selectedChecklistItems,
    id,
    createGoal,
    updateGoal,
    router,
    t,
  ]);

  const addCustomMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    const newMilestone = {
      id: `custom-${Date.now()}`,
      title: newMilestoneTitle.trim(),
      description: newMilestoneDesc.trim(),
      date:
        generatedRoadmap?.milestones[generatedRoadmap.milestones.length - 1]
          ?.date || new Date().toISOString(),
    };
    setCustomMilestones([...customMilestones, newMilestone]);
    setNewMilestoneTitle("");
    setNewMilestoneDesc("");
    setAddingCustomMilestone(false);
  };

  const toggleChecklistItem = (itemId: string) => {
    setSelectedChecklistItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const getCategoryColor = (category: string) => {
    const colorMap: Record<string, string> = {
      scholarship: "#3b82f6",
      job: "#10B981",
      course: "#3B82F6",
      mentorship: "#EC4899",
      internship: "#6366F1",
      fellowship: "#F97316",
      bootcamp: "#84CC16",
      competition: "#EF4444",
      training_conference: "#8B5CF6",
      "training & conference": "#8B5CF6",
    };
    return colorMap[category?.toLowerCase()] || "#94A3B8";
  };

  if (loading) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor }}
        edges={["top", "left", "right"]}
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <BrandedLoader label={t("detail.loading")} />
        </View>
      </SafeAreaView>
    );
  }

  if (!opportunity && loadFailed) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor }}
        edges={["top", "left", "right"]}
      >
        <View
          accessibilityRole="alert"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <AlertCircle size={48} color={textSecondary} />
          <Text
            style={{
              color: textPrimary,
              fontSize: 18,
              fontWeight: "bold",
              marginTop: 16,
            }}
          >
            {t("detail.errorTitle")}
          </Text>
          <Text
            style={{
              color: textSecondary,
              fontSize: 14,
              lineHeight: 20,
              textAlign: "center",
              marginTop: 8,
              maxWidth: 280,
            }}
          >
            {t("detail.errorBody")}
          </Text>
          <TouchableOpacity
            onPress={() => setRetryNonce((nonce) => nonce + 1)}
            style={{
              marginTop: 20,
              padding: 12,
              paddingHorizontal: 22,
              backgroundColor: colors.accent,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>{t("detail.retry")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 14, padding: 8 }}>
            <Text style={{ color: textSecondary, fontWeight: "600" }}>{t("detail.goBack")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!opportunity) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor }}
        edges={["top", "left", "right"]}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Globe size={48} color={textSecondary} />
          <Text
            style={{
              color: textPrimary,
              fontSize: 18,
              fontWeight: "bold",
              marginTop: 16,
            }}
          >
            {t("detail.notFound")}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 20,
              padding: 12,
              backgroundColor: colors.accent,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>{t("detail.goBack")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // One source of truth for deadline wording, thresholds and colour — the
  // same ramp the feed, widgets and saved list use.
  const deadlineBadge = getDeadlineBadge(opportunity.deadline, new Date(now));
  const daysUntilDeadline = deadlineBadge.daysLeft;
  const isClosed = deadlineBadge.level === "expired";
  const deadlineTone =
    deadlineBadge.level === "none" ? textSecondary : urgencyColor(deadlineBadge.level);
  const deadlineLabel =
    deadlineBadge.level === "expired"
      ? t("detail.closed")
      : deadlineBadge.level === "rolling"
        ? t("detail.rollingLabel")
        : deadlineBadge.level === "none"
          ? t("detail.deadlineUnknown")
          : daysUntilDeadline === 0
            ? t("detail.closesToday")
            : t("detail.daysLeft", { count: daysUntilDeadline ?? 0 });
  const deadlineDetail =
    deadlineBadge.level === "expired"
      ? t("detail.deadlineClosedDetail")
      : deadlineBadge.level === "rolling"
        ? t("detail.deadlineRolling")
        : deadlineBadge.date || t("detail.deadlineUnknown");

  // Scraped copy reaches us with HTML entities intact and, in the location
  // column, with a deadline sentence appended. Clean once, here, so every
  // consumer below (and the share card) reads the same corrected strings.
  const title = decodeMaybe(opportunity.title);
  const organization = decodeMaybe(opportunity.organization);
  const description = decodeMaybe(opportunity.description);
  const aiSummary = decodeMaybe(opportunity.aiSummary);
  const location = cleanLocation(opportunity.location);
  const requirements = (opportunity.requirements || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);
  const benefits = (opportunity.benefits || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);
  const applicationSteps = (opportunity.applicationProcess || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);
  const matchReasons = (opportunity.matchReasons || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);
  const matchRisks = (opportunity.matchRisks || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);

  // Fit is a TIER, never a percentage: a "91%" reads as win-odds we cannot
  // honestly promise. DESIGN.md §1/§4.
  const matchTier = getMatchTier(opportunity.match);
  const fitLabel = matchTier
    ? t(MATCH_TIER_KEY[matchTier].label)
    : t("detail.fit.unknown");
  const fitBlurb = matchTier
    ? t(MATCH_TIER_KEY[matchTier].blurb)
    : t("detail.fit.unknownBlurb");
  const fitColor =
    matchTier === "strong"
      ? "#10B981"
      : matchTier === "solid"
        ? colors.accent
        : matchTier === "possible"
          ? "#F59E0B"
          : textSecondary;

  const hasApplyUrl = Boolean(opportunity.applyUrl);
  // ONE next action. With a week or less on the clock, preparing is a luxury —
  // send them to the real application. With room to breathe (or no direct
  // link at all), the co-pilot is worth more than an unprepared submission.
  const nextActionKind: "closed" | "apply" | "copilot" = isClosed
    ? "closed"
    : daysUntilDeadline !== null && daysUntilDeadline <= 7 && hasApplyUrl
      ? "apply"
      : "copilot";
  const nextActionLabel =
    nextActionKind === "closed"
      ? t("detail.closed")
      : nextActionKind === "apply"
        ? t("detail.applyNow")
        : t("detail.copilotCta");
  const runNextAction = () => {
    if (nextActionKind === "closed") return;
    if (nextActionKind === "apply") {
      void handleApply();
      return;
    }
    if (isGuestBrowsing) {
      authWall?.promptAuth("ai");
      return;
    }
    router.push(`/copilot/${opportunity.id}` as never);
  };

  const categoryColor = getCategoryColor(opportunity.category);
  const facts: Fact[] = [
    organization
      ? {
          key: "sponsor",
          icon: Building2,
          label: t("detail.sponsor"),
          value: organization,
        }
      : null,
    {
      key: "location",
      icon: MapPin,
      label: t("detail.locationLabel"),
      value: location || t("shared.remote"),
    },
    opportunity.stipend && opportunity.stipend > 0
      ? {
          key: "funding",
          icon: TrendingUp,
          label: t("detail.fundingLabel"),
          value: `${opportunity.currency || "$"}${opportunity.stipend.toLocaleString()}`,
          color: "#10B981",
        }
      : null,
    // Only shown when we actually know the count — inventing social proof
    // ("500+") is not something a credibility product does.
    opportunity.applicants
      ? {
          key: "applicants",
          icon: Users,
          label: t("detail.applicantsLabel"),
          value: t("detail.applied", { value: opportunity.applicants }),
        }
      : null,
    opportunity.difficulty
      ? {
          key: "effort",
          icon: Target,
          label: t("detail.effortLabel"),
          value: opportunity.difficulty,
        }
      : null,
  ].filter((fact): fact is Fact => fact !== null);
  const shareSummary = clampShareText(
    cleanShareText(
      opportunity.aiSummary || opportunity.description,
      t("detail.share.summaryFallback"),
    ),
    SHARE_TEXT_LIMITS.summary,
  );
  const shareBenefits = getShareBullets(
    opportunity.benefits,
    getShareFunding(opportunity),
    5,
  );
  const shareRequirements = getShareBullets(
    opportunity.requirements,
    t("detail.share.requirementsFallback"),
    5,
  );
  const shareApplicationSteps = getShareBullets(
    opportunity.applicationProcess,
    opportunity.applyUrl
      ? t("detail.share.applyThroughLink", { url: opportunity.applyUrl })
      : t("detail.share.applyInApp"),
    3,
  );
  const shareStatus = isClosed
    ? { label: t("detail.share.statusClosed"), dot: "#F87171", valueColor: "#DC2626" }
    : daysUntilDeadline !== null && daysUntilDeadline <= 7
      ? {
          label: t("detail.share.statusDaysLeft", { count: daysUntilDeadline }),
          dot: "#FBBF24",
          valueColor: "#D97706",
        }
      : { label: t("detail.share.statusActive"), dot: "#34D399", valueColor: "#0F172A" };
  const shareTiles = [
    { label: t("detail.share.tileReward"), value: getShareFunding(opportunity), color: "#0F172A" },
    {
      label: t("detail.share.tileDeadline"),
      value: formatShareDeadline(opportunity.deadline),
      color: shareStatus.valueColor,
    },
    {
      label: t("detail.share.tileEligibility"),
      value: getShareEligibility(opportunity),
      color: "#0F172A",
    },
    {
      label: t("detail.share.tileLocation"),
      value: opportunity.location || t("shared.worldwide"),
      color: "#0F172A",
    },
  ];
  const providerInitials =
    (opportunity.organization || "Edutu")
      .replace(/[^A-Za-z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "ED";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor }}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader
        title={t("detail.headerTitle")}
        showBack
        right={
          <View style={styles.headerActions}>
            {/* Saved state was carried only by Bookmark vs BookmarkCheck —
                two glyphs that differ by a check mark a few px across. The
                filled glyph on a tinted chip is legible at a glance. */}
            <TouchableOpacity
              onPress={toggleBookmark}
              style={[
                styles.headerAction,
                bookmarked && { backgroundColor: withAlpha(colors.accent, 0.14) },
              ]}
              disabled={bookmarkLoading}
              accessibilityRole="button"
              accessibilityState={{ selected: bookmarked, busy: bookmarkLoading }}
              accessibilityLabel={
                bookmarked
                  ? t("detail.savedLabel")
                  : t("detail.saveAction", { defaultValue: "Save" })
              }
            >
              {bookmarkLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Bookmark
                  size={21}
                  color={bookmarked ? colors.accent : textSecondary}
                  fill={bookmarked ? colors.accent : "transparent"}
                  strokeWidth={bookmarked ? 1.6 : 2}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel={t("detail.share.dialogTitle")}
            >
              <Share2 size={21} color={textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        // Clears the sticky action bar AND the floating AI orb so the last
        // section is never trapped behind them.
        contentContainerStyle={{ paddingBottom: 190 }}
      >
        <OpportunityHero
          image={opportunity.image}
          accent={categoryColor}
          category={opportunity.category}
          featured={opportunity.featured}
          closed={isClosed}
          closedLabel={t("detail.closed")}
          featuredLabel={t("detail.featured")}
          scrollY={scrollY}
        />

        <View style={styles.content}>
          {/* ── ABOVE THE FOLD ──────────────────────────────────────────────
              Three answers, in order: what is this, can I win it / when must
              I act, and what do I do next. Everything below is reference. */}
          <Text style={[styles.title, { color: textPrimary }]} numberOfLines={3}>
            {title}
          </Text>
          <Text style={[styles.titleMeta, { color: textSecondary }]} numberOfLines={1}>
            {[organization, location].filter(Boolean).join("  ·  ")}
          </Text>

          <DecisionStrip
            fitTitle={t("detail.fit.title")}
            fitLabel={fitLabel}
            fitBlurb={fitBlurb}
            fitColor={fitColor}
            deadlineTitle={t("detail.deadline")}
            deadlineLabel={deadlineLabel}
            deadlineDetail={deadlineDetail}
            deadlineColor={deadlineTone}
          />

          {/* The one primary action. Its sibling is a quiet text link, not a
              second button — two equal buttons is not a next step. */}
          <AnimatedPressable
            onPress={runNextAction}
            disabled={nextActionKind === "closed"}
            scaleTo={0.97}
            hapticFeedback="medium"
            accessibilityRole="button"
            accessibilityState={{ disabled: nextActionKind === "closed" }}
            accessibilityLabel={nextActionLabel}
            style={[styles.primaryAction, nextActionKind === "closed" && { opacity: 0.6 }]}
          >
            <LinearGradient
              colors={
                nextActionKind === "closed"
                  ? ["#64748B", "#475569"]
                  : accentGradient(colors.accent)
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.primaryActionInner}>
              {nextActionKind === "copilot" ? (
                <Zap size={18} color="#FFFFFF" />
              ) : (
                <ExternalLink size={18} color="#FFFFFF" />
              )}
              <Text style={styles.primaryActionText}>{nextActionLabel}</Text>
            </View>
          </AnimatedPressable>

          {nextActionKind === "copilot" && hasApplyUrl ? (
            <TouchableOpacity
              onPress={handleApply}
              activeOpacity={0.7}
              style={styles.secondaryLink}
              accessibilityRole="link"
            >
              <Text style={[styles.secondaryLinkText, { color: textSecondary }]}>
                {t("detail.applyNow")}
              </Text>
              <ChevronRight size={14} color={textSecondary} />
            </TouchableOpacity>
          ) : null}
          {nextActionKind === "apply" ? (
            <TouchableOpacity
              onPress={() => {
                if (isGuestBrowsing) {
                  authWall?.promptAuth("ai");
                  return;
                }
                router.push(`/copilot/${opportunity.id}` as never);
              }}
              activeOpacity={0.7}
              style={styles.secondaryLink}
              accessibilityRole="link"
            >
              <Text style={[styles.secondaryLinkText, { color: colors.accent }]}>
                {t("detail.orPrepWithAi")}
              </Text>
              <ChevronRight size={14} color={colors.accent} />
            </TouchableOpacity>
          ) : null}

          {/* ── FIT ────────────────────────────────────────────────────────
              One of the two surfaces DESIGN.md lets go Committed: this is
              Edutu's judgement, not scraped copy, and it should not look like
              the reference sections underneath it. */}
          <View style={{ marginTop: 22 }}>
            <FitPanel
              eyebrow={t("detail.fit.eyebrow")}
              heading={fitLabel}
              blurb={fitBlurb}
              reasons={matchReasons}
              risks={matchRisks}
              reasonsTitle={t("detail.whyMatches")}
              risksTitle={t("detail.thingsToCheck")}
            />
          </View>

          {/* The AI actions sit on neutral ground directly under the panel:
              AiActionBar paints its own accent-on-surface pills, which are
              illegible on top of the Committed field. */}
          <View style={{ marginTop: 12, gap: 10 }}>
            {/* Win-coach actions answer in place. Signed-in only. */}
            {isSignedIn && (
                <AiActionBar
                  actions={[
                    {
                      label: t("chat:winCoach.actions.fitCheck"),
                      intent: "fit_check",
                      message: `Am I a good fit for "${title}"? Give me an honest assessment.`,
                    },
                    {
                      label: t("chat:winCoach.actions.nextMove"),
                      intent: "next_move",
                      message: `What's my single most important next move to win "${title}"?`,
                    },
                  ]}
                  onRun={handleWinCoachRun}
                  onOpenInChat={openWinCoachThread}
                  onUpgrade={goToPaywall}
                />
              )}
              {/* The one way out to full chat: prefills the composer, never
                  sends. Rendered for EVERY visitor — guests included — like
                  every other gated action here; askEdutuMore raises the auth
                  wall itself instead of navigating. */}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t("detail.askMore")}
                onPress={askEdutuMore}
                activeOpacity={0.8}
                style={[
                  styles.askMoreChip,
                  { borderColor: `${colors.accent}30`, backgroundColor: cardBg },
                ]}
              >
                <AiOrbBadge size={18} />
                <Text style={[styles.askMoreChipText, { color: colors.accent }]}>
                  {t("detail.askMore")}
                </Text>
              </TouchableOpacity>
          </View>

          {isSignedIn && (
            <View style={{ marginTop: 12 }}>
              <DocumentUpload
                kind="cv"
                opportunityId={id}
                label={t("chat:winCoach.documentUpload.cvLabel")}
                onUploaded={setWinCoachUploadId}
              />
            </View>
          )}

          {/* ── FACTS ──────────────────────────────────────────────────────
              Inline definition rows, not four more bordered tiles. */}
          <View style={{ marginTop: 18 }}>
            <FactRows facts={facts} />
          </View>

          {opportunity.aiTags && opportunity.aiTags.length > 0 && (
            <View style={styles.tagRow}>
              {opportunity.aiTags.map((tag, index) => (
                <View
                  key={`${tag}-${index}`}
                  style={[styles.tagChip, { backgroundColor: `${categoryColor}14` }]}
                >
                  <Text style={[styles.tagChipText, { color: categoryColor }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── REFERENCE ──────────────────────────────────────────────────
              Progressive disclosure: the first section is open, the rest
              preview their substance so a collapsed header still informs. */}
          <View style={{ marginTop: 10 }}>
            <CollapsibleSection
              title={t("detail.aboutTitle")}
              defaultExpanded
              preview={previewText(aiSummary || description)}
            >
              {aiSummary && aiSummary !== description ? (
                <View
                  style={[
                    styles.summaryBlock,
                    { borderLeftColor: colors.accent, backgroundColor: `${colors.accent}0A` },
                  ]}
                >
                  <View style={styles.summaryHead}>
                    <Target size={13} color={colors.accent} />
                    <Text style={[styles.summaryLabel, { color: colors.accent }]}>
                      {t("detail.aiSummary")}
                    </Text>
                  </View>
                  <Text style={[styles.summaryText, { color: textSecondary }]}>
                    {aiSummary}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.description, { color: textSecondary }]}>
                {description && description !== "No description provided."
                  ? description
                  : t("detail.descriptionUnavailable")}
              </Text>
            </CollapsibleSection>

            {requirements.length > 0 && (
              <CollapsibleSection
                title={t("detail.requirements")}
                meta={t("detail.itemsCount", { count: requirements.length })}
                preview={previewText(requirements.join(" · "))}
              >
                <Text style={[styles.sectionHint, { color: textSecondary }]}>
                  {t("detail.requirementsHint")}
                </Text>
                <RequirementChecklist opportunityId={opportunity.id} items={requirements} />
              </CollapsibleSection>
            )}

            {benefits.length > 0 && (
              <CollapsibleSection
                title={t("detail.benefits")}
                meta={t("detail.itemsCount", { count: benefits.length })}
                preview={previewText(benefits.join(" · "))}
              >
                {benefits.map((benefit, index) => (
                  <View key={`${benefit}-${index}`} style={styles.benefitRow}>
                    <Award size={16} color="#10B981" />
                    <Text style={[styles.benefitText, { color: textSecondary }]}>
                      {benefit}
                    </Text>
                  </View>
                ))}
              </CollapsibleSection>
            )}

            {applicationSteps.length > 0 && (
              <CollapsibleSection
                title={t("detail.applicationSteps")}
                meta={t("detail.itemsCount", { count: applicationSteps.length })}
                preview={previewText(applicationSteps.join(" · "))}
              >
                {applicationSteps.map((step, index) => (
                  <View key={`${step}-${index}`} style={styles.stepRow}>
                    <View style={[styles.stepIndex, { backgroundColor: `${categoryColor}1F` }]}>
                      <Text style={[styles.stepIndexText, { color: categoryColor }]}>
                        {index + 1}
                      </Text>
                    </View>
                    <Text style={[styles.benefitText, { color: textSecondary }]}>{step}</Text>
                  </View>
                ))}
              </CollapsibleSection>
            )}
          </View>

          {/* ── PLAN ───────────────────────────────────────────────────────
              Everything that turns interest into an application. */}
          {!isClosed && (
            <>
              <Text style={[styles.groupHeading, { color: textPrimary }]}>
                {t("detail.planTitle")}
              </Text>

              <AnimatedPressable
                onPress={() => {
                  if (isGuestBrowsing) {
                    authWall?.promptAuth("ai");
                    return;
                  }
                  router.push(`/copilot/${opportunity.id}` as never);
                }}
                style={[
                  styles.roadmapCTA,
                  {
                    backgroundColor: `${colors.accent}10`,
                    borderColor: `${colors.accent}25`,
                  },
                ]}
                hapticFeedback="medium"
              >
                <View style={styles.roadmapCTAContent}>
                  <View
                    style={[styles.roadmapCTAIcon, { backgroundColor: `${colors.accent}20` }]}
                  >
                    <FileText size={22} color={colors.accent} />
                  </View>
                  <View style={styles.roadmapCTAText}>
                    <Text style={[styles.roadmapCTATitle, { color: textPrimary }]}>
                      {t("detail.copilotCta")}
                    </Text>
                    <Text
                      style={[styles.roadmapCTADesc, { color: textSecondary }]}
                      numberOfLines={2}
                    >
                      {t("detail.copilotCtaDesc")}
                    </Text>
                  </View>
                  <View style={[styles.roadmapCTAArrow, { backgroundColor: colors.accent }]}>
                    <ChevronRight size={22} color="#FFFFFF" />
                  </View>
                </View>
              </AnimatedPressable>

              {/* Fit-to-my-life intake — optional, secondary. Collapsed by
                  default and fully dismissible so it doesn't always take up
                  space. */}
              {!bookmarked && opportunity.deadline && !tuneDismissed && (
                <View style={[styles.intakeCard, { backgroundColor: cardBg, borderColor }]}>
                  <TouchableOpacity
                    style={styles.intakeHeader}
                    onPress={() => setTuneExpanded((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t("detail.tunePlan")}
                  >
                    <View style={styles.intakeHeaderLeft}>
                      <SlidersHorizontal size={16} color={colors.accent} />
                      <Text style={[styles.intakeTitle, { color: textPrimary }]}>
                        {t("detail.tunePlan")}{" "}
                        <Text style={{ color: textSecondary }}>{t("detail.optional")}</Text>
                      </Text>
                    </View>
                    <View style={styles.intakeHeaderActions}>
                      {tuneExpanded ? (
                        <ChevronUp size={18} color={textSecondary} />
                      ) : (
                        <ChevronDown size={18} color={textSecondary} />
                      )}
                      <TouchableOpacity
                        onPress={dismissTune}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={t("common:actions.dismiss")}
                      >
                        <X size={16} color={textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>

                  {tuneExpanded && (
                    <View style={styles.intakeBody}>
                      <RoadmapIntake
                        value={intake}
                        onChange={setIntake}
                        colors={{
                          foreground: textPrimary,
                          textSecondary,
                          accent: colors.accent,
                          border: borderColor,
                          card: cardBg,
                        }}
                      />
                    </View>
                  )}
                </View>
              )}

              {!bookmarked && opportunity.deadline && (
                <AnimatedPressable
                  onPress={() => {
                    setGeneratedRoadmap(null);
                    setShowRoadmapModal(true);
                    generateAIPath();
                  }}
                  style={[
                    styles.roadmapCTA,
                    {
                      backgroundColor: `${colors.accent}10`,
                      borderColor: `${colors.accent}25`,
                    },
                  ]}
                  hapticFeedback="medium"
                >
                  <View style={styles.roadmapCTAContent}>
                    <View
                      style={[styles.roadmapCTAIcon, { backgroundColor: `${colors.accent}20` }]}
                    >
                      <Zap size={22} color={colors.accent} />
                    </View>
                    <View style={styles.roadmapCTAText}>
                      <Text style={[styles.roadmapCTATitle, { color: textPrimary }]}>
                        {t("detail.generateRoadmapCta")}
                      </Text>
                      <Text
                        style={[styles.roadmapCTADesc, { color: textSecondary }]}
                        numberOfLines={2}
                      >
                        {isPro
                          ? t("detail.roadmapProDesc")
                          : t("detail.roadmapCreditsDesc", {
                              cost: ROADMAP_CREDIT_COST,
                              credits,
                            })}
                      </Text>
                    </View>
                    <View style={[styles.roadmapCTAArrow, { backgroundColor: colors.accent }]}>
                      <ChevronRight size={22} color="#FFFFFF" />
                    </View>
                  </View>
                </AnimatedPressable>
              )}
            </>
          )}

          {/* Publisher-supplied preparation steps, when there are any. */}
          {opportunity.roadmap && opportunity.roadmap.length > 0 && !bookmarked && (
            <CollapsibleSection
              title={t("detail.prepRoadmap")}
              meta={t("detail.itemsCount", { count: opportunity.roadmap.length })}
              preview={previewText(
                opportunity.roadmap.map((step) => step.title).join(" · "),
              )}
            >
              {opportunity.roadmap.slice(0, 3).map((step, index) => (
                <View key={`${step.title}-${index}`} style={styles.stepRow}>
                  <View style={[styles.stepIndex, { backgroundColor: categoryColor }]}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.benefitText, { color: textPrimary }]} numberOfLines={2}>
                    {step.title}
                  </Text>
                </View>
              ))}
              {opportunity.roadmap.length > 3 && (
                <Text style={[styles.moreSteps, { color: textSecondary }]}>
                  {t("detail.moreSteps", { count: opportunity.roadmap.length - 3 })}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.addGoalsButton, { backgroundColor: categoryColor }]}
                onPress={() => setShowRoadmapModal(true)}
              >
                <Target size={16} color="white" />
                <Text style={styles.addGoalsButtonText}>{t("detail.addToGoals")}</Text>
              </TouchableOpacity>
            </CollapsibleSection>
          )}

          {/* ── QUIET FOOTER ───────────────────────────────────────────── */}
          <View style={[styles.footerActions, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              onPress={toggleBookmark}
              disabled={bookmarkLoading}
              activeOpacity={0.7}
              style={styles.footerAction}
              accessibilityRole="button"
              accessibilityState={{ selected: bookmarked, busy: bookmarkLoading }}
            >
              {bookmarkLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : bookmarked ? (
                <BookmarkCheck size={18} color={colors.accent} />
              ) : (
                <Bookmark size={18} color={textSecondary} />
              )}
              <Text
                style={[
                  styles.footerActionText,
                  { color: bookmarked ? colors.accent : textSecondary },
                ]}
                numberOfLines={1}
              >
                {bookmarked ? t("detail.savedLabel") : t("common:actions.save")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.7}
              style={styles.footerAction}
              accessibilityRole="button"
            >
              <Share2 size={18} color={textSecondary} />
              <Text style={[styles.footerActionText, { color: textSecondary }]}>
                {t("detail.shareAction")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNotInterested}
              activeOpacity={0.6}
              style={styles.footerAction}
              accessibilityRole="button"
            >
              <EyeOff size={18} color={textSecondary} />
              <Text style={[styles.footerActionText, { color: textSecondary }]} numberOfLines={1}>
                {t("detail.notInterestedLink", { defaultValue: "Not interested in this" })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* The primary action stays a thumb-move away once it scrolls off. The
          floating nav pill is not rendered on this route (the (app) layout
          classes /opportunities/{id} as a subpage), so the bar owns the
          bottom edge outright. */}
      <StickyApplyBar
        visible={stickyVisible}
        label={nextActionLabel}
        closed={nextActionKind === "closed"}
        saved={bookmarked}
        saveBusy={bookmarkLoading}
        saveLabel={bookmarked ? t("detail.savedLabel") : t("common:actions.save")}
        onPress={runNextAction}
        onToggleSave={toggleBookmark}
      />

      {/* Floating AI co-pilot button — one tap opens all AI recommendations.
          Parked above the sticky bar so the two never collide. */}
      {!isClosed && opportunity ? (
        <AiCopilotFab
          label={t("detail.copilotCta", { defaultValue: "Apply with Edutu AI" })}
          onPress={() => {
            if (isGuestBrowsing) {
              authWall?.promptAuth('ai');
              return;
            }
            router.push(`/copilot/${opportunity.id}` as never);
          }}
        />
      ) : null}

      {/* AI Roadmap Modal */}
      <Modal
        visible={showRoadmapModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRoadmapModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalSheet, { backgroundColor: colors.background }]}
          >
            {/* Modal Header */}
            <View
              style={[styles.modalHeader, { borderBottomColor: borderColor }]}
            >
              <TouchableOpacity
                onPress={() => setShowRoadmapModal(false)}
                style={styles.modalCloseBtn}
              >
                <X size={22} color={textSecondary} />
              </TouchableOpacity>
              <View style={styles.modalProgress}>
                {(
                  [
                    "overview",
                    "milestones",
                    "weekly",
                    "checklist",
                    "confirm",
                  ] as RoadmapStep[]
                ).map((s, i) => {
                  const idx = [
                    "overview",
                    "milestones",
                    "weekly",
                    "checklist",
                    "confirm",
                  ].indexOf(s);
                  const currentIdx = [
                    "overview",
                    "milestones",
                    "weekly",
                    "checklist",
                    "confirm",
                  ].indexOf(roadmapStep);
                  const isActive = s === roadmapStep;
                  const isComplete = idx < currentIdx;
                  return (
                    <React.Fragment key={s}>
                      <View
                        style={[
                          styles.progressDot,
                          {
                            backgroundColor:
                              isActive || isComplete
                                ? colors.accent
                                : borderColor,
                            width: isActive ? 20 : 8,
                          },
                        ]}
                      />
                      {i < 4 && (
                        <View
                          style={[
                            styles.progressLine,
                            {
                              backgroundColor: isComplete
                                ? colors.accent
                                : borderColor,
                            },
                          ]}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
              <View style={{ width: 30 }} />
            </View>

            {/* Modal Title */}
            <View style={styles.modalTitleBar}>
              <Text style={[styles.modalStepTitle, { color: textPrimary }]}>
                {roadmapStep === "overview" && t("detail.roadmap.stepTitles.overview")}
                {roadmapStep === "milestones" && t("detail.roadmap.stepTitles.milestones")}
                {roadmapStep === "weekly" && t("detail.roadmap.stepTitles.weekly")}
                {roadmapStep === "checklist" && t("detail.roadmap.stepTitles.checklist")}
                {roadmapStep === "confirm" && t("detail.roadmap.stepTitles.confirm")}
              </Text>
              <Text style={[styles.modalStepDesc, { color: textSecondary }]}>
                {roadmapStep === "overview" &&
                  t("detail.roadmap.stepDescs.overview")}
                {roadmapStep === "milestones" &&
                  t("detail.roadmap.stepDescs.milestones")}
                {roadmapStep === "weekly" && t("detail.roadmap.stepDescs.weekly")}
                {roadmapStep === "checklist" &&
                  t("detail.roadmap.stepDescs.checklist")}
                {roadmapStep === "confirm" &&
                  t("detail.roadmap.stepDescs.confirm")}
              </Text>
            </View>

            {/* Modal Content */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              {generatingRoadmap && (
                <View style={styles.generatingContainer}>
                  <BrandedLoader label={t("detail.generating.label")} size={64} />
                  <View style={styles.generatingSteps}>
                    {GENERATION_PHASES.map((step, i) => {
                      const isDone = i < generationPhase;
                      const isActive = i === generationPhase;
                      return (
                        <View key={i} style={styles.generatingStep}>
                          {isDone ? (
                            <CheckCircle2 size={16} color={colors.success} />
                          ) : (
                            <View
                              style={[
                                styles.generatingDot,
                                {
                                  backgroundColor: isActive
                                    ? colors.accent
                                    : colors.border,
                                },
                              ]}
                            />
                          )}
                          <Text
                            style={[
                              styles.generatingStepText,
                              {
                                color: isDone || isActive
                                  ? colors.foreground
                                  : textSecondary,
                                fontWeight: isActive ? "700" : "500",
                              },
                            ]}
                          >
                            {t(step)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {!generatingRoadmap &&
                generatedRoadmap &&
                roadmapStep === "overview" && (
                  <View style={styles.overviewContainer}>
                    <View
                      style={[
                        styles.overviewCard,
                        {
                          backgroundColor: `${colors.accent}08`,
                          borderColor: `${colors.accent}20`,
                        },
                      ]}
                    >
                      <AiOrbBadge size={30} />
                      <Text
                        style={[styles.overcardTitle, { color: textPrimary }]}
                      >
                        {t("detail.roadmap.personalizedTitle")}
                      </Text>
                      {generatedRoadmap.personalized && (
                        <View
                          style={[
                            styles.aiBadge,
                            { backgroundColor: `${colors.accent}18` },
                          ]}
                        >
                          <AiOrbBadge size={14} />
                          <Text
                            style={[styles.aiBadgeText, { color: colors.accent }]}
                          >
                            {t("detail.roadmap.personalizedByAI")}
                          </Text>
                        </View>
                      )}
                      <Text
                        style={[styles.overviewDesc, { color: textSecondary }]}
                      >
                        {generatedRoadmap.summary}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={handleExportCalendar}
                      style={[
                        styles.calendarCta,
                        { borderColor: `${colors.accent}30` },
                      ]}
                    >
                      <Calendar size={16} color={colors.accent} />
                      <Text
                        style={[styles.calendarCtaText, { color: colors.accent }]}
                      >
                        {t("detail.roadmap.addToCalendarRemind")}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.overviewStats}>
                      <View
                        style={[
                          styles.overviewStat,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Calendar size={20} color={colors.accent} />
                        <Text
                          style={[
                            styles.overviewStatValue,
                            { color: textPrimary },
                          ]}
                        >
                          {generatedRoadmap.daysUntilDeadline}
                        </Text>
                        <Text
                          style={[
                            styles.overviewStatLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.daysLeftLabel")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.overviewStat,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Target size={20} color={colors.accent} />
                        <Text
                          style={[
                            styles.overviewStatValue,
                            { color: textPrimary },
                          ]}
                        >
                          {generatedRoadmap.dailyPlan.length}
                        </Text>
                        <Text
                          style={[
                            styles.overviewStatLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.dailySteps")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.overviewStat,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <ListChecks size={20} color={colors.accent} />
                        <Text
                          style={[
                            styles.overviewStatValue,
                            { color: textPrimary },
                          ]}
                        >
                          {generatedRoadmap.checklist.length}
                        </Text>
                        <Text
                          style={[
                            styles.overviewStatLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.tasks")}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.overviewStat,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Bell size={20} color={colors.accent} />
                        <Text
                          style={[
                            styles.overviewStatValue,
                            { color: textPrimary },
                          ]}
                        >
                          {generatedRoadmap.reminders.length}
                        </Text>
                        <Text
                          style={[
                            styles.overviewStatLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.reminders")}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.strategyCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Text
                        style={[styles.strategyLabel, { color: colors.accent }]}
                      >
                        {t("detail.roadmap.submitTarget")}
                      </Text>
                      <Text
                        style={[styles.strategyTitle, { color: textPrimary }]}
                      >
                        {new Date(
                          generatedRoadmap.submissionTargetDate,
                        ).toLocaleDateString()}
                      </Text>
                      <Text
                        style={[styles.strategyText, { color: textSecondary }]}
                      >
                        {generatedRoadmap.winningStrategy}
                      </Text>
                    </View>

                    {generatedRoadmap.requirementActions.length > 0 && (
                      <View
                        style={[
                          styles.strategyCard,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Text
                          style={[styles.strategyLabel, { color: colors.accent }]}
                        >
                          {t("detail.roadmap.requirementMoves")}
                        </Text>
                        {generatedRoadmap.requirementActions
                          .slice(0, 8)
                          .map((item, i) => (
                            <View key={`req-${i}`} style={{ marginTop: i === 0 ? 4 : 12 }}>
                              <Text
                                style={[styles.resourceTitle, { color: textPrimary }]}
                              >
                                {item.requirement}
                              </Text>
                              <Text
                                style={[styles.resourceDesc, { color: textSecondary }]}
                              >
                                {t("detail.roadmap.actionArrow", { action: item.action })}
                              </Text>
                            </View>
                          ))}
                      </View>
                    )}

                    {generatedRoadmap.profileGaps.length > 0 && (
                      <View
                        style={[
                          styles.strategyCard,
                          { backgroundColor: cardBg, borderColor: "#F59E0B55" },
                        ]}
                      >
                        <Text style={[styles.strategyLabel, { color: "#F59E0B" }]}>
                          {t("detail.roadmap.closeGaps")}
                        </Text>
                        {generatedRoadmap.profileGaps.map((item, i) => (
                          <View key={`gap-${i}`} style={{ marginTop: i === 0 ? 4 : 12 }}>
                            <Text
                              style={[styles.resourceTitle, { color: textPrimary }]}
                            >
                              {item.gap}
                            </Text>
                            <Text
                              style={[styles.resourceDesc, { color: textSecondary }]}
                            >
                              {t("detail.roadmap.actionArrow", { action: item.action })}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {generatedRoadmap.bestPractices.length > 0 && (
                      <View
                        style={[
                          styles.strategyCard,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Text
                          style={[styles.strategyLabel, { color: colors.accent }]}
                        >
                          {t("detail.roadmap.whatWinnersDo")}
                        </Text>
                        {generatedRoadmap.bestPractices.slice(0, 6).map((tip, i) => (
                          <Text
                            key={`bp-${i}`}
                            style={[
                              styles.resourceDesc,
                              { color: textSecondary, marginTop: i === 0 ? 4 : 8 },
                            ]}
                          >
                            {t("detail.roadmap.tipBullet", { tip })}
                          </Text>
                        ))}
                      </View>
                    )}

                    <View
                      style={[
                        styles.strategyCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Text
                        style={[styles.strategyLabel, { color: colors.accent }]}
                      >
                        {t("detail.roadmap.resources")}
                      </Text>
                      {generatedRoadmap.resources
                        .slice(0, 4)
                        .map((resource) => (
                          <TouchableOpacity
                            key={resource.id}
                            disabled={!resource.url}
                            onPress={() =>
                              resource.url && Linking.openURL(resource.url)
                            }
                            style={styles.resourceRow}
                          >
                            <View style={styles.resourceCopy}>
                              <Text
                                style={[
                                  styles.resourceTitle,
                                  { color: textPrimary },
                                ]}
                              >
                                {resource.title}
                              </Text>
                              <Text
                                style={[
                                  styles.resourceDesc,
                                  { color: textSecondary },
                                ]}
                                numberOfLines={2}
                              >
                                {resource.description}
                              </Text>
                            </View>
                            {resource.url ? (
                              <ExternalLink size={14} color={colors.accent} />
                            ) : null}
                          </TouchableOpacity>
                        ))}
                    </View>
                  </View>
                )}

              {!generatingRoadmap &&
                generatedRoadmap &&
                roadmapStep === "milestones" && (
                  <View style={styles.milestonesContainer}>
                    <Text
                      style={[styles.milestonesHint, { color: textSecondary }]}
                    >
                      {t("detail.roadmap.milestonesHint")}
                    </Text>
                    <RoadmapTimeline
                      milestones={customMilestones}
                      completedIds={completedMilestoneIds}
                      visibleCount={milestoneRevealCount}
                      today={new Date()}
                      onToggle={(id) =>
                        setCompletedMilestoneIds((prev) =>
                          prev.includes(id)
                            ? prev.filter((x) => x !== id)
                            : [...prev, id],
                        )
                      }
                      onRemove={(id) =>
                        setCustomMilestones((prev) =>
                          prev.filter((m) => m.id !== id),
                        )
                      }
                      colors={{
                        foreground: textPrimary,
                        textSecondary,
                        accent: colors.accent,
                        success: colors.success,
                        border: borderColor,
                        card: cardBg,
                      }}
                    />

                    {!addingCustomMilestone ? (
                      <TouchableOpacity
                        style={[styles.addMilestoneBtn, { borderColor }]}
                        onPress={() => setAddingCustomMilestone(true)}
                      >
                        <Plus size={18} color={colors.accent} />
                        <Text
                          style={[
                            styles.addMilestoneText,
                            { color: colors.accent },
                          ]}
                        >
                          {t("detail.roadmap.addCustomMilestone")}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={[
                          styles.addMilestoneForm,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <Text
                          style={[styles.formLabel, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.milestoneTitleLabel")}
                        </Text>
                        <TextInput
                          style={[
                            styles.formInput,
                            {
                              backgroundColor: isDark
                                ? "rgba(255,255,255,0.05)"
                                : "#f1f5f9",
                              color: textPrimary,
                              borderColor,
                            },
                          ]}
                          placeholder={t("detail.roadmap.milestoneTitlePlaceholder")}
                          placeholderTextColor={textSecondary}
                          value={newMilestoneTitle}
                          onChangeText={setNewMilestoneTitle}
                        />
                        <Text
                          style={[styles.formLabel, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.descriptionLabel")}
                        </Text>
                        <TextInput
                          style={[
                            styles.formInput,
                            styles.formTextArea,
                            {
                              backgroundColor: isDark
                                ? "rgba(255,255,255,0.05)"
                                : "#f1f5f9",
                              color: textPrimary,
                              borderColor,
                            },
                          ]}
                          placeholder={t("detail.roadmap.milestoneDescPlaceholder")}
                          placeholderTextColor={textSecondary}
                          value={newMilestoneDesc}
                          onChangeText={setNewMilestoneDesc}
                          multiline
                          numberOfLines={2}
                          textAlignVertical="top"
                        />
                        <View style={styles.formActions}>
                          <TouchableOpacity
                            onPress={() => {
                              setAddingCustomMilestone(false);
                              setNewMilestoneTitle("");
                              setNewMilestoneDesc("");
                            }}
                            style={[
                              styles.formCancelBtn,
                              {
                                backgroundColor: isDark
                                  ? "rgba(255,255,255,0.05)"
                                  : "#f1f5f9",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.formCancelText,
                                { color: textSecondary },
                              ]}
                            >
                              {t("common:actions.cancel")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={addCustomMilestone}
                            style={[
                              styles.formAddBtn,
                              { backgroundColor: colors.accent },
                            ]}
                          >
                            <Text style={styles.formAddText}>{t("detail.roadmap.add")}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

              {!generatingRoadmap &&
                generatedRoadmap &&
                roadmapStep === "weekly" && (
                  <View style={styles.weeklyContainer}>
                    <View
                      style={[
                        styles.dailyPreviewCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dailyPreviewTitle,
                          { color: textPrimary },
                        ]}
                      >
                        {t("detail.roadmap.firstDailyActions")}
                      </Text>
                      {generatedRoadmap.dailyPlan.slice(0, 7).map((day) => (
                        <View key={day.id} style={styles.dailyPreviewRow}>
                          <Text
                            style={[
                              styles.dailyPreviewDay,
                              { color: colors.accent },
                            ]}
                          >
                            {t("detail.roadmap.dayAbbrev", { day: day.day })}
                          </Text>
                          <View style={styles.dailyPreviewCopy}>
                            <Text
                              style={[
                                styles.dailyPreviewText,
                                { color: textPrimary },
                              ]}
                              numberOfLines={1}
                            >
                              {day.title.replace(/^Day \d+:\s*/, "")}
                            </Text>
                            <Text
                              style={[
                                styles.dailyPreviewDate,
                                { color: textSecondary },
                              ]}
                            >
                              {t("detail.roadmap.dailyMeta", {
                                date: new Date(day.date).toLocaleDateString(),
                                minutes: day.durationMinutes,
                              })}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    {generatedRoadmap.weeklyGoals
                      .slice(0, Math.min(6, generatedRoadmap.totalWeeks))
                      .map((week) => (
                        <View
                          key={week.week}
                          style={[
                            styles.weekCard,
                            { backgroundColor: cardBg, borderColor },
                          ]}
                        >
                          <View style={styles.weekHeader}>
                            <View
                              style={[
                                styles.weekNum,
                                { backgroundColor: `${colors.accent}15` },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.weekNumText,
                                  { color: colors.accent },
                                ]}
                              >
                                {t("detail.roadmap.weekAbbrev", { week: week.week })}
                              </Text>
                            </View>
                            <Text
                              style={[styles.weekTitle, { color: textPrimary }]}
                            >
                              {week.title}
                            </Text>
                          </View>
                          <View style={styles.weekTasks}>
                            {week.tasks.slice(0, 3).map((task, i) => (
                              <View key={i} style={styles.weekTask}>
                                <View
                                  style={[
                                    styles.taskDot,
                                    { backgroundColor: colors.accent },
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.taskText,
                                    { color: textSecondary },
                                  ]}
                                >
                                  {task}
                                </Text>
                              </View>
                            ))}
                            {week.tasks.length > 3 && (
                              <Text
                                style={[
                                  styles.weekMore,
                                  { color: textSecondary },
                                ]}
                              >
                                {t("detail.roadmap.moreTasks", { count: week.tasks.length - 3 })}
                              </Text>
                            )}
                          </View>
                          <View style={styles.weekDeadline}>
                            <Calendar size={12} color={textSecondary} />
                            <Text
                              style={[
                                styles.weekDeadlineText,
                                { color: textSecondary },
                              ]}
                            >
                              {t("detail.roadmap.target", {
                                date: new Date(week.deadline).toLocaleDateString(),
                              })}
                            </Text>
                          </View>
                        </View>
                      ))}
                    {generatedRoadmap.totalWeeks > 6 && (
                      <Text
                        style={[styles.weeklyMore, { color: textSecondary }]}
                      >
                        {t("detail.roadmap.moreWeeks", { count: generatedRoadmap.totalWeeks - 6 })}
                      </Text>
                    )}
                  </View>
                )}

              {!generatingRoadmap &&
                generatedRoadmap &&
                roadmapStep === "checklist" && (
                  <View style={styles.checklistContainer}>
                    {[
                      "document",
                      "preparation",
                      "application",
                      "interview",
                      "follow-up",
                    ].map((category) => {
                      const items = generatedRoadmap.checklist.filter(
                        (c) => c.category === category,
                      );
                      if (items.length === 0) return null;
                      return (
                        <View key={category} style={styles.checklistCategory}>
                          <Text
                            style={[
                              styles.checklistCatTitle,
                              {
                                color: textPrimary,
                                textTransform: "capitalize",
                              },
                            ]}
                          >
                            {category === "document"
                              ? t("detail.roadmap.categories.document")
                              : category === "preparation"
                                ? t("detail.roadmap.categories.preparation")
                                : category === "application"
                                  ? t("detail.roadmap.categories.application")
                                  : category === "interview"
                                    ? t("detail.roadmap.categories.interview")
                                    : t("detail.roadmap.categories.followUp")}
                          </Text>
                          {items.map((item) => {
                            const isSelected = selectedChecklistItems.includes(
                              item.id,
                            );
                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[
                                  styles.checklistItem,
                                  { backgroundColor: cardBg, borderColor },
                                  !isSelected && { opacity: 0.5 },
                                ]}
                                onPress={() => toggleChecklistItem(item.id)}
                              >
                                <View
                                  style={[
                                    styles.checklistCheckbox,
                                    {
                                      borderColor: isSelected
                                        ? colors.accent
                                        : borderColor,
                                    },
                                  ]}
                                >
                                  {isSelected && (
                                    <Check size={14} color={colors.accent} />
                                  )}
                                </View>
                                <Text
                                  style={[
                                    styles.checklistItemText,
                                    { color: textPrimary },
                                  ]}
                                >
                                  {item.title}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                )}

              {!generatingRoadmap &&
                generatedRoadmap &&
                roadmapStep === "confirm" && (
                  <View style={styles.confirmContainer}>
                    <View
                      style={[
                        styles.confirmCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.confirmSectionTitle,
                          { color: textPrimary },
                        ]}
                      >
                        {t("detail.roadmap.summaryTitle")}
                      </Text>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.summaryOpportunity")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {opportunity.title}
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.summaryDuration")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.dailyStepsCount", { count: generatedRoadmap.dailyPlan.length })}
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.summaryMilestones")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.stagesCount", { count: customMilestones.length })}
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.checklistItems")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.selectedCount", { count: selectedChecklistItems.length })}
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.submitTarget")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {generatedRoadmap.submissionTargetDate}
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          {t("detail.roadmap.reminders")}
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {t("detail.roadmap.scheduledCount", { count: generatedRoadmap.reminders.length })}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.confirmInfo,
                        {
                          backgroundColor: `${colors.accent}08`,
                          borderColor: `${colors.accent}20`,
                        },
                      ]}
                    >
                      <Info size={16} color={colors.accent} />
                      <Text
                        style={[
                          styles.confirmInfoText,
                          { color: textSecondary },
                        ]}
                      >
                        {t("detail.roadmap.confirmInfo")}
                      </Text>
                    </View>
                  </View>
                )}

              <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal Footer */}
            <View style={[styles.modalFooter, { borderTopColor: borderColor }]}>
              {roadmapStep !== "overview" && (
                <TouchableOpacity
                  onPress={() => {
                    const steps: RoadmapStep[] = [
                      "overview",
                      "milestones",
                      "weekly",
                      "checklist",
                      "confirm",
                    ];
                    const idx = steps.indexOf(roadmapStep);
                    setRoadmapStep(steps[idx - 1]);
                  }}
                  style={[
                    styles.modalFooterBtn,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.05)"
                        : "#f1f5f9",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modalFooterBtnText,
                      { color: textSecondary },
                    ]}
                  >
                    {t("common:actions.back")}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.accent },
                ]}
                onPress={() => {
                  if (roadmapStep === "confirm") {
                    handleTrackWithRoadmap();
                  } else {
                    const steps: RoadmapStep[] = [
                      "overview",
                      "milestones",
                      "weekly",
                      "checklist",
                      "confirm",
                    ];
                    const idx = steps.indexOf(roadmapStep);
                    setRoadmapStep(steps[idx + 1]);
                  }
                }}
                disabled={generatingRoadmap || !generatedRoadmap}
              >
                <Text style={styles.modalSubmitText}>
                  {roadmapStep === "confirm"
                    ? t("detail.roadmap.createRoadmap")
                    : roadmapStep === "overview"
                      ? t("detail.roadmap.viewRoadmap")
                      : t("common:actions.continue")}
                </Text>
                {roadmapStep !== "confirm" && (
                  <ChevronRight size={18} color="white" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Card Canvas */}
      {sharingCard && opportunity && (
        <View pointerEvents="none" style={styles.shareCanvas}>
          <ViewShot ref={shareCardRef} options={{ format: "png", quality: 1 }}>
            <View style={styles.shareSheet}>
              {/* Header band */}
              <LinearGradient
                colors={["#0B1E45", "#173C82", "#2563EB"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareHeaderBand}
              >
                <View style={styles.shareHeaderRow}>
                  <View style={styles.shareBrand}>
                    <View style={styles.shareLogoMark}>
                      <Text style={styles.shareLogoLetter}>E</Text>
                    </View>
                    <View>
                      <Text style={styles.shareBrandTitle}>Edutu</Text>
                      <Text style={styles.shareBrandSubtitle}>
                        {t("detail.share.brief")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.shareStatusPill}>
                    <View
                      style={[
                        styles.shareStatusDot,
                        { backgroundColor: shareStatus.dot },
                      ]}
                    />
                    <Text style={styles.shareStatusText}>
                      {shareStatus.label}
                    </Text>
                  </View>
                </View>
                <View style={styles.shareCategoryChip}>
                  <Text style={styles.shareCategoryText}>
                    {(opportunity.category || t("shared.opportunity")).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.shareTitle} numberOfLines={3}>
                  {opportunity.title}
                </Text>
                <View style={styles.shareProviderRow}>
                  <View style={styles.shareAvatar}>
                    {opportunity.image ? (
                      <Image
                        source={{ uri: opportunity.image }}
                        style={styles.shareAvatarImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.shareAvatarText}>
                        {providerInitials}
                      </Text>
                    )}
                  </View>
                  <View style={styles.shareProviderText}>
                    <Text style={styles.shareProviderName} numberOfLines={1}>
                      {opportunity.organization || t("detail.share.providerFallback")}
                    </Text>
                    <Text style={styles.shareProviderSub} numberOfLines={1}>
                      {opportunity.location || t("detail.share.locationFallback")}
                    </Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Body */}
              <View style={styles.shareBody}>
                <Text style={styles.shareSummary} numberOfLines={2}>
                  {shareSummary}
                </Text>

                <View style={styles.shareTileGrid}>
                  {shareTiles.map((tile) => (
                    <View key={tile.label} style={styles.shareTile}>
                      <Text style={styles.shareTileLabel}>
                        {tile.label.toUpperCase()}
                      </Text>
                      <Text
                        style={[styles.shareTileValue, { color: tile.color }]}
                        numberOfLines={1}
                      >
                        {clampShareText(cleanShareText(tile.value), 26)}
                      </Text>
                    </View>
                  ))}
                </View>

                {shareBenefits.length > 0 && (
                  <>
                    <Text style={styles.shareSectionTitle}>{t("detail.share.benefits")}</Text>
                    {shareBenefits.slice(0, 3).map((item, index) => (
                      <View key={`benefit-${index}`} style={styles.shareBulletRow}>
                        <View style={styles.shareCheck}>
                          <Check size={16} color="#16A34A" strokeWidth={3} />
                        </View>
                        <Text style={styles.shareBulletText} numberOfLines={2}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {shareRequirements.length > 0 && (
                  <>
                    <Text style={[styles.shareSectionTitle, { marginTop: 26 }]}>
                      {t("detail.share.requirements")}
                    </Text>
                    {shareRequirements.slice(0, 2).map((item, index) => (
                      <View
                        key={`requirement-${index}`}
                        style={styles.shareBulletRow}
                      >
                        <View style={styles.shareDot} />
                        <Text style={styles.shareBulletText} numberOfLines={2}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                <View style={styles.shareApplyBox}>
                  <Text style={styles.shareApplyTitle}>{t("detail.share.howToApply")}</Text>
                  {shareApplicationSteps.slice(0, 2).map((item, index) => (
                    <Text
                      key={`apply-${index}`}
                      style={styles.shareApplyText}
                      numberOfLines={2}
                    >
                      {t("detail.share.applyStep", {
                        number: index + 1,
                        step: clampShareText(item, SHARE_TEXT_LIMITS.apply),
                      })}
                    </Text>
                  ))}
                </View>
              </View>

              {/* Footer */}
              <LinearGradient
                colors={["#0B1E45", "#1D4ED8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.shareFooter}
              >
                <View style={styles.shareFooterTextWrap}>
                  <Text style={styles.shareFooterTitle}>
                    {t("detail.share.discoverMore")}
                  </Text>
                  <Text style={styles.shareFooterSub}>
                    {t("detail.share.footerSub")}
                  </Text>
                </View>
                <View style={styles.shareFooterBadge}>
                  <Text style={styles.shareFooterBadgeText}>edutu.ai</Text>
                </View>
              </LinearGradient>
            </View>
          </ViewShot>
        </View>
      )}

      <DismissReasonSheet
        visible={dismissSheetVisible}
        isDark={isDark}
        onSelect={handleDismissReason}
        onClose={() => setDismissSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    height: 240,
    position: "relative",
    backgroundColor: "#0F172A",
  },
  heroOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  featuredText: {
    color: "white",
    fontSize: 9,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  urgentBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  urgentText: { color: "white", fontSize: 10, fontWeight: "600" },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 18 },

  // ── Decision-first layout ────────────────────────────────────────────────
  title: { fontSize: 25, fontWeight: "800", lineHeight: 32, letterSpacing: -0.4 },
  titleMeta: { fontSize: 13, fontWeight: "600", marginTop: 6 },
  primaryAction: {
    height: 54,
    borderRadius: 999,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  primaryActionInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  primaryActionText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  secondaryLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
  },
  secondaryLinkText: { fontSize: 14, fontWeight: "600" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  tagChipText: { fontSize: 11, fontWeight: "600" },
  summaryBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 10,
    borderRadius: 10,
    borderCurve: "continuous",
    gap: 6,
  },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  summaryText: { fontSize: 14, lineHeight: 21 },
  sectionHint: { fontSize: 13, marginBottom: 2 },
  benefitRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  benefitText: { flex: 1, fontSize: 15, lineHeight: 21 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepIndexText: { fontSize: 12, fontWeight: "700" },
  groupHeading: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 12,
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 24,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  footerActionText: { fontSize: 12, fontWeight: "600", textAlign: "center" },

  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  categoryText: { fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  difficultyText: { fontSize: 10, fontWeight: "600" },
  matchBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  matchText: { fontSize: 10, fontWeight: "600" },
  sponsorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    gap: 12,
  },
  sponsorIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  sponsorLabel: { fontSize: 11, fontWeight: "500", marginBottom: 2 },
  sponsorName: { fontSize: 15, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
  },
  statText: { fontSize: 11, fontWeight: "500", flex: 1 },
  deadlineCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  deadlineLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  stipendLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  deadlineLabel: { fontSize: 10, fontWeight: "500" },
  deadlineValue: { fontSize: 14, fontWeight: "600" },
  deadlineDate: { fontSize: 11, marginTop: 2 },
  stipendCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  description: { fontSize: 13, lineHeight: 21, marginBottom: 22 },
  listCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 22 },
  listItem: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7 },
  listDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 12,
  },
  listText: { fontSize: 13, lineHeight: 19, flex: 1 },
  askMoreChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  askMoreChipText: { fontSize: 13, fontWeight: "700" },
  actionButtonsRow: { flexDirection: "row", gap: 12, marginBottom: 40 },
  aiFab: {
    position: "absolute",
    right: 16,
    // Clears the sticky action bar (50pt control + padding + home indicator).
    bottom: 124,
    alignItems: "center",
    justifyContent: "center",
  },
  aiFabBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#4331c9",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 9,
  },
  aiFabEmoji: {
    fontSize: 28,
    lineHeight: 34,
  },
  aiFabBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.35)",
  },
  aiFabBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  applyButtonWrapper: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  applyButtonGradient: { borderRadius: 18 },
  applyButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 10,
  },
  applyButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  saveButtonWrapper: {
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 8,
  },
  saveButtonText: { fontSize: 15, fontWeight: "700" },
  roadmapCTA: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 24,
    overflow: "hidden",
  },
  roadmapCTAContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    position: "relative",
    gap: 14,
  },
  roadmapCTAIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roadmapCTAText: {
    flex: 1,
  },
  roadmapCTATitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  roadmapCTADesc: { fontSize: 12, lineHeight: 18 },
  roadmapCTAArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  roadmapCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  roadmapText: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  roadmapSteps: { marginBottom: 16 },
  roadmapStep: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNumberText: { color: "white", fontSize: 12, fontWeight: "bold" },
  stepTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
  moreSteps: { fontSize: 12, fontStyle: "italic", marginTop: 4 },
  addGoalsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  addGoalsButtonText: { color: "white", fontSize: 14, fontWeight: "bold" },
  shareCanvas: { position: "absolute", left: -9999, top: 0, opacity: 0 },
  shareSheet: {
    width: 1080,
    minHeight: 1350, // Instagram feed portrait (4:5)
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  shareHeaderBand: {
    paddingHorizontal: 72,
    paddingTop: 58,
    paddingBottom: 42,
  },
  shareHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  shareBrand: { flexDirection: "row", alignItems: "center", gap: 16 },
  shareLogoMark: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shareLogoLetter: { fontSize: 34, fontWeight: "900", color: "#123C82" },
  shareBrandTitle: { fontSize: 30, fontWeight: "800", color: "#FFFFFF" },
  shareBrandSubtitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 3.5,
    color: "#8FB4FF",
    marginTop: 2,
  },
  shareStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
  },
  shareStatusDot: { width: 14, height: 14, borderRadius: 7 },
  shareStatusText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#FFFFFF",
  },
  shareCategoryChip: {
    alignSelf: "flex-start",
    marginTop: 34,
    paddingHorizontal: 22,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
  },
  shareCategoryText: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: 2.5,
    color: "#DBEAFE",
  },
  shareTitle: {
    marginTop: 18,
    fontSize: 50,
    lineHeight: 60,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#FFFFFF",
  },
  shareProviderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    marginTop: 28,
  },
  shareAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  shareAvatarImage: { width: 68, height: 68 },
  shareAvatarText: { fontSize: 26, fontWeight: "900", color: "#123C82" },
  shareProviderText: { flex: 1 },
  shareProviderName: { fontSize: 27, fontWeight: "800", color: "#FFFFFF" },
  shareProviderSub: {
    fontSize: 20,
    fontWeight: "600",
    color: "#AFC7FF",
    marginTop: 4,
  },
  shareBody: { flex: 1, paddingHorizontal: 72, paddingTop: 42 },
  shareSummary: {
    fontSize: 26,
    lineHeight: 37,
    fontWeight: "500",
    color: "#475569",
  },
  shareTileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 24,
    marginTop: 26,
  },
  shareTile: {
    width: (1080 - 72 * 2 - 24) / 2,
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: "#F4F8FF",
    borderWidth: 1.5,
    borderColor: "#E1EAFF",
  },
  shareTileLabel: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: "#2563EB",
  },
  shareTileValue: { fontSize: 26, fontWeight: "800", marginTop: 10 },
  shareSectionTitle: {
    marginTop: 26,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.3,
    color: "#0B1E45",
    marginBottom: 12,
  },
  shareBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 8,
  },
  shareCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  shareDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2563EB",
    marginTop: 12,
    marginLeft: 6,
    marginRight: 6,
  },
  shareBulletText: {
    flex: 1,
    fontSize: 23,
    lineHeight: 32,
    fontWeight: "500",
    color: "#1E293B",
  },
  shareApplyBox: {
    marginTop: 26,
    padding: 30,
    borderRadius: 26,
    backgroundColor: "#EEF4FF",
    borderWidth: 1.5,
    borderColor: "#D6E4FF",
  },
  shareApplyTitle: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
    color: "#2563EB",
    marginBottom: 16,
  },
  shareApplyText: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 8,
  },
  shareFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 72,
    height: 124,
    marginTop: 28,
  },
  shareFooterTextWrap: { flex: 1, paddingRight: 24 },
  shareFooterTitle: { fontSize: 24, fontWeight: "800", color: "#FFFFFF" },
  shareFooterSub: {
    fontSize: 19,
    fontWeight: "600",
    color: "#AFC7FF",
    marginTop: 6,
  },
  shareFooterBadge: {
    paddingHorizontal: 28,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shareFooterBadgeText: { fontSize: 22, fontWeight: "900", color: "#123C82" },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    flex: 1,
    marginTop: 60,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCloseBtn: { padding: 4 },
  modalProgress: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressDot: { height: 8, borderRadius: 4 },
  progressLine: { width: 16, height: 2, borderRadius: 1 },
  modalTitleBar: { paddingHorizontal: 20, paddingVertical: 16 },
  modalStepTitle: { fontSize: 20, fontWeight: "800" },
  modalStepDesc: { fontSize: 13, marginTop: 4 },
  modalContent: { flex: 1 },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  modalFooterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalFooterBtnText: { fontSize: 15, fontWeight: "600" },
  modalSubmitBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  modalSubmitText: { color: "white", fontWeight: "800", fontSize: 16 },

  // Generating State
  generatingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  generatingText: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 24,
    textAlign: "center",
  },
  generatingSteps: { width: "100%" },
  generatingStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  generatingDot: { width: 8, height: 8, borderRadius: 4 },
  generatingStepText: { fontSize: 14 },

  // Overview
  overviewContainer: { paddingHorizontal: 20 },
  overviewCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    marginBottom: 20,
  },
  overcardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 8,
    textAlign: "center",
  },
  overviewDesc: { fontSize: 14, lineHeight: 22, textAlign: "center" },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  aiBadgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  overviewStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  overviewStat: {
    width: "47%",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  overviewStatValue: { fontSize: 24, fontWeight: "bold" },
  overviewStatLabel: { fontSize: 12 },
  strategyCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  strategyLabel: {
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  strategyTitle: { fontSize: 16, fontWeight: "900", marginBottom: 8 },
  strategyText: { fontSize: 13, lineHeight: 20 },
  resourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  resourceCopy: { flex: 1 },
  resourceTitle: { fontSize: 13, fontWeight: "800", marginBottom: 3 },
  resourceDesc: { fontSize: 12, lineHeight: 17 },

  // Milestones
  milestonesContainer: { paddingHorizontal: 20, gap: 12 },
  milestonesHint: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  intakeCard: {
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  intakeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  intakeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  intakeHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  intakeBody: { marginTop: 16 },
  intakeTitle: { fontSize: 15, fontWeight: "800" },
  calendarCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
  },
  calendarCtaText: { fontSize: 14, fontWeight: "800" },
  milestoneCard: { padding: 16, borderRadius: 14, borderWidth: 1 },
  milestoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  milestoneNum: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  milestoneNumText: { fontSize: 11, fontWeight: "800" },
  milestoneTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  milestoneDesc: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  milestoneDate: { flexDirection: "row", alignItems: "center", gap: 6 },
  milestoneDateText: { fontSize: 12 },
  addMilestoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  addMilestoneText: { fontSize: 14, fontWeight: "700" },
  addMilestoneForm: { padding: 16, borderRadius: 14, borderWidth: 1 },
  formLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  formTextArea: { minHeight: 70 },
  formActions: { flexDirection: "row", gap: 10 },
  formCancelBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  formCancelText: { fontSize: 14, fontWeight: "600" },
  formAddBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },
  formAddText: { color: "white", fontSize: 14, fontWeight: "700" },

  // Weekly
  weeklyContainer: { paddingHorizontal: 20, gap: 12 },
  dailyPreviewCard: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 10 },
  dailyPreviewTitle: { fontSize: 15, fontWeight: "900", marginBottom: 2 },
  dailyPreviewRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  dailyPreviewDay: { width: 28, fontSize: 12, fontWeight: "900" },
  dailyPreviewCopy: { flex: 1 },
  dailyPreviewText: { fontSize: 13, fontWeight: "800" },
  dailyPreviewDate: { marginTop: 2, fontSize: 11, fontWeight: "600" },
  weekCard: { padding: 16, borderRadius: 14, borderWidth: 1 },
  weekHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  weekNum: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  weekNumText: { fontSize: 11, fontWeight: "800" },
  weekTitle: { fontSize: 14, fontWeight: "700" },
  weekTasks: { marginBottom: 10 },
  weekTask: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  taskDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5 },
  taskText: { fontSize: 13, lineHeight: 18, flex: 1 },
  weekMore: { fontSize: 12, fontStyle: "italic", marginLeft: 15 },
  weekDeadline: { flexDirection: "row", alignItems: "center", gap: 6 },
  weekDeadlineText: { fontSize: 12 },
  weeklyMore: {
    fontSize: 13,
    textAlign: "center",
    fontStyle: "italic",
    padding: 12,
  },

  // Checklist
  checklistContainer: { paddingHorizontal: 20, gap: 16 },
  checklistCategory: { gap: 8 },
  checklistCatTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  checklistCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistItemText: { fontSize: 13, flex: 1 },

  // Confirm
  confirmContainer: { paddingHorizontal: 20, gap: 16 },
  confirmCard: { padding: 18, borderRadius: 14, borderWidth: 1 },
  confirmSectionTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 14 },
  confirmRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  confirmLabel: { fontSize: 13, fontWeight: "600" },
  confirmValue: { fontSize: 13, fontWeight: "500" },
  confirmInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  confirmInfoText: { fontSize: 13, flex: 1, lineHeight: 20 },
});
