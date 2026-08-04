import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SendHorizonal } from 'lucide-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * The message composer.
 *
 * THE ONE RULE THIS COMPONENT ENFORCES: the text is owned by the caller and is
 * NEVER cleared here. The screener can refuse a post with a sentence written for
 * the member, and a composer that empties itself on submit would delete what
 * somebody typed because a heuristic disagreed with it — the worst outcome this
 * feature can produce. The caller clears the value only after a send resolves
 * successfully; a rejection leaves the text exactly where it was, with the
 * server's sentence above it, ready to edit and resend.
 *
 * `error` is that sentence, verbatim. Never a status code, never a generic
 * failure (see the header of services/communities.ts).
 *
 * States: default · pressed (AnimatedPressable) · disabled (empty text, archived
 * or expired group) · loading (in-flight send) · error (the sentence above).
 */
export interface ComposerProps {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  /** An in-flight send. The button spins; the input stays editable. */
  sending?: boolean;
  /** Archived or expired group — posting is off, the input says why. */
  disabled?: boolean;
  /** Shown in place of the helper line when posting is disabled. */
  disabledNotice?: string;
  /** The server's refusal sentence. */
  error?: string | null;
  placeholder?: string;
  testID?: string;
}

export function Composer({
  value,
  onChangeText,
  onSend,
  sending = false,
  disabled = false,
  disabledNotice,
  error = null,
  placeholder,
  testID = 'chat-composer',
}: ComposerProps) {
  const { t } = useTranslation('community');
  const { colors } = useTheme();

  const canSend = value.trim().length > 0 && !sending && !disabled;

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { borderTopColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      {!!error && (
        <Text
          testID={`${testID}-error`}
          style={[styles.error, { color: colors.error }]}
        >
          {error}
        </Text>
      )}

      {disabled && !!disabledNotice && (
        <Text
          testID={`${testID}-disabled-notice`}
          style={[styles.notice, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {disabledNotice}
        </Text>
      )}

      <View style={styles.row}>
        <TextInput
          testID={`${testID}-input`}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline
          placeholder={placeholder ?? t('chat.composerPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={t('chat.composerPlaceholder')}
          style={[
            styles.input,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: error ? colors.error : colors.border,
              opacity: disabled ? 0.6 : 1,
            },
          ]}
        />

        <AnimatedPressable
          testID={`${testID}-send`}
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          hapticFeedback="light"
          onPress={onSend}
          style={[
            styles.send,
            {
              backgroundColor: canSend ? colors.accent : colors.muted,
              opacity: canSend ? 1 : 0.7,
            },
          ]}
        >
          <View style={styles.sendInner}>
            {sending ? (
              <ActivityIndicator testID={`${testID}-sending`} size="small" color="#FFFFFF" />
            ) : (
              <SendHorizonal
                size={18}
                color={canSend ? '#FFFFFF' : colors.textSecondary}
                strokeWidth={2.4}
              />
            )}
          </View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderCurve: 'continuous',
  },
  sendInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
  },
});
