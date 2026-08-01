import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bookmark } from 'lucide-react-native';
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
 * Tier 1 — "you haven't saved anything yet".
 *
 * The idea the scene has to carry is that saving is a *shelf you build*, not a
 * feature you failed to use. So it shows an open, waiting slot with one card
 * mid-flight toward it — the gesture the user is about to learn — rather than
 * an empty box, which reads as loss.
 */

export function NothingSavedScene({ size = stateStage.hero }: { size?: number }) {
  const t = useStateTokens('flow');
  const motion = useMotion();

  const flight = useSharedValue(0);
  const entry = useSharedValue(motion.reduced ? 1 : 0);

  const { allowLoop, duration, easing } = motion;

  useEffect(() => {
    entry.value = withTiming(1, { duration: duration.slow, easing: easing.enter });
  }, [entry, duration.slow, easing.enter]);

  useEffect(() => {
    if (!allowLoop) {
      // Rest pose: the card sits just above the slot, so the still frame still
      // reads as "about to be saved" rather than as a half-finished animation.
      flight.value = 0;
      return;
    }
    flight.value = withDelay(
      400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: easing.move }),
          withTiming(1, { duration: 900 }),
          withTiming(0, { duration: 0 }),
          withTiming(0, { duration: 700 }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      flight.value = 0;
    };
  }, [allowLoop, flight, easing.move]);

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
      {/* The shelf: three slots, the middle one open and waiting. */}
      <View style={[styles.shelf, { width: size * 0.78 }]}>
        {[0, 1, 2].map((i) => (
          <Slot key={i} index={i} t={t} size={size} flight={flight} />
        ))}
      </View>

      <FlyingCard t={t} size={size} flight={flight} />
    </Animated.View>
  );
}

function Slot({
  index,
  t,
  size,
  flight,
}: {
  index: number;
  t: ReturnType<typeof useStateTokens>;
  size: number;
  flight: SharedValue<number>;
}) {
  const isTarget = index === 1;

  const style = useAnimatedStyle(() => {
    if (!isTarget) return { borderColor: t.surfaceLine, opacity: 0.5 };
    // The target slot brightens as the card lands in it, so the eye is led to
    // the outcome rather than to the motion.
    const landed = interpolate(flight.value, [0, 0.82, 1], [0, 0, 1]);
    return {
      borderColor: t.ring,
      opacity: interpolate(landed, [0, 1], [0.85, 1]),
      transform: [{ scale: interpolate(landed, [0, 1], [1, 1.04]) }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.slot,
        {
          height: size * 0.17,
          backgroundColor: isTarget ? t.wash : 'transparent',
        },
        style,
      ]}
    />
  );
}

function FlyingCard({
  t,
  size,
  flight,
}: {
  t: ReturnType<typeof useStateTokens>;
  size: number;
  flight: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(flight.value, [0, 0.06, 0.86, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(flight.value, [0, 1], [-size * 0.3, -size * 0.02]) },
      { translateX: interpolate(flight.value, [0, 1], [size * 0.16, 0]) },
      { scale: interpolate(flight.value, [0, 1], [0.82, 1]) },
      { rotate: `${interpolate(flight.value, [0, 1], [9, 0])}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: size * 0.42,
          height: size * 0.16,
          backgroundColor: t.surface,
          borderColor: t.ring,
        },
        style,
      ]}
    >
      <View style={[styles.cardMark, { backgroundColor: t.hue }]}>
        <Bookmark size={size * 0.062} color={t.onHue} strokeWidth={2.4} fill={t.onHue} />
      </View>
      <View style={styles.cardLines}>
        <View style={[styles.cardLine, { width: '78%', backgroundColor: t.line }]} />
        <View style={[styles.cardLine, { width: '48%', backgroundColor: t.lineSoft }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center' },
  shelf: { gap: 10 },
  slot: {
    borderRadius: 13,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  card: {
    position: 'absolute',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 9,
  },
  cardMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLines: { flex: 1, gap: 5 },
  cardLine: { height: 5, borderRadius: 2.5 },
});
