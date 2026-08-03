import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ExternalLink, Lock, Zap } from 'lucide-react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { accentGradient } from '../../lib/themeGradient';

type StickyApplyBarProps = {
  visible: boolean;
  label: string;
  /**
   * Which action the label actually performs. The bar used to draw an
   * external-link glyph unconditionally, so "Apply with Edutu AI" — an
   * in-app route — promised to hand the user off to someone else's website.
   */
  kind: 'apply' | 'copilot' | 'closed';
  onPress: () => void;
};

/**
 * Compact action bar pinned to the bottom once the in-flow CTA scrolls away,
 * so "what do I do next" is never more than a thumb-move from anywhere on the
 * page. The floating bottom-nav pill is not rendered on this route (the
 * (app) layout classes `/opportunities/{id}` as a subpage), so the bar owns
 * the safe area outright — but it still pads for the home indicator.
 *
 * Deliberately ONE control. It carried a save button too, which made three
 * bookmark toggles for one boolean (header, footer, here) — and the header's
 * never scrolls away, so the extra copies bought nothing but ambiguity.
 */
export function StickyApplyBar({ visible, label, kind, onPress }: StickyApplyBarProps) {
  const { colors, isDark, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const closed = kind === 'closed';

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(200)}
      exiting={reducedMotion ? undefined : FadeOutDown.duration(160)}
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <BlurView
        intensity={isDark ? 40 : 60}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(2,6,23,0.72)' : 'rgba(255,255,255,0.82)',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
          },
        ]}
      />

      <View style={styles.row}>
        <AnimatedPressable
          onPress={onPress}
          disabled={closed}
          scaleTo={0.97}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityState={{ disabled: closed }}
          accessibilityLabel={label}
          style={[styles.primary, closed && styles.primaryClosed]}
        >
          <LinearGradient
            // Closed keeps a neutral slate ramp (the action is unavailable, so
            // it must not wear the brand). Live uses a ramp of the user's own
            // theme accent rather than the old accent→#4331C9, which forced
            // every palette through the same indigo-violet.
            colors={closed ? ['#64748B', '#475569'] : accentGradient(colors.accent)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.primaryInner}>
            {closed ? (
              <Lock size={17} color="#FFFFFF" />
            ) : kind === 'copilot' ? (
              <Zap size={17} color="#FFFFFF" />
            ) : (
              <ExternalLink size={17} color="#FFFFFF" />
            )}
            <Text style={styles.primaryText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primary: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  primaryClosed: { opacity: 0.7 },
  primaryInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
