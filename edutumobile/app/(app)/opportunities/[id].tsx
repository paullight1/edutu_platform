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
  X,
  Zap,
  FileText,
  ListChecks,
  Bell,
  AlertCircle,
  Info,
  Plus,
  Trash2,
  Check,
} from "lucide-react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { useTheme } from "../../../components/context/ThemeContext";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../../components/ui/BrandedLoader";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { supabase } from "../../../lib/supabase";
import { getOpportunity } from "@edutu/core/src/services/opportunities";
import {
  isOpportunitySaved,
  saveOpportunity,
  unsaveOpportunity,
} from "../../../packages/core/src/services/bookmarks";
import { trackOpportunityApplication } from "../../../packages/core/src/services/applications";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { useGoals } from "@edutu/core/src/hooks/useGoals";
import { useCredits } from "@edutu/core/src/hooks/useCredits";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { toSafeUUID } from "@edutu/core/src/utils/auth";
import { LinearGradient } from "expo-linear-gradient";
import ViewShot, { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { EdutuLogo } from "../../../components/branding/EdutuLogo";
import { getConfig } from "../../../lib/config";
import {
  generateRoadmapFromOpportunity,
  AIGeneratedRoadmap,
} from "@edutu/core/src/services/aiRoadmapGenerator";
import { notificationService } from "../../../lib/notifications";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import { FadeInDown } from "react-native-reanimated";
import Reanimated from "react-native-reanimated";

const { width } = Dimensions.get("window");

type RoadmapStep =
  | "overview"
  | "milestones"
  | "weekly"
  | "checklist"
  | "confirm";

const SHARE_TEXT_LIMITS = {
  summary: 360,
  section: 132,
  apply: 160,
};

function cleanShareText(
  value?: string | null,
  fallback = "Not specified",
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
  if (!deadline) return "Rolling / Not specified";
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
      ? "Funding available"
      : "Open opportunity",
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
  return opportunity.location || "Open to eligible applicants";
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
    : ["Details available in Edutu."];
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
    `${expired ? "Deadline Passed" : "Still Active"}!`,
    "",
    cleanShareText(opportunity.title, "Edutu opportunity"),
    "",
    `Sponsor: ${cleanShareText(opportunity.organization, "Edutu")}`,
    "",
    "Benefits:",
    benefitLines,
    "",
    `Category: ${cleanShareText(opportunity.category, "Opportunity")}`,
    `Eligible Country: ${getShareEligibility(opportunity)}`,
    `Deadline: ${formatShareDeadline(opportunity.deadline)}`,
    "",
    "Click the link below to apply📌",
    opportunity.applyUrl || "https://edutu.ai",
    "",
    "Kindly share with your friends who might be interested.",
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

export default function OpportunityDetailScreen() {
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
  const [selectedChecklistItems, setSelectedChecklistItems] = useState<
    string[]
  >([]);
  const [customMilestones, setCustomMilestones] = useState<any[]>([]);
  const [addingCustomMilestone, setAddingCustomMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDesc, setNewMilestoneDesc] = useState("");

  const slideAnim = useRef(new Animated.Value(0)).current;
  const viewRecordedRef = useRef(false);

  const backgroundColor = colors.background;
  const textPrimary = colors.foreground;
  const textSecondary = isDark ? "#94A3B8" : "#64748B";
  const cardBg = colors.card;
  const borderColor = colors.border;

  useEffect(() => {
    const fetchOpportunity = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const data = await getOpportunity(id, supabase);
        setOpportunity(data);
      } catch (error) {
        console.error("Failed to fetch opportunity:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchOpportunity();
  }, [id]);

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
        Alert.alert("Removed", "Opportunity removed from saved list");
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
        Alert.alert("Saved", "Opportunity saved to your list");
      }
    } catch (error) {
      console.error("Error toggling bookmark:", error);
      Alert.alert("Error", "Failed to save opportunity");
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleApply = useCallback(async () => {
    if (opportunity?.applyUrl && id) {
      try {
        let applyUrlHost: string | undefined;
        try {
          applyUrlHost = new URL(opportunity.applyUrl).hostname;
        } catch {
          applyUrlHost = undefined;
        }
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
          await trackOpportunityApplication(
            supabase,
            user.id,
            {
              opportunityId: id,
              status: "submitted",
              metadata: {
                source: "mobile_detail",
                applyUrlHost,
                title: opportunity.title,
              },
            },
            getToken,
          );
        }
        await Linking.openURL(opportunity.applyUrl);
      } catch (error) {
        console.error("Failed to open URL:", error);
      }
    }
  }, [getToken, id, opportunity, user?.id]);

  const askAI = useCallback(
    (intent: string) => {
      if (!opportunity) return;

      const prompt = `${intent}

Opportunity: ${opportunity.title}
Organization: ${opportunity.organization || "Unknown"}
Category: ${opportunity.category || "Opportunity"}
Deadline: ${opportunity.deadline || "Rolling"}
Description: ${opportunity.aiSummary || opportunity.description || "No description available"}`;

      router.push({ pathname: "/chat", params: { voiceMsg: prompt } } as never);
    },
    [opportunity, router],
  );

  const handleShare = useCallback(async () => {
    if (opportunity) {
      try {
        const sharePayload = await getBackendSharePayload(opportunity);
        const canShareFile = await Sharing.isAvailableAsync();
        if (sharePayload.imageUrl && canShareFile) {
          const downloaded = await downloadShareImage(
            sharePayload.imageUrl,
            opportunity.id,
          );
          if (downloaded) {
            if (Platform.OS === "ios") {
              await Share.share({
                title: opportunity.title,
                message: sharePayload.shareText,
                url: downloaded.uri,
              });
            } else {
              await Sharing.shareAsync(downloaded.uri, {
                mimeType: downloaded.mimeType,
                dialogTitle: "Share opportunity",
              });
            }
            return;
          }
        }

        setSharingCard(true);
        requestAnimationFrame(async () => {
          try {
            const uri = await captureRef(shareCardRef, {
              format: "png",
              quality: 1,
              result: "tmpfile",
            });
            if (canShareFile) {
              await Sharing.shareAsync(uri, {
                mimeType: "image/png",
                dialogTitle: "Share opportunity",
              });
            } else {
              await Share.share({
                title: opportunity.title,
                message: sharePayload.shareText,
                url:
                  sharePayload.shareUrl ||
                  opportunity.applyUrl ||
                  "https://edutu.ai",
              });
            }
          } finally {
            setSharingCard(false);
          }
        });
      } catch (error) {
        console.error("Failed to share:", error);
        setSharingCard(false);
      }
    }
  }, [opportunity]);

  const generateAIPath = useCallback(async () => {
    if (!opportunity) return;

    if (!isPro && credits < ROADMAP_CREDIT_COST) {
      Alert.alert(
        "Insufficient Credits",
        `Generating an AI roadmap requires ${ROADMAP_CREDIT_COST} credits. You have ${credits} credits. Upgrade to Pro for unlimited access or buy more credits.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Get Credits", onPress: () => router.push("/paywall") },
        ],
      );
      return;
    }

    if (!isPro) {
      const success = await spendCredits(
        ROADMAP_CREDIT_COST,
        `AI Roadmap: ${opportunity.title}`,
      );
      if (!success) {
        Alert.alert("Error", "Failed to deduct credits. Please try again.");
        return;
      }
    }

    setGeneratingRoadmap(true);
    setRoadmapStep("overview");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const roadmap = generateRoadmapFromOpportunity(opportunity);
    setGeneratedRoadmap(roadmap);
    setCustomMilestones(roadmap.milestones);
    setSelectedChecklistItems(roadmap.checklist.map((c) => c.id));
    setGeneratingRoadmap(false);
  }, [opportunity, isPro, credits, spendCredits, router]);

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
          "Already Tracked",
          "This opportunity is already actively tracked.",
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
          title: `Submit ${opportunity.title}`,
          description: `${generatedRoadmap.winningStrategy}\n\nResources:\n${resourceText}`,
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
        ...generatedRoadmap.dailyPlan.map((day) => ({
          title: day.title,
          description: `${day.description}\n\nFocus: ${day.focus}\nTime: ${day.durationMinutes} minutes`,
          deadline: day.date,
          priority:
            day.focus === "submission" || day.focus === "writing"
              ? ("high" as const)
              : ("medium" as const),
        })),
        ...selectedChecklist.map((item) => ({
          title: item.title,
          description: `Checklist item for ${opportunity.title}`,
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
        "AI Roadmap Created!",
        `${createdGoals.length} goals, daily actions, checklist items, and reminders have been added to your Goals page.`,
        [
          { text: "View Goals", onPress: () => router.push("/goals") },
          { text: "Stay Here", style: "cancel" },
        ],
      );
    } catch (error: any) {
      console.error("Failed to track with roadmap:", error);
      Alert.alert("Error", error.message || "Failed to create roadmap.");
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
  ]);

  const handleTrackDeadlineOnly = useCallback(async () => {
    if (!user || !opportunity) return;

    try {
      if (opportunity.deadline) {
        await createGoal({
          title: `Deadline: ${opportunity.title}`,
          description: `Submit application for ${opportunity.organization}.`,
          category: "Application",
          deadline: opportunity.deadline,
          source: "custom",
        });
        setBookmarked(true);
        Alert.alert(
          "Deadline Tracked!",
          "The deadline has been added to your calendar with reminders.",
          [
            { text: "View Calendar", onPress: () => router.push("/goals") },
            { text: "OK", style: "cancel" },
          ],
        );
      } else {
        Alert.alert(
          "Bookmarked!",
          "This opportunity has been saved to your bookmarks.",
        );
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to track deadline.");
    }
  }, [user, opportunity, createGoal, router]);

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

  const removeCustomMilestone = (index: number) => {
    setCustomMilestones(customMilestones.filter((_, i) => i !== index));
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
          <BrandedLoader label="Loading opportunity..." />
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
            Opportunity not found
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
            <Text style={{ color: "white", fontWeight: "600" }}>Go Back</Text>
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
      "A curated opportunity from Edutu. Open in the app to review full details and apply.",
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
    "Review the official eligibility criteria before applying.",
    5,
  );
  const shareApplicationSteps = getShareBullets(
    opportunity.applicationProcess,
    opportunity.applyUrl
      ? `Apply through the official link: ${opportunity.applyUrl}`
      : "Open this opportunity in Edutu and follow the application link.",
    3,
  );
  const shareFacts = [
    { label: "Reward", value: getShareFunding(opportunity) },
    { label: "Category", value: opportunity.category || "General" },
    { label: "Eligible Applicants", value: getShareEligibility(opportunity) },
    { label: "Deadline", value: formatShareDeadline(opportunity.deadline) },
    { label: "Location", value: opportunity.location || "Worldwide" },
    {
      label: "Match",
      value: opportunity.match
        ? `${opportunity.match}% fit`
        : "Personalized in Edutu",
    },
  ];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor }}
      edges={["top", "left", "right"]}
    >
      <ScreenHeader
        title="Opportunity Details"
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
              resizeMode="cover"
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
                <Text style={styles.featuredText}>Featured</Text>
              </View>
            )}
            {isUrgent && !isClosed && (
              <View
                style={[styles.urgentBadge, { backgroundColor: "#EF4444" }]}
              >
                <AlertCircle size={12} color="white" />
                <Text style={styles.urgentText}>
                  {daysUntilDeadline} days left
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
                  {opportunity.match}% Match
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
                Sponsor
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
                {opportunity.location || "Remote"}
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
                {opportunity.applicants || "500+"} applied
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
                    {isClosed ? "Closed" : "Deadline"}
                  </Text>
                  <Text style={[styles.deadlineValue, { color: textPrimary }]}>
                    {isClosed
                      ? "Application period has ended"
                      : `${daysUntilDeadline} days remaining`}
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
                    Stipend / Funding
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
                Why This Matches You
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
                Ask Edutu AI about this opportunity
              </Text>
            </View>
            <View style={styles.aiDecisionActions}>
              {[
                [
                  "Check eligibility",
                  "Check my eligibility for this opportunity. Be specific about likely gaps and what I should verify.",
                ],
                [
                  "Explain fit",
                  "Explain why this opportunity fits me and what profile details would improve the match.",
                ],
                [
                  "Tailor CV",
                  "Suggest how to tailor my CV for this opportunity with concrete bullet improvements.",
                ],
                [
                  "Plan prep",
                  "Create a concise preparation plan for this application before the deadline.",
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
            About This Opportunity
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
                    AI Summary
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
              : 'Detailed description is currently unavailable. Tap "Apply Now" to view more details on the official website.'}
          </Text>

          {/* Requirements */}
          {opportunity.requirements && opportunity.requirements.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                Requirements
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
                Benefits
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
                    Generate ROADMAP using AI
                  </Text>
                  <Text
                    style={[styles.roadmapCTADesc, { color: textSecondary }]}
                    numberOfLines={2}
                  >
                    {isPro
                      ? "Generate AI roadmap with weekly goals and reminders (Pro)"
                      : `Generate AI roadmap — ${ROADMAP_CREDIT_COST} credits (You have ${credits})`}
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
                  Preparation Roadmap
                </Text>
                <View
                  style={[
                    styles.roadmapCard,
                    { backgroundColor: cardBg, borderColor },
                  ]}
                >
                  <Text style={[styles.roadmapText, { color: textSecondary }]}>
                    This opportunity has {opportunity.roadmap.length}{" "}
                    preparation steps. Bookmark to add them to your Goals and
                    track your progress!
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
                        +{opportunity.roadmap.length - 3} more steps
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
                      Add to My Goals
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
                    {isClosed ? "Closed" : "Apply Now"}
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
                    {bookmarked ? "Saved" : "Save"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

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
                {roadmapStep === "overview" && "AI Roadmap Overview"}
                {roadmapStep === "milestones" && "Milestones"}
                {roadmapStep === "weekly" && "Weekly Goals"}
                {roadmapStep === "checklist" && "Preparation Checklist"}
                {roadmapStep === "confirm" && "Review & Create"}
              </Text>
              <Text style={[styles.modalStepDesc, { color: textSecondary }]}>
                {roadmapStep === "overview" &&
                  "Your personalized path to success"}
                {roadmapStep === "milestones" &&
                  "Key stages in your preparation journey"}
                {roadmapStep === "weekly" && "Week-by-week breakdown of tasks"}
                {roadmapStep === "checklist" &&
                  "Everything you need to prepare"}
                {roadmapStep === "confirm" &&
                  "Final review before creating your roadmap"}
              </Text>
            </View>

            {/* Modal Content */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              {generatingRoadmap && (
                <View style={styles.generatingContainer}>
                  <BrandedLoader label="Generating your roadmap..." size={64} />
                  <View style={styles.generatingSteps}>
                    {[
                      "Analyzing opportunity requirements",
                      "Creating preparation timeline",
                      "Building weekly goals",
                      "Setting up reminders",
                    ].map((step, i) => (
                      <View key={i} style={styles.generatingStep}>
                        <View
                          style={[
                            styles.generatingDot,
                            { backgroundColor: colors.accent },
                          ]}
                        />
                        <Text
                          style={[
                            styles.generatingStepText,
                            { color: textSecondary },
                          ]}
                        >
                          {step}
                        </Text>
                      </View>
                    ))}
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
                        Your Personalized Roadmap
                      </Text>
                      <Text
                        style={[styles.overviewDesc, { color: textSecondary }]}
                      >
                        {generatedRoadmap.summary}
                      </Text>
                    </View>

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
                          Days left
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
                          Daily steps
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
                          Tasks
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
                          Reminders
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
                        Submit target
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

                    <View
                      style={[
                        styles.strategyCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Text
                        style={[styles.strategyLabel, { color: colors.accent }]}
                      >
                        Resources
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
                    {customMilestones.map((milestone, i) => (
                      <View
                        key={milestone.id || i}
                        style={[
                          styles.milestoneCard,
                          { backgroundColor: cardBg, borderColor },
                        ]}
                      >
                        <View style={styles.milestoneHeader}>
                          <View
                            style={[
                              styles.milestoneNum,
                              { backgroundColor: `${colors.accent}15` },
                            ]}
                          >
                            <Text
                              style={[
                                styles.milestoneNumText,
                                { color: colors.accent },
                              ]}
                            >
                              Week{" "}
                              {Math.ceil(
                                (i + 1) *
                                  (generatedRoadmap.totalWeeks /
                                    customMilestones.length),
                              )}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => removeCustomMilestone(i)}
                            style={{ padding: 4 }}
                          >
                            <Trash2 size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                        <Text
                          style={[
                            styles.milestoneTitle,
                            { color: textPrimary },
                          ]}
                        >
                          {milestone.title}
                        </Text>
                        {milestone.description && (
                          <Text
                            style={[
                              styles.milestoneDesc,
                              { color: textSecondary },
                            ]}
                          >
                            {milestone.description}
                          </Text>
                        )}
                        <View style={styles.milestoneDate}>
                          <Calendar size={12} color={textSecondary} />
                          <Text
                            style={[
                              styles.milestoneDateText,
                              { color: textSecondary },
                            ]}
                          >
                            {new Date(milestone.date).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                    ))}

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
                          Add Custom Milestone
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
                          Milestone Title
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
                          placeholder="e.g., Complete Essay Draft"
                          placeholderTextColor={textSecondary}
                          value={newMilestoneTitle}
                          onChangeText={setNewMilestoneTitle}
                        />
                        <Text
                          style={[styles.formLabel, { color: textPrimary }]}
                        >
                          Description
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
                          placeholder="What needs to be done?"
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
                              Cancel
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={addCustomMilestone}
                            style={[
                              styles.formAddBtn,
                              { backgroundColor: colors.accent },
                            ]}
                          >
                            <Text style={styles.formAddText}>Add</Text>
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
                        First 7 daily actions
                      </Text>
                      {generatedRoadmap.dailyPlan.slice(0, 7).map((day) => (
                        <View key={day.id} style={styles.dailyPreviewRow}>
                          <Text
                            style={[
                              styles.dailyPreviewDay,
                              { color: colors.accent },
                            ]}
                          >
                            D{day.day}
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
                              {new Date(day.date).toLocaleDateString()} ·{" "}
                              {day.durationMinutes} min
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
                                W{week.week}
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
                                +{week.tasks.length - 3} more tasks
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
                              Target:{" "}
                              {new Date(week.deadline).toLocaleDateString()}
                            </Text>
                          </View>
                        </View>
                      ))}
                    {generatedRoadmap.totalWeeks > 6 && (
                      <Text
                        style={[styles.weeklyMore, { color: textSecondary }]}
                      >
                        +{generatedRoadmap.totalWeeks - 6} more weeks will be
                        included in your roadmap
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
                              ? "Documents"
                              : category === "preparation"
                                ? "Preparation"
                                : category === "application"
                                  ? "Application"
                                  : category === "interview"
                                    ? "Interview Prep"
                                    : "Follow-up"}
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
                        Roadmap Summary
                      </Text>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Opportunity
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
                          Duration
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {generatedRoadmap.dailyPlan.length} daily steps
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Milestones
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {customMilestones.length} stages
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Checklist Items
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {selectedChecklistItems.length} selected
                        </Text>
                      </View>
                      <View style={styles.confirmRow}>
                        <Text
                          style={[
                            styles.confirmLabel,
                            { color: textSecondary },
                          ]}
                        >
                          Submit target
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
                          Reminders
                        </Text>
                        <Text
                          style={[styles.confirmValue, { color: textPrimary }]}
                        >
                          {generatedRoadmap.reminders.length} scheduled
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
                        This creates milestones, daily calendar goals, selected
                        checklist items, and automatic reminders. You can
                        customize them later.
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
                    Back
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
                    ? "Create Roadmap"
                    : roadmapStep === "overview"
                      ? "View Roadmap"
                      : "Continue"}
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
              <LinearGradient
                colors={["#F8FBFF", "#EEF6FF", "#FFFFFF"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.sharePatternCircleOne} />
              <View style={styles.sharePatternCircleTwo} />
              <View style={styles.sharePatternBar} />
              <View style={styles.shareHeader}>
                <View style={styles.shareBrand}>
                  <EdutuLogo size={36} frameless />
                  <View>
                    <Text style={styles.shareBrandTitle}>Edutu</Text>
                    <Text style={styles.shareBrandSubtitle}>
                      OPPORTUNITY BRIEF
                    </Text>
                  </View>
                </View>
                <Text style={styles.shareSite}>Visit edutu.ai</Text>
              </View>
              <View style={styles.shareTitleRow}>
                <View style={styles.shareTitleBlock}>
                  <Text style={styles.shareTitle}>{opportunity.title}</Text>
                </View>
                <View style={styles.shareOrgWrap}>
                  {opportunity.image ? (
                    <Image
                      source={{ uri: opportunity.image }}
                      style={styles.shareOrgImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.shareOrgFallback}>
                      <Building2 size={44} color={categoryColor} />
                    </View>
                  )}
                  <Text style={styles.shareOrgName}>
                    {opportunity.organization}
                  </Text>
                </View>
              </View>
              <Text style={styles.shareSummary}>{shareSummary}</Text>
              <View style={styles.shareMetaGrid}>
                {shareFacts.map((fact) => (
                  <View key={fact.label} style={styles.shareMetaItem}>
                    <Text style={styles.shareMetaLabel}>{fact.label}:</Text>
                    <Text style={styles.shareMetaValue}>
                      {clampShareText(cleanShareText(fact.value), 58)}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.shareSection}>
                <Text style={styles.shareSectionTitle}>
                  Scholarship Reward / Benefits
                </Text>
                {shareBenefits.map((item, index) => (
                  <Text key={`benefit-${index}`} style={styles.shareBullet}>
                    • {item}
                  </Text>
                ))}
              </View>
              <View style={styles.shareSection}>
                <Text style={styles.shareSectionTitle}>Requirements</Text>
                {shareRequirements.map((item, index) => (
                  <Text key={`requirement-${index}`} style={styles.shareBullet}>
                    • {item}
                  </Text>
                ))}
              </View>
              <View style={styles.shareApplyBox}>
                <Text style={styles.shareSectionTitle}>How To Apply</Text>
                {shareApplicationSteps.map((item, index) => (
                  <Text key={`apply-${index}`} style={styles.shareApplyText}>
                    {index + 1}. {clampShareText(item, SHARE_TEXT_LIMITS.apply)}
                  </Text>
                ))}
              </View>
            </View>
          </ViewShot>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heroImage: { height: 200, position: "relative" },
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
    minHeight: 1680,
    backgroundColor: "#F8FBFF",
    paddingHorizontal: 78,
    paddingTop: 58,
    paddingBottom: 70,
    overflow: "hidden",
  },
  sharePatternCircleOne: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(59,130,246,0.08)",
    left: -135,
    top: 210,
  },
  sharePatternCircleTwo: {
    position: "absolute",
    width: 430,
    height: 430,
    borderRadius: 215,
    backgroundColor: "rgba(14,165,233,0.10)",
    right: -160,
    bottom: -150,
  },
  sharePatternBar: {
    position: "absolute",
    height: 18,
    left: 78,
    right: 78,
    bottom: 42,
    borderRadius: 999,
    backgroundColor: "#2F80ED",
  },
  shareHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 58,
  },
  shareBrand: { flexDirection: "row", alignItems: "center", gap: 12 },
  shareBrandTitle: { fontSize: 34, fontWeight: "900", color: "#0B2F6B" },
  shareBrandSubtitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    color: "#5B7CFA",
    marginTop: 2,
  },
  shareSite: {
    fontSize: 21,
    fontWeight: "800",
    color: "#2563EB",
    marginTop: 8,
  },
  shareTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 26,
  },
  shareTitleBlock: { flex: 1, paddingRight: 34 },
  shareTitle: {
    fontSize: 63,
    lineHeight: 75,
    fontWeight: "900",
    color: "#0A1020",
  },
  shareSummary: {
    marginBottom: 34,
    width: "72%",
    fontSize: 27,
    lineHeight: 37,
    color: "#172033",
    fontWeight: "500",
  },
  shareOrgWrap: { width: 255, alignItems: "center", paddingTop: 6 },
  shareOrgImage: { width: 156, height: 118, marginBottom: 14 },
  shareOrgFallback: {
    width: 126,
    height: 126,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#D6E8FF",
  },
  shareOrgName: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: "center",
    fontWeight: "900",
    color: "#0B2F6B",
    textTransform: "uppercase",
  },
  shareMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 20,
    columnGap: 28,
    marginBottom: 34,
  },
  shareMetaItem: { width: "30%", minWidth: 275 },
  shareMetaLabel: {
    fontSize: 19,
    fontWeight: "900",
    color: "#2563EB",
    marginBottom: 4,
  },
  shareMetaValue: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "700",
    color: "#111827",
  },
  shareSection: { marginTop: 18 },
  shareSectionTitle: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    color: "#2563EB",
    marginBottom: 8,
  },
  shareBullet: {
    fontSize: 23,
    lineHeight: 31,
    color: "#0F172A",
    marginLeft: 16,
    marginBottom: 3,
  },
  shareApplyBox: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: "rgba(37,99,235,0.14)",
  },
  shareApplyText: {
    fontSize: 22,
    lineHeight: 30,
    color: "#0F172A",
    fontWeight: "600",
    marginBottom: 4,
  },

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
