import { StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, CalendarDays } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useMotion } from '../../hooks/useMotion';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import type { OpportunityJourneyView } from '@edutu/core/src/types/opportunityJourney';

export default function JourneyCard({ item, onContinue }: { item: OpportunityJourneyView; onContinue: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation('home');
  const motion = useMotion();
  const title = typeof item.opportunity.title === 'string' ? item.opportunity.title : t('myPlan.opportunity');
  const organization = typeof item.opportunity.organization === 'string' ? item.opportunity.organization : '';
  const percent = Number.isFinite(item.progress.percent) ? Math.max(0, Math.min(100, item.progress.percent)) : 0;
  const deadline = getDeadlineBadge(typeof item.opportunity.deadline === 'string' ? item.opportunity.deadline : null);
  return <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('myPlan.continueNamed', { title })}
    accessibilityHint={t('myPlan.openHint')} onPress={onContinue} scaleTo={motion.reduced ? 1 : 0.98}
    style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={s.row}>
      <View style={[s.badge, { backgroundColor: colors.muted }]}><View style={[s.dot, { backgroundColor: colors.accent }]} />
        <Text style={[s.status, { color: colors.foreground }]}>{t(`myPlan.status.${item.journey.state}`, { defaultValue: item.journey.state.replaceAll('_', ' ') })}</Text></View>
      {item.journey.priority === 'primary' && <Text style={[s.focus, { color: colors.accent }]}>{t('myPlan.primaryFocus')}</Text>}
    </View>
    <View style={{ gap: 6 }}>
      {organization ? <Text numberOfLines={1} style={[s.meta, { color: colors.textSecondary }]}>{organization}</Text> : null}
      <Text numberOfLines={3} style={[s.title, { color: colors.foreground }]}>{title}</Text>
    </View>
    <View style={s.deadline}><CalendarDays size={14} color={colors.textSecondary} /><Text style={[s.meta, { color: colors.textSecondary }]}>{deadline.label}</Text></View>
    {item.progress.totalRequired > 0 && <View style={{ gap: 8 }}>
      <View style={s.row}><Text style={[s.meta, { color: colors.textSecondary }]}>{t('myPlan.preparation')}</Text>
        <Text style={[s.count, { color: colors.foreground }]}>{item.progress.completedRequired}/{item.progress.totalRequired}</Text></View>
      <View accessibilityRole="progressbar" accessibilityLabel={t('myPlan.preparation')} accessibilityValue={{ min: 0, max: 100, now: percent }} style={[s.track, { backgroundColor: colors.muted }]}>
        <View style={[s.fill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
      </View>
    </View>}
    <View style={[s.footer, { borderTopColor: colors.border }]}>
      <View style={{ flex: 1, gap: 4 }}><Text style={[s.meta, { color: colors.textSecondary }]}>{t('myPlan.nextStep')}</Text>
        <Text numberOfLines={2} style={[s.next, { color: colors.foreground }]}>{item.nextAction.label}</Text></View>
      <View style={[s.arrow, { backgroundColor: colors.muted }]}><ArrowUpRight size={21} color={colors.accent} /></View>
    </View>
  </AnimatedPressable>;
}
const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 24, borderCurve: 'continuous', padding: 20, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { height: 5, width: 5, borderRadius: 3 }, status: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  focus: { fontSize: 12, fontWeight: '600' }, title: { fontSize: 20, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4 },
  meta: { fontSize: 12, lineHeight: 18 }, deadline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }, track: { height: 4, borderRadius: 2, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 2 },
  footer: { paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  next: { fontSize: 14, lineHeight: 20, fontWeight: '600' }, arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
