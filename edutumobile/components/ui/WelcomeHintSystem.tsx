import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Compass, Home, MessageCircle, ShoppingBag, UserCircle } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_PREFIX = 'edutu:welcome-hints:v1';

type HintFocus = 'homeContent' | 'bell' | 'homeTab' | 'discoverTab' | 'planTab' | 'ai' | 'profileTab';

interface HintStep {
  id: string;
  title: string;
  body: string;
  footer: string;
  focus: HintFocus;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
}

interface WelcomeHintSystemProps {
  userId?: string | null;
  enabled: boolean;
  isDark: boolean;
  onComplete?: () => void;
}

const STEPS: HintStep[] = [
  {
    id: 'home',
    title: 'Home',
    body: 'Start here for featured opportunities and your most relevant recommendations.',
    footer: 'Use Home as your daily overview.',
    focus: 'homeContent',
    icon: Home,
  },
  {
    id: 'discover',
    title: 'Discover',
    body: 'Search scholarships, jobs, grants, and programs.',
    footer: 'Save strong matches.',
    focus: 'discoverTab',
    icon: Compass,
  },
  {
    id: 'plan',
    title: 'Plan',
    body: 'Open roadmaps and goals when you need a step-by-step path.',
    footer: 'Turn opportunities into actions.',
    focus: 'planTab',
    icon: ShoppingBag,
  },
  {
    id: 'ai',
    title: 'Ask Edutu AI',
    body: 'Tap the center AI button to open chat and ask for guidance.',
    footer: 'Verify official details.',
    focus: 'ai',
    icon: MessageCircle,
  },
  {
    id: 'bell',
    title: 'Alerts',
    body: 'Deadlines and reminders show here.',
    footer: 'Review time-sensitive items.',
    focus: 'bell',
    icon: Bell,
  },
  {
    id: 'menu',
    title: 'Profile',
    body: 'Update settings and preferences here.',
    footer: 'Better profile, better matches.',
    focus: 'profileTab',
    icon: UserCircle,
  },
];

function getFocusStyle(focus: HintFocus, bottomInset: number) {
  const navBottom = Platform.OS === 'ios'
    ? Math.max(bottomInset - 8, 10)
    : bottomInset > 0 ? Math.max(bottomInset, 8) : 8;
  const navTop = SCREEN_HEIGHT - navBottom - 74;
  const navLeft = 14;
  const aiWidth = 68;
  const navGap = 12;
  const pillWidth = SCREEN_WIDTH - navLeft * 2 - navGap - aiWidth;
  const pillInnerLeft = navLeft + 8;
  const pillInnerWidth = pillWidth - 16;
  const tabWidth = pillInnerWidth / 4;
  const tabLeft = (tabIndex: number) => pillInnerLeft + tabWidth * tabIndex + 3;
  const tabHighlightWidth = Math.max(50, tabWidth - 6);

  switch (focus) {
    case 'bell':
      return {
        top: Math.max(44, Platform.OS === 'ios' ? 54 : 42),
        left: SCREEN_WIDTH - 72,
        width: 52,
        height: 52,
        borderRadius: 26,
      };
    case 'homeTab':
      return {
        top: navTop + 8,
        left: tabLeft(0),
        width: tabHighlightWidth,
        height: 52,
        borderRadius: 26,
      };
    case 'discoverTab':
      return {
        top: navTop + 8,
        left: tabLeft(1),
        width: tabHighlightWidth,
        height: 52,
        borderRadius: 26,
      };
    case 'planTab':
      return {
        top: navTop + 8,
        left: tabLeft(2),
        width: tabHighlightWidth,
        height: 52,
        borderRadius: 26,
      };
    case 'ai':
      return {
        top: navTop,
        left: SCREEN_WIDTH - navLeft - aiWidth - 3,
        width: 74,
        height: 74,
        borderRadius: 37,
      };
    case 'profileTab':
      return {
        top: navTop + 8,
        left: tabLeft(3),
        width: tabHighlightWidth,
        height: 52,
        borderRadius: 26,
      };
    case 'homeContent':
    default:
      return {
        top: Platform.OS === 'ios' ? 114 : 96,
        left: 18,
        width: SCREEN_WIDTH - 36,
        height: 206,
        borderRadius: 24,
      };
  }
}

export function WelcomeHintSystem({ userId, enabled, isDark, onComplete }: WelcomeHintSystemProps) {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const cardY = useRef(new Animated.Value(18)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;

  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${userId || 'anonymous'}`, [userId]);
  const step = STEPS[index];
  const Icon = step.icon;
  const focusStyle = getFocusStyle(step.focus, insets.bottom);
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    let mounted = true;

    async function loadState() {
      if (!enabled || !userId) {
        if (mounted) {
          setVisible(false);
          setReady(true);
        }
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(storageKey);
        if (mounted) {
          setVisible(stored !== 'done');
          setReady(true);
        }
      } catch {
        if (mounted) {
          setVisible(true);
          setReady(true);
        }
      }
    }

    loadState();
    return () => {
      mounted = false;
    };
  }, [enabled, storageKey, userId]);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      cardY.setValue(18);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(cardY, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardY, opacity, visible]);

  useEffect(() => {
    if (!visible) {
      iconPulse.setValue(1);
      return;
    }

    iconPulse.setValue(1);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, {
          toValue: 1.12,
          duration: 620,
          useNativeDriver: true,
        }),
        Animated.spring(iconPulse, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [iconPulse, index, visible]);

  const close = async () => {
    setVisible(false);
    setIndex(0);
    try {
      await AsyncStorage.setItem(storageKey, 'done');
    } catch {
      // Non-critical; the hint may show again if storage fails.
    }
    onComplete?.();
  };

  const next = () => {
    if (isLast) {
      close();
      return;
    }
    setIndex((value) => value + 1);
  };

  if (!ready || !visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="auto">
      <View style={styles.scrim} />
      <View style={[styles.focusRing, focusStyle]} pointerEvents="none" />

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
            transform: [{ translateY: cardY }],
            bottom: Math.max(insets.bottom, 12) + 104,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <Animated.View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark ? 'rgba(129,140,248,0.18)' : '#EEF2FF',
                transform: [{ scale: iconPulse }],
              },
            ]}
          >
            <Icon size={22} color={isDark ? '#A5B4FC' : '#4F46E5'} strokeWidth={2.3} />
          </Animated.View>
          <View style={styles.progressWrap}>
            {STEPS.map((item, itemIndex) => (
              <View
                key={item.id}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: itemIndex <= index ? '#6366F1' : isDark ? '#334155' : '#CBD5E1',
                    width: itemIndex === index ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{step.title}</Text>
        <Text style={[styles.body, { color: isDark ? '#CBD5E1' : '#475569' }]}>{step.body}</Text>
        <Text style={[styles.footer, { color: isDark ? '#94A3B8' : '#64748B' }]}>{step.footer}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Skip welcome hints"
          >
            <Text style={[styles.secondaryText, { color: isDark ? '#CBD5E1' : '#475569' }]}>Skip</Text>
          </Pressable>

          <Pressable
            onPress={next}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Finish welcome hints' : 'Show next welcome hint'}
          >
            <Text style={styles.primaryText}>{isLast ? 'Done' : 'Next'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    elevation: 5000,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  focusRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#A5B4FC',
    backgroundColor: 'rgba(99,102,241,0.12)',
    shadowColor: '#A5B4FC',
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    height: 6,
    borderRadius: 999,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  footer: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 12,
  },
  secondaryBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    minHeight: 40,
    minWidth: 104,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.72,
  },
});
