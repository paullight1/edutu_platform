import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { OpportunityJourneyView } from '@edutu/core';

function title(item: OpportunityJourneyView): string {
  return typeof item.opportunity.title === 'string'
    ? item.opportunity.title
    : 'Opportunity';
}

export default function JourneyCard({
  item,
  onContinue,
}: {
  item: OpportunityJourneyView;
  onContinue: () => void;
}) {
  const { colors } = useTheme();
  const percent = Math.max(0, Math.min(100, item.progress.percent));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Continue ${title(item)}`}
      onPress={onContinue}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.badgeText, { color: colors.accent }]}>
            {item.journey.state.replaceAll('_', ' ')}
          </Text>
        </View>
        <Text style={[styles.priority, { color: colors.mutedForeground }]}>
          {item.journey.priority}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={[styles.title, { color: colors.foreground }]}
      >
        {title(item)}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.next, { color: colors.textSecondary }]}
      >
        Next: {item.nextAction.label}
      </Text>
      <View style={[styles.track, { backgroundColor: colors.muted }]}>
        <View
          style={[
            styles.fill,
            { width: `${percent}%`, backgroundColor: colors.accent },
          ]}
        />
      </View>
      <View style={styles.bottomRow}>
        <Text style={[styles.progress, { color: colors.mutedForeground }]}>
          {item.progress.completedRequired} of {item.progress.totalRequired} required
        </Text>
        <ArrowRight size={18} color={colors.accent} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 170, borderWidth: 1, borderRadius: 18, padding: 15, gap: 9 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  priority: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  next: { fontSize: 13, lineHeight: 18 },
  track: { height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 3 },
  fill: { height: '100%', borderRadius: 999 },
  bottomRow: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  progress: { flex: 1, fontSize: 11, fontWeight: '600' },
});
