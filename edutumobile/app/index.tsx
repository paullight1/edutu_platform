import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../components/context/ThemeContext';
import { useGuestMode } from '../lib/guestModeStore';

export default function SplashScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { colors, isDark } = useTheme();
  const { isGuest, hydrated: guestHydrated } = useGuestMode();

  const [text, setText] = useState('');
  const fullText = 'Edutu';
  const hasNavigated = useRef(false);

  useEffect(() => {
    let i = 0;
    const intervalId = setInterval(() => {
      setText(fullText.substring(0, i + 1));
      i++;
      if (i >= fullText.length) {
        clearInterval(intervalId);
      }
    }, 150);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isLoaded || !guestHydrated || hasNavigated.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (hasNavigated.current) {
        return;
      }

      hasNavigated.current = true;

      if (!isSignedIn) {
        // A returning guest goes straight into the (gated) app; everyone else
        // sees the welcome screen where they can sign up, sign in, or choose to
        // browse without an account.
        router.replace(isGuest ? '/(app)' : '/onboarding-welcome');
        return;
      }

      if (user && !user.unsafeMetadata?.onboardingComplete) {
        router.replace('/onboarding');
        return;
      }

      router.replace('/(app)');
    }, 1650);

    return () => clearTimeout(timeoutId);
  }, [isLoaded, guestHydrated, isGuest, isSignedIn, router, user]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <LinearGradient
        colors={isDark ? ['#020617', '#0F172A', '#111827'] : ['#F8FAFC', '#EEF2FF', '#FFFFFF']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.center}>
        <Text style={[styles.title, { color: colors.foreground }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
