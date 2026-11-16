import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AiSparkGlyph } from './AiSparkGlyph';

/**
 * Fixed-identity artwork for the "AI" brand mark: a white four-pointed spark
 * on a blue→violet gradient orb with a soft glow. DELIBERATE EXEMPTION from
 * the "never hardcode hex" rule, mirroring `ORB_PALETTES`
 * (lib/voiceSettingsStore.ts) — this is a single recognizable mark used
 * across the opportunity pages and win-coach surfaces, not a themed UI
 * element, so it must look identical in every theme/mode. Do not fork a
 * second copy of these values; import this component instead.
 */
const AI_ORB = {
  // Periwinkle blue (top-left) → indigo → violet (bottom-right).
  gradient: ['#5B8CFA', '#6366F1', '#8B5CF6'] as const,
  // A touch brighter than the base blue, drawn as a thin rim stroke so the
  // top-left of the orb reads as the "lit" edge, matching the reference image.
  rim: 'rgba(148, 180, 255, 0.55)',
  // Soft indigo glow behind the orb.
  glow: 'rgba(99, 102, 241, 0.4)',
};

interface AiOrbBadgeProps {
  /** Diameter of the orb, in px. Default 28. */
  size?: number;
}

/**
 * The canonical AI brand mark for the opportunity pages and the win-coach
 * `AiActionBar` — replaces the plain `Wand2` icon those surfaces used to
 * show. Composes the existing {@link AiSparkGlyph} (`filled`, solid white)
 * over the gradient orb above; the spark shape itself is never redrawn here.
 *
 * Static by design — no built-in animation loop. Several call sites render
 * this once per item inside a `.map()` (e.g. `AiActionBar`'s action pills),
 * so a perpetual per-instance shimmer would multiply motion/battery cost
 * with every item on screen; a still badge reads just as "alive" at this
 * size and is the safer default. If motion is wanted later it must be
 * gated on `reducedMotion` (see `ThemeContext`) and one-shot or very slow,
 * matching the restraint `OrbPreview` uses for its "settle" animation.
 *
 * Decorative: never give this its own `accessibilityLabel` — every place it
 * is used already sits inside a labelled button/chip, and a duplicate label
 * on the badge would make screen readers announce the mark twice.
 */
export function AiOrbBadge({ size = 28 }: AiOrbBadgeProps) {
  const s = useMemo(() => makeStyles(size), [size]);

  return (
    <View style={s.wrap}>
      {Platform.OS === 'android' && (
        // shadowColor/shadowRadius (used for the glow on iOS below) are a
        // no-op on Android, which has no colour-tinted shadow primitive — so
        // on Android the glow is faked with a translucent backdrop disc
        // instead, exactly as `OrbPreview`'s `ring` design does.
        <View pointerEvents="none" style={s.glowAndroid} />
      )}
      <LinearGradient
        colors={AI_ORB.gradient}
        start={{ x: 0.15, y: 0.1 }}
        end={{ x: 0.9, y: 0.95 }}
        style={s.orb}
      >
        <AiSparkGlyph size={size * 0.62} color="#FFFFFF" filled />
      </LinearGradient>
    </View>
  );
}

function makeStyles(size: number) {
  const glowSize = size * 1.35;
  const glowInset = (size - glowSize) / 2;
  return StyleSheet.create({
    wrap: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glowAndroid: {
      position: 'absolute',
      width: glowSize,
      height: glowSize,
      borderRadius: glowSize / 2,
      top: glowInset,
      left: glowInset,
      backgroundColor: AI_ORB.glow,
    },
    orb: {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: Math.max(1, size * 0.045),
      borderColor: AI_ORB.rim,
      // iOS-only colour glow. Left off overflow:'hidden' on purpose — the
      // spark child is sized well within these bounds so nothing needs
      // clipping, and clipping would also cut off this shadow.
      ...(Platform.OS === 'ios'
        ? {
            shadowColor: AI_ORB.glow,
            shadowOpacity: 0.6,
            shadowRadius: size * 0.35,
            shadowOffset: { width: 0, height: 0 },
          }
        : null),
    },
  });
}
