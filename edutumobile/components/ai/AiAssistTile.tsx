import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconSvgElement } from '@hugeicons/react-native';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../ui/BottomScrim';
import { HugeiconsIcon } from '../ui/icons';

export type AiAssistTileProps = {
  label: string;
  icon: IconSvgElement;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /**
   * Overrides the icon tint for terminal states (an upload that finished or
   * failed). The label stays accent-coloured either way — recolouring the
   * whole tile for a transient result makes the grid flicker.
   */
  iconColor?: string;
  accessibilityLabel?: string;
  /**
   * True (default) makes the tile claim an equal share of a horizontal
   * `AiAssistRow`. Set false when the tile is wrapped in its own column cell —
   * `flex: 1` inside a column container is read on the *vertical* axis and
   * would override the fixed height, stretching one tile taller than its
   * neighbour.
   */
  fill?: boolean;
};

/**
 * One cell of the AI assist grid under the fit panel.
 *
 * Every AI affordance on the opportunity page is now the same object at the
 * same size. Before this they were three different shapes — two rounded pills
 * that wrapped onto a ragged second line, then a full-width outlined button —
 * which read as three unrelated features rather than one row of things Edutu
 * can do for you, and cost three stacked rows of vertical space.
 *
 * Fixed height, not padding-driven: the tiles sit in a two-column grid and
 * labels differ in length, so intrinsic sizing left neighbouring cells
 * visibly mismatched whenever one wrapped.
 */
export function AiAssistTile({
  label,
  icon,
  onPress,
  busy = false,
  disabled = false,
  iconColor,
  accessibilityLabel,
  fill = true,
}: AiAssistTileProps) {
  const { colors } = useTheme();
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        fill ? styles.tileFill : styles.tileStretch,
        {
          // A soft tint of the theme accent — never `accentLight`, which is a
          // fully saturated indigo in the light palette and renders the
          // accent-coloured label on top of itself.
          backgroundColor: withAlpha(colors.primary, 0.08),
          borderColor: withAlpha(colors.primary, 0.2),
          opacity: pressed ? 0.65 : disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={styles.iconSlot}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <HugeiconsIcon
            icon={icon}
            size={19}
            color={iconColor ?? colors.primary}
            strokeWidth={1.8}
          />
        )}
      </View>
      <Text
        style={[styles.label, { color: colors.primary }]}
        numberOfLines={1}
        // Long translations (de/pt/sw run ~30% longer than en) shrink rather
        // than truncate — a clipped verb makes the action unreadable.
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Two-column row of tiles. Rendered as siblings rather than one grid container
 * so that `AiActionBar` (which owns its own result sheet) and `DocumentUpload`
 * (which owns its own picker state) can each supply a row while still lining
 * up column-for-column: same width, same gap, same tile height.
 */
export function AiAssistRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export const AI_ASSIST_TILE_HEIGHT = 52;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    height: AI_ASSIST_TILE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileFill: { flex: 1 },
  tileStretch: { alignSelf: 'stretch' },
  iconSlot: { width: 20, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 13, fontWeight: '600', letterSpacing: -0.1 },
});
