import React from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';
import { stateStage, useStateTokens, type StateHue } from './stateTokens';

/**
 * Tier 3 — the spot mark.
 *
 * A deliberately quiet surface for low-stakes slots: a collapsed section with
 * nothing in it, an admin table with no rows, an inline sub-list. These are
 * places where a full scene would overclaim — the user is not at a dead end,
 * they are looking at one empty shelf inside a stocked room.
 *
 * This is a refinement of the glyph-in-a-circle the app used everywhere, not a
 * rejection of it. The difference is that this one is theme-correct across all
 * 18 palettes, animates on entry, and is a sibling of the Tier 1/2 scenes
 * rather than an unrelated one-off.
 */

export interface IconTileProps {
  icon: LucideIcon;
  hue?: StateHue;
  size?: number;
  /** Square-ish rounded tile instead of a circle — reads better inside tables. */
  shape?: 'circle' | 'squircle';
  style?: StyleProp<ViewStyle>;
}

export function IconTile({
  icon: Icon,
  hue = 'flow',
  size = stateStage.tile,
  shape = 'circle',
  style,
}: IconTileProps) {
  const t = useStateTokens(hue);
  const motion = useMotion();

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.quick)}
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: shape === 'circle' ? size / 2 : size * 0.3,
          backgroundColor: t.wash,
          borderColor: t.ring,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Icon size={size * 0.44} color={t.hue} strokeWidth={2} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
