import { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, BriefcaseBusiness, GraduationCap, Landmark, Plane, Sparkles, type LucideIcon } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../components/context/ThemeContext';
import { EdutuLogo } from '../components/branding/EdutuLogo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DISPLAY_FONT = Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: undefined });

function OrbitingProgramIcon({
  icon: Icon,
  size,
  radius,
  phase,
  speed = 22000,
  color,
}: {
  icon: LucideIcon;
  size: number;
  radius: number;
  phase: number;
  speed?: number;
  color: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(Math.PI * 2, {
        duration: speed,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      false
    );
  }, [progress, speed]);

  const animatedStyle = useAnimatedStyle(() => {
    const angle = progress.value + phase;
    const bounce = Math.sin(progress.value * 2 + phase) * 7;

    return {
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius + bounce },
        { scale: 1 + Math.sin(progress.value + phase) * 0.035 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.programIcon,
        {
          width: size,
          height: size,
          left: SCREEN_WIDTH / 2 - size / 2,
          top: SCREEN_WIDTH * 0.57 - size / 2,
        },
        animatedStyle,
      ]}
    >
      <Icon color={color} size={Math.round(size * 0.64)} strokeWidth={2.25} />
    </Animated.View>
  );
}

function OrbitalHero() {
  const { isDark } = useTheme();
  const ringColor = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.86)';

  return (
    <View style={styles.heroStage}>
      <View style={[styles.orbitRing, styles.orbitRingOuter, { borderColor: ringColor }]} />
      <View style={[styles.orbitRing, styles.orbitRingMiddle, { borderColor: ringColor }]} />
      <View style={[styles.orbitRing, styles.orbitRingInner, { borderColor: ringColor }]} />

      <LinearGradient colors={['#FFFFFF', '#F7FBFF']} style={styles.centerLogo}>
        <EdutuLogo size={62} frameless />
      </LinearGradient>

      <OrbitingProgramIcon
        icon={GraduationCap}
        size={64}
        radius={SCREEN_WIDTH * 0.31}
        phase={0.2}
        color={isDark ? '#93C5FD' : '#2563EB'}
      />
      <OrbitingProgramIcon
        icon={Plane}
        size={58}
        radius={SCREEN_WIDTH * 0.27}
        phase={1.7}
        speed={26000}
        color={isDark ? '#F9A8D4' : '#DB2777'}
      />
      <OrbitingProgramIcon
        icon={Landmark}
        size={60}
        radius={SCREEN_WIDTH * 0.33}
        phase={3.05}
        speed={24000}
        color={isDark ? '#FCD34D' : '#B45309'}
      />
      <OrbitingProgramIcon
        icon={BriefcaseBusiness}
        size={56}
        radius={SCREEN_WIDTH * 0.24}
        phase={4.4}
        speed={28000}
        color={isDark ? '#86EFAC' : '#059669'}
      />

    </View>
  );
}

export default function OnboardingWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);

  const primaryTextColor = isDark ? '#F8FAFC' : '#141217';
  const mutedTextColor = isDark ? 'rgba(248,250,252,0.66)' : '#858189';
  const surfaceColor = isDark ? '#111217' : '#FFFFFF';
  const softButtonColor = isDark ? '#24252B' : '#EFEDEF';
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={
          isDark
            ? ['#0B1120', '#271B2E', '#101827', '#05070B']
            : ['#DCEFFA', '#F8E6DD', '#F9EEF7', '#FFFFFF']
        }
        locations={[0, 0.38, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.mainContent, { paddingTop: insets.top + 44 }]}>
        <OrbitalHero />

        <View style={styles.copy}>
          <Text style={[styles.title, { color: primaryTextColor }]}>Find real opportunities</Text>
          <Text style={[styles.helperLine, { color: mutedTextColor }]}>
            Scholarships, jobs, and schools matched to you.
          </Text>
        </View>

        <Pressable
          style={[
            styles.getStartedButton,
            {
              backgroundColor: isDark ? '#F8FAFC' : '#151316',
              marginBottom: insets.bottom + 20,
            },
          ]}
          onPress={() => setSheetOpen(true)}
        >
          <Text style={[styles.getStartedText, { color: isDark ? '#111217' : '#FFFFFF' }]}>
            Get Started
          </Text>
        </Pressable>
      </View>

      {sheetOpen ? (
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetOpen(false)} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: surfaceColor,
                paddingBottom: Math.max(insets.bottom, 18) + 10,
              },
            ]}
          >
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: softButtonColor }]}>
                <Sparkles color={primaryTextColor} size={34} fill={primaryTextColor} />
              </View>
            </View>

            <Text style={[styles.sheetTitle, { color: primaryTextColor }]}>Get Started</Text>
            <Text style={[styles.sheetDescription, { color: mutedTextColor }]}>
              Scholarships, schools, grants, and jobs in one focused feed.
            </Text>

            <Pressable
              style={[styles.sheetPrimaryButton, { backgroundColor: isDark ? '#F8FAFC' : '#151316' }]}
              onPress={() => router.push('/(auth)/sign-up')}
            >
              <Text style={[styles.sheetPrimaryText, { color: isDark ? '#111217' : '#FFFFFF' }]}>
                Create account
              </Text>
              <ArrowRight color={isDark ? '#111217' : '#FFFFFF'} size={22} />
            </Pressable>

            <Pressable
              style={[styles.sheetSecondaryButton, { backgroundColor: softButtonColor }]}
              onPress={() => router.push('/(auth)/sign-in')}
            >
              <Text style={[styles.sheetSecondaryText, { color: primaryTextColor }]}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  heroStage: {
    height: SCREEN_WIDTH * 1.02,
    marginHorizontal: -24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  orbitRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  orbitRingOuter: {
    width: SCREEN_WIDTH * 1.04,
    height: SCREEN_WIDTH * 1.04,
    borderRadius: SCREEN_WIDTH * 0.52,
    top: SCREEN_WIDTH * 0.02,
    left: -SCREEN_WIDTH * 0.02,
  },
  orbitRingMiddle: {
    width: SCREEN_WIDTH * 0.76,
    height: SCREEN_WIDTH * 0.76,
    borderRadius: SCREEN_WIDTH * 0.38,
    top: SCREEN_WIDTH * 0.16,
    left: SCREEN_WIDTH * 0.12,
  },
  orbitRingInner: {
    width: SCREEN_WIDTH * 0.46,
    height: SCREEN_WIDTH * 0.46,
    borderRadius: SCREEN_WIDTH * 0.23,
    top: SCREEN_WIDTH * 0.31,
    left: SCREEN_WIDTH * 0.27,
  },
  centerLogo: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SCREEN_WIDTH * 0.02,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 14,
  },
  programIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    marginTop: -22,
  },
  title: {
    maxWidth: 320,
    fontFamily: DISPLAY_FONT,
    fontSize: 33,
    lineHeight: 38,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0,
  },
  helperLine: {
    marginTop: 10,
    maxWidth: 272,
    fontFamily: DISPLAY_FONT,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
  },
  getStartedButton: {
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 8,
  },
  getStartedText: {
    fontFamily: DISPLAY_FONT,
    fontSize: 19,
    fontWeight: '800',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  sheet: {
    marginHorizontal: 10,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingHorizontal: 28,
    paddingTop: 42,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 44,
  },
  sheetIcon: {
    width: 72,
    height: 72,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
  },
  sheetDescription: {
    marginTop: 16,
    fontSize: 21,
    lineHeight: 31,
    fontWeight: '500',
  },
  sheetPrimaryButton: {
    height: 68,
    borderRadius: 16,
    marginTop: 34,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: {
    fontSize: 22,
    fontWeight: '800',
  },
  sheetSecondaryButton: {
    height: 68,
    borderRadius: 16,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: {
    fontSize: 21,
    fontWeight: '800',
  },
});
