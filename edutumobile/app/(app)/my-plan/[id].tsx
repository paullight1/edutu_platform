import { Check, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, ArrowUpRight, CalendarDays, MoreHorizontal, Sparkles, FileText } from 'lucide-react-native';
import { StateView } from '../../../components/state';
import { Skeleton } from '../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useMotion } from '../../../hooks/useMotion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../components/context/ThemeContext';
import { createJourneyRequestKey, getOpportunityJourney, mutateOpportunityJourney } from '@edutu/core/src/services/opportunityJourney';
import type { OpportunityJourneyView } from '@edutu/core/src/types/opportunityJourney';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import { planPalette } from '../../../components/opportunity-path/planPresentation';
import Svg, { Path, Rect } from 'react-native-svg';

function PlanActionButton({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled: boolean; secondary?: boolean }) {
  const { colors } = useTheme();
  const motion = useMotion();
  return <AnimatedPressable scaleTo={motion.reduced ? 1 : 0.98} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, { backgroundColor: secondary ? colors.card : colors.accent, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
    <Text style={{ color: secondary ? colors.foreground : '#FFF', fontWeight: '700', textAlign: 'center' }}>{label}</Text>
  </AnimatedPressable>;
}

export default function PlanJourneyScreen() {
  const { id: parameter } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(parameter) ? parameter[0] : parameter;
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const key = `${userId}:${id}`;
  const owner = useRef(key);
  const busy = useRef(false);
  const requests = useRef(new Map<string, string>());
  const [state, setState] = useState<{ key: string; item: OpportunityJourneyView | null; stale: boolean }>({ key: '', item: null, stale: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [expandedTask, setExpandedTask] = useState<{ key: string; id: string } | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (optionsOpen) scroll.current?.scrollToEnd({ animated: false });
  }, [optionsOpen]);

  useFocusEffect(useCallback(() => {
    let active = true;
    owner.current = key;
    void Promise.resolve().then(async () => {
      if (!active || !userId || !id) return;
      setLoading(true);
      try {
        const result = await getOpportunityJourney({ userId, journeyId: id, getAuthToken: getToken });
        if (!active) return;
        if (!result.data) throw new Error('Unable to load this opportunity. Please retry.');
        setState({ key, item: result.data, stale: result.isStale });
        setError(null);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load your plan.');
      } finally { if (active) setLoading(false); }
    });
    return () => { active = false; owner.current = ''; };
  // Refresh deliberately restarts the focused read.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, id, userId, getToken, refresh]));

  const item = state.key === key ? state.item : null;
  const run = async (action: Parameters<typeof mutateOpportunityJourney>[0]['action'], body: Record<string, unknown>, create = false) => {
    if (!item || busy.current || !userId || state.stale) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    const signature = JSON.stringify({ key, action, body, version: item.journey.version });
    const idempotencyKey = requests.current.get(signature) ?? createJourneyRequestKey();
    requests.current.set(signature, idempotencyKey);
    try {
      const updated = await mutateOpportunityJourney({ userId, getAuthToken: getToken,
        ...(create ? {} : { journeyId: id, action }),
        body: { ...body, ...(create ? {} : { expectedVersion: item.journey.version }), idempotencyKey },
      });
      if (owner.current === key) {
        setState({ key, item: updated, stale: false });
        if (action?.startsWith('tasks/')) setExpandedTask(null);
        try {
          const { syncNextStepWidget } = require('../../../lib/widgetSuiteSync') as typeof import('../../../lib/widgetSuiteSync');
          void syncNextStepWidget({ userId, getToken }).catch(() => undefined);
        } catch { /* Widget availability must not affect a confirmed plan update. */ }
      }
      requests.current.delete(signature);
    } catch (e) {
      if (owner.current === key) setError(e instanceof Error ? e.message : 'Unable to save. Please retry.');
    } finally {
      busy.current = false;
      if (owner.current === key) setSaving(false);
    }
  };

  const openApplication = async () => {
    if (!item || busy.current) return;
    const raw = item.opportunity.applyUrl ?? item.opportunity.applicationUrl ?? item.opportunity.application_url ?? item.opportunity.apply_url ?? item.opportunity.url;
    const url = typeof raw === 'string' ? raw.replace(/[\s\u200B-\u200D\uFEFF]+/g, '') : '';
    if (!/^https?:\/\//i.test(url)) { setError('No valid application link is available. Open the opportunity details for instructions.'); return; }
    try {
      await Linking.openURL(url);
      // A successful browser launch is still not a submission.
      if (item.journey.state === 'ready_to_apply') await run('application-opened', {});
    } catch { setError('The application website could not be opened. Please retry.'); }
  };

  const confirmSubmission = () => Alert.alert('Did you submit your application?',
    'Only confirm after completing and submitting it on the provider’s website.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Yes, I submitted', onPress: () => { void run('application-confirmed', {}); } },
    ]);
  const outcome = (value: string, label: string) => Alert.alert(label, 'Save this outcome to your plan?', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Save outcome', onPress: () => { void run('outcome', { outcome: value }); } },
  ]);
  const status = item?.journey.state;
  const editable = status === 'pursuing' || status === 'preparing' || status === 'ready_to_apply';

  const disabled = saving || state.stale;
  const palette = planPalette(isDark);
  const title = String(item?.opportunity.title ?? 'Opportunity');
  const organization = typeof item?.opportunity.organization === 'string' ? item.opportunity.organization : '';
  const tasks = item?.tasks ?? [];
  const remaining = tasks.filter(task => task.status !== 'completed' && task.status !== 'skipped');
  const completed = tasks.filter(task => task.status === 'completed' || task.status === 'skipped');
  const nextTask = remaining.find(task => task.id === item?.nextAction.taskId) ?? remaining[0];
  const selectedTask = tasks.find(task => expandedTask?.key === key && task.id === expandedTask.id);
  const focusTask = selectedTask ?? nextTask;
  const preparation = editable || status === 'shortlisted';
  const progress = item && Number.isFinite(item.progress.percent) ? Math.max(0, Math.min(100, item.progress.percent)) : 0;
  const showSubmission = Boolean(status && ['shortlisted', 'pursuing', 'preparing', 'ready_to_apply', 'application_opened'].includes(status));
  const applicationReady = status === 'ready_to_apply' || status === 'application_opened';
  const toggleTask = (taskId: string, complete: boolean) => {
    void run(`tasks/${encodeURIComponent(taskId)}`, { status: complete ? 'completed' : 'pending' });
  };
  const renderTask = (task: OpportunityJourneyView['tasks'][number]) => (
    <View key={task.id} style={[styles.task, { borderColor: colors.border }]}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={task.title}
        accessibilityState={{ checked: task.status === 'completed', disabled: !editable || disabled }}
        disabled={!editable || disabled} onPress={() => toggleTask(task.id, task.status !== 'completed')} style={styles.checkboxTouch}>
        <View style={[styles.check, { borderColor: task.status === 'completed' ? colors.success : colors.border, backgroundColor: task.status === 'completed' ? palette.mint.background : colors.card }]}>
          {task.status === 'completed' && <Check size={15} color={palette.mint.ink} />}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`View step: ${task.title}`}
        disabled={!preparation} accessibilityState={{ expanded: selectedTask?.id === task.id, disabled: !preparation }}
        onPress={() => { setExpandedTask(selectedTask?.id === task.id ? null : { key, id: task.id }); scroll.current?.scrollTo({ y: 0, animated: false }); }}
        style={styles.taskBody}>
        <Text numberOfLines={2} style={[styles.taskTitle, { color: colors.foreground, textDecorationLine: task.status === 'completed' ? 'line-through' : 'none' }]}>{task.title}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {task.required ? 'Required' : 'Optional'}{task.dueAt && Number.isFinite(Date.parse(task.dueAt)) ? ` · Due ${new Date(task.dueAt).toLocaleDateString()}` : ''}{task.status === 'skipped' ? ' · Skipped' : ''}
        </Text>
      </Pressable>
      <ChevronRight size={17} color={colors.textSecondary} />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to My Plan" onPress={() => router.canGoBack?.() === false ? router.replace('/my-plan') : router.back()} style={styles.backControl}>
          <ChevronLeft size={23} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.heading, { color: colors.foreground }]}>Your next steps</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="More options" accessibilityState={{ expanded: optionsOpen }}
          onPress={() => setOptionsOpen(value => !value)} style={styles.backControl}><MoreHorizontal size={22} color={colors.foreground} /></Pressable>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: showSubmission ? 20 : insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={loading && Boolean(item)} onRefresh={() => setRefresh(n => n + 1)} tintColor={colors.accent} />}>
        {error && item && <View style={styles.notice}>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRefresh(n => n + 1)} style={styles.back}><Text style={{ color: colors.accent }}>Refresh plan</Text></Pressable>
        </View>}
        {state.stale && item && <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>Offline copy. Reconnect and refresh before making changes.</Text>}
        {!item && loading && <View accessibilityLabel="Loading your plan" accessibilityState={{ busy: true }} style={{ gap: 12 }}>
          <Skeleton height={110} borderRadius={16} /><Skeleton height={64} borderRadius={14} /><Skeleton height={140} borderRadius={16} />
        </View>}
        {!item && !loading && error && <StateView state={{ kind: 'error', cause: 'server' }} flow="applied" fill={false}
          title="Let’s get your plan back" body={error} onRetry={() => setRefresh(n => n + 1)} />}

        {item && <>
          <View style={[styles.summary, { backgroundColor: palette.blue.background, borderColor: palette.blue.border }]}>
            <View style={styles.summaryRow}>
              <View style={[styles.logo, { backgroundColor: colors.card }]}><Text style={{ color: colors.accent, fontWeight: '700' }}>{(organization || title).slice(0, 2).toUpperCase()}</Text></View>
              <View style={styles.summaryBody}>
                {organization ? <Text numberOfLines={1} style={[styles.meta, { color: palette.blue.ink }]}>{organization}</Text> : null}
                <Text selectable numberOfLines={2} style={[styles.title, { color: palette.blue.ink }]}>{title}</Text>
                <View style={styles.statusRow}>
                  <Text style={[styles.status, { color: palette.blue.ink }]}>{status?.replaceAll('_', ' ')}</Text>
                  <View style={styles.deadlineRow}><CalendarDays size={13} color={palette.blue.ink} />
                    <Text style={[styles.meta, { color: palette.blue.ink }]}>{getDeadlineBadge(typeof item.opportunity.deadline === 'string' ? item.opportunity.deadline : null).label}</Text>
                  </View>
                </View>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="View opportunity" onPress={() => router.push({ pathname: '/opportunities/[id]', params: { id: item.journey.opportunityId } })}
              style={styles.detailsLink}><Text style={{ color: palette.blue.ink, fontWeight: '600' }}>View opportunity</Text><ArrowUpRight size={17} color={palette.blue.ink} /></Pressable>
          </View>

          {item.progress.totalRequired > 0 && <View style={[styles.progressCard, { backgroundColor: palette.mint.background, borderColor: palette.mint.border }]}>
            <Check size={24} color={palette.mint.ink} />
            <View style={styles.progressBody}>
              <Text style={{ color: palette.mint.ink, fontSize: 14, fontWeight: '700' }}>{item.progress.completedRequired} of {item.progress.totalRequired} steps ready</Text>
              <View accessibilityRole="progressbar" accessibilityLabel="Preparation progress" accessibilityValue={{ min: 0, max: 100, now: progress }}
                style={[styles.progressTrack, { backgroundColor: palette.mint.border }]}>
                <View style={{ height: '100%', width: `${progress}%`, backgroundColor: colors.success }} />
              </View>
            </View>
            <Text style={{ color: palette.mint.ink, fontWeight: '600' }}>{Math.round(progress)}%</Text>
          </View>}

          {preparation && (!applicationReady || selectedTask) && <View style={[styles.nextPanel, { backgroundColor: palette.violet.background, borderColor: palette.violet.border }]}>
            <Text style={[styles.eyebrow, { color: palette.violet.ink }]}>{selectedTask ? 'YOUR STEP' : 'UP NEXT'}</Text>
            {!selectedTask && <Svg pointerEvents="none" width={72} height={80} viewBox="0 0 72 80" style={styles.documentArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Rect x="16" y="13" width="42" height="55" rx="6" fill="none" stroke={palette.violet.ink} strokeWidth="2" />
              <Path d="M26 28h22M26 38h22M26 48h14M11 11l-4-4M36 6V1M61 11l4-4" stroke={palette.violet.ink} strokeWidth="2" strokeLinecap="round" />
            </Svg>}
            <Text style={[styles.nextTitle, { color: palette.violet.ink, paddingRight: selectedTask ? 0 : 60 }]}>{focusTask?.title ?? item.nextAction.label}</Text>
            {selectedTask ? <>
              {selectedTask.description && <Text style={{ color: palette.violet.ink, fontSize: 14, lineHeight: 21 }}>{selectedTask.description}</Text>}
              <Text style={[styles.meta, { color: palette.violet.ink }]}>
                {selectedTask.required ? 'Required' : 'Optional'}{selectedTask.dueAt && Number.isFinite(Date.parse(selectedTask.dueAt)) ? ` · Due ${new Date(selectedTask.dueAt).toLocaleDateString()}` : ''}
              </Text>
              <PlanActionButton label="Check official requirements" secondary disabled={saving}
                onPress={() => router.push({ pathname: '/opportunities/[id]', params: { id: item.journey.opportunityId } })} />
              <AnimatedPressable accessibilityRole="button" accessibilityLabel="Ask Edutu AI" onPress={() => router.push({ pathname: '/chat', params: { prefill: `Help me with the step "${selectedTask.title}" for "${title}".${selectedTask.description ? ` ${selectedTask.description}` : ''}` } })}
                style={[styles.aiButton, { borderColor: palette.violet.border }]}>
                <Sparkles size={17} color={palette.violet.ink} /><Text style={{ color: palette.violet.ink, fontWeight: '600' }}>Ask Edutu AI</Text>
              </AnimatedPressable>
              {status === 'shortlisted' ? <PlanActionButton label="Start pursuing" onPress={() => { void run(undefined, { opportunityId: item.journey.opportunityId, action: 'pursue' }, true); }} disabled={disabled} /> :
                <PlanActionButton label={selectedTask.status === 'completed' ? 'Mark step incomplete' : 'Mark step complete'} disabled={!editable || disabled} onPress={() => toggleTask(selectedTask.id, selectedTask.status !== 'completed')} />}
            </> : status === 'shortlisted' ? (
              <PlanActionButton label="Start pursuing" onPress={() => { void run(undefined, { opportunityId: item.journey.opportunityId, action: 'pursue' }, true); }} disabled={disabled} />
            ) : focusTask ? <Pressable accessibilityRole="button" accessibilityLabel="Open next step" onPress={() => setExpandedTask({ key, id: focusTask.id })}
              style={[styles.openStep, { backgroundColor: colors.accent }]}>
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Open step</Text><ArrowRight size={17} color="#FFF" />
            </Pressable> : <Text style={{ color: palette.violet.ink }}>Review the opportunity requirements to prepare your application.</Text>}
          </View>}

          {saving && <ActivityIndicator accessibilityLabel="Saving your plan" color={colors.accent} />}

          {remaining.length > 0 && <>
            <View style={styles.sectionRow}><Text accessibilityRole="header" style={[styles.section, { color: colors.foreground }]}>Preparation checklist</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{remaining.length} left</Text></View>
            <View style={[styles.taskGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>{remaining.map(renderTask)}</View>
          </>}
          {completed.length > 0 && <View style={[styles.disclosure, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Completed steps (${completed.length})`} accessibilityState={{ expanded: completedOpen }}
              onPress={() => setCompletedOpen(value => !value)} style={styles.disclosureButton}>
              <Check size={18} color={colors.success} /><Text style={[styles.disclosureText, { color: colors.foreground }]}>Completed steps ({completed.length})</Text>
              <ChevronDown size={18} color={colors.textSecondary} style={{ transform: [{ rotate: completedOpen ? '180deg' : '0deg' }] }} />
            </Pressable>
            {completedOpen && completed.map(renderTask)}
          </View>}

          <View style={[styles.disclosure, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Application details" accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen(value => !value)} style={styles.disclosureButton}>
              <FileText size={18} color={colors.accent} /><Text style={[styles.disclosureText, { color: colors.foreground }]}>Application details</Text>
              <ChevronDown size={18} color={colors.textSecondary} style={{ transform: [{ rotate: detailsOpen ? '180deg' : '0deg' }] }} />
            </Pressable>
            {detailsOpen && <View style={styles.detailsBody}>
              <Text style={{ color: colors.foreground }}>Status · {status?.replaceAll('_', ' ')}</Text>
              <Text style={{ color: colors.textSecondary }}>Next action · {item.nextAction.label}</Text>
              {item.journey.appliedAt && <Text style={{ color: colors.textSecondary }}>Applied · {new Date(item.journey.appliedAt).toLocaleDateString()}</Text>}
              {item.journey.outcome && <Text style={{ color: colors.foreground }}>Result · {item.journey.outcome.replaceAll('_', ' ')}</Text>}
            </View>}
          </View>

          {applicationReady && <PlanActionButton label="Open application website" onPress={() => { void openApplication(); }} disabled={disabled} />}
          {status === 'application_opened' && <PlanActionButton label="Return to preparation" onPress={() => { void run('transition', { state: 'ready_to_apply' }); }} disabled={disabled} secondary />}

          {(status === 'applied' || status === 'interview') && <View style={styles.results}>
            <Text accessibilityRole="header" style={[styles.section, { color: colors.foreground }]}>Track your result</Text>
            {status === 'applied' && <PlanActionButton label="Invited to interview" onPress={() => { void run('transition', { state: 'interview' }); }} disabled={disabled} secondary />}
            <PlanActionButton label="Received an offer" onPress={() => outcome('offer', 'Received an offer?')} disabled={disabled} />
            <PlanActionButton label="Not selected" onPress={() => outcome('rejected', 'Not selected?')} disabled={disabled} secondary />
            <PlanActionButton label="No response" onPress={() => outcome('no_response', 'Close as no response?')} disabled={disabled} secondary />
          </View>}

          <Pressable accessibilityRole="button" accessibilityLabel="More plan options" accessibilityState={{ expanded: optionsOpen }}
            onPress={() => setOptionsOpen(value => !value)} style={styles.disclosureButton}>
            <MoreHorizontal size={18} color={colors.textSecondary} /><Text style={[styles.disclosureText, { color: colors.textSecondary }]}>More options</Text><ChevronDown size={18} color={colors.textSecondary} />
          </Pressable>
          {optionsOpen && <View style={styles.results}>
            {status && ['pursuing', 'preparing', 'ready_to_apply', 'application_opened', 'applied', 'interview'].includes(status) &&
              <PlanActionButton label="Withdraw from this opportunity" onPress={() => outcome('withdrawn', 'Withdraw from this opportunity?')} disabled={disabled} secondary />}
            {status === 'archived' && <PlanActionButton label="Restore to shortlist" onPress={() => { void run('transition', { state: 'shortlisted' }); }} disabled={disabled} secondary />}
            {status && ['shortlisted', 'offer', 'rejected', 'withdrawn', 'no_response', 'expired'].includes(status) &&
              <PlanActionButton label="Archive opportunity" onPress={() => { void run('transition', { state: 'archived' }); }} disabled={disabled} secondary />}
          </View>}
        </>}
      </ScrollView>
      {item && showSubmission && <View style={[styles.submissionFooter, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <Text style={[styles.meta, { color: colors.textSecondary, textAlign: 'center' }]}>{status === 'application_opened' ? 'Confirm after submitting on the official website.' : 'Already sent your application?'}</Text>
        <PlanActionButton label="Confirm submission" onPress={confirmSubmission} disabled={disabled} secondary />
      </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 14, paddingBottom: 8, gap: 6, flexDirection: 'row', alignItems: 'center' },
  backControl: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '600', flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  summary: { padding: 12, borderWidth: 1, borderRadius: 16, gap: 4 },
  summaryRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  logo: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryBody: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  statusRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  status: { textTransform: 'capitalize', fontWeight: '600', fontSize: 12 },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailsLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  progressCard: { padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1 },
  progressBody: { flex: 1, gap: 7 },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  nextPanel: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 9, overflow: 'hidden' },
  documentArt: { position: 'absolute', right: 10, top: 14, opacity: 0.3 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  nextTitle: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  openStep: { minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 11 },
  aiButton: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  sectionRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  section: { fontSize: 17, fontWeight: '700' },
  taskGroup: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  task: { paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkboxTouch: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  check: { width: 23, height: 23, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  taskBody: { flex: 1, minHeight: 44, justifyContent: 'center', gap: 2, paddingVertical: 3 },
  taskTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 18 },
  disclosure: { borderRadius: 13, borderWidth: 1, overflow: 'hidden' },
  disclosureButton: { minHeight: 46, flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  disclosureText: { flex: 1, fontSize: 14, fontWeight: '600' },
  detailsBody: { padding: 12, paddingTop: 2, gap: 8 },
  notice: { gap: 4 },
  back: { minHeight: 44, justifyContent: 'center' },
  results: { gap: 8 },
  button: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  submissionFooter: { paddingHorizontal: 18, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
});
