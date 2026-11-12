import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, CalendarDays, CheckCircle2, FolderClosed, GraduationCap } from 'lucide-react-native';
import { StateView } from '../../../components/state';
import { Skeleton } from '../../../components/ui/Skeleton';
import { PlanWorkspaceHeader } from '../../../components/opportunity-path/PlanWorkspaceHeader';
import { PlanGoalPreview } from '../../../components/opportunity-path/PlanGoalPreview';
import { useTheme } from '../../../components/context/ThemeContext';
import JourneyCard from '../../../components/opportunity-path/JourneyCard';
import { PLAN_STAGES, planPalette } from '../../../components/opportunity-path/planPresentation';
import { usePlanJourneys } from '../../../hooks/usePlanJourneys';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import type { OpportunityJourneyView } from '@edutu/core/src/types/opportunityJourney';

const STAGES = PLAN_STAGES.map(({ key }) => key);
const ICONS = [GraduationCap, Bookmark, CheckCircle2, FolderClosed];

export default function MyPlanScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('home');
  const { userId } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reads, loading, signedIn, refresh } = usePlanJourneys(STAGES);
  const palette = planPalette(isDark);
  const pursuing = reads.pursuing?.data;
  const unavailable = !loading && STAGES.some(stage => !reads[stage]?.data);
  const stale = STAGES.some(stage => reads[stage]?.isStale);
  const active = [...(pursuing ?? []), ...(reads.discover?.data ?? [])];
  const deadlines = new Set(active.filter(item => {
    const deadline = getDeadlineBadge(typeof item.opportunity.deadline === 'string' ? item.opportunity.deadline : null);
    return deadline.daysLeft !== null && deadline.daysLeft >= 0 && deadline.daysLeft <= 7;
  }).map(item => item.journey.id)).size;
  const openJourney = (item: OpportunityJourneyView) =>
    router.push({ pathname: '/my-plan/[id]', params: { id: item.journey.id } });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top }}><PlanWorkspaceHeader section="overview" compact /></View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        refreshControl={<RefreshControl refreshing={loading && Boolean(pursuing)} onRefresh={refresh} tintColor={colors.accent} />}>
        <View style={styles.stats}>
          {PLAN_STAGES.map(({ key, label, tone }, index) => {
            const count = reads[key]?.data?.length;
            const swatch = palette[tone];
            const Icon = ICONS[index];
            return (
              <Pressable key={key} accessibilityRole="button"
                accessibilityLabel={`${t(`myPlan.stages.${key}`, { defaultValue: label })}, ${count ?? (loading ? 'loading' : 'count unavailable')}`}
                accessibilityHint="Opens this list of opportunities"
                onPress={() => router.push({ pathname: '/my-plan/stage/[stage]', params: { stage: key } })}
                style={[styles.stat, { backgroundColor: swatch.background, borderColor: swatch.border }]}>
                <Icon size={19} color={swatch.ink} />
                <View pointerEvents="none" style={styles.art}><Icon size={50} color={swatch.ink} strokeWidth={1} /></View>
                <Text style={[styles.statLabel, { color: swatch.ink }]}>{t(`myPlan.stages.${key}`, { defaultValue: label })}</Text>
                <View style={styles.row}>
                  {loading && count === undefined ? <Skeleton width={36} height={27} /> : <Text style={[styles.count, { color: swatch.ink }]}>{count ?? '—'}</Text>}
                  <ArrowRight size={19} color={swatch.ink} />
                </View>
              </Pressable>
            );
          })}
        </View>

        {(!signedIn || unavailable || stale) && (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={{ color: colors.textSecondary }}>
              {!signedIn ? 'Sign in to view your plan.' : unavailable ? t('myPlan.loadError') : t('myPlan.stale')}
            </Text>
            {signedIn && <Pressable accessibilityRole="button" onPress={refresh} style={styles.touch}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>{t('myPlan.retry')}</Text>
            </Pressable>}
          </View>
        )}

        {deadlines > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${deadlines} deadlines in the next 7 days`}
          onPress={() => router.push({ pathname: '/deadlines', params: { planNav: '1' } })}
          style={[styles.deadline, { backgroundColor: palette.peach.background, borderColor: palette.peach.border }]}>
          <CalendarDays size={21} color={palette.peach.ink} />
          <Text style={[styles.deadlineLabel, { color: palette.peach.ink }]}>{deadlines} {deadlines === 1 ? 'deadline' : 'deadlines'} in the next 7 days</Text>
          <ArrowRight size={18} color={palette.peach.ink} />
        </Pressable>}

        <View style={styles.row}>
          <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Next steps</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="View all pursuing opportunities" style={styles.touch}
            onPress={() => router.push({ pathname: '/my-plan/stage/[stage]', params: { stage: 'pursuing' } })}>
            <Text style={{ color: colors.accent, fontWeight: '600' }}>View all</Text>
          </Pressable>
        </View>
        {loading && !pursuing ? <Skeleton height={100} borderRadius={16} /> :
          pursuing?.length ? pursuing.slice(0, 2).map(item => <JourneyCard key={item.journey.id} item={item} compact onContinue={() => openJourney(item)} />) :
          pursuing ? <StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="applied" fill={false} sceneSize={100}
            title={t('myPlan.empty')} body={t('myPlan.empty_pursuing')} actionLabel={t('myPlan.explore')} onAction={() => router.push('/opportunities')} /> : null}

        {userId && <>
          <View style={styles.row}>
            <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Your goals</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View all goals" style={styles.touch}
              onPress={() => router.push({ pathname: '/goals', params: { planNav: '1' } })}>
              <Text style={{ color: colors.accent, fontWeight: '600' }}>View all</Text>
            </Pressable>
          </View>
          <PlanGoalPreview key={userId} userId={userId} />
        </>}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 18, gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '46%', flexGrow: 1, borderRadius: 16, padding: 13, gap: 4, minHeight: 100, borderWidth: 1, overflow: 'hidden' },
  art: { position: 'absolute', right: 12, top: 12, opacity: 0.12 },
  statLabel: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 27, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  heading: { fontSize: 19, fontWeight: '700' },
  touch: { minHeight: 44, justifyContent: 'center' },
  deadline: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 14, borderWidth: 1 },
  deadlineLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  notice: { gap: 4, paddingHorizontal: 2 },
});
