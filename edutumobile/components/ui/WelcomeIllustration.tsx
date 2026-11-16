import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BriefcaseBusiness,
  Compass,
  GraduationCap,
  Landmark,
  MapPin,
  Plane,
  Star,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { EdutuLogo } from '../branding/EdutuLogo';

export type WelcomeVariant = 'new' | 'returning' | 'guest';

const STAGE = 168;
const CENTER = STAGE / 2;

// Shared vibrant program palette, echoing the onboarding orbital hero so the
// greeting feels like the same world.
const PROGRAM_COLORS = {
  blue: '#3B82F6',
  pink: '#EC4899',
  amber: '#D97706',
  green: '#10B981',
};

type IllustrationProps = {
  variant: WelcomeVariant;
  accent: string;
  isDark: boolean;
};

export function WelcomeIllustration({ variant, accent, isDark }: IllustrationProps) {
  return (
    <View style={styles.stage} pointerEvents="none">
      <HaloRings accent={accent} isDark={isDark} variant={variant} />
      {variant === 'new' ? <CelebrateScene accent={accent} /> : null}
      {variant === 'returning' ? <ReturningScene /> : null}
      {variant === 'guest' ? <ExploreScene accent={accent} isDark={isDark} /> : null}
    </View>
  );
}

/* ── Shared: soft pulsing halo behind every scene ─────────────────────────── */

function HaloRings({
  accent,
  isDark,
  variant,
}: {
  accent: string;
  isDark: boolean;
  variant: WelcomeVariant;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse, reduced]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.92, 1.06]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.5, 0.85]),
  }));

  const tint = variant === 'new' ? accent : variant === 'guest' ? accent : PROGRAM_COLORS.blue;
  const ringColor = isDark ? withAlpha(tint, 0.22) : withAlpha(tint, 0.16);
  const glowColor = isDark ? withAlpha(tint, 0.16) : withAlpha(tint, 0.12);

  return (
    <>
      <Animated.View style={[styles.glow, { backgroundColor: glowColor }, ringStyle]} />
      <View style={[styles.ring, styles.ringOuter, { borderColor: ringColor }]} />
      <View style={[styles.ring, styles.ringInner, { borderColor: ringColor }]} />
    </>
  );
}

/* ── NEW: logo pops in with a burst of sparkles ───────────────────────────── */

function CelebrateScene({ accent }: { accent: string }) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    pop.value = withSequence(
      withTiming(1.12, { duration: 420, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 240, easing: Easing.out(Easing.quad) }),
    );
  }, [pop, reduced]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: interpolate(pop.value, [0, 0.4, 1], [0, 1, 1]),
  }));

  // Ten sparkles on an even ring, staggered so the burst reads as a loop.
  const sparks = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 10;
    const color = i % 2 === 0 ? accent : PROGRAM_COLORS.amber;
    return { angle, delay: (i % 5) * 160, color, key: i };
  });

  return (
    <>
      {sparks.map((s) => (
        <Spark key={s.key} angle={s.angle} delay={s.delay} color={s.color} reduced={reduced} />
      ))}
      <Animated.View style={[styles.centerNode, logoStyle]}>
        <EdutuLogo size={54} frameless />
      </Animated.View>
    </>
  );
}

function Spark({
  angle,
  delay,
  color,
  reduced,
}: {
  angle: number;
  delay: number;
  color: string;
  reduced: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      t.value = 0.6; // settled mid-flight for the static frame
      return;
    }
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1900, easing: Easing.out(Easing.quad) }), -1, false),
    );
  }, [t, delay, reduced]);

  const style = useAnimatedStyle(() => {
    const radius = interpolate(t.value, [0, 1], [16, 64]);
    const opacity = interpolate(t.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0]);
    const scale = interpolate(t.value, [0, 0.3, 1], [0.3, 1, 0.5]);
    return {
      opacity,
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
        { scale },
      ],
    };
  });

  return (
    <Animated.View style={[styles.spark, style]}>
      <Star size={16} color={color} fill={color} strokeWidth={0} />
    </Animated.View>
  );
}

/* ── RETURNING: program chips orbit and gently settle around the logo ─────── */

function ReturningScene() {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    spin.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 16000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spin, reduced]);

  const chips: { icon: LucideIcon; color: string; phase: number }[] = [
    { icon: GraduationCap, color: PROGRAM_COLORS.blue, phase: 0 },
    { icon: BriefcaseBusiness, color: PROGRAM_COLORS.green, phase: Math.PI / 2 },
    { icon: Landmark, color: PROGRAM_COLORS.amber, phase: Math.PI },
    { icon: Plane, color: PROGRAM_COLORS.pink, phase: (3 * Math.PI) / 2 },
  ];

  return (
    <>
      {chips.map((c, i) => (
        <OrbitChip key={i} icon={c.icon} color={c.color} phase={c.phase} spin={spin} reduced={reduced} />
      ))}
      <View style={styles.centerNode}>
        <EdutuLogo size={48} frameless />
      </View>
    </>
  );
}

function OrbitChip({
  icon: Icon,
  color,
  phase,
  spin,
  reduced,
}: {
  icon: LucideIcon;
  color: string;
  phase: number;
  spin: SharedValue<number>;
  reduced: boolean;
}) {
  const radius = 58;
  const style = useAnimatedStyle(() => {
    const angle = spin.value + phase;
    const bob = reduced ? 0 : Math.sin(spin.value * 2 + phase) * 4;
    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius + bob },
      ],
    };
  });

  return (
    <Animated.View style={[styles.chip, { backgroundColor: withAlpha(color, 0.14) }, style]}>
      <Icon size={22} color={color} strokeWidth={2.2} />
    </Animated.View>
  );
}

/* ── GUEST: a compass needle sweeps while pins drop in around the ring ─────── */

function ExploreScene({ accent, isDark }: { accent: string; isDark: boolean }) {
  const reduced = useReducedMotion();
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    sweep.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
  }, [sweep, reduced]);

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(sweep.value, [0, 1], [-42, 42])}deg` }],
  }));

  const pins = [
    { angle: -Math.PI / 2, delay: 0 },
    { angle: Math.PI / 6, delay: 500 },
    { angle: (5 * Math.PI) / 6, delay: 1000 },
  ];

  return (
    <>
      {pins.map((p, i) => (
        <Pin key={i} angle={p.angle} delay={p.delay} accent={accent} reduced={reduced} />
      ))}
      <Animated.View style={[styles.needle, { backgroundColor: accent }, needleStyle]} />
      <View style={[styles.centerNode, styles.compassNode, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
        <Compass size={34} color={accent} strokeWidth={2.2} />
      </View>
    </>
  );
}

function Pin({
  angle,
  delay,
  accent,
  reduced,
}: {
  angle: number;
  delay: number;
  accent: string;
  reduced: boolean;
}) {
  const drop = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    drop.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 520, easing: Easing.out(Easing.back(2)) }),
          withDelay(1600, withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) })),
        ),
        -1,
        false,
      ),
    );
  }, [drop, delay, reduced]);

  const radius = 62;
  const style = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateX: Math.cos(angle) * radius },
      { translateY: Math.sin(angle) * radius },
      { scale: interpolate(drop.value, [0, 1], [0.4, 1]) },
    ],
  }));

  return (
    <Animated.View style={[styles.pin, style]}>
      <MapPin size={20} color={accent} fill={withAlpha(accent, 0.28)} strokeWidth={2.2} />
    </Animated.View>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: STAGE * 0.82,
    height: STAGE * 0.82,
    borderRadius: STAGE,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: STAGE,
  },
  ringOuter: {
    width: STAGE * 0.92,
    height: STAGE * 0.92,
  },
  ringInner: {
    width: STAGE * 0.6,
    height: STAGE * 0.6,
  },
  centerNode: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassNode: {
    width: 62,
    height: 62,
    borderRadius: 31,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
  spark: {
    position: 'absolute',
    left: CENTER - 8,
    top: CENTER - 8,
  },
  chip: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needle: {
    position: 'absolute',
    width: 4,
    height: 74,
    borderRadius: 2,
  },
  pin: {
    position: 'absolute',
    left: CENTER - 10,
    top: CENTER - 10,
  },
});
