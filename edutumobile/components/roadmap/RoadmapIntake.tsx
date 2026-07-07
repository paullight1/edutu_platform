import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export type CurrentLevel = 'beginner' | 'intermediate' | 'advanced';

export interface RoadmapIntakeValue {
  hoursPerWeek?: number;
  currentLevel?: CurrentLevel;
}

export interface RoadmapIntakeColors {
  foreground: string;
  textSecondary: string;
  accent: string;
  border: string;
  card: string;
}

interface RoadmapIntakeProps {
  value: RoadmapIntakeValue;
  onChange: (value: RoadmapIntakeValue) => void;
  colors: RoadmapIntakeColors;
}

// Time buckets map to a representative hours/week the LLM endpoint can reason about.
// `label` holds an i18n key (goals namespace) translated at render time.
const TIME_OPTIONS: { label: string; hoursPerWeek: number }[] = [
  { label: 'intake.time.under5', hoursPerWeek: 3 },
  { label: 'intake.time.h5to10', hoursPerWeek: 8 },
  { label: 'intake.time.h10to20', hoursPerWeek: 15 },
  { label: 'intake.time.h20plus', hoursPerWeek: 25 },
];

const LEVEL_OPTIONS: { label: string; value: CurrentLevel }[] = [
  { label: 'intake.level.beginner', value: 'beginner' },
  { label: 'intake.level.intermediate', value: 'intermediate' },
  { label: 'intake.level.advanced', value: 'advanced' },
];

/**
 * A two-tap "fit to my life" intake — hours available per week and current level —
 * so the generated plan respects real availability instead of being aspirational.
 * Both answers are optional; the roadmap generates fine without them.
 */
export function RoadmapIntake({ value, onChange, colors }: RoadmapIntakeProps) {
  const { t } = useTranslation('goals');
  return (
    <View style={styles.container}>
      <View style={styles.group}>
        <Text style={[styles.question, { color: colors.foreground }]}>
          {t('intake.timeQuestion')}
        </Text>
        <View style={styles.chips}>
          {TIME_OPTIONS.map((option) => {
            const selected = value.hoursPerWeek === option.hoursPerWeek;
            return (
              <TouchableOpacity
                key={option.hoursPerWeek}
                activeOpacity={0.8}
                onPress={() => onChange({ ...value, hoursPerWeek: option.hoursPerWeek })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.card,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {t(option.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[styles.question, { color: colors.foreground }]}>
          {t('intake.levelQuestion')}
        </Text>
        <View style={styles.chips}>
          {LEVEL_OPTIONS.map((option) => {
            const selected = value.currentLevel === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.8}
                onPress={() => onChange({ ...value, currentLevel: option.value })}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.accent : colors.card,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? '#FFFFFF' : colors.textSecondary },
                  ]}
                >
                  {t(option.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  group: { gap: 10 },
  question: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
});
