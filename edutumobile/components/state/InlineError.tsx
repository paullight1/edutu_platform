import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AlertTriangle, RotateCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '../../hooks/useMotion';
import { haptics } from '../../lib/haptics';
import { stateType, useStateTokens } from './stateTokens';

/**
 * In-context failure recovery.
 *
 * This component is the reason ~161 of the app's 193 `Alert.alert` calls can go
 * away. Those calls were almost all of the form
 * `Alert.alert(t('states.error'), t('alerts.saveFailed'))` — a blocking OS modal
 * that reports a failure, offers a single OK button, and leaves the user exactly
 * where they were with nothing to do about it.
 *
 * A failure should appear where the failure happened, and it should carry the
 * action that undoes it. That is the whole difference between an app that feels
 * fragile and one that feels reliable.
 *
 * Two densities:
 *  - `block` (default) — replaces a section that could not load.
 *  - `row` — a compact strip for a failure inside an otherwise working screen,
 *    e.g. one list item that could not refresh.
 */

export interface InlineErrorProps {
  /** Short statement of what failed, in the user's terms. */
  message: string;
  /** Optional second line: what they can do, or why it happened. */
  hint?: string;
  onRetry?: () => void;
  /** True while a retry is in flight — spins the glyph and blocks re-taps. */
  retrying?: boolean;
  density?: 'block' | 'row';
  /** Fires the error haptic on mount. Off for errors that appear in bulk. */
  announce?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function InlineError({
  message,
  hint,
  onRetry,
  retrying = false,
  density = 'block',
  announce = true,
  style,
}: InlineErrorProps) {
  const { t } = useTranslation('common');
  const tokens = useStateTokens('danger');
  const motion = useMotion();

  const spin = useSharedValue(0);

  useEffect(() => {
    if (announce) haptics.error();
    // Mount-only: re-announcing on every prop change would buzz repeatedly
    // while the user reads the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!retrying || !motion.allowLoop) {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration: 800 }), -1, false);
    return () => {
      spin.value = 0;
    };
  }, [retrying, motion.allowLoop, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const isRow = density === 'row';

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.quick)}
      style={[
        styles.wrap,
        isRow ? styles.wrapRow : styles.wrapBlock,
        { backgroundColor: tokens.wash, borderColor: tokens.ring },
        style,
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View
        style={[
          styles.glyph,
          isRow ? styles.glyphRow : styles.glyphBlock,
          { backgroundColor: tokens.isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF' },
        ]}
      >
        <AlertTriangle size={isRow ? 15 : 19} color={tokens.hue} strokeWidth={2.2} />
      </View>

      <View style={styles.copy}>
        <Text style={[stateType.quiet, { color: tokens.title }]} maxFontSizeMultiplier={1.4}>
          {message}
        </Text>
        {hint && !isRow ? (
          <Text
            style={[styles.hint, { color: tokens.body }]}
            maxFontSizeMultiplier={1.4}
          >
            {hint}
          </Text>
        ) : null}
      </View>

      {onRetry ? (
        <Pressable
          onPress={() => {
            haptics.medium();
            onRetry();
          }}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel={t('actions.tryAgain')}
          accessibilityState={{ disabled: retrying, busy: retrying }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.retry,
            { backgroundColor: tokens.hue, opacity: retrying ? 0.65 : pressed ? 0.85 : 1 },
          ]}
        >
          <Animated.View style={spinStyle}>
            <RotateCw size={13} color={tokens.onHue} strokeWidth={2.6} />
          </Animated.View>
          {!isRow ? (
            <Text style={[styles.retryText, { color: tokens.onHue }]} maxFontSizeMultiplier={1.2}>
              {t('actions.tryAgain')}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 11,
  },
  wrapBlock: { borderRadius: 16, padding: 14 },
  wrapRow: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 11 },

  glyph: { alignItems: 'center', justifyContent: 'center' },
  glyphBlock: { width: 38, height: 38, borderRadius: 12 },
  glyphRow: { width: 28, height: 28, borderRadius: 9 },

  copy: { flex: 1, gap: 3 },
  hint: { fontSize: 12, lineHeight: 17, fontWeight: '500' },

  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 34,
  },
  retryText: { fontSize: 12, fontWeight: '700' },
});
