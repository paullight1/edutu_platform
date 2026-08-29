import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated, useAnimatedValue,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Compass, Home, MessageCircle, ShoppingBag, UserCircle } from 'lucide-react-native';
import { useWelcomeModalActive } from '../../lib/welcomeModalStore';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORAGE_PREFIX = 'edutu:welcome-hints:v1';

type HintFocus = 'homeContent' | 'bell' | 'homeTab' | 'discoverTab' | 'planTab' | 'ai' | 'profileTab';

interface HintStep {
  id: string;
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
    focus: 'homeContent',
    icon: Home,
  },
  {
    id: 'discover',
    focus: 'discoverTab',
    icon: Compass,
  },
  {
    id: 'plan',
    focus: 'planTab',
    icon: ShoppingBag,
  },
  {
    id: 'ai',
    focus: 'ai',
    icon: MessageCircle,
  },
  {
    id: 'bell',
    focus: 'bell',
    icon: Bell,
  },
  {
    id: 'menu',
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
  const { t } = useTranslation('common');
  const { colors, reducedMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const opacity = useAnimatedValue(0);
  const cardY = useAnimatedValue(18);
  const iconPulse = useAnimatedValue(1);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${userId || 'anonymous'}`, [userId]);
  // Hold the coach-marks while the first-run WelcomeModal greeting is on screen;
  // they resume automatically once it's dismissed.
  const welcomeActive = useWelcomeModalActive();
  const effectiveEnabled = enabled && !welcomeActive;
  const step = STEPS[index];
  const Icon = step.icon;
  const focusStyle = getFocusStyle(step.focus, insets.bottom);
  const isLast = index === STEPS.length - 1;

  // Four dim panels framing the focus rect, so the focused element itself stays
  // unblurred and undimmed. Each is inset by 2pt into the ring's own border so
  // the blur edge tucks under the stroke instead of showing a hairline seam.
  const scrimPanels = useMemo(() => {
    const { top, left, width: w, height: h } = focusStyle;
    const bleed = 2;
    const focusTop = top + bleed;
    const focusBottom = top + h - bleed;
    const focusLeft = left + bleed;
    const focusRight = left + w - bleed;

    return [
      { top: 0, left: 0, right: 0, height: Math.max(0, focusTop) },
      { top: focusBottom, left: 0, right: 0, bottom: 0 },
      { top: focusTop, left: 0, width: Math.max(0, focusLeft), height: Math.max(0, focusBottom - focusTop) },
      { top: focusTop, left: focusRight, right: 0, height: Math.max(0, focusBottom - focusTop) },
    ];
  }, [focusStyle]);

  // Anchor the card to the element it describes instead of parking it at a
  // fixed offset off the bottom of the screen: sit below the focus when the
  // focus is in the top half, above it when it is in the bottom half. Pointing
  // at the header while the copy sits by the tab bar made the two read as
  // unrelated.
  const cardPlacement = useMemo(() => {
    const focusCentre = focusStyle.top + focusStyle.height / 2;
    if (focusCentre > SCREEN_HEIGHT / 2) {
      return { bottom: Math.max(SCREEN_HEIGHT - focusStyle.top + 14, insets.bottom + 12) };
    }
    return { top: focusStyle.top + focusStyle.height + 14 };
  }, [focusStyle, insets.bottom]);

  useEffect(() => {
    let mounted = true;

    async function loadState() {
      if (!effectiveEnabled || !userId) {
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
  }, [effectiveEnabled, storageKey, userId]);

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
    // Static icon (no pulse) when the user has reduced motion on — mirrors
    // chat.tsx's TypingDot gating pattern.
    if (!visible || reducedMotion) {
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
  }, [iconPulse, index, visible, reducedMotion]);

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
      {/* Pressable (even a no-op) is required to actually swallow touches;
          a plain View lets taps fall through to the screen underneath. */}
      {/* Pressable (even a no-op) is required to actually swallow touches;
          a plain View lets taps fall through to the screen underneath. */}
      <Pressable style={StyleSheet.absoluteFill} accessible={false} />

      {/* The dimming is laid out as four panels framing the focus rect rather
          than one full-screen sheet. A full-screen scrim dims the thing it is
          pointing at just as much as everything else, so the "highlight" was
          only a thin ring around equally-dark UI — the element never actually
          stood out. Leaving the focus rect uncovered makes it the one bright
          thing on screen, which is what a coach-mark is for. */}
      {scrimPanels.map((panel, panelIndex) => (
        <View key={panelIndex} style={[styles.scrimPanel, panel]} pointerEvents="none">
          <BlurView
            intensity={30}
            tint="dark"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.scrim} />
        </View>
      ))}

      <View
        style={[
          styles.focusRing,
          focusStyle,
          { borderColor: colors.accent, shadowColor: colors.accent, backgroundColor: colors.accent + '1F' },
        ]}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
            transform: [{ translateY: cardY }],
            ...cardPlacement,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <Animated.View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark ? colors.accent + '26' : colors.accent + '1A',
                transform: [{ scale: iconPulse }],
              },
            ]}
          >
            <Icon size={22} color={isDark ? colors.accentLight : colors.accent} strokeWidth={2.3} />
          </Animated.View>
          <View style={styles.progressWrap}>
            {STEPS.map((item, itemIndex) => (
              <View
                key={item.id}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: itemIndex <= index ? colors.accent : isDark ? '#334155' : '#CBD5E1',
                  },
                ]}
              />
            ))}
          </View>
        </View>

        <Text style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>{t(`hints.${step.id}.title`)}</Text>
        <Text style={[styles.body, { color: isDark ? '#CBD5E1' : '#475569' }]}>{t(`hints.${step.id}.body`)}</Text>
        <Text style={[styles.footer, { color: isDark ? '#94A3B8' : '#64748B' }]}>{t(`hints.${step.id}.footer`)}</Text>

        <View style={styles.actions}>
          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('hints.skipHint')}
          >
            <Text style={[styles.secondaryText, { color: isDark ? '#CBD5E1' : '#475569' }]}>{t('actions.skip')}</Text>
          </Pressable>

          <Pressable
            onPress={next}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.accent }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('hints.finishHint') : t('hints.nextHint')}
          >
            <Text style={styles.primaryText}>{isLast ? t('actions.done') : t('actions.next')}</Text>
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
  scrimPanel: {
    position: 'absolute',
    overflow: 'hidden',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    // Deeper than the previous 0.72. With the focus rect now cut out of the
    // dimming, the contrast between "focused" and "everything else" is what
    // carries the emphasis, so the surround can afford to go darker.
    backgroundColor: 'rgba(2,6,23,0.86)',
  },
  focusRing: {
    position: 'absolute',
    borderWidth: 2,
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
    width: 6,
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
