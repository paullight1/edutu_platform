import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

const BADGE = 168;
const RAY_BOX = 300;

// A confetti ribbon. Each piece owns its animation so we can vary delay / drift
// / spin per piece without threading state up. Deterministic-ish via index so
// the burst spreads across the width instead of clustering.
function ConfettiPiece({
  index,
  total,
  width,
  height,
  color,
}: {
  index: number;
  total: number;
  width: number;
  height: number;
  color: string;
}) {
  const progress = useSharedValue(0);
  // Per-piece randomness is generated in the effect (never during render — the
  // React Compiler purity rule forbids Math.random in the render path) and read
  // back through this shared value inside the worklet style.
  const cfg = useSharedValue({ startX: 0, drift: 0, spin: 0, size: 8, round: 0 });

  useEffect(() => {
    const laneX = (width * (index + 0.5)) / total;
    cfg.value = {
      startX: laneX + (Math.random() * 44 - 22),
      drift: Math.random() * 90 - 45,
      spin: Math.random() * 900 - 450,
      size: 7 + Math.random() * 7,
      round: index % 3 === 0 ? 1 : 0,
    };
    progress.value = withDelay(
      Math.random() * 260,
      withTiming(1, { duration: 1700 + Math.random() * 1000, easing: Easing.out(Easing.quad) }),
    );
  }, [index, total, width, cfg, progress]);

  const style = useAnimatedStyle(() => {
    const c = cfg.value;
    return {
      width: c.size,
      height: c.round ? c.size : c.size * 0.5,
      borderRadius: c.round ? c.size : 2,
      transform: [
        { translateX: c.startX + c.drift * progress.value },
        { translateY: interpolate(progress.value, [0, 1], [-70, height * 0.78]) },
        { rotate: `${c.spin * progress.value}deg` },
      ],
      opacity: interpolate(progress.value, [0, 0.08, 0.82, 1], [0, 1, 1, 0]),
    };
  });

  return (
    <Animated.View
      style={[{ position: 'absolute', top: 0, left: 0, backgroundColor: color }, style]}
    />
  );
}

function Confetti({ width, height }: { width: number; height: number }) {
  const colors = ['#FBBF24', '#8B9DFF', '#34D399', '#F472B6', '#60A5FA', '#FCD34D'];
  const pieces = Array.from({ length: 26 });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((_, i) => (
        <ConfettiPiece
          key={i}
          index={i}
          total={pieces.length}
          width={width}
          height={height}
          color={colors[i % colors.length]}
        />
      ))}
    </View>
  );
}

// The illustrated crown medallion — bespoke SVG (no asset file), matching the
// app's no-Lottie convention.
function CrownBadge({ accent, accentLight }: { accent: string; accentLight: string }) {
  return (
    <Svg width={BADGE} height={BADGE} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="disc" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accentLight} />
          <Stop offset="1" stopColor={accent} />
        </SvgGradient>
        <SvgGradient id="crown" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FEF3C7" />
          <Stop offset="1" stopColor="#FBBF24" />
        </SvgGradient>
      </Defs>
      <Circle cx="50" cy="50" r="46" fill="url(#disc)" />
      <Circle cx="50" cy="50" r="46" fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={2} />
      {/* Crown */}
      <Path
        d="M28 66 L23 39 L37 50 L50 30 L63 50 L77 39 L72 66 Z"
        fill="url(#crown)"
        stroke="#F59E0B"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path d="M27 69 H73 V74 H27 Z" fill="url(#crown)" stroke="#F59E0B" strokeWidth={1.2} strokeLinejoin="round" />
      {/* Jewels on the peaks */}
      <Circle cx="23" cy="39" r="3.4" fill="#FFFFFF" />
      <Circle cx="50" cy="30" r="4" fill="#FFFFFF" />
      <Circle cx="77" cy="39" r="3.4" fill="#FFFFFF" />
    </Svg>
  );
}

interface PremiumCelebrationProps {
  visible: boolean;
  onClose: () => void;
  accent?: string;
}

export function PremiumCelebration({ visible, onClose, accent = '#8B9DFF' }: PremiumCelebrationProps) {
  const { t } = useTranslation('opportunities');
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();

  const accentLight = colors.accentLight || accent;

  // Badge entrance + idle life.
  const scale = useSharedValue(0);
  const wobble = useSharedValue(0);
  const glow = useSharedValue(0);
  const rayRotate = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      scale.value = 0;
      wobble.value = 0;
      glow.value = 0;
      rayRotate.value = 0;
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    scale.value = withDelay(120, withSpring(1, { damping: 9, stiffness: 140, mass: 0.9 }));
    wobble.value = withDelay(
      120,
      withSequence(
        withTiming(-1, { duration: 0 }),
        withSpring(0, { damping: 5, stiffness: 120 }),
      ),
    );
    glow.value = withDelay(
      420,
      withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    rayRotate.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
    // Animation values are stable shared values; run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${interpolate(wobble.value, [-1, 0], [-12, 0])}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.25, 0.6]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.9, 1.15]) }],
  }));

  const rayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scale.value, [0, 1], [0, 1]),
    transform: [
      { scale: interpolate(scale.value, [0, 1], [0.6, 1]) },
      { rotate: `${rayRotate.value * 360}deg` },
    ],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: isDark ? 'rgba(2,6,23,0.86)' : 'rgba(15,23,42,0.72)' }]}>
        {visible ? <Confetti width={width} height={height} /> : null}

        <Animated.View entering={FadeIn.duration(240)} style={styles.center}>
          {/* Rays + glow + badge stack */}
          <View style={styles.badgeStack}>
            <Animated.View style={[styles.rays, rayStyle]} pointerEvents="none">
              <Svg width={RAY_BOX} height={RAY_BOX} viewBox="0 0 100 100">
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i * 360) / 12;
                  return (
                    <Path
                      key={i}
                      d="M50 8 L53 30 L47 30 Z"
                      fill={accentLight}
                      opacity={i % 2 === 0 ? 0.55 : 0.28}
                      transform={`rotate(${angle} 50 50)`}
                    />
                  );
                })}
              </Svg>
            </Animated.View>

            <Animated.View
              style={[styles.glow, glowStyle, { backgroundColor: accentLight }]}
              pointerEvents="none"
            />

            <Animated.View style={badgeStyle}>
              <CrownBadge accent={accent} accentLight={accentLight} />
            </Animated.View>
          </View>

          <Animated.Text
            entering={FadeInUp.delay(360).duration(420)}
            style={styles.title}
          >
            {t('paywall.celebration.title', { defaultValue: "You're Pro!" })}
          </Animated.Text>
          <Animated.Text
            entering={FadeInUp.delay(460).duration(420)}
            style={styles.subtitle}
          >
            {t('paywall.celebration.subtitle', { defaultValue: 'Every opportunity is unlocked.' })}
          </Animated.Text>

          <Animated.View entering={FadeInUp.delay(600).duration(420)} style={styles.ctaWrap}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cta,
                { backgroundColor: accent, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>
                {t('paywall.celebration.cta', { defaultValue: "Let's go" })}
              </Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  badgeStack: {
    width: RAY_BOX,
    height: RAY_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  rays: {
    position: 'absolute',
    width: RAY_BOX,
    height: RAY_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: BADGE * 1.35,
    height: BADGE * 1.35,
    borderRadius: BADGE,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
  ctaWrap: {
    marginTop: 34,
    width: '100%',
    maxWidth: 320,
  },
  cta: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
