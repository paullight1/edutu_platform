import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

/**
 * A soft gradient scrim pinned to the bottom of the screen, sitting *behind* the
 * floating tab bar. Content scrolling underneath fades into the background instead
 * of hard-cutting at the tab bar edge — cleaner UX in both light and dark mode.
 *
 * Render it as the last child of a screen's root container (after the ScrollView/
 * FlatList, before/behind the tab bar). It's non-interactive (pointerEvents none).
 *
 *   <View style={{ flex: 1 }}>
 *     <FlatList … />
 *     <BottomScrim />
 *   </View>
 */
export function BottomScrim({ height = 140 }: { height?: number }) {
  const { colors, isDark } = useTheme();
  const base = colors.background;

  // transparent → background: the fade is stronger/taller in dark mode where a hard
  // content edge behind the translucent tab bar is more noticeable.
  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <LinearGradient
        colors={[withAlpha(base, 0), withAlpha(base, isDark ? 0.85 : 0.7), base]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/** Accepts #RGB / #RRGGBB / rgb()/rgba() and returns an rgba() with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const nums = color.match(/[\d.]+/g);
  if (nums && nums.length >= 3) {
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
  }
  return color;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
});
