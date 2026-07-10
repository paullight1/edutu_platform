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
  Dimensions,
  Animated,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  GraduationCap,
  Clock,
  MapPin,
  Users,
  ExternalLink,
  Share2,
  Bookmark,
  BookmarkCheck,
  Award,
  Globe,
  TrendingUp,
  Sparkles,
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
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useTheme } from "../../../components/context/ThemeContext";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../../components/ui/BrandedLoader";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { supabase } from "../../../lib/supabase";
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
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { CHAT_CONTEXT_SENTINEL } from "@edutu/core/src/types/chat";
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

const { width } = Dimensions.get("window");

// Public Edutu opportunity page. Shares must point here — a branded landing that
// tracks and routes to Apply — NOT the raw third-party application link.
const EDUTU_WEB_URL = "https://www.edutu.org";
const TUNE_DISMISS_KEY = "edutu:tunePlanDismissed";
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
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
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

function buildMobileOpportunityShareText(opportunity: Opportunity): string {
  const expired = opportunity.deadline
    ? new Date(opportunity.deadline).getTime() < Date.now()
    : false;
  const benefits = getShareBullets(
    opportunity.benefits,
    getShareFunding(opportunity),
    2,
  );
  const benefitLines = benefits
    .map((benefit, index) => `${index === 0 ? "⭐" : "✅"}${benefit}`)
    .join("\n");

  return [
    expired
      ? i18n.t("opps:detail.share.deadlinePassed")
      : i18n.t("opps:detail.share.stillActive"),
    "",
    cleanShareText(opportunity.title, i18n.t("opps:detail.share.fallbackTitle")),
    "",
    i18n.t("opps:detail.share.sponsorLine", {
      sponsor: cleanShareText(opportunity.organization, "Edutu"),
    }),
    "",
    i18n.t("opps:detail.share.benefitsHeading"),
    benefitLines,
    "",
    i18n.t("opps:detail.share.categoryLine", {
      category: cleanShareText(opportunity.category, i18n.t("opps:shared.opportunity")),
    }),
    i18n.t("opps:detail.share.eligibleCountryLine", {
      eligibility: getShareEligibility(opportunity),
    }),
    i18n.t("opps:detail.share.deadlineLine", {
      deadline: formatShareDeadline(opportunity.deadline),
    }),
    "",
    i18n.t("opps:detail.share.applyCta"),
    buildOpportunityShareUrl(opportunity.id),
    "",
    i18n.t("opps:detail.share.shareWithFriends"),
  ].join("\n");
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
  accent,
  label,
}: {
  onPress: () => void;
  accent: string;
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
  const { getToken } = useAuth();
  const { isDark, colors } = useTheme();
  const { createGoal, updateGoal } = useGoals(supabase, user?.id || null);
  const {
    credits,
    spendCredits,
    isLoading: creditsLoading,
  } = useCredits(supabase, user?.id || null);
  const { isPro, isLoading: proLoading } = useProStatus(
    supabase,
    user?.id || null,
  );
  const ROADMAP_CREDIT_COST = 10;

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  // True only when the fetch failed for network reasons AND nothing is cached —
  // distinguishes "couldn't load" (retryable) from a definitive "not found".
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [saved, setSaved] = useState(false);
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
  // reads as authored progress rather than a static spinner.
  useEffect(() => {
    if (!generatingRoadmap) {
      setGenerationPhase(0);
      return;
    }
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

  const slideAnim = useRef(new Animated.Value(0)).current;
  const viewRecordedRef = useRef(false);

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

  const toggleBookmark = async () => {
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

  const handleApply = useCallback(async () => {
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
      if (user?.id) {
        void trackOpportunityApplication(
          supabase,
          user.id,
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
  }, [getToken, id, opportunity, user?.id]);

  const askAI = useCallback(
    (intent: string) => {
      if (!opportunity) return;

      const prompt = t("detail.aiPromptTemplate", {
        intent,
        title: opportunity.title,
        organization: opportunity.organization || t("shared.unknown"),
        category: opportunity.category || t("shared.opportunity"),
        deadline: opportunity.deadline || t("detail.rolling"),
        description:
          opportunity.aiSummary || opportunity.description || t("detail.noDescription"),
      });

      // The template is "{{intent}}\n\n<context>". Swap the first blank line for the
      // invisible sentinel so the chat sends the full context to Edutu but only shows
      // the short intent to the user instead of the whole templated dump.
      const message = prompt.replace(/\n\n/, `${CHAT_CONTEXT_SENTINEL}\n`);

      router.push({ pathname: "/chat", params: { voiceMsg: message } } as never);
    },
    [opportunity, router, t],
  );

  const handleShare = useCallback(async () => {
    if (!opportunity) return;
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
  }, [opportunity]);

  const generateAIPath = useCallback(async () => {
    if (!opportunity) return;

    if (!isPro && credits < ROADMAP_CREDIT_COST) {
      Alert.alert(
        t("detail.alerts.insufficientCreditsTitle"),
        t("detail.alerts.insufficientCreditsMsg", { cost: ROADMAP_CREDIT_COST, credits }),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          { text: t("detail.alerts.getCredits"), onPress: () => router.push("/paywall") },
        ],
      );
      return;
    }

    if (!isPro) {
      const success = await spendCredits(
        ROADMAP_CREDIT_COST,
        t("detail.goals.aiRoadmapCredit", { title: opportunity.title }),
      );
      if (!success) {
        Alert.alert(t("common:states.error"), t("detail.alerts.deductFailed"));
        return;
      }
    }

    setGeneratingRoadmap(true);
    setRoadmapStep("overview");

    try {
      // Applicant snapshot personalizes both the local plan and the AI prompt.
      const metadata = (user?.unsafeMetadata || {}) as Record<string, unknown>;
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
      const roadmap = await generateRoadmap(opportunity, { ...intake, profile });
      setGeneratedRoadmap(roadmap);
      setCustomMilestones(roadmap.milestones);
      setCompletedMilestoneIds([]);
      setSelectedChecklistItems(roadmap.checklist.map((c) => c.id));
    } finally {
      setGeneratingRoadmap(false);
    }
  }, [opportunity, isPro, credits, spendCredits, router, intake, user?.unsafeMetadata, t]);

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

  const handleTrackDeadlineOnly = useCallback(async () => {
    if (!user || !opportunity) return;

    try {
      if (opportunity.deadline) {
        await createGoal({
          title: t("detail.goals.deadlineTitle", { title: opportunity.title }),
          description: t("detail.goals.deadlineDescription", { organization: opportunity.organization }),
          category: t("detail.goals.applicationCategory"),
          deadline: opportunity.deadline,
          source: "custom",
        });
        setBookmarked(true);
        Alert.alert(
          t("detail.alerts.deadlineTrackedTitle"),
          t("detail.alerts.deadlineTrackedMsg"),
          [
            { text: t("detail.alerts.viewCalendar"), onPress: () => router.push("/goals") },
            { text: t("common:actions.ok"), style: "cancel" },
          ],
        );
      } else {
        Alert.alert(
          t("detail.alerts.bookmarkedTitle"),
          t("detail.alerts.bookmarkedMsg"),
        );
      }
    } catch (error: any) {
      Alert.alert(t("common:states.error"), error.message || t("detail.alerts.trackDeadlineFailed"));
    }
  }, [user, opportunity, createGoal, router, t]);

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

  const daysUntilDeadline = opportunity.deadline
    ? Math.ceil(
        (new Date(opportunity.deadline).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : null;
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 14;
  const isClosed = daysUntilDeadline !== null && daysUntilDeadline <= 0;

  const categoryColor = getCategoryColor(opportunity.category);
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
          <View style={{ flexDirection: "row" }}>
            <TouchableOpacity
              onPress={toggleBookmark}
              style={{ padding: 8 }}
              disabled={bookmarkLoading}
            >
              {bookmarkLoading ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : bookmarked ? (
                <BookmarkCheck size={22} color={colors.accent} />
              ) : (
                <Bookmark size={22} color={textSecondary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={{ padding: 8 }}>
              <Share2 size={22} color={textSecondary} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Hero Image */}
        <View style={styles.heroImage}>
          {opportunity.image ? (
            <Image
              source={{ uri: opportunity.image }}
              style={{ width: "100%", height: "100%" }}
              // Many opportunity images are portrait flyers/posters with the
              // title and key info at the top. "cover" crops that off, so use
              // "contain" to always show the whole graphic.
              resizeMode="contain"
            />
          ) : (
            <LinearGradient
              colors={[categoryColor, `${categoryColor}88`]}
              style={{ width: "100%", height: "100%" }}
            >
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={64} color="rgba(255,255,255,0.6)" />
              </View>
            </LinearGradient>
          )}
          <View style={styles.heroOverlay}>
            {opportunity.featured && (
              <View
                style={[
                  styles.featuredBadge,
                  { backgroundColor: categoryColor },
                ]}
              >
                <Sparkles size={12} color="white" />
                <Text style={styles.featuredText}>{t("detail.featured")}</Text>
              </View>
            )}
            {isUrgent && !isClosed && (
              <View
                style={[styles.urgentBadge, { backgroundColor: "#EF4444" }]}
              >
                <AlertCircle size={12} color="white" />
                <Text style={styles.urgentText}>
                  {t("detail.daysLeft", { count: daysUntilDeadline ?? 0 })}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Title Section */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: `${categoryColor}15` },
              ]}
            >
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {opportunity.category}
              </Text>
            </View>
            {opportunity.difficulty && (
              <View
                style={[
                  styles.difficultyBadge,
                  { backgroundColor: "#F59E0B15" },
                ]}
              >
                <Text style={[styles.difficultyText, { color: "#F59E0B" }]}>
                  {opportunity.difficulty}
                </Text>
              </View>
            )}
            {opportunity.match > 0 && (
              <View
                style={[styles.matchBadge, { backgroundColor: "#10B98115" }]}
              >
                <Text style={[styles.matchText, { color: "#10B981" }]}>
                  {t("detail.matchPercent", { match: opportunity.match })}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.title, { color: textPrimary }]}>
            {opportunity.title}
          </Text>
          {/* Sponsor Banner */}
          <View style={[styles.sponsorBanner, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.sponsorIconWrap}>
              <Building2 size={20} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sponsorLabel, { color: textSecondary }]}>
                {t("detail.sponsor")}
              </Text>
              <Text style={[styles.sponsorName, { color: textPrimary }]}>
                {opportunity.organization}
              </Text>
            </View>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
              <MapPin size={16} color={textSecondary} />
              <Text
                style={[styles.statText, { color: textSecondary }]}
                numberOfLines={1}
              >
                {opportunity.location || t("shared.remote")}
              </Text>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
              <Users size={16} color={textSecondary} />
              <Text style={[styles.statText, { color: textSecondary }]}>
                {t("detail.applied", { value: opportunity.applicants || "500+" })}
              </Text>
            </View>
          </View>

          {/* Deadline Card */}
          {daysUntilDeadline !== null && (
            <View
              style={[
                styles.deadlineCard,
                {
                  backgroundColor: cardBg,
                  borderColor: isUrgent
                    ? "#EF444440"
                    : isClosed
                      ? "#64748B40"
                      : "#10B98140",
                  borderLeftWidth: 4,
                  borderLeftColor: isUrgent
                    ? "#EF4444"
                    : isClosed
                      ? "#64748B"
                      : "#10B981",
                },
              ]}
            >
              <View style={styles.deadlineLeft}>
                <Clock
                  size={20}
                  color={
                    isUrgent ? "#EF4444" : isClosed ? "#64748B" : "#10B981"
                  }
                />
                <View style={{ marginLeft: 12 }}>
                  <Text
                    style={[styles.deadlineLabel, { color: textSecondary }]}
                  >
                    {isClosed ? t("detail.closed") : t("detail.deadline")}
                  </Text>
                  <Text style={[styles.deadlineValue, { color: textPrimary }]}>
                    {isClosed
                      ? t("detail.applicationEnded")
                      : t("detail.daysRemaining", { count: daysUntilDeadline ?? 0 })}
                  </Text>
                  <Text style={[styles.deadlineDate, { color: textSecondary }]}>
                    {new Date(opportunity.deadline!).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Stipend Card */}
          {opportunity.stipend && opportunity.stipend > 0 && (
            <View
              style={[
                styles.stipendCard,
                { backgroundColor: "#10B98108", borderColor: "#10B98130" },
              ]}
            >
              <View style={styles.stipendLeft}>
                <TrendingUp size={20} color="#10B981" />
                <View style={{ marginLeft: 12 }}>
                  <Text
                    style={[styles.deadlineLabel, { color: textSecondary }]}
                  >
                    {t("detail.stipendFunding")}
                  </Text>
                  <Text style={[styles.deadlineValue, { color: "#10B981" }]}>
                    {opportunity.currency || "$"}
                    {opportunity.stipend.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Match Reasons */}
          {opportunity.matchReasons && opportunity.matchReasons.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                {t("detail.whyMatches")}
              </Text>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: "#10B98108", borderColor: "#10B98130" },
                ]}
              >
                {opportunity.matchReasons.map((reason, index) => (
                  <View key={index} style={styles.listItem}>
                    <CheckCircle2 size={16} color="#10B981" />
                    <Text
                      style={[
                        styles.listText,
                        { color: "#10B981", marginLeft: 12 },
                      ]}
                    >
                      {reason}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Match Risks / Eligibility Warnings */}
          {opportunity.matchRisks && opportunity.matchRisks.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                {t("detail.thingsToCheck")}
              </Text>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: "#F59E0B10", borderColor: "#F59E0B30" },
                ]}
              >
                {opportunity.matchRisks.map((risk, index) => (
                  <View key={index} style={styles.listItem}>
                    <AlertCircle size={16} color="#F59E0B" />
                    <Text
                      style={[
                        styles.listText,
                        { color: isDark ? "#FBBF24" : "#B45309", marginLeft: 12 },
                      ]}
                    >
                      {risk}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View
            style={[
              styles.aiDecisionCard,
              {
                backgroundColor: `${colors.accent}08`,
                borderColor: `${colors.accent}20`,
              },
            ]}
          >
            <View style={styles.aiDecisionHeader}>
              <Sparkles size={16} color={colors.accent} />
              <Text style={[styles.aiDecisionTitle, { color: textPrimary }]}>
                {t("detail.askAI")}
              </Text>
            </View>
            <View style={styles.aiDecisionActions}>
              {[
                [
                  t("detail.aiChips.eligibility"),
                  t("detail.aiChips.eligibilityPrompt"),
                ],
                [
                  t("detail.aiChips.fit"),
                  t("detail.aiChips.fitPrompt"),
                ],
                [
                  t("detail.aiChips.cv"),
                  t("detail.aiChips.cvPrompt"),
                ],
                [
                  t("detail.aiChips.prep"),
                  t("detail.aiChips.prepPrompt"),
                ],
              ].map(([label, prompt]) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => askAI(prompt)}
                  style={[
                    styles.aiDecisionChip,
                    {
                      borderColor: `${colors.accent}30`,
                      backgroundColor: cardBg,
                    },
                  ]}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.aiDecisionChipText,
                      { color: colors.accent },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* AI Tags */}
          {opportunity.aiTags && opportunity.aiTags.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {opportunity.aiTags.map((tag, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: `${categoryColor}10`,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: categoryColor,
                      fontSize: 10,
                      fontWeight: "500",
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* About Section */}
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>
            {t("detail.aboutTitle")}
          </Text>

          {opportunity.aiSummary &&
            opportunity.aiSummary !== opportunity.description && (
              <View
                style={{
                  backgroundColor: `${categoryColor}08`,
                  padding: 14,
                  borderRadius: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: `${categoryColor}16`,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                    gap: 6,
                  }}
                >
                  <Sparkles size={14} color={categoryColor} />
                  <Text
                    style={{
                      color: categoryColor,
                      fontWeight: "600",
                      fontSize: 11,
                      textTransform: "uppercase",
                    }}
                  >
                    {t("detail.aiSummary")}
                  </Text>
                </View>
                <Text
                  style={{ color: textSecondary, fontSize: 13, lineHeight: 20 }}
                >
                  {opportunity.aiSummary}
                </Text>
              </View>
            )}

          <Text style={[styles.description, { color: textSecondary }]}>
            {opportunity.description &&
            opportunity.description !== "No description provided."
              ? opportunity.description
              : t("detail.descriptionUnavailable")}
          </Text>

          {/* Requirements */}
          {opportunity.requirements && opportunity.requirements.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                {t("detail.requirements")}
              </Text>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: cardBg, borderColor },
                ]}
              >
                {opportunity.requirements.map((req, index) => (
                  <View key={index} style={styles.listItem}>
                    <View
                      style={[
                        styles.listDot,
                        { backgroundColor: categoryColor },
                      ]}
                    />
                    <Text style={[styles.listText, { color: textSecondary }]}>
                      {req}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Benefits */}
          {opportunity.benefits && opportunity.benefits.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                {t("detail.benefits")}
              </Text>
              <View
                style={[
                  styles.listCard,
                  { backgroundColor: cardBg, borderColor },
                ]}
              >
                {opportunity.benefits.map((benefit, index) => (
                  <View key={index} style={styles.listItem}>
                    <Award size={16} color="#10B981" />
                    <Text
                      style={[
                        styles.listText,
                        { color: textSecondary, marginLeft: 12 },
                      ]}
                    >
                      {benefit}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Application Co-pilot CTA */}
          {!isClosed && (
            <AnimatedPressable
              onPress={() => router.push(`/copilot/${opportunity.id}` as never)}
              style={[
                styles.roadmapCTA,
                {
                  backgroundColor: `${colors.accent}10`,
                  borderColor: `${colors.accent}25`,
                },
              ]}
              entering={FadeInDown.duration(400)}
              hapticFeedback="medium"
            >
              <LinearGradient
                colors={[`${colors.accent}06`, `${colors.accent}02`]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.roadmapCTAContent}>
                <View
                  style={[
                    styles.roadmapCTAIcon,
                    { backgroundColor: `${colors.accent}20` },
                  ]}
                >
                  <FileText size={22} color={colors.accent} />
                </View>
                <View style={styles.roadmapCTAText}>
                  <Text
                    style={[styles.roadmapCTATitle, { color: textPrimary }]}
                  >
                    {t("detail.copilotCta")}
                  </Text>
                  <Text
                    style={[styles.roadmapCTADesc, { color: textSecondary }]}
                    numberOfLines={2}
                  >
                    {t("detail.copilotCtaDesc")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.roadmapCTAArrow,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <ChevronRight size={22} color="#FFFFFF" />
                </View>
              </View>
            </AnimatedPressable>
          )}

          {/* Fit-to-my-life intake — optional, secondary. Collapsed by default
              and fully dismissible so it doesn't always take up space. */}
          {!bookmarked && opportunity.deadline && !isClosed && !tuneDismissed && (
            <View
              style={[
                styles.intakeCard,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
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
                    <Text style={{ color: textSecondary }}>
                      {t("detail.optional")}
                    </Text>
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

          {/* AI Roadmap CTA */}
          {!bookmarked && opportunity.deadline && !isClosed && (
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
              entering={FadeInDown.duration(400)}
              hapticFeedback="medium"
            >
              <LinearGradient
                colors={[`${colors.accent}06`, `${colors.accent}02`]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.roadmapCTAContent}>
                <View
                  style={[
                    styles.roadmapCTAIcon,
                    { backgroundColor: `${colors.accent}20` },
                  ]}
                >
                  <Zap size={22} color={colors.accent} />
                </View>
                <View style={styles.roadmapCTAText}>
                  <Text
                    style={[styles.roadmapCTATitle, { color: textPrimary }]}
                  >
                    {t("detail.generateRoadmapCta")}
                  </Text>
                  <Text
                    style={[styles.roadmapCTADesc, { color: textSecondary }]}
                    numberOfLines={2}
                  >
                    {isPro
                      ? t("detail.roadmapProDesc")
                      : t("detail.roadmapCreditsDesc", { cost: ROADMAP_CREDIT_COST, credits })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.roadmapCTAArrow,
                    { backgroundColor: colors.accent },
                  ]}
                >
                  <ChevronRight size={22} color="#FFFFFF" />
                </View>
              </View>
            </AnimatedPressable>
          )}

          {/* Existing Roadmap Preview */}
          {opportunity.roadmap &&
            opportunity.roadmap.length > 0 &&
            !bookmarked && (
              <>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                  {t("detail.prepRoadmap")}
                </Text>
                <View
                  style={[
                    styles.roadmapCard,
                    { backgroundColor: cardBg, borderColor },
                  ]}
                >
                  <Text style={[styles.roadmapText, { color: textSecondary }]}>
                    {t("detail.roadmapStepsIntro", { count: opportunity.roadmap.length })}
                  </Text>
                  <View style={styles.roadmapSteps}>
                    {opportunity.roadmap.slice(0, 3).map((step, index) => (
                      <View key={index} style={styles.roadmapStep}>
                        <View
                          style={[
                            styles.stepNumber,
                            { backgroundColor: categoryColor },
                          ]}
                        >
                          <Text style={styles.stepNumberText}>{index + 1}</Text>
                        </View>
                        <Text
                          style={[styles.stepTitle, { color: textPrimary }]}
                          numberOfLines={1}
                        >
                          {step.title}
                        </Text>
                      </View>
                    ))}
                    {opportunity.roadmap.length > 3 && (
                      <Text
                        style={[styles.moreSteps, { color: textSecondary }]}
                      >
                        {t("detail.moreSteps", { count: opportunity.roadmap.length - 3 })}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.addGoalsButton,
                      { backgroundColor: categoryColor },
                    ]}
                    onPress={() => setShowRoadmapModal(true)}
                  >
                    <Target size={16} color="white" />
                    <Text style={styles.addGoalsButtonText}>
                      {t("detail.addToGoals")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          {/* Action Buttons */}
          <View style={styles.actionButtonsRow}>
            {/* Apply Now */}
            <View
              style={[
                styles.applyButtonWrapper,
                { flex: 1.5, opacity: isClosed ? 0.5 : 1, marginBottom: 0 },
              ]}
            >
              <LinearGradient
                colors={
                  isClosed
                    ? ["#64748B", "#475569"]
                    : [colors.accent, `${colors.accent}CC`]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.applyButtonGradient}
              >
                <TouchableOpacity
                  style={styles.applyButtonInner}
                  onPress={isClosed ? undefined : handleApply}
                  disabled={isClosed}
                  activeOpacity={0.85}
                >
                  <ExternalLink size={18} color="white" />
                  <Text style={styles.applyButtonText}>
                    {isClosed ? t("detail.closed") : t("detail.applyNow")}
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* Save Opportunity */}
            <TouchableOpacity
              style={[
                styles.saveButtonWrapper,
                {
                  flex: 1,
                  backgroundColor: bookmarked
                    ? `${colors.accent}15`
                    : colors.card,
                  borderColor: bookmarked ? colors.accent : colors.border,
                  borderWidth: 1.5,
                },
              ]}
              onPress={toggleBookmark}
              disabled={bookmarkLoading}
              activeOpacity={0.7}
            >
              {bookmarkLoading ? (
                <ActivityIndicator
                  size="small"
                  color={bookmarked ? colors.accent : colors.foreground}
                />
              ) : (
                <>
                  {bookmarked ? (
                    <BookmarkCheck size={20} color={colors.accent} />
                  ) : (
                    <Bookmark size={20} color={colors.foreground} />
                  )}
                  <Text
                    style={[
                      styles.saveButtonText,
                      { color: bookmarked ? colors.accent : colors.foreground },
                    ]}
                    numberOfLines={1}
                  >
                    {bookmarked ? t("detail.savedLabel") : t("common:actions.save")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Floating AI co-pilot button — one tap opens all AI recommendations */}
      {!isClosed && opportunity ? (
        <AiCopilotFab
          accent={colors.accent}
          label={t("detail.copilotCta", { defaultValue: "Apply with Edutu AI" })}
          onPress={() => router.push(`/copilot/${opportunity.id}` as never)}
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
                      <Sparkles size={24} color={colors.accent} />
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
                          <Sparkles size={11} color={colors.accent} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  content: { padding: 18 },
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
  title: { fontSize: 21, fontWeight: "700", marginBottom: 6, lineHeight: 28 },
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
  aiDecisionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  aiDecisionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  aiDecisionTitle: { fontSize: 14, fontWeight: "700", flex: 1 },
  aiDecisionActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  aiDecisionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiDecisionChipText: { fontSize: 12, fontWeight: "700" },
  actionButtonsRow: { flexDirection: "row", gap: 12, marginBottom: 40 },
  aiFab: {
    position: "absolute",
    right: 16,
    bottom: 108,
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
