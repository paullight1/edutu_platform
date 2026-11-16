import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Award,
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  FileCheck2,
  PartyPopper,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';

/**
 * What just succeeded. The kind picks the mark — a profile save, a submitted
 * application and a deleted document are three different events and a single
 * generic tick makes them read as interchangeable. Falls back to `generic`, so
 * adopting this at a new call site never needs a new kind first.
 */
export type SuccessKind =
  | 'generic'
  | 'profile'
  | 'document'
  | 'submitted'
  | 'application'
  | 'payment'
  | 'roadmap'
  | 'goal'
  | 'deadline'
  | 'deleted'
  | 'celebrate';

const KIND_ICON: Record<SuccessKind, LucideIcon> = {
  generic: CheckCircle2,
  profile: UserCheck,
  document: FileCheck2,
  submitted: Send,
  application: BadgeCheck,
  payment: Sparkles,
  roadmap: Rocket,
  goal: Award,
  deadline: CalendarCheck,
  deleted: Trash2,
  celebrate: PartyPopper,
};

export interface SuccessDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  kind?: SuccessKind;
  /** Primary button label. */
  actionLabel: string;
  onAction: () => void;
  /** Optional quiet second action, e.g. "Not now". */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /**
   * Destructive events (a delete) use the error hue rather than success green,
   * so the colour never congratulates someone for losing something.
   */
  tone?: 'success' | 'danger';
}

/** The animated mark: pops in, then settles with one soft breath. */
function SuccessMark({ kind, tint }: { kind: SuccessKind; tint: string }) {
  const { reducedMotion } = useTheme();
  const scale = useSharedValue(reducedMotion ? 1 : 0.4);
  const ringScale = useSharedValue(reducedMotion ? 1 : 0.6);
  const ringOpacity = useSharedValue(reducedMotion ? 0.16 : 0.5);

  const Icon = KIND_ICON[kind] ?? CheckCircle2;

  useEffect(() => {
    if (reducedMotion) return;

    // Overshoot then settle — the mark should feel like it *landed*, which a
    // plain fade cannot convey at this size.
    scale.value = withSequence(
      withSpring(1.12, { damping: 9, stiffness: 190 }),
      withSpring(1, { damping: 13, stiffness: 170 }),
    );

    // A single halo pulse outward, then hold faint. Not looped: a permanent
    // pulse under a dialog reads as "still working", which is the opposite of
    // what a success state is telling you.
    ringScale.value = withDelay(90, withTiming(1.25, { duration: 520, easing: Easing.out(Easing.quad) }));
    ringOpacity.value = withDelay(90, withTiming(0.16, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [reducedMotion, scale, ringScale, ringOpacity]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View style={styles.markWrap}>
      <Animated.View style={[styles.markRing, { backgroundColor: tint }, ringStyle]} pointerEvents="none" />
      <Animated.View style={[styles.markCircle, { backgroundColor: `${tint}1F`, borderColor: `${tint}59` }, iconStyle]}>
        <Icon size={44} color={tint} strokeWidth={2.2} />
      </Animated.View>
    </View>
  );
}

export function SuccessDialog({
  visible,
  title,
  message,
  kind = 'generic',
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  tone = 'success',
}: SuccessDialogProps) {
  const { colors, isDark } = useTheme();
  const tint = tone === 'danger' ? colors.error : colors.success;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onAction}>
      <Animated.View style={styles.overlay} entering={FadeIn.duration(160)}>
        {/* Swallows taps on the scrim so the dialog is dismissed deliberately,
            through a button, rather than by a stray tap behind it. */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false} />

        <Animated.View
          entering={FadeInDown.duration(300).springify().damping(16)}
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
            },
          ]}
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
        >
          <SuccessMark kind={kind} tint={tint} />

          <Text
            style={[styles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
            maxFontSizeMultiplier={1.3}
          >
            {title}
          </Text>

          {message ? (
            <Text
              style={[styles.message, { color: isDark ? '#94A3B8' : '#475569' }]}
              maxFontSizeMultiplier={1.3}
            >
              {message}
            </Text>
          ) : null}

          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: tint },
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryText} maxFontSizeMultiplier={1.2}>{actionLabel}</Text>
          </Pressable>

          {secondaryLabel && onSecondary ? (
            <Pressable
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text
                style={[styles.secondaryText, { color: isDark ? '#94A3B8' : '#64748B' }]}
                maxFontSizeMultiplier={1.2}
              >
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 24,
  },
  markWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  markRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  markCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    alignSelf: 'stretch',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
