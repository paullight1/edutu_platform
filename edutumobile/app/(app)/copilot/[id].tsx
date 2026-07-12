import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  FileText,
  Lightbulb,
  ListChecks,
  Mail,
  MessageCircle,
  PartyPopper,
  PenLine,
  Share2,
  RefreshCw,
  Flag,
  Sparkles,
  Target,
  X,
} from "lucide-react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../components/context/ThemeContext";
import { ScreenHeader } from "../../../components/ui/ScreenHeader";
import { BrandedLoader } from "../../../components/ui/BrandedLoader";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { AnimatedPressable } from "../../../components/ui/AnimatedPressable";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { supabase } from "../../../lib/supabase";
import { useReportAIContent } from "../../../lib/reportAiContent";
import {
  getOpportunity,
  getCachedOpportunity,
} from "@edutu/core/src/services/opportunities";
import {
  buildRefereeRequestEmail,
  fetchApplicationKit,
  generateApplicationKit,
  generateEssayOutline,
  requestEssayFeedback,
  saveEssayDraft,
  updateKitChecklist,
  type ApplicationKit,
  type EssayFeedback,
  type EssayOutline,
  type EssayWorkspaceEntry,
  type KitChecklistItem,
  type KitEssayPrompt,
} from "@edutu/core/src/services/copilot";
import { recordOpportunitySignal } from "@edutu/core/src/services/opportunitySignals";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { useCredits } from "@edutu/core/src/hooks/useCredits";
import { isAiBillingError } from "@edutu/core/src/services/productApi";
import { useUpgradeSheet } from "../../../components/context/UpgradeSheetContext";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";

const KIT_CREDIT_COST = 15;

const GENERATION_PHASES = [
  "Reading the opportunity like a reviewer",
  "Matching it against your profile",
  "Building your document checklist",
  "Predicting the essay questions",
] as const;

const CHECKLIST_SECTIONS: Array<{
  key: KitChecklistItem["category"];
  label: string;
}> = [
  { key: "eligibility", label: "Eligibility" },
  { key: "documents", label: "Documents" },
  { key: "preparation", label: "Preparation" },
  { key: "submission", label: "Submission" },
];

// Specific, category-aware praise shown when a checklist item is ticked —
// being seen doing the work is half of why people keep doing it.
const TICK_PRAISE: Record<KitChecklistItem["category"], string[]> = {
  eligibility: [
    "Requirement confirmed — you're officially in the running.",
    "Eligibility box ticked. You belong in this race.",
  ],
  documents: [
    "One more document locked in — reviewers can tell who came prepared.",
    "That's the paperwork sorted. The boring parts win applications.",
  ],
  preparation: [
    "That's the referee sorted — the hard part is momentum, and you have it.",
    "Groundwork done. Most applicants never get this organized.",
  ],
  submission: [
    "So close now — you're nearer to submitted than most ever get.",
    "Final stretch. Every tick here is a step you won't panic about later.",
  ],
};

const CATEGORY_COMPLETE_COPY: Record<KitChecklistItem["category"], string> = {
  eligibility: "Eligibility: fully confirmed. Nothing can disqualify you on a technicality.",
  documents: "Documents: complete. That entire section is behind you.",
  preparation: "Preparation: done. You've built the application most people only plan.",
  submission: "Submission steps: complete. You are genuinely ready.",
};

// The three things the kit delivers — each with its own accent so the intro
// reads as a colourful, scannable set rather than three identical grey rows.
const KIT_FEATURES = [
  {
    icon: Target,
    title: "Your winning angle",
    desc: "Why you fit and exactly what to emphasize.",
    color: "#6366F1",
  },
  {
    icon: ListChecks,
    title: "Everything to prepare",
    desc: "Documents, eligibility proofs, submission steps.",
    color: "#10B981",
  },
  {
    icon: PenLine,
    title: "Essay co-writer",
    desc: "Predicted prompts, personalized outlines, honest feedback.",
    color: "#F59E0B",
  },
] as const;

/** Softly pulsing halo behind the hero icon. */
function PulseIcon({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.35 }],
    opacity: 0.55 - progress.value * 0.5,
  }));
  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        style={[styles.pulseHalo, { backgroundColor: color }, halo]}
      />
      <View style={[styles.pulseCore, { backgroundColor: `${color}1F` }]}>
        {children}
      </View>
    </View>
  );
}

/** Bobbing icon used inside the "opening the application" launch overlay. */
function LaunchIcon({ color }: { color: string }) {
  const scale = useSharedValue(0.92);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 620, easing: Easing.out(Easing.ease) }),
        withTiming(0.92, { duration: 620, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.launchIcon, { backgroundColor: `${color}22` }, style]}>
      <ExternalLink size={30} color={color} />
    </Animated.View>
  );
}

export default function ApplicationCopilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { isDark, colors } = useTheme();
  const reportAIContent = useReportAIContent("copilot");
  const { credits } = useCredits(supabase, user?.id || null);
  const { isPro } = useProStatus(supabase, user?.id || null);
  const upgradeSheet = useUpgradeSheet();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [kit, setKit] = useState<ApplicationKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  // Drives the animated "opening the application…" launch overlay.
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);

  // Essay workspace modal
  const [activePrompt, setActivePrompt] = useState<KitEssayPrompt | null>(null);
  const [draft, setDraft] = useState("");
  const [outline, setOutline] = useState<EssayOutline | null>(null);
  const [feedback, setFeedback] = useState<EssayFeedback | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const draftDirtyRef = useRef(false);

  // Celebration state: per-item praise line + a bigger banner when a whole
  // checklist category completes. Both auto-dismiss.
  const [praise, setPraise] = useState<{ itemId: string; text: string } | null>(null);
  const [categoryBanner, setCategoryBanner] = useState<string | null>(null);
  const praiseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (praiseTimerRef.current) clearTimeout(praiseTimerRef.current);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
  }, []);

  // Referee outreach email draft modal
  const [refereeDraft, setRefereeDraft] = useState<string | null>(null);

  // Clerk's getToken can be a new reference every render; keep it in a ref so
  // the load effect can call the latest one without re-running (which would
  // otherwise loop setLoading(true) forever and flicker the screen).
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const textSecondary = isDark ? "#94A3B8" : "#64748B";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!id) return;
      setLoading(true);
      // 1) Load the opportunity first — this is all the screen needs to render.
      // Race the network fetch against an 8s timeout so a slow/offline query
      // can never hang the screen; on timeout or error, fall back to the
      // per-id AsyncStorage cache so a previously-opened opportunity still opens.
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("opportunity_load_timeout")), 8000),
        );
        const opp = await Promise.race([
          getOpportunity(id, supabase),
          timeout,
        ]);
        if (!cancelled) setOpportunity(opp);
      } catch (error) {
        console.error("Failed to load co-pilot opportunity:", error);
        const cached = await getCachedOpportunity(id);
        if (!cancelled && cached) setOpportunity(cached);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2) Fetch any existing application kit in the BACKGROUND. The backend
      // can be slow/unreachable (cold start) — never let it block the screen.
      try {
        const existingKit = await fetchApplicationKit(id, getTokenRef.current);
        if (
          !cancelled &&
          existingKit?.kit &&
          (existingKit.kit.checklist?.length || existingKit.kit.essayPrompts?.length)
        ) {
          setKit(existingKit);
        }
      } catch (error) {
        console.error("Failed to load application kit:", error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // Only re-run when the opportunity id changes — getToken is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!generating) {
      setGenerationPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setGenerationPhase((phase) => Math.min(phase + 1, GENERATION_PHASES.length - 1));
    }, 1100);
    return () => clearInterval(timer);
  }, [generating]);

  const deadlineBadge = useMemo(
    () => (opportunity?.deadline ? getDeadlineBadge(opportunity.deadline) : null),
    [opportunity?.deadline],
  );

  const checklist = kit?.kit.checklist ?? [];
  const checklistState = kit?.checklistState ?? {};
  const doneCount = checklist.filter((item) => checklistState[item.id]).length;
  const checklistProgress = checklist.length ? doneCount / checklist.length : 0;

  // Server-side billing refusal (402 insufficient credits / 429 fair-use
  // limit) — the backend debits credits now, so this alert is the real gate.
  const showBillingAlert = useCallback(
    (error: unknown): boolean => {
      if (!isAiBillingError(error)) return false;
      // Prefer the shared upgrade bottom sheet; the alert stays as a fallback
      // if the provider isn't mounted for any reason.
      if (upgradeSheet) {
        upgradeSheet.show(error.message);
        return true;
      }
      Alert.alert(
        error.code === "limit" ? "Limit reached" : "Not enough credits",
        error.message,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Buy Credits", onPress: () => router.push("/wallet" as never) },
          { text: "Go Pro", onPress: () => router.push("/paywall" as never) },
        ],
      );
      return true;
    },
    [router, upgradeSheet],
  );

  const essayEntryFor = useCallback(
    (promptId: string): EssayWorkspaceEntry | undefined =>
      kit?.essays?.find((entry) => entry.promptId === promptId),
    [kit?.essays],
  );

  // -------------------------------------------------------------------------
  // Kit generation (Pro free, otherwise credits — same gate as AI roadmaps)
  // -------------------------------------------------------------------------

  const handleGenerate = useCallback(
    async (refresh = false) => {
      if (!opportunity) return;

      // Pre-flight UX check only — the server is the source of truth and
      // debits credits itself (402/429 below is the real gate).
      if (!refresh && !isPro && credits < KIT_CREDIT_COST) {
        Alert.alert(
          "Insufficient Credits",
          `The Application Co-pilot kit requires ${KIT_CREDIT_COST} credits. You have ${credits}. Upgrade to Pro for unlimited access or buy more credits.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Buy Credits", onPress: () => router.push("/wallet" as never) },
            { text: "Go Pro", onPress: () => router.push("/paywall" as never) },
          ],
        );
        return;
      }

      setGenerating(true);
      try {
        const { kit: generated, source } = await generateApplicationKit(
          opportunity,
          getToken,
          { refresh },
        );
        setKit(generated);
        if (source === "local") {
          Alert.alert(
            "Offline kit",
            "You're offline or the AI is busy, so this is a starter kit. Regenerate later for the fully personalized version.",
          );
        }
        void recordOpportunitySignal(
          {
            opportunityId: opportunity.id,
            signalType: "click",
            signalValue: 3,
            source: "mobile_copilot",
            context: refresh ? "copilot_kit_refreshed" : "copilot_kit_generated",
            details: { title: opportunity.title },
          },
          getToken,
        );
      } catch (error) {
        if (!showBillingAlert(error)) throw error;
      } finally {
        setGenerating(false);
      }
    },
    [opportunity, isPro, credits, getToken, router, showBillingAlert],
  );

  const confirmRefresh = useCallback(() => {
    Alert.alert(
      "Regenerate kit?",
      "Your checklist ticks and essay drafts are kept — only the AI content (fit note, strategy, checklist items, prompts) is rebuilt.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Regenerate", onPress: () => void handleGenerate(true) },
      ],
    );
  }, [handleGenerate]);

  // -------------------------------------------------------------------------
  // Checklist
  // -------------------------------------------------------------------------

  const toggleChecklistItem = useCallback(
    (item: KitChecklistItem) => {
      if (!kit || !id) return;
      const nextDone = !checklistState[item.id];
      setKit((current) =>
        current
          ? {
              ...current,
              checklistState: {
                ...current.checklistState,
                [item.id]: nextDone,
              },
            }
          : current,
      );
      void updateKitChecklist(id, { itemId: item.id, done: nextDone }, getToken);
    },
    [kit, id, checklistState, getToken],
  );

  // -------------------------------------------------------------------------
  // Essay workspace
  // -------------------------------------------------------------------------

  const openEssay = useCallback(
    (prompt: KitEssayPrompt) => {
      const entry = essayEntryFor(prompt.id);
      setActivePrompt(prompt);
      setDraft(entry?.draft ?? "");
      setOutline(entry?.outline ?? null);
      setFeedback(entry?.feedback ?? null);
      draftDirtyRef.current = false;
    },
    [essayEntryFor],
  );

  const syncEssayEntry = useCallback(
    (promptId: string, promptText: string, patch: Partial<EssayWorkspaceEntry>) => {
      setKit((current) => {
        if (!current) return current;
        const essays = [...(current.essays ?? [])];
        const index = essays.findIndex((entry) => entry.promptId === promptId);
        const base =
          index >= 0
            ? essays[index]
            : { promptId, prompt: promptText, updatedAt: new Date().toISOString() };
        const next = { ...base, ...patch, updatedAt: new Date().toISOString() };
        if (index >= 0) essays[index] = next;
        else essays.push(next);
        return { ...current, essays };
      });
    },
    [],
  );

  const handleOutline = useCallback(async () => {
    if (!activePrompt || !id) return;
    setOutlineLoading(true);
    try {
      const { outline: generated } = await generateEssayOutline(
        id,
        { promptId: activePrompt.id, prompt: activePrompt.prompt },
        getToken,
      );
      setOutline(generated);
      syncEssayEntry(activePrompt.id, activePrompt.prompt, { outline: generated });
    } catch (error) {
      if (!showBillingAlert(error)) throw error;
    } finally {
      setOutlineLoading(false);
    }
  }, [activePrompt, id, getToken, syncEssayEntry, showBillingAlert]);

  const handleFeedback = useCallback(async () => {
    if (!activePrompt || !id) return;
    const trimmed = draft.trim();
    if (trimmed.split(/\s+/).length < 20) {
      Alert.alert(
        "Draft too short",
        "Write at least a rough paragraph (20+ words) so the review is useful.",
      );
      return;
    }
    setFeedbackLoading(true);
    try {
      const { feedback: result } = await requestEssayFeedback(
        id,
        { promptId: activePrompt.id, prompt: activePrompt.prompt, draft: trimmed },
        getToken,
      );
      setFeedback(result);
      draftDirtyRef.current = false;
      syncEssayEntry(activePrompt.id, activePrompt.prompt, {
        draft: trimmed,
        feedback: result,
      });
    } catch (error) {
      if (!showBillingAlert(error)) throw error;
    } finally {
      setFeedbackLoading(false);
    }
  }, [activePrompt, id, draft, getToken, syncEssayEntry, showBillingAlert]);

  const persistDraft = useCallback(async () => {
    if (!activePrompt || !id || !draftDirtyRef.current) return;
    setSavingDraft(true);
    try {
      await saveEssayDraft(
        id,
        { promptId: activePrompt.id, prompt: activePrompt.prompt, draft },
        getToken,
      );
      syncEssayEntry(activePrompt.id, activePrompt.prompt, { draft });
      draftDirtyRef.current = false;
    } finally {
      setSavingDraft(false);
    }
  }, [activePrompt, id, draft, getToken, syncEssayEntry]);

  const closeEssay = useCallback(() => {
    void persistDraft();
    setActivePrompt(null);
  }, [persistDraft]);

  // -------------------------------------------------------------------------
  // Cross-feature CTAs
  // -------------------------------------------------------------------------

  const openChat = useCallback(() => {
    if (!opportunity) return;
    const prompt = `I'm preparing my application for this opportunity. Help me strengthen it.

Opportunity: ${opportunity.title}
Organization: ${opportunity.organization || "Unknown"}
Deadline: ${opportunity.deadline || "Rolling"}`;
    router.push({ pathname: "/chat", params: { voiceMsg: prompt } } as never);
  }, [opportunity, router]);

  const openApply = useCallback(() => {
    const url = opportunity?.applyUrl;
    if (!url) return;
    // Show a branded launch animation, then hand off to the browser. Feels
    // intentional instead of the app abruptly disappearing.
    setOpeningUrl(url);
    setTimeout(() => {
      void Linking.openURL(url)
        .catch(() => undefined)
        .finally(() => setOpeningUrl(null));
    }, 850);
  }, [opportunity?.applyUrl]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <BrandedLoader label="Opening your co-pilot..." />
      </View>
    );
  }

  if (!opportunity) {
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <ScreenHeader title="Application Co-pilot" showBack />
        <View style={styles.emptyWrap}>
          <Text style={{ color: textSecondary, fontSize: 14 }}>
            This opportunity is no longer available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScreenHeader
        title="Application Co-pilot"
        subtitle={opportunity.title}
        showBack
        right={
          kit ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() =>
                  reportAIContent(
                    [kit.kit.fitNote, ...kit.kit.strategy].filter(Boolean).join("\n"),
                    { opportunityId: id, generatedBy: kit.generatedBy },
                  )
                }
                style={[styles.headerBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Flag size={17} color={textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmRefresh}
                style={[styles.headerBtn, { backgroundColor: `${colors.accent}15` }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <RefreshCw size={17} color={colors.accent} />
              </TouchableOpacity>
            </View>
          ) : undefined
        }
      />

      {!kit ? (
        generating ? (
          <View style={styles.generateWrap}>
            <View style={[styles.generateIcon, { backgroundColor: `${colors.accent}15` }]}>
              <Sparkles size={30} color={colors.accent} />
            </View>
            <Text style={[styles.generateTitle, { color: colors.foreground }]}>
              Building your kit
            </Text>
            {GENERATION_PHASES.map((phase, index) => (
              <View key={phase} style={styles.phaseRow}>
                {index < generationPhase ? (
                  <CheckCircle2 size={16} color={colors.success} />
                ) : index === generationPhase ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Circle size={16} color={colors.border} />
                )}
                <Text
                  style={{
                    color: index <= generationPhase ? colors.foreground : textSecondary,
                    fontSize: 14,
                  }}
                >
                  {phase}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.introScroll}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              entering={FadeIn.duration(450)}
              style={[styles.introHero, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <LinearGradient
                colors={[`${colors.accent}18`, `${colors.accent}05`, "transparent"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <PulseIcon color={colors.accent}>
                <FileText size={30} color={colors.accent} />
              </PulseIcon>
              <Text style={[styles.introTitle, { color: colors.foreground }]}>
                Apply with Edutu
              </Text>
              <Text style={[styles.introDesc, { color: textSecondary }]}>
                A personalized application kit for {"“"}
                {opportunity.title}
                {"”"} — your winning angle, a document checklist, the likely
                essay questions, plus AI outlines and draft feedback.
              </Text>
              {deadlineBadge && (
                <View
                  style={[
                    styles.deadlinePill,
                    { backgroundColor: `${urgencyColor(deadlineBadge.level)}1F` },
                  ]}
                >
                  <Text
                    style={{
                      color: urgencyColor(deadlineBadge.level),
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {deadlineBadge.label}
                  </Text>
                </View>
              )}
            </Animated.View>

            <Text style={[styles.introSectionLabel, { color: textSecondary }]}>
              WHAT YOU GET
            </Text>

            {KIT_FEATURES.map((row, index) => (
              <Animated.View
                key={row.title}
                entering={FadeInDown.delay(120 + index * 90).duration(420)}
                style={[
                  styles.introRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderLeftColor: row.color,
                    borderLeftWidth: 3,
                  },
                ]}
              >
                <View style={[styles.introRowIcon, { backgroundColor: `${row.color}1A` }]}>
                  <row.icon size={19} color={row.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "800" }}>
                    {row.title}
                  </Text>
                  <Text style={{ color: textSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 }}>
                    {row.desc}
                  </Text>
                </View>
              </Animated.View>
            ))}

            <View style={{ height: 8 }} />

            <AnimatedPressable
              onPress={() => void handleGenerate(false)}
              hapticFeedback="medium"
              entering={FadeInDown.delay(430).duration(420)}
              style={styles.generateCTA}
            >
              <LinearGradient
                colors={[colors.accent, `${colors.accent}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.generateCTAGradient}
              >
                <Sparkles size={18} color="#FFFFFF" />
                <Text style={styles.generateCTAText}>
                  {isPro
                    ? "Generate my application kit"
                    : `Generate my kit — ${KIT_CREDIT_COST} credits`}
                </Text>
              </LinearGradient>
            </AnimatedPressable>

            <Text style={[styles.introFootnote, { color: textSecondary }]}>
              {isPro
                ? "Included with Pro · Outlines & feedback included"
                : `You have ${credits} credits · Outlines & feedback included`}
            </Text>
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.kitScroll}>
          {/* Fit note */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Target size={16} color={colors.accent} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Your winning angle
              </Text>
              {kit.generatedBy !== "ai" && (
                <View style={[styles.sourceBadge, { backgroundColor: `${colors.warning}18` }]}>
                  <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700" }}>
                    STARTER
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>
              {kit.kit.fitNote}
            </Text>
          </View>

          {/* Strategy */}
          {kit.kit.strategy.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Lightbulb size={16} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Winning strategy
                </Text>
              </View>
              {kit.kit.strategy.map((tip, index) => (
                <View key={index} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Checklist */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <ListChecks size={16} color={colors.accent} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Application checklist
              </Text>
              <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>
                {doneCount}/{checklist.length}
              </Text>
            </View>
            <ProgressBar progress={Math.round(checklistProgress * 100)} variant="green" />
            {CHECKLIST_SECTIONS.map((section) => {
              const items = checklist.filter((item) => item.category === section.key);
              if (!items.length) return null;
              return (
                <View key={section.key} style={{ marginTop: 14 }}>
                  <Text style={[styles.sectionLabel, { color: textSecondary }]}>
                    {section.label.toUpperCase()}
                  </Text>
                  {items.map((item) => {
                    const done = Boolean(checklistState[item.id]);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.checkRow}
                        onPress={() => toggleChecklistItem(item)}
                        activeOpacity={0.7}
                      >
                        {done ? (
                          <CheckCircle2 size={20} color={colors.success} />
                        ) : (
                          <Circle size={20} color={colors.border} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: done ? textSecondary : colors.foreground,
                              fontSize: 14,
                              textDecorationLine: done ? "line-through" : "none",
                            }}
                          >
                            {item.label}
                          </Text>
                          {item.detail ? (
                            <Text style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                              {item.detail}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>

          {/* Essays */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <PenLine size={16} color={colors.accent} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Essays & statements
              </Text>
            </View>
            <Text style={{ color: textSecondary, fontSize: 12, marginBottom: 10 }}>
              Likely prompts for this application. Tap one to outline, draft and get
              reviewer-style feedback.
            </Text>
            {kit.kit.essayPrompts.map((prompt) => {
              const entry = essayEntryFor(prompt.id);
              const status = entry?.feedback
                ? `Reviewed · ${entry.feedback.overallScore}/100`
                : entry?.draft
                  ? "Draft in progress"
                  : entry?.outline
                    ? "Outlined"
                    : "Not started";
              return (
                <TouchableOpacity
                  key={prompt.id}
                  style={[styles.essayRow, { borderColor: colors.border }]}
                  onPress={() => openEssay(prompt)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}
                      numberOfLines={2}
                    >
                      {prompt.prompt}
                    </Text>
                    <Text
                      style={{
                        color: entry?.feedback ? colors.success : textSecondary,
                        fontSize: 12,
                        marginTop: 4,
                        fontWeight: "600",
                      }}
                    >
                      {status}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cross-feature CTAs */}
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push("/cv" as never)}
              activeOpacity={0.8}
            >
              <FileText size={17} color={colors.accent} />
              <Text style={[styles.ctaBtnText, { color: colors.foreground }]}>Tailor CV</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={openChat}
              activeOpacity={0.8}
            >
              <MessageCircle size={17} color={colors.accent} />
              <Text style={[styles.ctaBtnText, { color: colors.foreground }]}>Ask Edutu</Text>
            </TouchableOpacity>
          </View>
          {opportunity.applyUrl ? (
            <TouchableOpacity onPress={openApply} activeOpacity={0.85} style={{ marginTop: 10 }}>
              <LinearGradient
                colors={[colors.accent, `${colors.accent}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.applyBtn}
              >
                <ExternalLink size={18} color="#FFFFFF" />
                <Text style={styles.generateCTAText}>Apply Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}

      {/* Essay workspace */}
      <Modal
        visible={Boolean(activePrompt)}
        animationType="slide"
        onRequestClose={closeEssay}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: textSecondary, fontSize: 11, fontWeight: "700" }}>
                  ESSAY WORKSPACE
                </Text>
                <Text
                  style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", marginTop: 2 }}
                  numberOfLines={2}
                >
                  {activePrompt?.prompt}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeEssay}
                style={[styles.headerBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}
              >
                <X size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {activePrompt?.guidance ? (
                <View style={[styles.guidanceCard, { backgroundColor: `${colors.accent}0A`, borderColor: `${colors.accent}20` }]}>
                  <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 19 }}>
                    {activePrompt.guidance}
                  </Text>
                  {activePrompt.suggestedAngle ? (
                    <Text style={{ color: colors.accent, fontSize: 13, lineHeight: 19, marginTop: 6, fontWeight: "600" }}>
                      Your angle: {activePrompt.suggestedAngle}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Outline */}
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: `${colors.accent}40`, backgroundColor: colors.card }]}
                onPress={handleOutline}
                disabled={outlineLoading}
                activeOpacity={0.8}
              >
                {outlineLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Sparkles size={16} color={colors.accent} />
                )}
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>
                  {outline ? "Regenerate outline" : "Generate personalized outline"}
                </Text>
              </TouchableOpacity>

              {outline && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
                  <Text style={[styles.sectionLabel, { color: colors.accent }]}>THESIS</Text>
                  <Text style={[styles.bodyText, { color: colors.foreground }]}>{outline.thesis}</Text>
                  {outline.hook ? (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.accent, marginTop: 10 }]}>HOOK</Text>
                      <Text style={[styles.bodyText, { color: colors.foreground }]}>{outline.hook}</Text>
                    </>
                  ) : null}
                  {outline.sections.map((section, index) => (
                    <View key={index} style={{ marginTop: 10 }}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700" }}>
                        {index + 1}. {section.heading}
                      </Text>
                      {section.points.map((point, pointIndex) => (
                        <View key={pointIndex} style={[styles.bulletRow, { marginTop: 4 }]}>
                          <View style={[styles.bulletDot, { backgroundColor: textSecondary }]} />
                          <Text style={{ color: textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>
                            {point}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  {outline.avoid.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.error, marginTop: 10 }]}>AVOID</Text>
                      {outline.avoid.map((item, index) => (
                        <Text key={index} style={{ color: textSecondary, fontSize: 13, lineHeight: 19 }}>
                          · {item}
                        </Text>
                      ))}
                    </>
                  )}
                </View>
              )}

              {/* Draft */}
              <Text style={[styles.sectionLabel, { color: textSecondary, marginTop: 18 }]}>
                YOUR DRAFT
              </Text>
              <TextInput
                multiline
                value={draft}
                onChangeText={(value) => {
                  setDraft(value);
                  draftDirtyRef.current = true;
                }}
                placeholder="Write or paste your draft here..."
                placeholderTextColor={textSecondary}
                style={[
                  styles.draftInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                textAlignVertical="top"
              />
              <View style={styles.draftMetaRow}>
                <Text style={{ color: textSecondary, fontSize: 12 }}>
                  {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
                </Text>
                <TouchableOpacity onPress={() => void persistDraft()} disabled={savingDraft}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                    {savingDraft ? "Saving..." : "Save draft"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleFeedback}
                disabled={feedbackLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.accent, `${colors.accent}CC`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyBtn}
                >
                  {feedbackLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Sparkles size={17} color="#FFFFFF" />
                  )}
                  <Text style={styles.generateCTAText}>
                    {feedbackLoading ? "Reviewing like a committee..." : "Get reviewer feedback"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Feedback */}
              {feedback && (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 }]}>
                  <View style={styles.scoreHeader}>
                    <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800" }}>
                      {feedback.overallScore}
                      <Text style={{ color: textSecondary, fontSize: 12, fontWeight: "600" }}>/100</Text>
                    </Text>
                    <Text style={{ color: textSecondary, fontSize: 13, flex: 1, marginLeft: 10 }}>
                      {feedback.verdict}
                    </Text>
                  </View>
                  <View style={styles.scoreGrid}>
                    {(
                      [
                        ["Clarity", feedback.scores.clarity],
                        ["Relevance", feedback.scores.relevance],
                        ["Impact", feedback.scores.impact],
                        ["Authentic", feedback.scores.authenticity],
                      ] as Array<[string, number]>
                    ).map(([label, score]) => (
                      <View key={label} style={[styles.scoreCell, { backgroundColor: `${colors.accent}0A` }]}>
                        <Text style={{ color: colors.accent, fontSize: 15, fontWeight: "800" }}>
                          {score}
                        </Text>
                        <Text style={{ color: textSecondary, fontSize: 10, fontWeight: "600" }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {feedback.strengths.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.success, marginTop: 12 }]}>
                        STRENGTHS
                      </Text>
                      {feedback.strengths.map((item, index) => (
                        <Text key={index} style={{ color: colors.foreground, fontSize: 13, lineHeight: 19, marginTop: 3 }}>
                          · {item}
                        </Text>
                      ))}
                    </>
                  )}
                  {feedback.improvements.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.warning, marginTop: 12 }]}>
                        IMPROVE NEXT
                      </Text>
                      {feedback.improvements.map((item, index) => (
                        <Text key={index} style={{ color: colors.foreground, fontSize: 13, lineHeight: 19, marginTop: 3 }}>
                          {index + 1}. {item}
                        </Text>
                      ))}
                    </>
                  )}
                  {feedback.lineEdits.length > 0 && (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.accent, marginTop: 12 }]}>
                        LINE EDITS
                      </Text>
                      {feedback.lineEdits.map((edit, index) => (
                        <View key={index} style={[styles.editCard, { borderColor: colors.border }]}>
                          <Text style={{ color: textSecondary, fontSize: 12, textDecorationLine: "line-through" }}>
                            {edit.original}
                          </Text>
                          <Text style={{ color: colors.foreground, fontSize: 13, marginTop: 3 }}>
                            {edit.suggestion}
                          </Text>
                          {edit.reason ? (
                            <Text style={{ color: colors.accent, fontSize: 11, marginTop: 3 }}>
                              {edit.reason}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </>
                  )}
                  {feedback.revisedOpening ? (
                    <>
                      <Text style={[styles.sectionLabel, { color: colors.accent, marginTop: 12 }]}>
                        STRONGER OPENING
                      </Text>
                      <Text
                        style={{ color: colors.foreground, fontSize: 13, lineHeight: 19, fontStyle: "italic", marginTop: 3 }}
                      >
                        {"“"}{feedback.revisedOpening}{"”"}
                      </Text>
                    </>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Animated launch overlay while we hand off to the application URL */}
      <Modal visible={Boolean(openingUrl)} transparent animationType="fade">
        <View style={styles.launchOverlay}>
          <Animated.View
            entering={FadeIn.duration(220)}
            style={[
              styles.launchCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <LaunchIcon color={colors.accent} />
            <Text style={[styles.launchTitle, { color: colors.foreground }]}>
              Opening the application…
            </Text>
            <Text style={[styles.launchSub, { color: textSecondary }]} numberOfLines={2}>
              {opportunity.title}
            </Text>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  generateWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  generateIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  generateTitle: { fontSize: 19, fontWeight: "800", marginBottom: 10 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start", marginLeft: 48 },
  introScroll: { padding: 16, paddingBottom: 48 },
  introHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  introTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.4, marginTop: 14 },
  introDesc: { fontSize: 13.5, lineHeight: 20, textAlign: "center", marginTop: 8 },
  deadlinePill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginTop: 16 },
  introSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginTop: 6,
    marginBottom: 10,
    marginLeft: 4,
  },
  introFootnote: { fontSize: 12, textAlign: "center", marginTop: 10 },
  pulseWrap: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseHalo: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 22,
  },
  pulseCore: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  launchOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  launchCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  launchIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  launchTitle: { fontSize: 16, fontWeight: "800", textAlign: "center" },
  launchSub: { fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  introRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  introRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  generateCTA: { marginTop: 8, borderRadius: 16, overflow: "hidden" },
  generateCTAGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  generateCTAText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  kitScroll: { padding: 16, paddingBottom: 48 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: "800", flex: 1 },
  sourceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  bodyText: { fontSize: 14, lineHeight: 21 },
  bulletRow: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "flex-start" },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 6 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7 },
  essayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    paddingVertical: 12,
  },
  ctaRow: { flexDirection: "row", gap: 10 },
  ctaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
  },
  ctaBtnText: { fontSize: 14, fontWeight: "700" },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
    marginTop: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
  },
  guidanceCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
  },
  draftInput: {
    minHeight: 180,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    lineHeight: 21,
  },
  draftMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  scoreHeader: { flexDirection: "row", alignItems: "center" },
  scoreGrid: { flexDirection: "row", gap: 8, marginTop: 12 },
  scoreCell: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
    gap: 2,
  },
  editCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
});
