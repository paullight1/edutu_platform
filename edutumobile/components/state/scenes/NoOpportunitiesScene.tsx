import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Award, GraduationCap, Globe2, Sparkles } from 'lucide-react-native';
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
import { useMotion } from '../../../hooks/useMotion';
import { stateStage, useStateTokens } from '../stateTokens';

/**
 * Tier 1 — "nothing matched you yet".
 *
 * The most consequential empty state in the product: a user who opens Edutu,
 * sees no opportunities, and is told "No results" learns that the app is empty.
 * What is actually true is that the match is still forming — so this scene shows
 * opportunity cards arriving toward a centre rather than an absence.
 *
 * The composition is deliberately in the same medium as the onboarding slides
 * (`components/onboarding/SlideVisuals.tsx`): RN views, glyphs and Reanimated,
 * driven by the theme hue, so the moment reads as continuous with the flow the
 * user just came through rather than as a different app.
 */

const CARDS = [
  { Icon: GraduationCap, label: 'Scholarships', offset: -1 },
  { Icon: Globe2, label: 'Fellowships', offset: 0 },
  { Icon: Award, label: 'Grants', offset: 1 },
];

export function NoOpportunitiesScene({ size = stateStage.hero }: { size?: number }) {
  const t = useStateTokens('flow');
  const motion = useMotion();

  const drift = useSharedValue(0);
  const entry = useSharedValue(motion.reduced ? 1 : 0);

  const { allowLoop, duration, easing } = motion;

  useEffect(() => {
    entry.value = withTiming(1, { duration: duration.slow, easing: easing.enter });
  }, [entry, duration.slow, easing.enter]);

  useEffect(() => {
    if (!allowLoop) {
      drift.value = 0;
      return;
    }
    drift.value = withDelay(
      240,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2600, easing: easing.loop }),
          withTiming(0, { duration: 2600, easing: easing.loop }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      drift.value = 0;
    };
  }, [allowLoop, drift, easing.loop]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entry.value,
    transform: [{ scale: interpolate(entry.value, [0, 1], [0.92, 1]) }],
  }));

  return (
    <Animated.View
      style={[styles.stage, { width: size, height: size }, entryStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Soft ground so the cards read as floating rather than stacked. */}
      <View
        style={[
          styles.ground,
          {
            width: size * 0.82,
            height: size * 0.82,
            borderRadius: size * 0.41,
            backgroundColor: t.wash,
          },
        ]}
      />

      {CARDS.map((card, i) => (
        <FloatingCard key={card.label} {...card} index={i} t={t} size={size} drift={drift} />
      ))}

      {/* The spark sits at the centre: the match itself, still forming. */}
      <CentreSpark t={t} size={size} drift={drift} />
    </Animated.View>
  );
}

function FloatingCard({
  Icon,
  label,
  offset,
  index,
  t,
  size,
  drift,
}: {
  Icon: typeof Award;
  label: string;
  offset: number;
  index: number;
  t: ReturnType<typeof useStateTokens>;
  size: number;
  drift: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    // Each card breathes on its own phase so the group never pulses in unison,
    // which is what makes a composition read as alive rather than mechanical.
    const phase = (drift.value + index * 0.33) % 1;
    const lift = interpolate(phase, [0, 0.5, 1], [0, -7, 0]);
    return {
      transform: [
        { translateX: offset * size * 0.27 },
        { translateY: offset === 0 ? -size * 0.16 + lift : size * 0.1 + lift },
        { rotate: `${offset * 7}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: size * 0.36,
          backgroundColor: t.surface,
          borderColor: offset === 0 ? t.ring : t.surfaceLine,
        },
        style,
      ]}
    >
      <View style={[styles.cardGlyph, { backgroundColor: t.wash }]}>
        <Icon size={size * 0.085} color={t.hue} strokeWidth={2.2} />
      </View>
      <Text style={[styles.cardLabel, { color: t.body }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.cardLine, { backgroundColor: t.lineSoft }]} />
    </Animated.View>
  );
}

function CentreSpark({
  t,
  size,
  drift,
}: {
  t: ReturnType<typeof useStateTokens>;
  size: number;
  drift: SharedValue<number>;
}) {
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drift.value, [0, 0.5, 1], [0.28, 0.1, 0.28]),
    transform: [{ scale: interpolate(drift.value, [0, 0.5, 1], [0.94, 1.18, 0.94]) }],
  }));

  return (
    <>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size * 0.17,
            backgroundColor: t.hue,
          },
          haloStyle,
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.spark,
          {
            width: size * 0.2,
            height: size * 0.2,
            borderRadius: size * 0.1,
            backgroundColor: t.hue,
          },
        ]}
      >
        <Sparkles size={size * 0.1} color={t.onHue} strokeWidth={2.3} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  ground: { position: 'absolute' },
  card: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 7,
  },
  cardGlyph: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: -0.1 },
  cardLine: { height: 4, width: '60%', borderRadius: 2 },
  halo: { position: 'absolute' },
  spark: { alignItems: 'center', justifyContent: 'center' },
});
