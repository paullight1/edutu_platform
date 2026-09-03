import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { OpportunityPublicStage } from '@edutu/core';

const TABS: Array<{ key: OpportunityPublicStage; label: string }> = [
  { key: 'pursuing', label: 'Pursuing' },
  { key: 'discover', label: 'Shortlist' },
  { key: 'applied', label: 'Applied' },
  { key: 'outcome', label: 'Closed' },
];

export default function JourneyStageTabs({
  value,
  onChange,
}: {
  value: OpportunityPublicStage;
  onChange: (value: OpportunityPublicStage) => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const selected = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label} opportunity journeys`}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: selected ? colors.primary : colors.card,
                borderColor: selected ? colors.primary : colors.border,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.background : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tab: { minHeight: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '800' },
});
