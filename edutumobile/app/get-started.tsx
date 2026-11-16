import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, BellRing, Check, ChevronRight, Sparkles, Target } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../components/context/ThemeContext';
import { EdutuLogo } from '../components/branding/EdutuLogo';
import { enterGuestMode } from '../lib/guestModeStore';
import {
  getOnboardingPalette,
  onboardingLayout,
  onboardingType,
} from '../components/onboarding/onboardingTokens';

/**
 * Get Started as a full route rather than the bottom sheet it used to be.
 * A sheet capped the content at roughly half the screen, which left no room to
 * say what an account actually buys you before asking for one.
 *
 * Unlike the slides, this screen sits on the app's own themed background
 * (`colors.background`) rather than a slide gradient: it is the handoff into
 * the product, so it should already look like the product.
 */
export default function GetStartedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');

  const palette = getOnboardingPalette(isDark);

  const handleGuest = useCallback(() => {
    // Preview mode: mark this visitor a guest and drop them into the app. Only
    // the home screen and opportunity detail are reachable — the (app) layout
    // raises the auth wall for anything else.
    enterGuestMode();
    router.replace('/(app)');
  }, [router]);

  // Tints mirror the slide each benefit came from, so the handoff still reads
  // as the same story told on the way in.
  const benefits = [
    {
      icon: Target,
      tint: isDark ? '#34D399' : '#059669',
      text: t('getStartedPage.benefitMatch', {
        defaultValue: 'Opportunities scored against your profile',
      }),
    },
    {
      icon: Sparkles,
      tint: isDark ? '#FBBF24' : '#D97706',
      text: t('getStartedPage.benefitCoach', {
        defaultValue: 'An AI coach for essays, CVs and interviews',
      }),
    },
    {
      icon: BellRing,
      tint: isDark ? '#FB7185' : '#E11D48',
      text: t('getStartedPage.benefitAlerts', {
        defaultValue: 'Deadline reminders so nothing slips past you',
      }),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={[styles.navRow, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('getStartedPage.back', { defaultValue: 'Back' })}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: palette.softBg, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <ArrowLeft color={colors.foreground} size={19} strokeWidth={2.3} />
        </Pressable>

        {/* Guest entry lives here now. As a bottom link under two buttons it
            read as a third CTA competing with sign-up; as Skip it reads as
            what it is — a way past this screen. */}
        <Pressable
          onPress={handleGuest}
          hitSlop={12}
          accessibilityRole="button"
          style={({ pressed }) => [styles.skipButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
            {t('slides.skip', { defaultValue: 'Skip' })}
          </Text>
          <ChevronRight color={colors.mutedForeground} size={16} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.header}>
          <LinearGradient
            colors={['#FFFFFF', '#EFF4FF']}
            style={[styles.mark, { shadowColor: palette.shadow }]}
          >
            <EdutuLogo size={46} frameless />
          </LinearGradient>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('getStartedPage.title', { defaultValue: 'Start where you are' })}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            {t('getStartedPage.subtitle', {
              defaultValue:
                'Create a free account and Edutu builds your feed around your goals, not everyone else’s.',
            })}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.benefits}>
          {benefits.map(({ icon: Icon, text, tint }) => (
            <View key={text} style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: `${tint}22` }]}>
                <Icon color={tint} size={17} strokeWidth={2.2} />
              </View>
              <Text style={[styles.benefitText, { color: colors.foreground }]}>{text}</Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeIn.delay(220)}
        style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}
      >
        <View style={styles.trustRow}>
          <View
            style={[
              styles.trustDot,
              { backgroundColor: isDark ? 'rgba(125,211,160,0.16)' : 'rgba(15,157,88,0.12)' },
            ]}
          >
            <Check color={isDark ? '#7DD3A0' : '#0F9D58'} size={11} strokeWidth={3.5} />
          </View>
          <Text style={[styles.trustText, { color: colors.mutedForeground }]}>
            {t('welcome.trustLine', { defaultValue: 'Free to start — no card needed' })}
          </Text>
        </View>

        <Pressable
          onPress={() => router.push('/(auth)/sign-up')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            },
          ]}
        >
          <Text style={[styles.primaryText, { color: '#FFFFFF' }]}>
            {t('welcome.createAccount', { defaultValue: 'Create account' })}
          </Text>
          <ArrowRight color="#FFFFFF" size={19} strokeWidth={2.4} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(auth)/sign-in')}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.secondary,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>
            {t('welcome.signIn', { defaultValue: 'Sign in' })}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: onboardingLayout.gutter,
    paddingBottom: 4,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    ...onboardingType.skip,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: onboardingLayout.gutter,
    paddingTop: 12,
  },
  header: {
    alignItems: 'flex-start',
  },
  mark: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    ...onboardingType.display,
  },
  body: {
    marginTop: 12,
    maxWidth: 340,
    ...onboardingType.body,
  },
  benefits: {
    marginTop: 34,
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actions: {
    paddingHorizontal: onboardingLayout.gutter,
    paddingTop: 10,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginBottom: 16,
  },
  trustDot: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  primary: {
    height: onboardingLayout.ctaHeight,
    borderRadius: onboardingLayout.ctaRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 8,
  },
  primaryText: {
    ...onboardingType.cta,
  },
  secondary: {
    height: onboardingLayout.ctaHeight,
    borderRadius: onboardingLayout.ctaRadius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  secondaryText: {
    ...onboardingType.cta,
  },
});
