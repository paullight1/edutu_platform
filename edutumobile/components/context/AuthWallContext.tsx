import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Animated, useAnimatedValue,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowRight,
  Bookmark,
  Send,
  Bot,
  Compass,
  Rocket,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from './ThemeContext';

/**
 * The reason a guest hit the wall — drives the headline/subtitle/icon so the
 * prompt speaks to what they were trying to do ("Ready to apply?" beats a
 * generic "Sign in").
 */
export type AuthWallReason = 'save' | 'apply' | 'ai' | 'browse' | 'default';

interface AuthWallContextValue {
  /** Raise the auth wall, optionally themed to what the guest tried to do. */
  promptAuth: (reason?: AuthWallReason) => void;
  hide: () => void;
}

const AuthWallContext = createContext<AuthWallContextValue | null>(null);

interface ReasonCopy {
  icon: LucideIcon;
  titleKey: string;
  titleDefault: string;
  bodyKey: string;
  bodyDefault: string;
}

const REASON_COPY: Record<AuthWallReason, ReasonCopy> = {
  save: {
    icon: Bookmark,
    titleKey: 'authWall.save.title',
    titleDefault: 'Save this opportunity',
    bodyKey: 'authWall.save.body',
    bodyDefault: 'Create a free account to save opportunities and pick up right where you left off.',
  },
  apply: {
    icon: Send,
    titleKey: 'authWall.apply.title',
    titleDefault: 'Ready to apply?',
    bodyKey: 'authWall.apply.body',
    bodyDefault: 'Sign up free to apply, track your applications, and get reminders before deadlines close.',
  },
  ai: {
    icon: Bot,
    titleKey: 'authWall.ai.title',
    titleDefault: 'Meet Edutu, your AI coach',
    bodyKey: 'authWall.ai.body',
    bodyDefault: 'Create a free account for personal guidance, roadmaps, and answers tailored to you.',
  },
  browse: {
    icon: Compass,
    titleKey: 'authWall.browse.title',
    titleDefault: 'Unlock the full Edutu',
    bodyKey: 'authWall.browse.body',
    bodyDefault: 'Create a free account for personalized opportunities, saved lists, roadmaps, and AI guidance.',
  },
  default: {
    icon: Rocket,
    titleKey: 'authWall.default.title',
    titleDefault: 'Create your free account',
    bodyKey: 'authWall.default.body',
    bodyDefault: 'Sign up to unlock everything Edutu can do for you — it only takes a moment.',
  },
};

function AuthWallSheet({
  visible,
  reason,
  onClose,
  onCreateAccount,
  onSignIn,
}: {
  visible: boolean;
  reason: AuthWallReason;
  onClose: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();

  // Keep the sheet mounted through its exit animation. Mounting happens via
  // adjust-during-render (React's documented alternative to a setState in the
  // effect); unmounting stays async in the exit animation's callback.
  const [rendered, setRendered] = useState(visible);
  if (visible && !rendered) setRendered(true);
  const anim = useAnimatedValue(0);

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, {
        toValue: 1,
        friction: 9,
        tension: 80,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible, anim]);

  if (!rendered) return null;

  const copy = REASON_COPY[reason] ?? REASON_COPY.default;
  const Icon = copy.icon;

  const primaryText = isDark ? '#F8FAFC' : '#141217';
  const mutedText = isDark ? 'rgba(248,250,252,0.66)' : '#6B6770';
  const surface = isDark ? '#14151B' : '#FFFFFF';
  const softButton = isDark ? '#24252B' : '#EFEDEF';
  const accent = colors.accent || '#4F46E5';

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('authWall.dismiss', { defaultValue: 'Dismiss' })} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: surface,
              paddingBottom: Math.max(insets.bottom, 18) + 10,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={[styles.sheetIcon, { backgroundColor: `${accent}1A` }]}>
              <Icon color={accent} size={30} strokeWidth={2.2} />
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: softButton }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('authWall.dismiss', { defaultValue: 'Dismiss' })}
            >
              <X color={primaryText} size={20} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: primaryText }]}>
            {t(copy.titleKey, { defaultValue: copy.titleDefault })}
          </Text>
          <Text style={[styles.body, { color: mutedText }]}>
            {t(copy.bodyKey, { defaultValue: copy.bodyDefault })}
          </Text>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: accent }]}
            onPress={onCreateAccount}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>
              {t('authWall.createAccount', { defaultValue: 'Create free account' })}
            </Text>
            <ArrowRight color="#FFFFFF" size={20} />
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { backgroundColor: softButton }]}
            onPress={onSignIn}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: primaryText }]}>
              {t('authWall.signIn', { defaultValue: 'I already have an account' })}
            </Text>
          </Pressable>

          <Pressable style={styles.ghostButton} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.ghostText, { color: mutedText }]}>
              {t('authWall.keepBrowsing', { defaultValue: 'Keep browsing' })}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function AuthWallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<AuthWallReason>('default');

  const promptAuth = useCallback((nextReason: AuthWallReason = 'default') => {
    setReason(nextReason);
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  const goTo = useCallback(
    (path: '/(auth)/sign-up' | '/(auth)/sign-in') => {
      setVisible(false);
      router.push(path as never);
    },
    [router],
  );

  const value = useMemo(() => ({ promptAuth, hide }), [promptAuth, hide]);

  return (
    <AuthWallContext.Provider value={value}>
      {children}
      <AuthWallSheet
        visible={visible}
        reason={reason}
        onClose={hide}
        onCreateAccount={() => goTo('/(auth)/sign-up')}
        onSignIn={() => goTo('/(auth)/sign-in')}
      />
    </AuthWallContext.Provider>
  );
}

/**
 * Access the auth wall. Returns null when no provider is mounted so callers can
 * fall back safely (they simply won't prompt) — never throws.
 */
export function useAuthWall(): AuthWallContextValue | null {
  return useContext(AuthWallContext);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    marginHorizontal: 10,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    paddingHorizontal: 26,
    paddingTop: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  sheetIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  primaryButton: {
    height: 60,
    borderRadius: 16,
    marginTop: 26,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 58,
    borderRadius: 16,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
  ghostButton: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
