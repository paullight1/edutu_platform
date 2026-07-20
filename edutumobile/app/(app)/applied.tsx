import { Alert, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Calendar, ChevronRight, Clock, Globe, ArrowRight, Heart, Sparkles, Check } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { haptics } from "../../lib/haptics";
import { useTheme } from "../../components/context/ThemeContext";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import {
  APPLICATION_PIPELINE,
  ApplicationStatus,
  AppliedOpportunity,
  fetchTrackedApplications,
  getNextApplicationStage,
  updateTrackedApplicationStatus,
} from "../../packages/core/src/services/applications";
import { getDeadlineBadge } from "../../packages/core/src/utils/deadline";
import { useOpportunities } from "../../packages/core/src/hooks/useOpportunities";
import type { Opportunity } from "../../packages/core/src/types/opportunity";
import { BrandedLoader } from "../../components/ui/BrandedLoader";
import { AiActionBar } from "../../components/ai/AiActionBar";
import { useAiAction } from "../../hooks/useAiAction";
import { useTranslation } from "react-i18next";
import i18n from "../../lib/i18n";

const STATUS_OPTIONS: ApplicationStatus[] = ['draft', 'submitted', 'interview', 'offer', 'rejected', 'withdrawn'];

// One-line reflections users leave after a rejection, keyed by application id.
const REJECTION_REFLECTIONS_KEY = 'edutu_rejection_reflections';

// Last successful applications fetch, keyed per user, so the screen paints
// instantly on revisit and still shows content if the network stalls.
const APPLICATIONS_CACHE_KEY = 'edutu_applications_cache_v1';

// Absolute ceiling on a load attempt — whatever happens underneath, the
// spinner must resolve to content, cache, or the empty state.
const LOAD_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('applications load timed out')), ms)),
  ]);
}

// Stat-board / filter keys: the forward stages plus "all" and a combined
// terminal bucket ("closed" = rejected + withdrawn).
type StatFilter = 'all' | ApplicationStatus | 'closed';

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
  return getDeadlineBadge(value).label;
}

// Compact 4-segment stepper mirroring the forward pipeline
// (draft -> submitted -> interview -> offer). Segments fill up to the current
// stage; 'offer' fills green, terminal states render muted/red.
function PipelineStepper({ status, inactiveColor }: { status: ApplicationStatus; inactiveColor: string }) {
  const stageIndex = APPLICATION_PIPELINE.indexOf(status);
  const isRejected = status === 'rejected';
  const isWithdrawn = status === 'withdrawn';
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
  initialReflection,
  onSaveReflection,
  nextBestShot,
  onOpenNext,
  cardBg,
  borderColor,
  accentColor,
  textPrimary,
  textSecondary,
}: {
  initialReflection: string;
  onSaveReflection: (text: string) => void;
  nextBestShot: Opportunity | null;
  onOpenNext: (opportunity: Opportunity) => void;
  cardBg: string;
  borderColor: string;
  accentColor: string;
  textPrimary: string;
  textSecondary: string;
}) {
  const [reflection, setReflection] = useState(initialReflection);
  const [saved, setSaved] = useState(Boolean(initialReflection));

  const handleSave = () => {
    void haptics.light();
    onSaveReflection(reflection.trim());
    setSaved(true);
  };

  const nextMatchPct = nextBestShot ? Math.round(nextBestShot.match ?? 0) : 0;
  const nextDeadline = nextBestShot ? getDeadlineBadge(nextBestShot.deadline) : null;

  return (
    <View style={[styles.rejectionCard, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.rejectionHeader}>
        <Heart size={16} color="#F472B6" />
        <Text style={[styles.rejectionTitle, { color: textPrimary }]}>
          This one said no. That&apos;s data, not a verdict.
        </Text>
      </View>
      <Text style={[styles.rejectionBody, { color: textSecondary }]}>
        Every strong applicant collects rejections on the way to a yes. If anything stood out about this one, note it — future you will use it.
      </Text>
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
            <Sparkles size={13} color={accentColor} />
            <Text style={[styles.nextShotLabel, { color: accentColor }]}>YOUR NEXT BEST SHOT</Text>
          </View>
          <Text style={[styles.nextShotTitle, { color: textPrimary }]} numberOfLines={2}>
            {nextBestShot.title}
          </Text>
          <View style={styles.nextShotMetaRow}>
            {nextMatchPct >= 40 ? (
              <Text style={{ color: accentColor, fontSize: 11, fontWeight: '800' }}>
                {nextMatchPct}% match
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
  const { t } = useTranslation('home');
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  // Win-coach across all tracked applications — the agent uses list_applications
  // to find the most urgent gaps.
  const runWinCoach = useAiAction({ surface: "application_tracker" });
  const [applications, setApplications] = useState<AppliedOpportunity[]>([]);
  const [rawLoading, setLoading] = useState(true);
  // Signed-out users have nothing to load — derive instead of synchronously
  // flipping loading off inside the load effect.
  const loading = userId ? rawLoading : false;
  const [refreshing, setRefreshing] = useState(false);

  // Adjust-during-render: drop any stale list if the user signs out.
  const [prevListUserId, setPrevListUserId] = useState(userId);
  if (prevListUserId !== userId) {
    setPrevListUserId(userId);
    if (!userId) setApplications([]);
  }
  const [activeFilter, setActiveFilter] = useState<StatFilter>('all');
  // Post-rejection support: the application just marked rejected this session,
  // plus stored one-line reflections keyed by application id.
  const [rejectionCardId, setRejectionCardId] = useState<string | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>({});

  useEffect(() => {
    AsyncStorage.getItem(REJECTION_REFLECTIONS_KEY)
      .then((raw) => {
        if (raw) setReflections(JSON.parse(raw));
      })
      .catch(() => undefined);
  }, []);

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

  // Feed used to surface "your next best shot" after a rejection — only
  // consulted when the rejection card is visible.
  const { data: feedOpportunities } = useOpportunities({
    supabase,
    userId: user?.id,
    getAuthToken: getToken,
  });

  const textPrimary = colors.foreground;
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const cardBg = colors.card;
  const borderColor = colors.border;
  const accentColor = colors.accent;
  const stepInactiveColor = isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';

  // Promise-chain style (not async/await) so every setState lives in an async
  // callback — the set-state-in-effect rule treats awaited sets in a named
  // async callee as synchronous.
  const loadApplications = useCallback(() => {
    // No user → nothing to load; the render-derived `loading` and the
    // adjust-during-render reset above cover the signed-out state.
    if (!userId) return Promise.resolve();

    const cacheKey = `${APPLICATIONS_CACHE_KEY}:${userId}`;

    // Paint from the last successful fetch immediately; the network refresh
    // below replaces it when it lands. Cache is best-effort only.
    return AsyncStorage.getItem(cacheKey)
      .then((cached) => {
        if (!cached) return;
        const parsed = JSON.parse(cached) as AppliedOpportunity[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApplications(parsed);
          setLoading(false);
        }
      })
      .catch(() => undefined)
      .then(() => withTimeout(
        fetchTrackedApplications(supabase, userId, getToken),
        LOAD_TIMEOUT_MS,
      ))
      .then((fresh) => {
        setApplications(fresh);
        void AsyncStorage.setItem(cacheKey, JSON.stringify(fresh)).catch(() => undefined);
      })
      .catch((error) => {
        console.error('Failed to load applied opportunities:', error);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [getToken, userId]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const onRefresh = useCallback(() => {
    if (!userId) return;
    setRefreshing(true);
    loadApplications();
  }, [userId, loadApplications]);

  const updateStatus = useCallback(async (applicationId: string, status: ApplicationStatus) => {
    if (!userId) return;

    try {
      const updated = await updateTrackedApplicationStatus(supabase, userId, applicationId, status, getToken);
      if (!updated) throw new Error('Unable to update status');
      setApplications((current) => current.map((item) => (
        item.id === applicationId ? { ...item, status } : item
      )));
      if (status === 'rejected') {
        setRejectionCardId(applicationId);
      } else {
        setRejectionCardId((current) => (current === applicationId ? null : current));
      }
    } catch (error) {
      console.error('Failed to update application status:', error);
      Alert.alert(t('applied.statusNotUpdatedTitle'), t('applied.statusNotUpdatedMessage'));
    }
  }, [getToken, userId, t]);

  const advanceStatus = useCallback((application: AppliedOpportunity) => {
    const next = getNextApplicationStage(application.status);
    if (!next) return;
    updateStatus(application.id, next);
  }, [updateStatus]);

  const stats = useMemo(() => {
    const counts: Record<ApplicationStatus, number> = {
      draft: 0,
      submitted: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
      withdrawn: 0,
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
    { key: 'closed' as StatFilter, label: t('applied.filters.closed'), count: stats.rejected + stats.withdrawn, color: '#EF4444' },
  ]), [applications.length, stats, accentColor, t]);

  const filteredApplications = useMemo(() => {
    if (activeFilter === 'all') return applications;
    if (activeFilter === 'closed') {
      return applications.filter((item) => item.status === 'rejected' || item.status === 'withdrawn');
    }
    return applications.filter((item) => item.status === activeFilter);
  }, [applications, activeFilter]);

  const handleTilePress = useCallback((key: StatFilter) => {
    setActiveFilter((current) => (key === 'all' || current === key ? 'all' : key));
  }, []);

  const openStatusPicker = useCallback((application: AppliedOpportunity) => {
    Alert.alert(
      t('applied.updateStatusTitle'),
      application.title,
      [
        ...STATUS_OPTIONS.map((status) => ({
          text: formatStatus(status),
          onPress: () => updateStatus(application.id, status),
        })),
        { text: t('common:actions.cancel'), style: 'cancel' as const },
      ],
    );
  }, [updateStatus, t]);

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
    if (loading) return t('common:states.loading');
    return t('applied.appliedCount', { count: applications.length });
  }, [applications.length, loading, t]);

  const renderApplication = useCallback(({ item }: { item: AppliedOpportunity }) => (
    <View>
    <TouchableOpacity
      style={[styles.card, { backgroundColor: cardBg, borderColor }]}
      activeOpacity={0.85}
      onPress={() => router.push(`/opportunities/${item.opportunity_id}`)}
    >
      <View style={[styles.thumb, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9' }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <Globe size={24} color={accentColor} />
        )}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.category, { color: accentColor }]} numberOfLines={1}>{item.category}</Text>
          <TouchableOpacity
            onPress={() => openStatusPicker(item)}
            style={[styles.statusButton, { backgroundColor: `${getStatusColor(item.status)}1F` }]}
            activeOpacity={0.75}
          >
            <Text style={[styles.status, { color: getStatusColor(item.status) }]}>{formatStatus(item.status)}</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.org, { color: textSecondary }]} numberOfLines={1}>{item.organization}</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Calendar size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>{t('applied.appliedOn', { date: formatDate(item.submitted_at) })}</Text>
          </View>
          <View style={styles.metaItem}>
            <Clock size={12} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>{formatDeadline(item.deadline)}</Text>
          </View>
        </View>
        <View style={styles.pipelineRow}>
          <PipelineStepper status={item.status} inactiveColor={stepInactiveColor} />
          {getNextApplicationStage(item.status) ? (
            <TouchableOpacity
              onPress={() => advanceStatus(item)}
              style={[styles.advanceButton, { backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}40` }]}
              activeOpacity={0.75}
            >
              <Text style={[styles.advanceText, { color: accentColor }]}>
                {t('applied.advanceTo', { stage: formatStatus(getNextApplicationStage(item.status)!) })}
              </Text>
              <ArrowRight size={12} color={accentColor} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <ChevronRight size={18} color={textSecondary} />
    </TouchableOpacity>
    {item.status === 'rejected' && rejectionCardId === item.id ? (
      <RejectionSupportCard
        initialReflection={reflections[item.id] ?? ''}
        onSaveReflection={(text) => saveReflection(item.id, text)}
        nextBestShot={nextBestShot}
        onOpenNext={openNextBestShot}
        cardBg={cardBg}
        borderColor={borderColor}
        accentColor={accentColor}
        textPrimary={textPrimary}
        textSecondary={textSecondary}
      />
    ) : null}
    </View>
  ), [accentColor, advanceStatus, cardBg, borderColor, isDark, openStatusPicker, router, stepInactiveColor, textPrimary, textSecondary, t, rejectionCardId, reflections, saveReflection, nextBestShot, openNextBestShot]);

  const renderStatBoard = () => {
    if (applications.length === 0) return null;
    return (
      <View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <AiActionBar
          actions={[
            {
              label: "What's missing?",
              intent: "whats_missing",
              message:
                "Across my applications, which are missing required documents and closest to their deadline? What should I finish first?",
            },
            {
              label: "My next win move",
              intent: "next_move",
              message:
                "Looking at everything I've applied to, what's my single most important next move right now?",
            },
          ]}
          onRun={runWinCoach}
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
              onPress={() => handleTilePress(tile.key)}
              activeOpacity={0.8}
              style={[
                styles.statTile,
                { backgroundColor: cardBg, borderColor: active ? tile.color : borderColor },
                active && { backgroundColor: `${tile.color}14` },
              ]}
            >
              <Text style={[styles.statCount, { color: tile.color }]}>{tile.count}</Text>
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
    <View style={styles.emptyState}>
      <Globe size={48} color={textSecondary} />
      <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('applied.emptyTitle')}</Text>
      <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
        {t('applied.emptySubtitle')}
      </Text>
      <TouchableOpacity
        style={[styles.emptyBtn, { backgroundColor: accentColor }]}
        onPress={() => router.push('/opportunities')}
      >
        <Text style={styles.emptyBtnText}>{t('applied.browseOpportunities')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <ScreenHeader title={t('applied.title')} showBack subtitle={headerSubtitle} />

      <FlatList
        data={filteredApplications}
        keyExtractor={(item) => item.id}
        renderItem={renderApplication}
        ListHeaderComponent={renderStatBoard}
        ListEmptyComponent={loading ? null : (applications.length > 0 ? (
          <View style={styles.filterEmpty}>
            <Text style={[styles.emptySubtitle, { color: textSecondary }]}>
              {t('applied.emptyFilter')}
            </Text>
          </View>
        ) : renderEmpty())}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      />

      {loading && applications.length === 0 && (
        <View style={styles.loadingOverlay}>
          <BrandedLoader label={t('applied.loading')} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: 16,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 3,
  },
  org: {
    fontSize: 11,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 10,
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
  },
  stepSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  advanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  advanceText: {
    fontSize: 10,
    fontWeight: '700',
  },
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
