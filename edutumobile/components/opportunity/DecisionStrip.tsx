import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarClock, Compass } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

type DecisionStripProps = {
  /** "Can I win this?" — tier language only, never a percentage. */
  fitLabel: string;
  fitBlurb: string;
  fitColor: string;
  fitTitle: string;
  /** "When must I act?" — from the shared urgency ramp. */
  deadlineLabel: string;
  deadlineDetail: string;
  deadlineColor: string;
  deadlineTitle: string;
  /**
   * Feasibility framing: when the clock is short but the requirements are
   * known, reassure instead of only alarming. Omitted whenever we cannot say
   * that honestly — an urgent deadline with unknown requirements gets nothing.
   */
  deadlineNote?: string;
};

/**
 * The two facts a user needs before anything else: how well this fits them,
 * and how long they have. Rendered as inline cells split by a hairline —
 * explicitly not two more cards (DESIGN.md §5 debt #1).
 */
export function DecisionStrip({
  fitLabel,
  fitBlurb,
  fitColor,
  fitTitle,
  deadlineLabel,
  deadlineDetail,
  deadlineColor,
  deadlineTitle,
  deadlineNote,
}: DecisionStripProps) {
  const { colors, isDark } = useTheme();
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <View style={styles.capRow}>
          <Compass size={13} color={textSecondary} />
          <Text style={[styles.cap, { color: textSecondary }]}>{fitTitle}</Text>
        </View>
        <Text style={[styles.value, { color: fitColor }]} numberOfLines={1}>
          {fitLabel}
        </Text>
        <Text style={[styles.detail, { color: textSecondary }]} numberOfLines={2}>
          {fitBlurb}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.cell}>
        <View style={styles.capRow}>
          <CalendarClock size={13} color={textSecondary} />
          <Text style={[styles.cap, { color: textSecondary }]}>{deadlineTitle}</Text>
        </View>
        <Text style={[styles.value, { color: deadlineColor }]} numberOfLines={1}>
          {deadlineLabel}
        </Text>
        <Text style={[styles.detail, { color: textSecondary }]} numberOfLines={2}>
          {deadlineDetail}
        </Text>
        {deadlineNote ? (
          <Text style={[styles.note, { color: textSecondary }]} numberOfLines={2}>
            {deadlineNote}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 16 },
  cell: { flex: 1, gap: 3 },
  divider: { width: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  capRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cap: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  value: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  detail: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 11, lineHeight: 15, marginTop: 4 },
});
