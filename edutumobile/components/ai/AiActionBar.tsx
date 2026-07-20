import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Crown, MessageSquare, RefreshCw, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { withAlpha } from '../ui/BottomScrim';
import { AiOrbBadge } from '../ui/AiOrbBadge';
import { haptics } from '../../lib/haptics';
import type { WinCoachIntent } from '@edutu/core/src/services/chat';

export type AiAction = {
  label: string;
  intent: WinCoachIntent;
  /** The seed message sent to the agent for this action. */
  message: string;
};

/**
 * A win-coach reply plus the conversation it landed in, so the sheet can offer
 * a way back to it instead of the advice evaporating when the sheet closes.
 */
export type AiActionResult = {
  text: string;
  threadId: string | null;
};

/**
 * Failure kind carried structurally rather than sniffed out of a (translated)
 * message — the UI has to pick between "Retry" and "Upgrade" in 9 languages.
 */
export type AiActionErrorKind = 'billing' | 'generic';

export class AiActionError extends Error {
  readonly kind: AiActionErrorKind;

  constructor(message: string, kind: AiActionErrorKind = 'generic') {
    super(message);
    this.name = 'AiActionError';
    this.kind = kind;
  }
}

type AiActionBarProps = {
  actions: AiAction[];
  /** Runs the action and resolves the assistant's reply + its thread. */
  onRun: (action: AiAction) => Promise<AiActionResult>;
  /** Opens the conversation the reply lives in. Omit to hide the affordance. */
  onOpenInChat?: (threadId: string) => void;
  /** Sends the user to the paywall when the failure is a billing limit. */
  onUpgrade?: () => void;
};

/**
 * Row of one-tap win-coach actions ("Am I a fit?", "What's missing?"). Each
 * button fires the agent with a screen-scoped intent and shows the reply in a
 * lightweight sheet — presentational, so screens supply onRun (wired to the
 * chat service with their context).
 */
export function AiActionBar({
  actions,
  onRun,
  onOpenInChat,
  onUpgrade,
}: AiActionBarProps) {
  const { t } = useTranslation('chat');
  const { colors } = useTheme();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<{
    message: string;
    kind: AiActionErrorKind;
  } | null>(null);
  const [lastAction, setLastAction] = useState<AiAction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handlePress = async (action: AiAction) => {
    if (running) return;
    haptics.light();
    setRunning(action.intent);
    setLastAction(action);
    setError(null);
    setResult(null);
    // Clear the previous run's thread too. `useAiAction` reuses one thread for
    // the whole session, so in practice every successful run reports the same
    // id back and this rarely changes anything — but clearing it here means
    // the "Open in chat" affordance can never point at a stale thread from an
    // earlier run if a future caller supplies a per-action thread (or a run
    // simply fails before a threadId comes back).
    setThreadId(null);
    setSheetOpen(true);
    try {
      const reply = await onRun(action);
      setResult(reply.text);
      if (reply.threadId) setThreadId(reply.threadId);
      haptics.success();
    } catch (err) {
      setError({
        message:
          err instanceof Error && err.message
            ? err.message
            : t('common:errors.generic'),
        kind: err instanceof AiActionError ? err.kind : 'generic',
      });
      haptics.error();
    } finally {
      setRunning(null);
    }
  };

  return (
    <View style={styles.row}>
      {actions.map((action) => {
        const isRunning = running === action.intent;
        return (
          <Pressable
            key={action.intent}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            disabled={Boolean(running)}
            onPress={() => handlePress(action)}
            style={({ pressed }) => [
              styles.pill,
              {
                // A soft tint of the accent — not `accentLight`, which is a
                // fully-saturated indigo in the light palette and rendered
                // primary-on-primary text invisible.
                backgroundColor: withAlpha(colors.primary, 0.1),
                borderColor: withAlpha(colors.primary, 0.22),
                opacity: pressed || (running && !isRunning) ? 0.6 : 1,
              },
            ]}
          >
            {isRunning ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <AiOrbBadge size={18} />
            )}
            <Text style={[styles.pillLabel, { color: colors.primary }]} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <AiOrbBadge size={20} />
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  {t('winCoach.sheetTitle')}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.close')}
                onPress={() => setSheetOpen(false)}
                hitSlop={10}
              >
                <X size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetContent}>
              {running ? (
                <View style={styles.centered}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    {t('winCoach.thinking')}
                  </Text>
                </View>
              ) : error ? (
                <View style={styles.stateBlock}>
                  <Text style={[styles.body, { color: colors.error }]}>
                    {error.message}
                  </Text>
                  <View style={styles.sheetActions}>
                    {error.kind === 'billing' && onUpgrade ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('limit.upgradeCta')}
                        onPress={() => {
                          setSheetOpen(false);
                          onUpgrade();
                        }}
                        style={({ pressed }) => [
                          styles.sheetAction,
                          {
                            backgroundColor: colors.primary,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Crown size={14} color={colors.card} />
                        <Text
                          style={[styles.sheetActionText, { color: colors.card }]}
                        >
                          {t('limit.upgradeCta')}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('limit.retryCta')}
                      onPress={() => {
                        if (lastAction) void handlePress(lastAction);
                      }}
                      style={({ pressed }) => [
                        styles.sheetAction,
                        {
                          backgroundColor: withAlpha(colors.primary, 0.1),
                          borderColor: withAlpha(colors.primary, 0.22),
                          borderWidth: StyleSheet.hairlineWidth,
                          opacity: pressed ? 0.8 : 1,
                        },
                      ]}
                    >
                      <RefreshCw size={14} color={colors.primary} />
                      <Text
                        style={[styles.sheetActionText, { color: colors.primary }]}
                      >
                        {t('limit.retryCta')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.stateBlock}>
                  <Text style={[styles.body, { color: colors.foreground }]}>
                    {result}
                  </Text>
                  {threadId && onOpenInChat ? (
                    <View style={styles.sheetActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('winCoach.openInChat')}
                        onPress={() => {
                          setSheetOpen(false);
                          onOpenInChat(threadId);
                        }}
                        style={({ pressed }) => [
                          styles.sheetAction,
                          {
                            backgroundColor: withAlpha(colors.primary, 0.1),
                            borderColor: withAlpha(colors.primary, 0.22),
                            borderWidth: StyleSheet.hairlineWidth,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <MessageSquare size={14} color={colors.primary} />
                        <Text
                          style={[
                            styles.sheetActionText,
                            { color: colors.primary },
                          ]}
                        >
                          {t('winCoach.openInChat')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sheetBody: {
    flexGrow: 0,
  },
  sheetContent: {
    paddingBottom: 8,
  },
  centered: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  hint: {
    fontSize: 13,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  stateBlock: {
    gap: 16,
  },
  sheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  sheetActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
