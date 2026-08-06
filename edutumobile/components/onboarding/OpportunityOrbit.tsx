import { useEffect, type ReactNode } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import {
  Award,
  BriefcaseBusiness,
  FlaskConical,
  Globe2,
  GraduationCap,
  HandCoins,
  Landmark,
  Plane,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Glow } from './Glow';
import type { OnboardingPalette } from './onboardingTokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STAGE = Math.min(SCREEN_WIDTH, 430);

const CHIP = 46;

/**
 * Two orbital planes, sized so nothing can ever touch anything else:
 *
 *   inner x-radius 82  → leaves the centre open (chip half is 23)
 *   outer x-radius 148 → 66pt clear of the inner plane
 *   outer extent 148+23 = 171 < 177, the slide's half-width, so no clipping
 *
 * Four icons per plane sit 90° apart, and the shortest chord at the inner
 * radius is ~116pt — far wider than a chip. The planes counter-rotate at
 * different speeds, but because they never overlap radially, no phase of the
 * animation can bring two chips into contact.
 */
const PLANES: {
  rx: number;
  ry: number;
  duration: number;
  direction: 1 | -1;
  iconSize: number;
  marks: { icon: LucideIcon; color: string; tint: string }[];
}[] = [
  {
    rx: 82,
    ry: 66,
    duration: 26000,
    direction: -1,
    iconSize: 20,
    marks: [
      { icon: Award, color: '#A78BFA', tint: 'rgba(167,139,250,0.18)' },
      { icon: Globe2, color: '#38BDF8', tint: 'rgba(56,189,248,0.18)' },
      { icon: HandCoins, color: '#FB923C', tint: 'rgba(251,146,60,0.18)' },
      { icon: FlaskConical, color: '#22D3EE', tint: 'rgba(34,211,238,0.18)' },
    ],
  },
  {
    rx: 148,
    ry: 118,
    duration: 38000,
    direction: 1,
    iconSize: 23,
    marks: [
      { icon: GraduationCap, color: '#60A5FA', tint: 'rgba(96,165,250,0.18)' },
      { icon: BriefcaseBusiness, color: '#34D399', tint: 'rgba(52,211,153,0.18)' },
      { icon: Plane, color: '#F472B6', tint: 'rgba(244,114,182,0.18)' },
      { icon: Landmark, color: '#FBBF24', tint: 'rgba(251,191,36,0.18)' },
    ],
  },
];

/**
 * One chip riding a plane. Every chip on a plane reads the same `clock`, so
 * they hold formation forever — giving each icon its own timer (an earlier
 * approach) let the ring visibly fall apart within seconds.
 *
 * Only translation is animated, never rotation, so icons stay upright.
 */
function OrbitChip({
  clock,
  rx,
  ry,
  phase,
  direction,
  fill,
  border,
  glow,
  children,
}: {
  clock: SharedValue<number>;
  rx: number;
  ry: number;
  phase: number;
  direction: 1 | -1;
  fill: string;
  border: string;
  glow: string;
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const angle = clock.value * Math.PI * 2 * direction + phase;
    return {
      transform: [
        { translateX: Math.cos(angle) * rx },
        { translateY: Math.sin(angle) * ry },
      ],
    };
  });

  return (
    <Animated.View style={[styles.chipAnchor, animatedStyle]}>
      <View style={[styles.chip, { backgroundColor: fill, borderColor: border, shadowColor: glow }]}>
        {children}
      </View>
    </Animated.View>
  );
}

/**
 * Slide 1 hero: the Edutu mark at the centre of two counter-rotating planes of
 * what the app surfaces — scholarships, jobs, exchanges, grants, research,
 * fellowships, funding and programmes worldwide.
 */
export function OpportunityOrbit({ palette }: { palette: OnboardingPalette; isDark: boolean }) {
  const innerClock = useSharedValue(0);
  const outerClock = useSharedValue(0);
  const pulse = useSharedValue(0);

  const clocks = [innerClock, outerClock];

  useEffect(() => {
    // withRepeat resumes from the current value, so a remount that left these
    // at 1 would animate 1→1 and the orbits would freeze.
    innerClock.value = 0;
    outerClock.value = 0;
    pulse.value = 0;

    innerClock.value = withRepeat(
      withTiming(1, { duration: PLANES[0].duration, easing: Easing.linear }),
      -1,
      false
    );
    outerClock.value = withRepeat(
      withTiming(1, { duration: PLANES[1].duration, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [innerClock, outerClock, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.3,
    transform: [{ scale: 0.94 + pulse.value * 0.12 }],
  }));

  return (
    <View style={styles.stage}>
      {PLANES.map((plane, planeIndex) => (
        <View
          key={`ring-${planeIndex}`}
          style={[
            styles.ring,
            {
              width: plane.rx * 2,
              height: plane.ry * 2,
              borderRadius: plane.rx,
              borderColor: palette.ring,
            },
          ]}
        />
      ))}

      <Animated.View style={[styles.halo, haloStyle]}>
        <Glow size={STAGE * 0.62} color="#60A5FA" intensity={0.4} />
      </Animated.View>

      {PLANES.map((plane, planeIndex) =>
        plane.marks.map(({ icon: Icon, color, tint }, index) => (
          <OrbitChip
            key={`${planeIndex}-${index}`}
            clock={clocks[planeIndex]}
            rx={plane.rx}
            ry={plane.ry}
            direction={plane.direction}
            phase={(Math.PI * 2 * index) / plane.marks.length}
            fill={tint}
            border={`${color}44`}
            glow={color}
          >
            <Icon color={color} size={plane.iconSize} strokeWidth={2.2} />
          </OrbitChip>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    height: STAGE * 0.94,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  halo: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipAnchor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    width: CHIP,
    height: CHIP,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
});
