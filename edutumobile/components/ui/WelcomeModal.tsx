import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { ArrowRight, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { useGuestMode } from '../../lib/guestModeStore';
import { setWelcomeModalActive } from '../../lib/welcomeModalStore';
import { WelcomeIllustration, type WelcomeVariant } from './WelcomeIllustration';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 44, 384);

// Bump the version to re-show the greeting to everyone (e.g. after a redesign).
const STORAGE_PREFIX = 'edutu:welcome-modal:v1';
// Accounts created within this window are treated as brand-new sign-ups so
// they get the celebratory copy rather than "welcome back".
const NEW_ACCOUNT_WINDOW_MS = 20 * 60 * 1000;
// Let the home screen paint before the greeting springs in.
const SHOW_DELAY_MS = 850;

type Resolved = { variant: WelcomeVariant; storageKey: string } | null;

const DEFAULT_COPY: Record<
  WelcomeVariant,
  { title: string; body: string; primary: string; secondary: string }
> = {
  new: {
    title: 'Welcome to Edutu{{suffix}}',
    body: "Your feed of scholarships, schools, grants and jobs is ready. Let's find your first opportunity.",
    primary: 'Explore opportunities',
    secondary: 'Maybe later',
  },
  returning: {
    title: 'Welcome back{{suffix}}',
    body: 'Fresh scholarships, grants and roles have landed since your last visit — picked for you.',
    primary: 'Jump back in',
    secondary: 'Dismiss',
  },
  guest: {
    title: 'Welcome to Edutu',
    body: 'Browse scholarships, schools, grants and jobs freely. Create a free account whenever you want to save and personalize your feed.',
    primary: 'Start exploring',
    secondary: 'Create free account',
  },
};

/**
 * First-run greeting. Shows exactly once per audience, ever:
 *   • new       — a signed-in user whose account was created moments ago
 *   • returning — a signed-in user on their first launch on this device
 *   • guest     — a visitor browsing without an account
 *
 * Self-gates on Clerk + guest state + a per-audience AsyncStorage flag, and
 * raises {@link setWelcomeModalActive} while visible so the nav coach-marks and
 * the Pro promo hold until it's dismissed.
 */
export function WelcomeModal() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('home');
  const { user, isLoaded } = useUser();
  const { isGuest, hydrated: guestHydrated } = useGuestMode();

  const [resolved, setResolved] = useState<Resolved>(null);
  const [visible, setVisible] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !isLoaded || !guestHydrated) return;

    // Work out which greeting (if any) this visitor should see.
    let target: Resolved = null;
    if (isGuest) {
      target = { variant: 'guest', storageKey: `${STORAGE_PREFIX}:guest` };
    } else if (user?.id) {
      const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : 0;
      const isNew = createdAt > 0 && Date.now() - createdAt < NEW_ACCOUNT_WINDOW_MS;
      target = {
        variant: isNew ? 'new' : 'returning',
        storageKey: `${STORAGE_PREFIX}:user:${user.id}`,
      };
    }

    if (!target) return;
    decided.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(target.storageKey);
        if (seen || cancelled) return;
      } catch {
        // Storage unavailable — greet once this session rather than never.
      }
      if (cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        setResolved(target);
        setVisible(true);
        setWelcomeModalActive(true);
      }, SHOW_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isLoaded, guestHydrated, isGuest, user?.id, user?.createdAt]);

  const dismiss = useCallback(() => {
    setVisible(false);
    setWelcomeModalActive(false);
    if (resolved) void AsyncStorage.setItem(resolved.storageKey, String(Date.now()));
  }, [resolved]);

  const onSecondary = useCallback(() => {
    dismiss();
    if (resolved?.variant === 'guest') {
      router.push('/(auth)/sign-up');
    }
  }, [dismiss, resolved, router]);

  useEffect(() => () => setWelcomeModalActive(false), []);

  if (!resolved || !visible) return null;

  const name = user?.firstName?.trim() || '';
  const suffix = name ? `, ${name}!` : '!';
  const copy = DEFAULT_COPY[resolved.variant];
  const title = t(`welcomeModal.${resolved.variant}.title`, {
    defaultValue: copy.title,
    suffix,
  });
  const body = t(`welcomeModal.${resolved.variant}.body`, { defaultValue: copy.body });
  const primaryLabel = t(`welcomeModal.${resolved.variant}.primary`, { defaultValue: copy.primary });
  const secondaryLabel = t(`welcomeModal.${resolved.variant}.secondary`, {
    defaultValue: copy.secondary,
  });

  const cardBg = isDark ? '#14161C' : '#FFFFFF';
  const bodyColor = isDark ? '#A9B2C3' : '#5B6472';
  const softBtnBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)';

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={dismiss}>
      <Animated.View entering={FadeIn.duration(220)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityElementsHidden />

        <Animated.View
          entering={FadeInUp.springify().damping(18).mass(0.9)}
          style={[styles.card, { width: CARD_WIDTH, backgroundColor: cardBg }]}
          accessibilityViewIsModal
        >
          <Pressable
            onPress={dismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: softBtnBg }]}
          >
            <X size={18} color={bodyColor} strokeWidth={2.4} />
          </Pressable>

          <View style={styles.illustrationWrap}>
            <WelcomeIllustration variant={resolved.variant} accent={colors.accent} isDark={isDark} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.body, { color: bodyColor }]}>{body}</Text>

          <Pressable
            onPress={dismiss}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
            <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>

          <Pressable
            onPress={onSecondary}
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryBtn, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.secondaryText, { color: bodyColor }]}>{secondaryLabel}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(2,6,23,0.58)',
  },
  card: {
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 20,
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  illustrationWrap: {
    marginTop: 6,
    marginBottom: 4,
  },
  title: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    maxWidth: 300,
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 310,
  },
  primaryBtn: {
    marginTop: 22,
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 6,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
