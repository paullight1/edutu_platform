import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, HelpCircle, Trash2, type LucideIcon } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';
import { haptics } from '../../lib/haptics';
import { useTheme } from '../context/ThemeContext';
import { stateType, useStateTokens } from './stateTokens';

/**
 * The themed confirm / destructive sheet.
 *
 * Replaces the 21 `Alert.alert` confirms and 11 destructive confirms in the
 * app. It is a bottom sheet rather than a centre dialog on purpose: Edutu
 * already has a sheet family (UpgradeSheet, CreditPackSheet, CoverLetterSheet,
 * AITailorModal), so this reads as a native idiom rather than a new one, and a
 * sheet keeps the thumb near the buttons on a phone.
 *
 * Two safety properties the OS alert did not give us:
 *  - The destructive action is never the visually dominant button, and cancel
 *    always sits where the thumb rests.
 *  - Presenting a destructive confirm fires the warning haptic, so the user
 *    feels the weight of what is being asked before reading it.
 */

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  /** Override the mark. Defaults by tone. */
  icon?: LucideIcon;
}

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
  icon,
}: ConfirmSheetProps) {
  const { colors, isDark } = useTheme();
  const tokens = useStateTokens(destructive ? 'danger' : 'flow');
  const motion = useMotion();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    // Warning for a destructive ask, a lighter tick for an ordinary one.
    if (destructive) haptics.warning();
    else haptics.light();
  }, [visible, destructive]);

  const Icon = icon ?? (destructive ? Trash2 : HelpCircle);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View
        entering={FadeIn.duration(motion.duration.quick)}
        exiting={FadeOut.duration(motion.duration.instant)}
        style={styles.scrim}
      >
        {/* Tapping the scrim cancels — the safe outcome, never the destructive
            one. A stray tap must not be able to delete anything. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />

        <Animated.View
          entering={SlideInDown.duration(motion.duration.base).springify().damping(18)}
          exiting={SlideOutDown.duration(motion.duration.quick)}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />

          <View style={[styles.mark, { backgroundColor: tokens.wash, borderColor: tokens.ring }]}>
            <Icon size={24} color={tokens.hue} strokeWidth={2.1} />
          </View>

          <Text
            style={[stateType.title, styles.title, { color: colors.foreground }]}
            maxFontSizeMultiplier={1.3}
          >
            {title}
          </Text>

          {body ? (
            <Text
              style={[stateType.body, styles.body, { color: colors.textSecondary }]}
              maxFontSizeMultiplier={1.3}
            >
              {body}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {/* Cancel first and full-weight: the reversible choice should be the
                easy one to hit. */}
            <Pressable
              onPress={() => {
                haptics.light();
                onCancel();
              }}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : colors.muted,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[stateType.action, { color: colors.foreground }]}
                maxFontSizeMultiplier={1.2}
              >
                {cancelLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (destructive) haptics.heavy();
                else haptics.medium();
                onConfirm();
              }}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: tokens.hue, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text
                style={[stateType.action, { color: tokens.onHue }]}
                maxFontSizeMultiplier={1.2}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/** Mark used when a confirm is purely informational rather than a fork. */
export const ConfirmWarnIcon = AlertTriangle;

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(2,6,23,0.62)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: 'center',
  },
  grabber: { width: 38, height: 4, borderRadius: 2, marginBottom: 18 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: 8, maxWidth: 320 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22, width: '100%' },
  btn: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
