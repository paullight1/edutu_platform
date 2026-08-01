import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';
import { stateStage, useStateTokens, type StateHue, type StateTokens } from './stateTokens';

/**
 * Tier 2 — the parameterized scene.
 *
 * Nobody hand-animates forty distinct empty states, and the alternative the app
 * shipped with — a 32px glyph in a tinted circle, identical everywhere — says
 * nothing about the state it represents. This primitive sits between: one
 * component, five arrangements, configured per state rather than authored per
 * state, so twenty surfaces get a considered scene for the cost of one.
 *
 * The arrangement is the message. `scan` reads as looking-and-finding-nothing,
 * `stack` as a pile that hasn't been started, `orbit` as options circling a
 * centre. Picking the right one carries more than the copy under it does.
 *
 * Tier 1 heroes (`./scenes/`) are bespoke compositions for the eight moments
 * that decide retention. Tier 3 (`./IconTile.tsx`) is the spot mark. This is
 * everything in between.
 */

export type SceneArrangement =
  /** Glyphs circling a centred anchor — options, choices, discovery. */
  | 'orbit'
  /** Offset cards receding backwards — an unstarted collection. */
  | 'stack'
  /** Loosely placed marks with a drifting bias — nothing organised yet. */
  | 'scatter'
  /** A single centred mark breathing under a halo — waiting, or attention. */
  | 'pulse'
  /** A sweep passing across placeholder rows — searching, filtering, matching. */
  | 'scan';

export interface StateSceneProps {
  arrangement: SceneArrangement;
  /** 1–4 glyphs. Beyond four the stage reads as clutter at this size. */
  glyphs: LucideIcon[];
  hue?: StateHue;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/* ------------------------------------------------------------------ */
/* Arrangements                                                        */
/* ------------------------------------------------------------------ */

function OrbitScene({
  glyphs,
  t,
  size,
  progress,
}: {
  glyphs: LucideIcon[];
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  const radius = size * 0.31;
  const Anchor = glyphs[0];

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View
        style={[
          styles.orbitRing,
          {
            width: radius * 2 + 44,
            height: radius * 2 + 44,
            borderRadius: radius + 22,
            borderColor: t.ring,
          },
        ]}
      />
      <View style={[styles.anchor, { backgroundColor: t.wash, borderColor: t.ring }]}>
        {Anchor ? <Anchor size={size * 0.17} color={t.hue} strokeWidth={2} /> : null}
      </View>

      {glyphs.slice(1).map((Glyph, i) => (
        <OrbitMark
          key={i}
          Glyph={Glyph}
          index={i}
          total={Math.max(glyphs.length - 1, 1)}
          radius={radius}
          t={t}
          size={size}
          progress={progress}
        />
      ))}
    </View>
  );
}

function OrbitMark({
  Glyph,
  index,
  total,
  radius,
  t,
  size,
  progress,
}: {
  Glyph: LucideIcon;
  index: number;
  total: number;
  radius: number;
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  // Evenly spaced, started from the top so the composition is balanced at rest
  // even when the loop is disabled for reduced motion.
  const base = (index / total) * Math.PI * 2 - Math.PI / 2;

  const style = useAnimatedStyle(() => {
    const angle = base + progress.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.orbitMark,
        { backgroundColor: t.surface, borderColor: t.surfaceLine },
        style,
      ]}
    >
      <Glyph size={size * 0.11} color={t.hue} strokeWidth={2.2} />
    </Animated.View>
  );
}

function StackScene({
  glyphs,
  t,
  size,
  progress,
}: {
  glyphs: LucideIcon[];
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  const cardW = size * 0.62;
  const cardH = size * 0.3;

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      {[2, 1, 0].map((depth) => (
        <StackCard
          key={depth}
          depth={depth}
          width={cardW}
          height={cardH}
          t={t}
          progress={progress}
          Glyph={depth === 0 ? glyphs[0] : undefined}
          glyphSize={size * 0.13}
        />
      ))}
    </View>
  );
}

function StackCard({
  depth,
  width,
  height,
  t,
  progress,
  Glyph,
  glyphSize,
}: {
  depth: number;
  width: number;
  height: number;
  t: StateTokens;
  progress: SharedValue<number>;
  Glyph?: LucideIcon;
  glyphSize: number;
}) {
  // Receding: each card back is smaller, higher and fainter, so the pile reads
  // as depth rather than as three stacked rectangles.
  const style = useAnimatedStyle(() => {
    const lift = interpolate(progress.value, [0, 0.5, 1], [0, -3, 0]);
    return {
      transform: [
        { translateY: -depth * height * 0.34 + lift * (depth === 0 ? 1 : 0.4) },
        { scale: 1 - depth * 0.09 },
      ],
      opacity: depth === 0 ? 1 : 0.5 - depth * 0.14,
    };
  });

  return (
    <Animated.View
      style={[
        styles.stackCard,
        {
          width,
          height,
          backgroundColor: t.surface,
          borderColor: depth === 0 ? t.ring : t.surfaceLine,
        },
        style,
      ]}
    >
      {Glyph ? (
        <>
          <View style={[styles.stackGlyph, { backgroundColor: t.wash }]}>
            <Glyph size={glyphSize} color={t.hue} strokeWidth={2.2} />
          </View>
          <View style={styles.stackLines}>
            <View style={[styles.line, { width: '70%', backgroundColor: t.line }]} />
            <View style={[styles.line, { width: '45%', backgroundColor: t.lineSoft }]} />
          </View>
        </>
      ) : null}
    </Animated.View>
  );
}

function ScatterScene({
  glyphs,
  t,
  size,
  progress,
}: {
  glyphs: LucideIcon[];
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  // Fixed offsets rather than random: a scene that reshuffles on every render
  // reads as a glitch, and randomness here would also break snapshot tests.
  const spots = [
    { x: -0.26, y: -0.2, s: 1 },
    { x: 0.27, y: -0.08, s: 0.82 },
    { x: -0.1, y: 0.24, s: 0.9 },
    { x: 0.22, y: 0.28, s: 0.72 },
  ];

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View
        style={[
          styles.blob,
          { width: size * 0.72, height: size * 0.72, borderRadius: size * 0.36, backgroundColor: t.wash },
        ]}
      />
      {glyphs.slice(0, 4).map((Glyph, i) => (
        <ScatterMark
          key={i}
          Glyph={Glyph}
          spot={spots[i]}
          index={i}
          t={t}
          size={size}
          progress={progress}
        />
      ))}
    </View>
  );
}

function ScatterMark({
  Glyph,
  spot,
  index,
  t,
  size,
  progress,
}: {
  Glyph: LucideIcon;
  spot: { x: number; y: number; s: number };
  index: number;
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Each mark drifts on its own phase, so the group never pulses in unison.
    const phase = (progress.value + index * 0.25) % 1;
    const drift = interpolate(phase, [0, 0.5, 1], [0, -4, 0]);
    return { transform: [{ translateY: drift }] };
  });

  return (
    <Animated.View
      style={[
        styles.scatterMark,
        {
          left: size / 2 + spot.x * size - (size * 0.13 * spot.s) / 2,
          top: size / 2 + spot.y * size - (size * 0.13 * spot.s) / 2,
          width: size * 0.13 * spot.s * 2,
          height: size * 0.13 * spot.s * 2,
          borderRadius: size * 0.13 * spot.s,
          backgroundColor: t.surface,
          borderColor: t.surfaceLine,
        },
        style,
      ]}
    >
      <Glyph size={size * 0.12 * spot.s} color={t.hue} strokeWidth={2.2} />
    </Animated.View>
  );
}

function PulseScene({
  glyphs,
  t,
  size,
  progress,
}: {
  glyphs: LucideIcon[];
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  const Glyph = glyphs[0];

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6, 1], [0.34, 0.06, 0.34]),
    transform: [{ scale: interpolate(progress.value, [0, 0.6, 1], [0.9, 1.32, 0.9]) }],
  }));

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: size * 0.6, height: size * 0.6, borderRadius: size * 0.3, backgroundColor: t.hue },
          haloStyle,
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.pulseCore,
          {
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: size * 0.21,
            backgroundColor: t.wash,
            borderColor: t.ring,
          },
        ]}
      >
        {Glyph ? <Glyph size={size * 0.19} color={t.hue} strokeWidth={2} /> : null}
      </View>
    </View>
  );
}

function ScanScene({
  glyphs,
  t,
  size,
  progress,
}: {
  glyphs: LucideIcon[];
  t: StateTokens;
  size: number;
  progress: SharedValue<number>;
}) {
  const Glyph = glyphs[0];
  const rowW = size * 0.66;

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-size * 0.22, size * 0.22]) }],
    opacity: interpolate(progress.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
  }));

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View style={[styles.scanRows, { width: rowW }]}>
        {[0.95, 0.7, 0.85, 0.5].map((w, i) => (
          <View
            key={i}
            style={[
              styles.scanRow,
              { width: `${w * 100}%`, backgroundColor: i % 2 === 0 ? t.line : t.lineSoft },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[styles.sweep, { width: rowW + 16, backgroundColor: t.hue }, sweepStyle]}
        pointerEvents="none"
      />

      {Glyph ? (
        <View style={[styles.scanBadge, { backgroundColor: t.surface, borderColor: t.ring }]}>
          <Glyph size={size * 0.13} color={t.hue} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export function StateScene({
  arrangement,
  glyphs,
  hue = 'flow',
  size = stateStage.scene,
  style,
}: StateSceneProps) {
  const t = useStateTokens(hue);
  const motion = useMotion();

  // One driver for every arrangement: each reads `progress` differently, which
  // keeps the loop count at one per scene no matter how many marks it holds.
  const progress = useSharedValue(0);
  // Entry is separate from the ambient loop, so reduced motion can keep the
  // former (a 0ms fade is just "appear") and drop the latter entirely.
  const entry = useSharedValue(motion.reduced ? 1 : 0);

  const { allowLoop, duration, easing } = motion;

  useEffect(() => {
    entry.value = withTiming(1, { duration: duration.base, easing: easing.enter });
  }, [entry, duration.base, easing.enter]);

  useEffect(() => {
    if (!allowLoop) {
      // Park at the rest pose. Every arrangement is composed so that
      // progress === 0 is a complete, balanced still image.
      progress.value = 0;
      return;
    }

    const period = arrangement === 'scan' ? 1800 : 4200;
    progress.value = withDelay(
      160,
      withRepeat(
        arrangement === 'scan'
          ? withTiming(1, { duration: period, easing: easing.move })
          : withSequence(
              withTiming(1, { duration: period, easing: easing.loop }),
              withTiming(0, { duration: 0 }),
            ),
        -1,
        false,
      ),
    );

    return () => {
      progress.value = 0;
    };
  }, [allowLoop, arrangement, progress, easing.move, easing.loop]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [{ scale: interpolate(entry.value, [0, 1], [0.94, 1]) }],
  }));

  const safeGlyphs = glyphs.slice(0, 4);
  const sceneProps = { glyphs: safeGlyphs, t, size, progress };

  return (
    <Animated.View
      style={[entryStyle, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {arrangement === 'orbit' && <OrbitScene {...sceneProps} />}
      {arrangement === 'stack' && <StackScene {...sceneProps} />}
      {arrangement === 'scatter' && <ScatterScene {...sceneProps} />}
      {arrangement === 'pulse' && <PulseScene {...sceneProps} />}
      {arrangement === 'scan' && <ScanScene {...sceneProps} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },

  orbitRing: { position: 'absolute', borderWidth: 1 },
  anchor: {
    width: '38%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbitMark: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stackCard: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  stackGlyph: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackLines: { flex: 1, gap: 6 },
  line: { height: 6, borderRadius: 3 },

  blob: { position: 'absolute' },
  scatterMark: {
    position: 'absolute',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  halo: { position: 'absolute' },
  pulseCore: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  scanRows: { gap: 10, alignItems: 'flex-start' },
  scanRow: { height: 8, borderRadius: 4 },
  sweep: { position: 'absolute', height: 2, borderRadius: 1, opacity: 0.9 },
  scanBadge: {
    position: 'absolute',
    right: '14%',
    bottom: '16%',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
