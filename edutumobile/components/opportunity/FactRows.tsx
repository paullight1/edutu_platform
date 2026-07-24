import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

export type Fact = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  /** Optional emphasis colour (funding, urgency). */
  color?: string;
};

/**
 * Reference facts (sponsor, location, funding, category…) as inline
 * definition rows — label left, value right, hairline between. The old screen
 * gave each of these its own bordered tile, which made four equally loud
 * boxes out of information nobody reads until after they have decided.
 */
export function FactRows({ facts }: { facts: Fact[] }) {
  const { colors, isDark } = useTheme();
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  if (facts.length === 0) return null;

  return (
    <View>
      {facts.map((fact, index) => {
        const Icon = fact.icon;
        return (
          <View
            key={fact.key}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
            ]}
          >
            <Icon size={15} color={textSecondary} />
            <Text style={[styles.label, { color: textSecondary }]} numberOfLines={1}>
              {fact.label}
            </Text>
            <Text
              style={[styles.value, { color: fact.color || colors.foreground }]}
              numberOfLines={2}
            >
              {fact.value}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  label: { fontSize: 13, fontWeight: '600', minWidth: 72 },
  value: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
  },
});
