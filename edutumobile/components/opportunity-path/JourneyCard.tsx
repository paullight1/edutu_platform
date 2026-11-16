import { StyleSheet, Text, View } from 'react-native';
import { ArrowRight, CalendarDays } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useMotion } from '../../hooks/useMotion';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import type { OpportunityJourneyView } from '@edutu/core/src/types/opportunityJourney';

export default function JourneyCard({ item, onContinue, compact = false }: {
  item: OpportunityJourneyView; onContinue: () => void; compact?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation('home');
  const motion = useMotion();
  const title = typeof item.opportunity.title === 'string' ? item.opportunity.title : t('myPlan.opportunity');
  const organization = typeof item.opportunity.organization === 'string' ? item.opportunity.organization : '';
  const percent = Number.isFinite(item.progress.percent) ? Math.max(0, Math.min(100, item.progress.percent)) : 0;
  const deadline = getDeadlineBadge(typeof item.opportunity.deadline === 'string' ? item.opportunity.deadline : null);
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('myPlan.continueNamed', { title })}
      accessibilityHint={t('myPlan.openHint')} onPress={onContinue} scaleTo={motion.reduced ? 1 : 0.98}
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.heading}>
        <View style={[s.monogram, { backgroundColor: colors.muted }]}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>{(organization || title).slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={s.titleBody}>
          {organization ? <Text numberOfLines={1} style={[s.meta, { color: colors.textSecondary }]}>{organization}</Text> : null}
          <Text numberOfLines={2} style={[s.title, { color: colors.foreground }]}>{title}</Text>
        </View>
        {compact && <ArrowRight size={18} color={colors.accent} />}
      </View>
      {!compact && <View style={s.row}>
        <Text style={[s.status, { color: colors.accent }]}>{t(`myPlan.status.${item.journey.state}`, { defaultValue: item.journey.state.replaceAll('_', ' ') })}</Text>
        <View style={s.deadline}>
          <CalendarDays size={13} color={deadline.isUrgent ? colors.warning : colors.textSecondary} />
          <Text style={[s.meta, { color: deadline.isUrgent ? colors.warning : colors.textSecondary }]}>{deadline.label}</Text>
        </View>
      </View>}
      {item.progress.totalRequired > 0 && <View style={s.progress}>
        <View accessibilityRole="progressbar" accessibilityLabel={t('myPlan.preparation')}
          accessibilityValue={{ min: 0, max: 100, now: percent }} style={[s.track, { backgroundColor: colors.muted }]}>
          <View style={[s.fill, { width: `${percent}%`, backgroundColor: colors.accent }]} />
        </View>
        <Text style={[s.meta, { color: colors.textSecondary }]}>{item.progress.completedRequired} of {item.progress.totalRequired} ready</Text>
      </View>}
      <View style={[s.footer, !compact && { backgroundColor: colors.muted }]}>
        <Text numberOfLines={2} style={[s.next, { color: compact ? colors.textSecondary : colors.accent }]}>{item.nextAction.label}</Text>
        {!compact && <ArrowRight size={18} color={colors.accent} />}
      </View>
    </AnimatedPressable>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 9 },
  heading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  titleBody: { flex: 1, minWidth: 0, gap: 2 },
  monogram: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  status: { fontSize: 12, fontWeight: '600' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 18 },
  deadline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', flex: 1, minWidth: 64 },
  fill: { height: '100%', borderRadius: 3 },
  footer: { borderRadius: 9, paddingVertical: 5, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  next: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
});
