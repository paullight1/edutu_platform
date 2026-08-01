import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
  Wand2,
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
import { haptics } from "../../../lib/haptics";
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
import { trackOpportunityApplication } from "@edutu/core/src/services/applications";
import { Opportunity } from "@edutu/core/src/types/opportunity";
import { useCredits } from "@edutu/core/src/hooks/useCredits";
import { isAiBillingError } from "@edutu/core/src/services/productApi";
import { useUpgradeSheet } from "../../../components/context/UpgradeSheetContext";
import { useProStatus } from "@edutu/core/src/hooks/useProStatus";
import { getDeadlineBadge, urgencyColor } from "@edutu/core/src/utils/deadline";
import { fetchMobileControlConfig } from "../../../lib/mobileControl";

// Fallback when the mobile-control config (admin OTA pricing) is unreachable;
// the effective price is read from `config.aiCosts.copilotKit` at runtime.
const DEFAULT_KIT_CREDIT_COST = 15;

// Per-kit record of the "Did you submit?" answer so the prompt never nags twice.
const APPLY_CONFIRM_PREFIX = "@edutu_copilot_apply_confirmed:";

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
  // Read here, in the screen, rather than inside the <Modal>s below: a
  // react-native-safe-area-context SafeAreaView rendered inside a RN Modal
  // measures against the modal's own native window and comes back with zero
  // insets, which is why the workspace header used to sit under the status bar
  // and the dynamic island. These values are measured against the real root.
  const insets = useSafeAreaInsets();
  const reportAIContent = useReportAIContent("copilot");
  const { credits } = useCredits(supabase, user?.id || null);
  const { isPro } = useProStatus(supabase, user?.id || null);
  const upgradeSheet = useUpgradeSheet();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [kit, setKit] = useState<ApplicationKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  // Effective kit price from admin OTA pricing; falls back to the default when
  // the mobile-control config is slow/unreachable.
  const [kitCreditCost, setKitCreditCost] = useState(DEFAULT_KIT_CREDIT_COST);
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
  useEffect(() => {
    // Written post-commit rather than during render: a concurrent render that
    // React discards must not leave its getToken behind in the ref.
    getTokenRef.current = getToken;
  });

  // Set true when we hand off to the external apply URL; on the next return to
  // foreground we ask whether the user actually submitted (P1.3).
  const awaitingApplyConfirmRef = useRef(false);

  // Read the effective kit price (admin OTA pricing) once; best-effort.
  useEffect(() => {
    let cancelled = false;
    void fetchMobileControlConfig()
      .then((config) => {
        if (!cancelled) {
          setKitCreditCost(config.aiCosts?.copilotKit ?? DEFAULT_KIT_CREDIT_COST);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
     
  }, [id]);

  // Adjust-during-render: rewind the phase ticker when generation stops; the
  // effect below only schedules the interval.
  const [prevGenerating, setPrevGenerating] = useState(generating);
  if (prevGenerating !== generating) {
    setPrevGenerating(generating);
    if (!generating) setGenerationPhase(0);
  }

  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => {
      setGenerationPhase((phase) => Math.min(phase + 1, GENERATION_PHASES.length - 1));
    }, 1100);
    return () => clearInterval(timer);
  }, [generating]);

  // Prefer the live deadline the backend joins onto the kit over the
  // opportunity row (which may be stale) or the AI text baked into the kit.
  const opportunityDeadline = kit?.opportunity?.deadline ?? opportunity?.deadline;
  const deadlineBadge = useMemo(
    () => (opportunityDeadline ? getDeadlineBadge(opportunityDeadline) : null),
    [opportunityDeadline],
  );
  const deadlinePassed = deadlineBadge?.level === "expired";

  const checklist = kit?.kit.checklist ?? [];
  const kitChecklistState = kit?.checklistState;
  const checklistState = useMemo(() => kitChecklistState ?? {}, [kitChecklistState]);
  const doneCount = checklist.filter((item) => checklistState[item.id]).length;
  const checklistProgress = checklist.length ? doneCount / checklist.length : 0;
  const stepsLeft = checklist.length - doneCount;
  const isReady = checklist.length > 0 && stepsLeft === 0;
  const essaysDrafted = (kit?.essays ?? []).filter(
    (entry) => (entry.draft ?? "").trim().length > 0,
  ).length;
  const essayPromptCount = kit?.kit.essayPrompts.length ?? 0;

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
      if (!refresh && !isPro && credits < kitCreditCost) {
        Alert.alert(
          "Insufficient Credits",
          `The Application Co-pilot kit requires ${kitCreditCost} credits. You have ${credits}. Upgrade to Pro for unlimited access or buy more credits.`,
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
        // Close the loop into the applied pipeline: a first-time generation
        // creates a tracked (draft/in-progress) application so the applied
        // dashboard and the win-coach see it immediately.
        if (!refresh && user?.id) {
          void trackOpportunityApplication(
            supabase,
            user.id,
            { opportunityId: opportunity.id, status: "draft" },
            getToken,
          ).catch(() => undefined);
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
        if (!showBillingAlert(error)) {
          console.error("Failed to generate application kit:", error);
          Alert.alert(
            "Something went wrong",
            "We couldn't build your kit right now. Please try again in a moment.",
          );
        }
      } finally {
        setGenerating(false);
      }
    },
    [opportunity, isPro, credits, kitCreditCost, getToken, router, showBillingAlert, user],
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

      if (nextDone) {
        // Did this tick complete its whole category?
        const nextState = { ...checklistState, [item.id]: true };
        const categoryItems = (kit.kit.checklist ?? []).filter(
          (entry) => entry.category === item.category,
        );
        const categoryDone =
          categoryItems.length > 0 && categoryItems.every((entry) => nextState[entry.id]);

        if (categoryDone) {
          void haptics.success();
          setPraise(null);
          setCategoryBanner(CATEGORY_COMPLETE_COPY[item.category]);
          if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
          bannerTimerRef.current = setTimeout(() => setCategoryBanner(null), 3500);
        } else {
          void haptics.light();
          const lines = TICK_PRAISE[item.category];
          setPraise({ itemId: item.id, text: lines[Math.floor(Math.random() * lines.length)] });
          if (praiseTimerRef.current) clearTimeout(praiseTimerRef.current);
          praiseTimerRef.current = setTimeout(() => setPraise(null), 2800);
        }
      } else if (praise?.itemId === item.id) {
        setPraise(null);
      }
    },
    [kit, id, checklistState, getToken, praise?.itemId],
  );

  // -------------------------------------------------------------------------
  // Referee outreach email
  // -------------------------------------------------------------------------

  const isRefereeItem = useCallback(
    (item: KitChecklistItem) =>
      item.id === "referees" || /refere|recommendation letter|recommender/i.test(item.label),
    [],
  );

  const openRefereeDraft = useCallback(() => {
    if (!opportunity) return;
    setRefereeDraft(
      buildRefereeRequestEmail({
        userName: user?.fullName || user?.firstName || null,
        opportunityTitle: opportunity.title,
        organization: opportunity.organization,
        deadline: opportunity.deadline,
      }),
    );
  }, [opportunity, user?.fullName, user?.firstName]);

  const shareRefereeDraft = useCallback(() => {
    if (!refereeDraft) return;
    void haptics.light();
    void Share.share({ message: refereeDraft }).catch(() => undefined);
  }, [refereeDraft]);

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
      if (!showBillingAlert(error)) {
        console.error("Failed to generate essay outline:", error);
        Alert.alert(
          "Something went wrong",
          "We couldn't build that outline right now. Please try again in a moment.",
        );
      }
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
      if (!showBillingAlert(error)) {
        console.error("Failed to review essay draft:", error);
        Alert.alert(
          "Something went wrong",
          "We couldn't review your draft right now. Please try again in a moment.",
        );
      }
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
    // Arm the "did you submit?" prompt for when we return to the foreground.
    awaitingApplyConfirmRef.current = true;
    // Show a branded launch animation, then hand off to the browser. Feels
    // intentional instead of the app abruptly disappearing.
    setOpeningUrl(url);
    setTimeout(() => {
      void Linking.openURL(url)
        .catch(() => undefined)
        .finally(() => setOpeningUrl(null));
    }, 850);
  }, [opportunity?.applyUrl]);

  // The kit closed a dead end: after handing off to the apply URL, confirm on
  // return whether the user submitted, then reflect it in the applied pipeline.
  // The answer is persisted per kit so we never nag twice (P1.3).
  const maybeAskApplyConfirm = useCallback(async () => {
    if (!id || !opportunity) return;
    const key = `${APPLY_CONFIRM_PREFIX}${id}`;
    try {
      const prior = await AsyncStorage.getItem(key);
      if (prior) return;
    } catch {
      // Best-effort — if storage is unreadable, still show the prompt once.
    }
    const opportunityId = opportunity.id;
    Alert.alert(
      "Did you submit your application?",
      "Marking it as submitted moves it into your applied pipeline so Edutu can keep coaching you toward the finish.",
      [
        {
          text: "Not yet",
          style: "cancel",
          onPress: () => {
            void AsyncStorage.setItem(key, "not_yet").catch(() => undefined);
            if (user?.id) {
              void trackOpportunityApplication(
                supabase,
                user.id,
                { opportunityId, status: "draft" },
                getToken,
              ).catch(() => undefined);
            }
          },
        },
        {
          text: "Yes, submitted",
          onPress: () => {
            void AsyncStorage.setItem(key, "submitted").catch(() => undefined);
            if (user?.id) {
              void trackOpportunityApplication(
                supabase,
                user.id,
                { opportunityId, status: "submitted" },
                getToken,
              ).catch(() => undefined);
            }
            router.push("/applied" as never);
          },
        },
      ],
    );
  }, [id, opportunity, user, getToken, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && awaitingApplyConfirmRef.current) {
        awaitingApplyConfirmRef.current = false;
        void maybeAskApplyConfirm();
      }
    });
    return () => subscription.remove();
  }, [maybeAskApplyConfirm]);

  // Closed opportunity: send the user to the detail screen's "similar" section.
  const findSimilar = useCallback(() => {
    if (!id) return;
    router.push(`/opportunities/${id}` as never);
  }, [id, router]);

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
              <Wand2 size={30} color={colors.accent} />
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
                <Wand2 size={18} color="#FFFFFF" />
                <Text style={styles.generateCTAText}>
                  {isPro
                    ? "Generate my application kit"
                    : `Generate my kit — ${kitCreditCost} credits`}
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
          {/* Live deadline pill — kept fresh from the opportunity the backend
              joins onto the kit, so a moved/closed deadline shows here. */}
          {deadlineBadge && deadlineBadge.level !== "none" && (
            <View style={styles.deadlineHeaderRow}>
              <View
                style={[
                  styles.deadlineHeaderPill,
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
            </View>
          )}

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

          {/* Empty-profile nudge: the server flagged that it generated this kit
              with little/no profile to match against. */}
          {kit.profileGrounded === false && (
            <TouchableOpacity
              onPress={() => router.push("/profile/edit")}
              style={[
                styles.card,
                {
                  backgroundColor: `${colors.accent}12`,
                  borderColor: `${colors.accent}44`,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                },
              ]}
            >
              <Target size={18} color={colors.accent} />
              <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>
                Complete your profile for a kit matched to you — right now it is mostly generic.
              </Text>
              <ChevronRight size={18} color={colors.accent} />
            </TouchableOpacity>
          )}

          {/* Honest fit: eligibility conflicts before the user invests time */}
          {kit.kit.eligibilityFlags.length > 0 && (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: `${colors.warning}55` },
              ]}
            >
              <View style={styles.cardHeader}>
                <Flag size={16} color={colors.warning} />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Before you invest time
                </Text>
              </View>
              {kit.kit.eligibilityFlags.map((item, index) => {
                const isBlocker = item.severity === "blocker";
                const tone = isBlocker ? colors.error : colors.warning;
                return (
                  <View key={index} style={styles.bulletRow}>
                    <View style={[styles.bulletDot, { backgroundColor: tone }]} />
                    <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>
                      <Text style={{ color: tone, fontWeight: "700" }}>
                        {isBlocker ? "Blocker: " : "Check: "}
                      </Text>
                      {item.flag}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Honest fit: the biggest competitive gaps to close */}
          {kit.kit.gaps.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Target size={16} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Close these gaps
                </Text>
              </View>
              {kit.kit.gaps.map((gap, index) => (
                <View key={index} style={styles.bulletRow}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.bodyText, { color: colors.foreground, flex: 1 }]}>
                    {gap}
                  </Text>
                </View>
              ))}
            </View>
          )}

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
            {categoryBanner ? (
              <Animated.View
                entering={ZoomIn.duration(320)}
                exiting={FadeOut.duration(250)}
                style={[
                  styles.celebrateBanner,
                  { backgroundColor: `${colors.success}16`, borderColor: `${colors.success}45` },
                ]}
              >
                <PartyPopper size={18} color={colors.success} />
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 18 }}>
                  {categoryBanner}
                </Text>
              </Animated.View>
            ) : null}
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
                          <Animated.View entering={ZoomIn.duration(280)}>
                            <CheckCircle2 size={20} color={colors.success} />
                          </Animated.View>
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
                          {praise?.itemId === item.id ? (
                            <Animated.Text
                              entering={FadeInDown.duration(300)}
                              exiting={FadeOut.duration(250)}
                              style={{ color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 4 }}
                            >
                              {praise.text}
                            </Animated.Text>
                          ) : null}
                          {isRefereeItem(item) ? (
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                openRefereeDraft();
                              }}
                              style={[
                                styles.refereeBtn,
                                { borderColor: `${colors.accent}40`, backgroundColor: `${colors.accent}0D` },
                              ]}
                              activeOpacity={0.8}
                            >
                              <Mail size={13} color={colors.accent} />
                              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>
                                Draft the ask
                              </Text>
                            </TouchableOpacity>
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

          {/* Final review gate: a celebratory "ready to submit" panel once the
              checklist hits 100%, summarizing what's complete. */}
          {isReady ? (
            <Animated.View
              entering={ZoomIn.duration(360)}
              style={[
                styles.readyPanel,
                { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}50` },
              ]}
            >
              <View style={styles.readyHeader}>
                <PartyPopper size={20} color={colors.success} />
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", flex: 1 }}>
                  Ready to submit
                </Text>
              </View>
              <Text style={{ color: textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
                Everything on this application is in place. Most applicants never get here.
              </Text>
              <View style={{ marginTop: 10, gap: 6 }}>
                {[
                  "Winning angle locked in",
                  `Checklist complete — ${doneCount}/${checklist.length} steps done`,
                  essayPromptCount > 0
                    ? `Essays: ${essaysDrafted}/${essayPromptCount} drafted`
                    : "No essays required",
                ].map((line) => (
                  <View key={line} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <CheckCircle2 size={15} color={colors.success} />
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          ) : null}

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
          {deadlinePassed ? (
            <View style={{ marginTop: 10 }}>
              <View
                style={[
                  styles.deadlinePassedCard,
                  { backgroundColor: `${colors.error}10`, borderColor: `${colors.error}40` },
                ]}
              >
                <Text style={{ color: colors.error, fontSize: 14, fontWeight: "800" }}>
                  Deadline passed
                </Text>
                <Text style={{ color: textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                  This opportunity has closed and is no longer accepting applications. Here are live
                  ones that fit your profile.
                </Text>
              </View>
              <TouchableOpacity onPress={findSimilar} activeOpacity={0.85}>
                <LinearGradient
                  colors={[colors.accent, `${colors.accent}CC`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.applyBtn}
                >
                  <Target size={18} color="#FFFFFF" />
                  <Text style={styles.generateCTAText}>Find similar opportunities</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : opportunity.applyUrl ? (
            <TouchableOpacity onPress={openApply} activeOpacity={0.85} style={{ marginTop: 10 }}>
              <LinearGradient
                colors={
                  isReady
                    ? [colors.success, `${colors.success}CC`]
                    : [colors.accent, `${colors.accent}CC`]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.applyBtn}
              >
                <ExternalLink size={18} color="#FFFFFF" />
                <Text style={styles.generateCTAText}>
                  {isReady
                    ? "Apply Now — you're ready"
                    : stepsLeft > 0
                      ? `Apply Now · ${stepsLeft} step${stepsLeft === 1 ? "" : "s"} left before you're ready`
                      : "Apply Now"}
                </Text>
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
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalEyebrow, { color: textSecondary }]}>
                  ESSAY WORKSPACE
                </Text>
                <Text
                  style={[styles.modalTitle, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {activePrompt?.prompt}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeEssay}
                accessibilityRole="button"
                accessibilityLabel="Close essay workspace"
                hitSlop={8}
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
                  <Wand2 size={16} color={colors.accent} />
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
                    <Wand2 size={17} color="#FFFFFF" />
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
        </View>
      </Modal>

      {/* Referee outreach email draft */}
      <Modal
        visible={Boolean(refereeDraft)}
        animationType="slide"
        onRequestClose={() => setRefereeDraft(null)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.modalHeaderText}>
              <Text style={[styles.modalEyebrow, { color: textSecondary }]}>
                REFEREE REQUEST
              </Text>
              <Text
                style={[styles.modalTitle, { color: colors.foreground }]}
                numberOfLines={2}
              >
                A ready-to-send ask for your recommender
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setRefereeDraft(null)}
              accessibilityRole="button"
              accessibilityLabel="Close referee request"
              hitSlop={8}
              style={[styles.headerBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}
            >
              <X size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}>
            <Text style={{ color: textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
              Personalize the [Referee name] greeting, then send it. Referees say yes far more
              often when the ask is specific and two weeks ahead.
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text selectable style={{ color: colors.foreground, fontSize: 14, lineHeight: 22 }}>
                {refereeDraft}
              </Text>
            </View>
            <TouchableOpacity onPress={shareRefereeDraft} activeOpacity={0.85}>
              <LinearGradient
                colors={[colors.accent, `${colors.accent}CC`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.applyBtn}
              >
                <Share2 size={17} color="#FFFFFF" />
                <Text style={styles.generateCTAText}>Copy or share the email</Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </View>
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
  deadlineHeaderRow: { flexDirection: "row", marginBottom: 14 },
  deadlineHeaderPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  deadlinePassedCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 10 },
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
    // Top-aligned, not centred: with a two-line title a centred close button
    // drifts to the vertical middle and reads as unaligned with the eyebrow.
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  modalHeaderText: {
    flex: 1,
    // Keeps the last line of a truncated title clear of the 36pt close button
    // instead of running right up under it.
    paddingRight: 4,
  },
  modalEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 21,
    marginTop: 3,
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
  celebrateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  refereeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  readyPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  readyHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
});
