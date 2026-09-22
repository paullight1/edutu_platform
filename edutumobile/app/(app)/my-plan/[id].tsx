import { Check, ChevronLeft, ArrowUpRight, CalendarDays } from 'lucide-react-native';
import { NativeGlassSurface } from '../../../components/ui/NativeGlassSurface';
import { StateView } from '../../../components/state';
import { Skeleton } from '../../../components/ui/Skeleton';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { useMotion } from '../../../hooks/useMotion';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../components/context/ThemeContext';
import { createJourneyRequestKey, getOpportunityJourney, mutateOpportunityJourney } from '@edutu/core/src/services/opportunityJourney';
import type { OpportunityJourneyView } from '@edutu/core/src/types/opportunityJourney';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';

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
  const { colors, isDark, highContrast } = useTheme();
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
      if (owner.current === key) setState({ key, item: updated, stale: false });
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

  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to My Plan" onPress={() => router.back()} style={styles.backControl}>
        <NativeGlassSurface radius={24} isDark={isDark} highContrast={highContrast} surface={colors.card} border={colors.border} />
        <ChevronLeft size={22} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.heading, { color: colors.foreground }]}>Your next steps</Text>
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRefresh(n => n + 1)} tintColor={colors.accent} />}>
      {error && item && <View style={styles.notice}><Text accessibilityRole="alert" style={{ color: colors.foreground }}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => setRefresh(n => n + 1)} style={styles.back}><Text style={{ color: colors.accent }}>Refresh plan</Text></Pressable></View>}
      {state.stale && item && <Text style={{ color: colors.textSecondary }}>Offline copy. Reconnect and refresh before making changes.</Text>}
      {!item && loading && <View accessibilityLabel="Loading your plan" accessibilityState={{ busy: true }} style={{ gap: 20 }}>
        <Skeleton width="35%" height={24} /><Skeleton height={32} /><Skeleton width="80%" height={24} />
        <Skeleton height={120} borderRadius={24} /><Skeleton height={88} borderRadius={20} />
      </View>}
      {!item && !loading && error && <StateView state={{ kind: 'error', cause: 'server' }} flow="applied" fill={false}
        title="Let’s get your plan back" body={error} onRetry={() => setRefresh(n => n + 1)} />}

      {item && <>
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.statusPill, { backgroundColor: colors.muted }]}><View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.status, { color: colors.foreground }]}>{status?.replaceAll('_', ' ')}</Text></View>
          <Text selectable style={[styles.title, { color: colors.foreground }]}>{String(item.opportunity.title ?? 'Opportunity')}</Text>
          <View style={styles.deadlineRow}><CalendarDays size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary }}>{getDeadlineBadge(String(item.opportunity.deadline ?? '') || null).label}</Text></View>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/opportunities/[id]', params: { id: item.journey.opportunityId } })}
            style={[styles.detailsLink, { borderTopColor: colors.border }]}>
            <Text style={{ color: colors.accent, fontWeight: '600' }}>View opportunity</Text><ArrowUpRight size={18} color={colors.accent} />
          </Pressable>
        </View>
        <View style={[styles.nextPanel, { borderColor: colors.border }]}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>NEXT STEP</Text>
          <Text style={[styles.nextTitle, { color: colors.foreground }]}>{item.nextAction.label}</Text>
          {item.progress.totalRequired > 0 && <>
            <View accessibilityRole="progressbar" accessibilityLabel="Preparation progress" accessibilityValue={{ min: 0, max: 100, now: Math.max(0, Math.min(100, item.progress.percent)) }}
              style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
              <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, item.progress.percent))}%`, backgroundColor: colors.accent }} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.progress.completedRequired} of {item.progress.totalRequired} required steps complete</Text>
          </>}
        </View>
        {saving && <ActivityIndicator accessibilityLabel="Saving your plan" color={colors.accent} />}
        {status === 'shortlisted' && <PlanActionButton label={'Start pursuing'} onPress={() => { void run(undefined, { opportunityId: item.journey.opportunityId, action: 'pursue' }, true); }} disabled={saving || state.stale} />}
        {item.tasks.length > 0 && <>
          <Text style={[styles.section, { color: colors.foreground }]}>Preparation · {item.progress.completedRequired}/{item.progress.totalRequired} required</Text>
          {item.tasks.map(task => <Pressable key={task.id} accessibilityRole="checkbox" accessibilityLabel={task.title}
            accessibilityState={{ checked: task.status === 'completed', disabled: !editable || saving || state.stale }}
            disabled={!editable || saving || state.stale}
            onPress={() => { void run(`tasks/${encodeURIComponent(task.id)}`, { status: task.status === 'completed' ? 'pending' : 'completed' }); }}
            style={[styles.task, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.check, { borderColor: task.status === 'completed' ? colors.accent : colors.border, backgroundColor: task.status === 'completed' ? colors.muted : 'transparent' }]}>
              {task.status === 'completed' && <Check size={17} color={colors.accent} />}
            </View>
            <View style={styles.taskBody}><Text style={{ color: task.status === 'completed' ? colors.textSecondary : colors.foreground, fontWeight: '600', fontSize: 16, lineHeight: 22, textDecorationLine: task.status === 'completed' ? 'line-through' : 'none' }}>{task.title}</Text>
              {task.description && <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{task.description}</Text>}
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{task.required ? 'Required' : 'Optional'}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleDateString()}` : ''}</Text>
            </View>
          </Pressable>)}
        </>}
        {(status === 'ready_to_apply' || status === 'application_opened') && <PlanActionButton label={'Open application website'} onPress={() => { void openApplication(); }} disabled={saving || state.stale} />}
        {status && ['shortlisted', 'pursuing', 'preparing', 'ready_to_apply'].includes(status) && <PlanActionButton label={'Already submitted?'} onPress={confirmSubmission} disabled={saving || state.stale} secondary />}
        {status === 'application_opened' && <>
          <Text style={{ color: colors.textSecondary }}>Opening the website does not mean you have applied. Confirm below after submitting.</Text>
          {<PlanActionButton label={'Confirm submission'} onPress={confirmSubmission} disabled={saving || state.stale} />}
          {<PlanActionButton label={'Not submitted — return to preparation'} onPress={() => { void run('transition', { state: 'ready_to_apply' }); }} disabled={saving || state.stale} secondary />}
        </>}
        {(status === 'applied' || status === 'interview') && <>
          <Text style={[styles.section, { color: colors.foreground }]}>Track your result</Text>
          {status === 'applied' && <PlanActionButton label={'Invited to interview'} onPress={() => { void run('transition', { state: 'interview' }); }} disabled={saving || state.stale} secondary />}
          {<PlanActionButton label={'Received an offer'} onPress={() => outcome('offer', 'Received an offer?')} disabled={saving || state.stale} />}
          {<PlanActionButton label={'Not selected'} onPress={() => outcome('rejected', 'Not selected?')} disabled={saving || state.stale} secondary />}
          {<PlanActionButton label={'No response'} onPress={() => outcome('no_response', 'Close as no response?')} disabled={saving || state.stale} secondary />}
        </>}
        {status && ['pursuing', 'preparing', 'ready_to_apply', 'application_opened', 'applied', 'interview'].includes(status) && <PlanActionButton label={'Withdraw from this opportunity'} onPress={() => outcome('withdrawn', 'Withdraw from this opportunity?')} disabled={saving || state.stale} secondary />}
        {status === 'archived' && <PlanActionButton label="Restore to shortlist" onPress={() => { void run('transition', { state: 'shortlisted' }); }} disabled={saving || state.stale} secondary />}
        {status && ['shortlisted', 'offer', 'rejected', 'withdrawn', 'no_response', 'expired'].includes(status) && <PlanActionButton label={'Archive opportunity'} onPress={() => { void run('transition', { state: 'archived' }); }} disabled={saving || state.stale} secondary />}
      </>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 20, paddingBottom: 12, gap: 16, flexDirection: 'row', alignItems: 'center' },
  backControl: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  summary: { padding: 20, borderWidth: 1, borderRadius: 24, borderCurve: 'continuous', gap: 16 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 5, height: 5, borderRadius: 3 }, deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsLink: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextPanel: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 14 }, eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.2 },
  nextTitle: { fontSize: 20, lineHeight: 27, fontWeight: '600' }, progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  check: { width: 28, height: 28, borderRadius: 24, borderCurve: 'continuous', borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }, back: { minHeight: 44, justifyContent: 'center' },
  heading: { fontSize: 20, fontWeight: '600', flex: 1 }, content: { padding: 20, gap: 16 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '600', letterSpacing: -0.6 }, status: { textTransform: 'capitalize', fontWeight: '600', fontSize: 12 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 8 }, button: { minHeight: 48, padding: 14, borderRadius: 24, borderCurve: 'continuous', borderWidth: 1, justifyContent: 'center' },
  task: { padding: 20, borderWidth: 1, borderRadius: 20, borderCurve: 'continuous', flexDirection: 'row', gap: 12 }, taskBody: { flex: 1, gap: 7 }, notice: { gap: 6 },
});
