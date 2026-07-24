import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';

type CollapsibleSectionProps = {
  title: string;
  /**
   * One line of the section's actual substance, shown while collapsed. A bare
   * accordion header tells the user nothing about whether it is worth opening;
   * the preview is what makes progressive disclosure honest.
   */
  preview?: string;
  /** Small count/'3 items' hint rendered next to the title. */
  meta?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

/**
 * A reference section on the opportunity detail screen: quiet divider,
 * tappable header, substance previewed while collapsed. Deliberately NOT a
 * card — the screen already spends its card budget on the fit block, and
 * DESIGN.md §5 debt #1 bans stacking one more identical grid.
 */
export function CollapsibleSection({
  title,
  preview,
  meta,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const { colors, isDark, reducedMotion } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const textSecondary = isDark ? '#94A3B8' : '#64748B';

  const toggle = useCallback(() => setExpanded((value) => !value), []);

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border }]}>
      <AnimatedPressable
        onPress={toggle}
        scaleTo={0.99}
        hapticFeedback="selection"
        style={styles.headerHit}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
      >
        {/* AnimatedPressable puts its own flex:1 Pressable between `style`
            and the children, so the row layout has to live on this inner
            View or it collapses to a column. */}
        <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
              {title}
            </Text>
            {meta ? (
              <Text style={[styles.meta, { color: textSecondary }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {!expanded && preview ? (
            <Text style={[styles.preview, { color: textSecondary }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.chevron,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
            expanded && { transform: [{ rotate: '180deg' }] },
          ]}
        >
          <ChevronDown size={18} color={textSecondary} />
        </View>
        </View>
      </AnimatedPressable>

      {expanded ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          style={styles.body}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  headerHit: { paddingVertical: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 13, fontWeight: '600' },
  preview: { fontSize: 13, lineHeight: 19 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  body: { paddingBottom: 18, gap: 10 },
});
