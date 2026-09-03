import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Pencil } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import type { OpportunityIntentView } from '@edutu/core';

const GOAL_LABELS: Record<string, string> = {
  study_funding: 'Study funding',
  work_experience: 'Work experience',
  employment: 'Employment',
  business_funding: 'Business funding',
  leadership_growth: 'Leadership growth',
  skill_building: 'Skill building',
  open_exploration: 'Explore opportunities',
};

export default function CurrentFocusCard({
  intent,
  onEdit,
}: {
  intent: OpportunityIntentView;
  onEdit: () => void;
}) {
  const { colors } = useTheme();
  const tags = [
    intent.locations[0],
    intent.remotePreference === 'required'
      ? 'Remote only'
      : intent.remotePreference === 'preferred'
        ? 'Remote preferred'
        : null,
    `Within ${intent.actionHorizonDays} days`,
  ].filter((value): value is string => Boolean(value));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      accessibilityLabel={`Current focus: ${GOAL_LABELS[intent.goalKey] ?? intent.goalKey}`}
    >
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Current focus</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {GOAL_LABELS[intent.goalKey] ?? intent.goalKey}
          </Text>
          {intent.source === 'inferred' ? (
            <Text style={[styles.inferred, { color: colors.mutedForeground }]}>Based on your profile</Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit current opportunity focus"
          onPress={onEdit}
          hitSlop={8}
          style={({ pressed }) => [
            styles.editButton,
            { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Pencil size={16} color={colors.accent} />
        </Pressable>
      </View>
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tag, { backgroundColor: colors.accentLight }]}
            >
              <Text style={[styles.tagText, { color: colors.accent }]}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headingCopy: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  inferred: { fontSize: 12, marginTop: 4 },
  editButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 12, fontWeight: '700' },
});
