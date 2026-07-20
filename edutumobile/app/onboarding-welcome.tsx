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
import { ArrowRight, BriefcaseBusiness, Check, GraduationCap, Landmark, Plane, Rocket, type LucideIcon } from 'lucide-react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/context/ThemeContext';
import { EdutuLogo } from '../components/branding/EdutuLogo';
import { enterGuestMode } from '../lib/guestModeStore';

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
  const { t } = useTranslation('auth');
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleContinueWithoutLogin = () => {
    // Preview mode: mark this visitor a guest and drop them into the app. Only
    // the home screen and opportunity detail are reachable — the (app) layout
    // raises the auth wall for anything else.
    enterGuestMode();
    router.replace('/(app)');
  };

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
          <Text style={[styles.title, { color: primaryTextColor, fontWeight: isDark ? '800' : '700' }]}>{t('welcome.title')}</Text>
          <Text style={[styles.helperLine, { color: mutedTextColor }]}>
            {t('welcome.subtitle')}
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
            {t('welcome.getStarted')}
          </Text>
        </Pressable>
      </View>

      {sheetOpen ? (
        <Animated.View
          style={styles.sheetOverlay}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(160)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetOpen(false)} />
          <Animated.View
            entering={SlideInDown.springify().damping(20).stiffness(200).mass(0.9)}
            exiting={SlideOutDown.duration(200)}
            style={[
              styles.sheet,
              {
                backgroundColor: surfaceColor,
                paddingBottom: Math.max(insets.bottom, 18) + 10,
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: isDark ? 'rgba(248,250,252,0.16)' : 'rgba(20,18,23,0.14)' }]} />

            <View style={styles.sheetHeader}>
              <LinearGradient
                colors={['#2E7BF6', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sheetIcon}
              >
                <Rocket color="#FFFFFF" size={32} fill="#FFFFFF" />
              </LinearGradient>
            </View>

            <Text style={[styles.sheetTitle, { color: primaryTextColor }]}>{t('welcome.getStarted')}</Text>
            <Text style={[styles.sheetDescription, { color: mutedTextColor }]}>
              {t('welcome.sheetDescription')}
            </Text>

            <View style={styles.trustRow}>
              <View style={[styles.trustDot, { backgroundColor: isDark ? 'rgba(52,211,153,0.16)' : 'rgba(5,150,105,0.12)' }]}>
                <Check color={isDark ? '#34D399' : '#059669'} size={13} strokeWidth={3} />
              </View>
              <Text style={[styles.trustText, { color: mutedTextColor }]}>
                {t('welcome.trustLine', { defaultValue: 'Free to start — no card needed' })}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.sheetPrimaryButton,
                { backgroundColor: isDark ? '#F8FAFC' : '#151316', opacity: pressed ? 0.9 : 1 },
              ]}
              onPress={() => router.push('/(auth)/sign-up')}
            >
              <Text style={[styles.sheetPrimaryText, { color: isDark ? '#111217' : '#FFFFFF' }]}>
                {t('welcome.createAccount')}
              </Text>
              <ArrowRight color={isDark ? '#111217' : '#FFFFFF'} size={22} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.sheetSecondaryButton,
                { backgroundColor: softButtonColor, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => router.push('/(auth)/sign-in')}
            >
              <Text style={[styles.sheetSecondaryText, { color: primaryTextColor }]}>
                {t('welcome.signIn')}
              </Text>
            </Pressable>

            <Pressable
              style={styles.sheetGuestButton}
              onPress={handleContinueWithoutLogin}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetGuestText, { color: mutedTextColor }]}>
                {t('welcome.continueWithoutLogin', { defaultValue: 'Continue without login' })}
              </Text>
              <ArrowRight color={mutedTextColor} size={16} />
            </Pressable>
          </Animated.View>
        </Animated.View>
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
    paddingTop: 14,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 22,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  sheetIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  sheetTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  sheetDescription: {
    marginTop: 12,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '500',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  trustDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sheetPrimaryButton: {
    height: 66,
    borderRadius: 18,
    marginTop: 24,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryText: {
    fontSize: 22,
    fontWeight: '600',
  },
  sheetSecondaryButton: {
    height: 66,
    borderRadius: 18,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSecondaryText: {
    fontSize: 20,
    fontWeight: '600',
  },
  sheetGuestButton: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  sheetGuestText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
