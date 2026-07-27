import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth, useUser } from '@clerk/clerk-expo';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../components/context/ThemeContext';
import { useGuestMode } from '../lib/guestModeStore';
import { EdutuLogo } from '../components/branding/EdutuLogo';
import { getOnboardingPalette } from '../components/onboarding/onboardingTokens';

/**
 * Splash. Previously this typed out the word "Edutu" one letter at a time on a
 * 1.65s fixed timer — the animation, not auth, set how long every launch took.
 * Now it shows the mark, and holds only long enough to avoid a flash (700ms)
 * before routing as soon as Clerk and the guest store have settled.
 */
const MIN_VISIBLE_MS = 700;

export default function SplashScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { isDark } = useTheme();
  const { isGuest, hydrated: guestHydrated } = useGuestMode();

  const hasNavigated = useRef(false);
  // Stamped on mount rather than during render: Date.now() is impure, and the
  // React Compiler lint rejects impure calls in the render body.
  const mountedAt = useRef(0);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  const palette = getOnboardingPalette(isDark);

  useEffect(() => {
    mountedAt.current = Date.now();
    opacity.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) });
    scale.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) });
  }, [opacity, scale]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    if (!isLoaded || !guestHydrated || hasNavigated.current) {
      return;
    }

    // Hold the mark for the remainder of the minimum window only — a warm start
    // where auth is already resolved no longer waits out a full fixed delay.
    const elapsed = Date.now() - mountedAt.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);

    const timeoutId = setTimeout(() => {
      if (hasNavigated.current) {
        return;
      }

      hasNavigated.current = true;

      if (!isSignedIn) {
        // A returning guest goes straight into the (gated) app; everyone else
        // sees the onboarding slides, which end at the Get Started page.
        router.replace(isGuest ? '/(app)' : '/onboarding-welcome');
        return;
      }

      if (user && !user.unsafeMetadata?.onboardingComplete) {
        router.replace('/onboarding');
        return;
      }

      router.replace('/(app)');
    }, remaining);

    return () => clearTimeout(timeoutId);
  }, [isLoaded, guestHydrated, isGuest, isSignedIn, router, user]);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#08090D' : '#FAFAFA' }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <Animated.View style={markStyle}>
        <View
          style={[
            styles.mark,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
              borderColor: palette.glassBorder,
              shadowColor: palette.shadow,
            },
          ]}
        >
          <EdutuLogo size={72} frameless />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mark: {
    width: 112,
    height: 112,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 30,
    elevation: 10,
  },
});
