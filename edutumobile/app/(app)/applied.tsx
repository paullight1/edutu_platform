import { PlanWorkspaceHeader } from "../../components/opportunity-path/PlanWorkspaceHeader";
import { useFocusEffect, useLocalSearchParams as usePlanParams, useRouter } from 'expo-router';
import { addNotificationReceivedListener } from 'expo-notifications';
import { PlanRefresh } from '../../components/opportunity-path/PlanRefresh';
import { Alert, AppState, Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, ChevronRight, Clock, ArrowRight, Heart, Target, Check, Wand2 } from "lucide-react-native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { haptics } from "../../lib/haptics";
import { useTheme } from "../../components/context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { StateView } from '../../components/state';
import {
  APPLICATION_PIPELINE,
  ApplicationStatus,
  AppliedOpportunity,
  fetchTrackedApplications,
  getNextApplicationStage,
  updateTrackedApplicationStatus,
} from "../../packages/core/src/services/applications";
import { fetchApplicationKits, fetchAnswerBankCount } from "../../packages/core/src/services/copilot";
import { getDeadlineBadge } from "../../packages/core/src/utils/deadline";
import { useOpportunities } from "../../packages/core/src/hooks/useOpportunities";
import type { Opportunity } from "../../packages/core/src/types/opportunity";
import { getMatchTier, MATCH_TIER_KEY } from "@edutu/core/src/utils/matchTier";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { AiActionBar } from "../../components/ai/AiActionBar";
import { useAiAction } from "../../hooks/useAiAction";
// Chat consumes this on mount to open a specific thread (named for its first
// caller, voice mode) — it is the only thread hand-off channel chat exposes.
import { setVoiceModeThread as setPendingChatThread } from "../../lib/voiceModeStore";
import { useTranslation } from "react-i18next";
import i18n from "../../lib/i18n";
import { usePromptProUpgrade } from "../../lib/upsell";
import { autoApplyStatus } from "../../components/opportunity/autoApplyStatus";
import { ProductApiRequestError, requestProductApi } from "../../packages/core/src/services/productApi";
import { autoApplyNotificationAttemptId } from '../../lib/autoApplyNotification';
import { syncAutoApplyActivity } from "../../lib/autoApplyActivity";

const STATUS_OPTIONS: ApplicationStatus[] = ['draft', 'submitted', 'interview', 'offer', 'rejected', 'withdrawn', 'no_response'];

// One-line reflections users leave after a rejection, keyed by application id.
const REJECTION_REFLECTIONS_KEY = 'edutu_rejection_reflections';

// Last successful applications fetch, keyed per user, so the screen paints
// instantly on revisit and still shows content if the network stalls.
const APPLICATIONS_CACHE_KEY = 'edutu_applications_cache_v1';

// Stat-board / filter keys: the forward stages plus "all" and a combined
// terminal bucket ("closed" = rejected + withdrawn).
type StatFilter = 'all' | ApplicationStatus | 'closed' | 'attention';

const attentionStates = {
  needs_input: 'Continue application',
  needs_review: 'Review your draft',
  unconfirmed: 'Check the submission receipt',
};

function needsAutoApplyAttention(item: AppliedOpportunity) {
  return item.status === 'draft' && !!item.autoApply && Object.hasOwn(attentionStates, item.autoApply.state);
}

function formatStatus(value: ApplicationStatus) {
  return i18n.t(`home:applied.status.${value}`);
}

function getStatusColor(value: ApplicationStatus) {
  switch (value) {
    case 'interview':
      return '#3B82F6';
    case 'offer':
      return '#3b82f6';
    case 'rejected':
      return '#EF4444';
    case 'withdrawn':
      return '#64748B';
    case 'no_response':
      // Neutral slate — closure, not a red failure. The silence is on them.
      return '#64748B';
    case 'draft':
      return '#F59E0B';
    case 'submitted':
    default:
      return '#10B981';
  }
}

function formatDate(value?: string | null) {
  if (!value) return i18n.t('home:applied.recently');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('home:applied.recently');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDeadline(value?: string | null) {
  const badge = getDeadlineBadge(value);
  return badge.level === 'expired'
    ? i18n.t('home:applied.deadlinePassed', { defaultValue: 'Deadline passed' })
    : badge.label;
}

// Compact 4-segment stepper mirroring the forward pipeline
// (draft -> submitted -> interview -> offer). Segments fill up to the current
// stage; 'offer' fills green, terminal states render muted/red.
function PipelineStepper({ status, inactiveColor }: { status: ApplicationStatus; inactiveColor: string }) {
  const stageIndex = APPLICATION_PIPELINE.indexOf(status);
  const isRejected = status === 'rejected';
  const isWithdrawn = status === 'withdrawn' || status === 'no_response';
  const isTerminal = isRejected || isWithdrawn;

  return (
    <View style={styles.stepper}>
      {APPLICATION_PIPELINE.map((stage, index) => {
        let color = inactiveColor;
        if (isTerminal) {
          color = isRejected ? 'rgba(239,68,68,0.55)' : 'rgba(100,116,139,0.45)';
        } else if (index <= stageIndex) {
          color = status === 'offer' ? '#10B981' : getStatusColor(status);
        }
        return <View key={stage} style={[styles.stepSegment, { backgroundColor: color }]} />;
      })}
    </View>
  );
}

// Supportive inline card shown right after the user marks an application
// rejected: warm reframe + optional one-line reflection + the next best shot.
function RejectionSupportCard({
  variant = 'rejected',
  initialReflection,
  onSaveReflection,
  nextBestShot,
  onOpenNext,
  answerBankCount,
  cardBg,
  borderColor,
  accentColor,
  textPrimary,
  textSecondary,
}: {
  variant?: 'rejected' | 'no_response';
  initialReflection: string;
  onSaveReflection: (text: string) => void;
  nextBestShot: Opportunity | null;
  onOpenNext: (opportunity: Opportunity) => void;
  answerBankCount: number;
  cardBg: string;
  borderColor: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
}) {
  const { t } = useTranslation('home');
  const [reflection, setReflection] = useState(initialReflection);
  const [saved, setSaved] = useState(Boolean(initialReflection));

  const handleSave = () => {
    void haptics.light();
    onSaveReflection(reflection.trim());
    setSaved(true);
  };

  const nextMatchPct = nextBestShot ? Math.round(nextBestShot.match ?? 0) : 0;
  const nextDeadline = nextBestShot ? getDeadlineBadge(nextBestShot.deadline) : null;

  // no_response is closure the user owns — never a rejection, never their fault.
  const isNoResponse = variant === 'no_response';
  const title = isNoResponse
    ? "No response counts as closed — that's on them, not you."
    : "This one said no. That's data, not a verdict.";
  const body = isNoResponse
    ? 'Your work is saved for the next one. If anything stood out about this one, note it — future you will use it.'
    : 'Every strong applicant collects rejections on the way to a yes. If anything stood out about this one, note it — future you will use it.';

  return (
    <View style={[styles.rejectionCard, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.rejectionHeader}>
        <Heart size={16} color="#F472B6" />
        <Text style={[styles.rejectionTitle, { color: textPrimary }]}>
          {title}
        </Text>
      </View>
      <Text style={[styles.rejectionBody, { color: textSecondary }]}>
        {body}
      </Text>
      {answerBankCount > 0 ? (
        <Text style={[styles.answerBankLine, { color: accentColor }]}>
          {t('applied.answerBankLine', { count: answerBankCount })}
        </Text>
      ) : null}
      <View style={styles.reflectionRow}>
        <TextInput
          value={reflection}
          onChangeText={(value) => {
            setReflection(value);
            setSaved(false);
          }}
          placeholder="One line: what would you do differently?"
          placeholderTextColor={textSecondary}
          style={[styles.reflectionInput, { color: textPrimary, borderColor }]}
          maxLength={200}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <TouchableOpacity
          onPress={handleSave}
          disabled={!reflection.trim() || saved}
          style={[
            styles.reflectionSaveBtn,
            { backgroundColor: saved ? '#10B98122' : `${accentColor}1A`, borderColor: saved ? '#10B98155' : `${accentColor}40` },
          ]}
          activeOpacity={0.75}
        >
          {saved && reflection.trim() ? (
            <Check size={14} color="#10B981" />
          ) : (
            <Text style={{ color: accentColor, fontSize: 11, fontWeight: '700' }}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
      {nextBestShot ? (
        <View style={[styles.nextShotBox, { borderColor: `${accentColor}35`, backgroundColor: `${accentColor}0D` }]}>
          <View style={styles.rejectionHeader}>
            <Target size={13} color={accentColor} />
            <Text style={[styles.nextShotLabel, { color: accentColor }]}>YOUR NEXT BEST SHOT</Text>
          </View>
          <Text style={[styles.nextShotTitle, { color: textPrimary }]} numberOfLines={2}>
            {nextBestShot.title}
          </Text>
          <View style={styles.nextShotMetaRow}>
            {nextMatchPct >= 40 ? (
              <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
                {t('opportunityCard.' + MATCH_TIER_KEY[getMatchTier(nextMatchPct)])}
              </Text>
            ) : null}
            {nextDeadline ? (
              <Text style={{ color: textSecondary, fontSize: 11, fontWeight: '600' }}>
                {nextDeadline.shortLabel}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => onOpenNext(nextBestShot)}
            style={[styles.nextShotCta, { backgroundColor: accentColor }]}
            activeOpacity={0.85}
          >
            <Text style={styles.nextShotCtaText}>Open it — your profile fits</Text>
            <ArrowRight size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default function AppliedPage() {
  const { planNav } = usePlanParams<{ planNav?: string }>();
  return <ApplicationsPanel planNavigation={planNav === '1'} />;
}

export function ApplicationsPanel({ workspace = false, active = true, planNavigation = false }: { workspace?: boolean; active?: boolean; planNavigation?: boolean }) {
  const { t } = useTranslation('home');
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  const activeUser = useRef(userId);
  const tokenGetter = useRef(getToken);
  const pendingLoad = useRef<Promise<void> | null>(null);
  useLayoutEffect(() => {
    tokenGetter.current = getToken;
  }, [getToken]);
  const getCurrentToken = useCallback(() => tokenGetter.current(), []);
  const statusWrites = useRef(new Set<string>());
  const [statusPicker, setStatusPicker] = useState<{
    owner?: string;
    application: AppliedOpportunity;
    confirmSubmission?: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    activeUser.current = userId;
    return () => {
      activeUser.current = undefined;
      pendingLoad.current = null;
    };
  }, [userId]);
  // Win-coach across all tracked applications — the agent uses list_applications
  // to find the most urgent gaps.
  const runWinCoach = useAiAction({ surface: "application_tracker" });
  // Lets the coach sheet hand the user back the conversation its advice lives
  // in, and route a billing failure to the paywall.
  const openWinCoachThread = useCallback(
    (threadId: string) => {
      setPendingChatThread(threadId);
      router.push('/chat' as never);
    },
    [router],
  );
  // One shared upsell entry point (lib/upsell). The win-coach sheet already
  // shows the billing message next to this button, so it goes straight to the
  // paywall rather than repeating itself in a dialog.
  const promptProUpgrade = usePromptProUpgrade();
  const goToPaywall = useCallback(() => {
    promptProUpgrade({ direct: true });
  }, [promptProUpgrade]);
  const [applications, setApplications] = useState<AppliedOpportunity[]>([]);
  const [rawLoading, setLoading] = useState(true);
  // Signed-out users have nothing to load — derive instead of synchronously
  // flipping loading off inside the load effect.
  const loading = userId ? rawLoading : false;
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Adjust-during-render: drop any stale list if the user signs out.
  const [prevListUserId, setPrevListUserId] = useState(userId);
  if (prevListUserId !== userId) {
    setPrevListUserId(userId);
    setApplications([]);
    setLoading(true);
    setRefreshing(false);
    setLoadFailed(false);
  }
  const [activeFilter, setActiveFilter] = useState<StatFilter>('all');
  // Post-rejection support: the application just marked rejected this session,
  // plus stored one-line reflections keyed by application id.
  const [rejectionCardId, setRejectionCardId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  // Opportunity ids that already have a co-pilot kit — used to offer an "Open
  // co-pilot kit" affordance on those rows (makes the kit list endpoint useful).
  const [kitOpportunityIds, setKitOpportunityIds] = useState<Set<string>>(new Set());
  // Reusable essay drafts the user has banked — surfaced in the closure card so
  // a loss visibly deposits a surviving asset. Fetched lazily only once a
  // closure card opens; any failure stays 0 and simply hides the line.
  const [answerBankCount, setAnswerBankCount] = useState(0);

  useEffect(() => {
    if (!rejectionCardId) return;
    let cancelled = false;
    fetchAnswerBankCount(getCurrentToken)
      .then((count) => {
        if (!cancelled) setAnswerBankCount(count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rejectionCardId, getCurrentToken]);

  useEffect(() => {
    AsyncStorage.getItem(REJECTION_REFLECTIONS_KEY)
      .then((raw) => {
        if (raw) setReflections(JSON.parse(raw));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void fetchApplicationKits(getCurrentToken)
      .then((kits) => {
        if (cancelled) return;
        setKitOpportunityIds(
          new Set(kits.map((kit) => kit.opportunityId).filter(Boolean)),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, getCurrentToken]);

  const saveReflection = useCallback((applicationId: string, text: string) => {
    setReflections((current) => {
      const next = { ...current, [applicationId]: text };
      void AsyncStorage.setItem(REJECTION_REFLECTIONS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
    // The reflection also reaches the ranking engine: a repeat PATCH with the
    // same status carries it, and the backend merges it into the outcome
    // signal's details (deduped server-side, so no double-counting).
    if (userId && text.trim()) {
      void updateTrackedApplicationStatus(supabase, userId, applicationId, 'rejected', getToken, text);
    }
  }, [getToken, userId]);

  // Feed used to surface "your next best shot" after a rejection.
  const { data: feedOpportunities } = useOpportunities({
    supabase,
    userId,
    getAuthToken: getCurrentToken,
  });

  const textPrimary = colors.foreground;
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const cardBg = colors.card;
  const borderColor = colors.border;
  const accentColor = colors.accent;
  const stepInactiveColor = isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';

  const loadApplications = useCallback((readCache: boolean) => {
    if (!userId || activeUser.current !== userId) return;
    if (pendingLoad.current) return pendingLoad.current;

    const cacheKey = `${APPLICATIONS_CACHE_KEY}:${userId}`;
    const cachedLoad = readCache
      ? AsyncStorage.getItem(cacheKey)
          .then((cached) => {
            if (!cached || pendingLoad.current !== request) return;
            const parsed = JSON.parse(cached) as AppliedOpportunity[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setApplications(parsed);
              setLoading(false);
            }
          })
          .catch(() => undefined)
      : Promise.resolve();

    const request: Promise<void> = cachedLoad
      .then(() => {
        if (pendingLoad.current === request) return fetchTrackedApplications(getCurrentToken);
      })
      .then((fresh) => {
        if (!fresh || pendingLoad.current !== request) return;
        setApplications(fresh);
        setLoadFailed(false);
        void AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => undefined);
      })
      .catch(() => {
        if (pendingLoad.current === request) setLoadFailed(true);
      })
      .finally(() => {
        if (pendingLoad.current !== request) return;
        pendingLoad.current = null;
        setLoading(false);
        setRefreshing(false);
      });

    pendingLoad.current = request;
    return request;
  }, [getCurrentToken, userId]);

  useFocusEffect(useCallback(() => {
    if (!active || !userId) return;
    let focused = true;
    let queued = false;
    async function refreshWhenIdle() {
      if (queued) return;
      queued = true;
      await pendingLoad.current;
      queued = false;
      if (focused && AppState.currentState === 'active') await loadApplications(false);
    }
    void loadApplications(true);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshWhenIdle();
    });
    const notifications = addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data?.source !== 'auto-apply-progress' && autoApplyNotificationAttemptId(data)) void refreshWhenIdle();
    });
    return () => {
      focused = false;
      appState.remove();
      notifications.remove();
    };
  }, [active, loadApplications, userId]));

  const onRefresh = useCallback(() => {
    if (!userId || pendingLoad.current) return;
    setRefreshing(true);
    void loadApplications(false);
  }, [userId, loadApplications]);

  const updateStatus = useCallback(async (applicationId: string, status: ApplicationStatus, attemptId?: string) => {
    if (!userId || activeUser.current !== userId || statusWrites.current.has(applicationId)) return;
    statusWrites.current.add(applicationId);

    try {
      const auth = async () => {
        const token = await getToken();
        return activeUser.current === userId ? token : null;
      };
      const updated = await updateTrackedApplicationStatus(supabase, userId, applicationId, status, auth);
      if (activeUser.current !== userId) return;
      if (!updated) throw new Error('Unable to update status');
      setApplications((current) => current.map((item) => (
        item.id === applicationId ? { ...item, status,
          ...(status === 'submitted' && item.autoApply ? { autoApply: { ...item.autoApply, state: 'submitted' } } : {}) } : item
      )));
      if (status === 'submitted' && attemptId) {
        void requestProductApi<{ id: string; state: 'submitted'; version: number; title?: string }>(
          '/me/auto-apply/attempts/' + encodeURIComponent(attemptId), {}, auth,
        ).then(progress => {
          if (activeUser.current === userId && progress?.id === attemptId && progress.state === 'submitted' &&
              Number.isSafeInteger(progress.version) && progress.version > 0) {
            void syncAutoApplyActivity(progress, { owner: userId });
          }
        }).catch(() => undefined);
      }
      if (status === 'rejected' || status === 'no_response') {
        // Closure should never dead-end: surface the next best shot card.
        setRejectionCardId(applicationId);
      } else {
        setRejectionCardId((current) => (current === applicationId ? null : current));
      }
    } catch (error) {
      if (activeUser.current !== userId) return;
      if (status === 'submitted' && error instanceof ProductApiRequestError && error.status === 409) {
        void loadApplications(false);
        Alert.alert('Check application status', 'Edutu is updating this application. Check Auto Apply before marking it submitted.');
        return;
      }
      console.error('Failed to update application status:', error);
      Alert.alert(t('applied.statusNotUpdatedTitle'), t('applied.statusNotUpdatedMessage'));
    } finally {
      statusWrites.current.delete(applicationId);
    }
  }, [getToken, loadApplications, userId, t]);

  const chooseStatus = useCallback((application: AppliedOpportunity, status: ApplicationStatus) => {
    if (application.status === status) return;
    if (status !== 'submitted') {
      void updateStatus(application.id, status);
      return;
    }
    setStatusPicker({ owner: userId, application, confirmSubmission: true });
  }, [userId, updateStatus]);

  const advanceStatus = useCallback((application: AppliedOpportunity) => {
    const next = getNextApplicationStage(application.status);
    if (!next) return;
    chooseStatus(application, next);
  }, [chooseStatus]);

  const stats = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      draft: 0,
      submitted: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
      no_response: 0,
    };
    applications.forEach((application) => {
      counts[application.status] += 1;
    });
    return counts;
  }, [applications]);

  const statTiles = useMemo(() => ([
    { key: 'all' as StatFilter, label: t('applied.filters.total'), count: applications.length, color: accentColor },
    { key: 'draft' as StatFilter, label: t('applied.status.draft'), count: stats.draft, color: getStatusColor('draft') },
    { key: 'submitted' as StatFilter, label: t('applied.status.submitted'), count: stats.submitted, color: getStatusColor('submitted') },
    { key: 'interview' as StatFilter, label: t('applied.status.interview'), count: stats.interview, color: getStatusColor('interview') },
    { key: 'offer' as StatFilter, label: t('applied.status.offer'), count: stats.offer, color: '#10B981' },
    { key: 'closed' as StatFilter, label: t('applied.filters.closed'), count: stats.rejected + stats.withdrawn + stats.no_response, color: '#EF4444' },
  ]), [applications.length, stats, accentColor, t]);

  const attentionApplications = useMemo(() => applications.filter(needsAutoApplyAttention), [applications]);
  const filteredApplications = useMemo(() => {
    if (activeFilter === 'all') return applications;
    if (activeFilter === 'attention') return attentionApplications;
    if (activeFilter === 'closed') {
      return applications.filter((item) => item.status === 'rejected' || item.status === 'withdrawn' || item.status === 'no_response');
    }
    return applications.filter((item) => item.status === activeFilter);
  }, [applications, activeFilter, attentionApplications]);

  const handleTilePress = useCallback((key: StatFilter) => {
    setActiveFilter((current) => (key === 'all' || current === key ? 'all' : key));
  }, []);

  const openStatusPicker = useCallback((application: AppliedOpportunity) => {
    setStatusPicker({ owner: userId, application });
  }, [userId]);

  const trackedOpportunityIds = useMemo(
    () => new Set(applications.map((item) => item.opportunity_id)),
    [applications],
  );

  // Highest-match opportunity the user isn't already tracking.
  const nextBestShot = useMemo(() => {
    const candidates = feedOpportunities.filter((item) => !trackedOpportunityIds.has(item.id));
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) => (b.match ?? 0) - (a.match ?? 0))[0];
  }, [feedOpportunities, trackedOpportunityIds]);

  const openNextBestShot = useCallback((opportunity: Opportunity) => {
    router.push(`/opportunities/${opportunity.id}`);
  }, [router]);

  const headerSubtitle = useMemo(() => {
    if (loadFailed && !applications.length) return undefined;
    if (loading) return t('common:states.loading');
    return t('applied.appliedCount', { count: applications.length });
  }, [applications.length, loadFailed, loading, t]);

  const openAutoApply = useCallback((id: string) => {
    router.push({ pathname: '/(app)/auto-apply/[id]', params: { id } });
  }, [router]);

  const renderApplication = useCallback(({ item }: { item: AppliedOpportunity }) => {
    const attempt = item.autoApply;
    const attemptStatus = attempt && Object.prototype.hasOwnProperty.call(autoApplyStatus, attempt.state)
      ? autoApplyStatus[attempt.state as keyof typeof autoApplyStatus]
      : undefined;
    const autoApplyInProgress = attempt && !['submitted', 'cancelled', 'failed'].includes(attempt.state);
    const nextStage = autoApplyInProgress ? null : getNextApplicationStage(item.status);
    return (
    <View>
    <View style={[styles.card, workspace && styles.workspaceCard, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.category, { color: accentColor }]} numberOfLines={1}>{item.category}</Text>
          <TouchableOpacity
            onPress={(event) => { event.stopPropagation(); openStatusPicker(item); }}
            accessibilityRole="button" accessibilityLabel={t('myPlan.updateStatus', { title: item.title })}
            style={[styles.statusButton, { backgroundColor: `${getStatusColor(item.status)}1F` }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.status, { color: getStatusColor(item.status) }]}>{formatStatus(item.status)}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(`/opportunities/${item.opportunity_id}`)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={3}>{item.title}</Text>
        </TouchableOpacity>
        {!!item.organization && item.organization !== 'Unknown organization' && (
          <Text style={[styles.org, { color: textSecondary }]} numberOfLines={1}>{item.organization}</Text>
        )}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>{item.status === 'draft'
              ? t('applied.trackedOn', { date: formatDate(item.submitted_at), defaultValue: 'Tracked {{date}}' })
              : t('applied.appliedOn', { date: formatDate(item.submitted_at) })}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>{formatDeadline(item.deadline)}</Text>
          </View>
        </View>
        <View style={styles.pipelineRow}>
          <PipelineStepper status={item.status} inactiveColor={stepInactiveColor} />
          {nextStage ? (
            <TouchableOpacity
              onPress={(event) => { event.stopPropagation(); advanceStatus(item); }}
              accessibilityRole="button"
              style={[styles.advanceButton, { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}40` }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.advanceText, { color: accentColor }]}>
                {t('applied.advanceTo', { stage: formatStatus(nextStage) })}
              </Text>
              <ArrowRight size={12} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>
        {attempt ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('applied.openAutoApply', { title: item.title, defaultValue: 'Open Auto Apply for {{title}}' })}
            accessibilityHint={attemptStatus}
            onPress={() => openAutoApply(attempt.id)}
            style={[styles.autoApplyButton, { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0D` }]}
            activeOpacity={0.8}
          >
            <Wand2 size={16} color={accentColor} />
            <View style={styles.autoApplyButtonCopy}>
              <Text style={[styles.autoApplyButtonTitle, { color: textPrimary }]}>
                {t('applied.autoApply', { defaultValue: 'Auto Apply' })}
              </Text>
              {attemptStatus ? <Text style={[styles.metaText, { color: textSecondary }]}>{attemptStatus}</Text> : null}
            </View>
            <ChevronRight size={16} color={accentColor} />
          </TouchableOpacity>
        ) : null}
        {kitOpportunityIds.has(item.opportunity_id) ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/copilot/${item.opportunity_id}` as never);
            }}
            style={[styles.copilotKitBtn, { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0D` }]}
            activeOpacity={0.8}
          >
            <Wand2 size={13} color={accentColor} />
            <Text style={[styles.copilotKitText, { color: accentColor }]}>Open co-pilot kit</Text>
            <ArrowRight size={12} color={accentColor} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ChevronRight size={18} color={textSecondary} />
    </View>
    {(item.status === 'rejected' || item.status === 'no_response') && rejectionCardId === item.id ? (
      <RejectionSupportCard
        variant={item.status === 'no_response' ? 'no_response' : 'rejected'}
        initialReflection={reflections[item.id] ?? ''}
        onSaveReflection={(text) => saveReflection(item.id, text)}
        nextBestShot={nextBestShot}
        onOpenNext={openNextBestShot}
        answerBankCount={answerBankCount}
        cardBg={cardBg}
        borderColor={borderColor}
        accentColor={accentColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      />
    ) : null}
    </View>
    );
  }, [accentColor, advanceStatus, cardBg, borderColor, openStatusPicker, openAutoApply, router, stepInactiveColor, textPrimary, textSecondary, t, rejectionCardId, reflections, saveReflection, nextBestShot, openNextBestShot, kitOpportunityIds, answerBankCount, workspace]);

  const renderAttentionRow = useCallback(({ item }: { item: AppliedOpportunity }) => {
    const attempt = item.autoApply;
    if (!attempt) return null;
    const action = t('applied.attentionActions.' + attempt.state, {
      defaultValue: attentionStates[attempt.state as keyof typeof attentionStates],
    });
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.title + '. ' + action}
        onPress={() => openAutoApply(attempt.id)} style={[styles.attentionRow, { borderColor },
          activeFilter === 'attention' && [styles.attentionListRow, { backgroundColor: cardBg }]]}>
        <View style={styles.autoApplyButtonCopy}>
          <Text style={[styles.autoApplyButtonTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.metaText, { color: textSecondary }]}>{action}</Text>
        </View>
        <ChevronRight size={16} color={accentColor} />
      </TouchableOpacity>
    );
  }, [accentColor, activeFilter, borderColor, cardBg, openAutoApply, t, textPrimary, textSecondary]);

  const renderAttention = () => {
    const title = t('applied.attentionTitle', { defaultValue: 'Needs your attention' });
    if (activeFilter === 'attention') return (
      <View>
        <TouchableOpacity accessibilityRole="button" style={styles.attentionLink} onPress={() => setActiveFilter('all')}>
          <Text style={{ color: accentColor, fontWeight: '700' }}>
            {t('applied.showAllApplications', { defaultValue: 'Show all applications' })}
          </Text>
        </TouchableOpacity>
        <Text accessibilityRole="header" style={[styles.attentionTitle, { color: textPrimary, paddingHorizontal: 0 }]}>{title}</Text>
      </View>
    );
    if (!attentionApplications.length) return null;
    return (
      <View style={[styles.attention, { backgroundColor: cardBg, borderColor }]}>
        <Text accessibilityRole="header" style={[styles.attentionTitle, { color: textPrimary }]}>{title}</Text>
        {attentionApplications.slice(0, 2).map(item => (
          <View key={item.id}>{renderAttentionRow({ item })}</View>
        ))}
        {attentionApplications.length > 2 && (
          <TouchableOpacity accessibilityRole="button" style={[styles.attentionLink, { paddingHorizontal: 14 }]}
            onPress={() => setActiveFilter('attention')}>
            <Text style={{ color: accentColor, fontWeight: '700' }}>
              {t('applied.seeAttention', { count: attentionApplications.length, defaultValue: 'See all {{count}} waiting applications' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStatBoard = () => {
    if (applications.length === 0) return null;
    return (
      <View>
      <View style={{ paddingBottom: 10 }} testID="application-coach-actions">
        <AiActionBar
          variant="pill"
          actions={[
            {
              label: t("chat:winCoach.actions.whatsMissing"),
              intent: "whats_missing",
              message:
                "Across my applications, which are missing required documents and closest to their deadline? What should I finish first?",
            },
            {
              label: t("chat:winCoach.actions.nextWinMove"),
              intent: "next_move",
              message:
                "Looking at everything I've applied to, what's my single most important next move right now?",
            },
          ]}
          onRun={runWinCoach}
          onOpenInChat={openWinCoachThread}
          onUpgrade={goToPaywall}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statBoard}
      >
        {statTiles.map((tile) => {
          const active = activeFilter === tile.key;
          return (
            <TouchableOpacity
              key={tile.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => handleTilePress(tile.key)}
              activeOpacity={0.8}
              style={[
                styles.statTile,
                { backgroundColor: cardBg, borderColor: active ? accentColor : borderColor },
                active && { backgroundColor: active ? colors.muted : 'transparent' },
              ]}
            >
              <Text style={[styles.statCount, { color: active ? accentColor : textSecondary }]}>{tile.count}</Text>
              <Text style={[styles.statLabel, { color: active ? tile.color : textSecondary }]} numberOfLines={1}>
                {tile.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      </View>
    );
  };

  const renderEmpty = () => (
    <StateView
      state={{ kind: 'empty', reason: 'firstRun' }}
      flow="applied"
      fill={false}
      title={t('applied.emptyTitle')}
      body={t('applied.emptySubtitle')}
      actionLabel={t('applied.browseOpportunities')}
      onAction={() => router.push('/opportunities')}
    />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={workspace ? [] : ['top', 'left', 'right']}>
      {!workspace && (planNavigation ? <PlanWorkspaceHeader section="applications" /> : <ScreenHeader title={t('applied.title')} showBack subtitle={headerSubtitle} />)}

      <PlanRefresh workspace={workspace} refreshing={refreshing} onRefresh={onRefresh} color={accentColor}>{(scrollProps) => (
            <FlatList {...scrollProps}
        data={filteredApplications}
        keyExtractor={(item) => item.id}
        renderItem={activeFilter === 'attention' ? renderAttentionRow : renderApplication}
        ListHeaderComponent={applications.length > 0 || (!loadFailed && !loading) ? (
          <>
            {loadFailed && (
              <TouchableOpacity accessibilityRole="button" onPress={onRefresh} disabled={refreshing} style={styles.refreshNotice}>
                <Text style={{ color: textSecondary }} accessibilityLiveRegion="polite">
                  {t('applied.stale', { defaultValue: 'Showing saved applications. Tap to retry.' })}
                </Text>
              </TouchableOpacity>
            )}
            {renderAttention()}
            {activeFilter !== 'attention' && renderStatBoard()}
          </>
        ) : null}
        ListEmptyComponent={loading ? null : (applications.length > 0 ? (
          // There ARE applications; the active filter just excludes them all.
          // A different problem from having none, with a different fix.
          <StateView
            state={{ kind: 'empty', reason: 'filtered' }}
            flow="applied"
            fill={false}
            sceneSize={140}
            title={activeFilter === 'attention'
              ? t('applied.noAttention', { defaultValue: 'No applications need your attention' })
              : t('applied.emptyFilter')}
            body=""
          />
        ) : loadFailed ? (
          <StateView
            state={{ kind: 'error', cause: 'server' }}
            flow="applied"
            fill={false}
            title={t('applied.loadError', { defaultValue: "Couldn't load applications" })}
            onRetry={onRefresh}
          />
        ) : renderEmpty())}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
            )}</PlanRefresh>

      {loading && applications.length === 0 && (
        <View style={styles.loadingOverlay}>
          <BrandedLoader label={t('applied.loading')} />
        </View>
      )}
      {statusPicker && statusPicker.owner === userId && (
        <Modal transparent visible animationType="none" onRequestClose={() => setStatusPicker(null)}>
          <View style={styles.statusPickerBackdrop}>
            <View accessibilityViewIsModal style={[styles.statusPicker, { backgroundColor: cardBg }]}>
              <Text accessibilityRole="header" style={{ color: textPrimary, fontWeight: '700' }}>
                {statusPicker.confirmSubmission
                  ? t('common:applicationConfirmation.title', { defaultValue: 'Did you submit your application?' })
                  : t('applied.updateStatusTitle')}
              </Text>
              <Text style={{ color: textSecondary }}>{statusPicker.application.title}</Text>
              {statusPicker.confirmSubmission ? (
                <>
                  <Text style={{ color: textSecondary }}>
                    {t('common:applicationConfirmation.body', { defaultValue: 'Confirm only after submitting the form on the provider’s website.' })}
                  </Text>
                  {statusPicker.application.autoApply && statusPicker.application.autoApply.state !== 'submitted' &&
                    <Text style={{ color: textSecondary }}>Recording this submission will also close the Auto Apply attempt.</Text>}
                  <TouchableOpacity accessibilityRole="button" style={styles.statusPickerOption} onPress={() => {
                    setStatusPicker(null);
                    void updateStatus(statusPicker.application.id, 'submitted', statusPicker.application.autoApply?.id);
                  }}>
                    <Text style={{ color: accentColor }}>
                      {t('common:applicationConfirmation.yes', { defaultValue: 'Yes, I submitted it' })}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : <ScrollView>
                {STATUS_OPTIONS.map(status => (
                  <TouchableOpacity
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected: statusPicker.application.status === status }}
                    style={styles.statusPickerOption}
                    onPress={() => {
                      setStatusPicker(null);
                      chooseStatus(statusPicker.application, status);
                    }}
                  >
                    <Text style={{ color: textPrimary }}>{formatStatus(status)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>}
              <TouchableOpacity accessibilityRole="button" style={styles.statusPickerOption} onPress={() => setStatusPicker(null)}>
                <Text style={{ color: accentColor }}>
                  {statusPicker.confirmSubmission
                    ? t('common:applicationConfirmation.notYet', { defaultValue: 'Not yet' })
                    : t('common:actions.cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statusPickerBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: 24,
  },
  statusPicker: { width: '100%', maxWidth: 420, maxHeight: '90%', padding: 20, borderRadius: 20, gap: 8 },
  statusPickerOption: { minHeight: 44, justifyContent: 'center' },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 160,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 20,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  refreshNotice: { minHeight: 44, justifyContent: 'center', marginBottom: 8 },
  workspaceCard: { padding: 14, gap: 8, borderRadius: 18 },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 24,
    borderCurve: "continuous",
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  category: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    flex: 1,
  },
  status: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusButton: {
    maxWidth: '62%',
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 27,
    marginBottom: 3,
  },
  org: {
    fontSize: 13,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  statBoard: {
    gap: 10,
    paddingBottom: 16,
    paddingRight: 4,
  },
  statTile: {
    minWidth: 78,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statCount: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 40,
  },
  stepSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  advanceButton: {
    flexShrink: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  advanceText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  copilotKitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
  },
  copilotKitText: {
    fontSize: 11,
    fontWeight: '700',
  },
  attention: { borderWidth: 1, borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  attentionTitle: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: '700' },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  attentionListRow: { borderWidth: 1, borderRadius: 12, minHeight: 60, marginBottom: 8 },
  attentionLink: { minHeight: 44, justifyContent: 'center' },
  autoApplyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  autoApplyButtonCopy: { flex: 1 },
  autoApplyButtonTitle: { fontSize: 13, fontWeight: '700' },
  filterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  rejectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginTop: -4,
    marginBottom: 12,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  rejectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    flex: 1,
  },
  rejectionBody: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  answerBankLine: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  reflectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  reflectionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  reflectionSaveBtn: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  nextShotBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  nextShotLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  nextShotTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 6,
  },
  nextShotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 5,
  },
  nextShotCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    marginTop: 10,
  },
  nextShotCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
