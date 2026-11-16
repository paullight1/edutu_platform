import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

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
  const { t } = useTranslation('home');
  return (
    <ScrollView
      style={{ flexGrow: 0, flexShrink: 0 }}
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
            accessibilityLabel={t(`myPlan.stages.${tab.key}`)}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              {
                backgroundColor: selected ? colors.muted : 'transparent',
                borderColor: selected ? colors.border : 'transparent',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.foreground : colors.textSecondary },
              ]}
            >
              {t(`myPlan.stages.${tab.key}`)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  tab: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
});
