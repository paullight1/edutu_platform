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
import { Sparkles, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { WinCoachIntent } from '@edutu/core/src/services/chat';

export type AiAction = {
  label: string;
  intent: WinCoachIntent;
  /** The seed message sent to the agent for this action. */
  message: string;
};

type AiActionBarProps = {
  actions: AiAction[];
  /** Runs the action and resolves the assistant's reply text. */
  onRun: (action: AiAction) => Promise<string>;
};

/**
 * Row of one-tap win-coach actions ("Am I a fit?", "What's missing?"). Each
 * button fires the agent with a screen-scoped intent and shows the reply in a
 * lightweight sheet — presentational, so screens supply onRun (wired to the
 * chat service with their context).
 */
export function AiActionBar({ actions, onRun }: AiActionBarProps) {
  const { colors } = useTheme();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handlePress = async (action: AiAction) => {
    if (running) return;
    setRunning(action.intent);
    setError(null);
    setResult(null);
    setSheetOpen(true);
    try {
      const reply = await onRun(action);
      setResult(reply);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Please try again.',
      );
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
                backgroundColor: colors.accentLight,
                borderColor: colors.border,
                opacity: pressed || (running && !isRunning) ? 0.6 : 1,
              },
            ]}
          >
            {isRunning ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Sparkles size={15} color={colors.primary} />
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
                <Sparkles size={16} color={colors.primary} />
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                  Edutu Coach
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
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
                    Thinking through this for you…
                  </Text>
                </View>
              ) : error ? (
                <Text style={[styles.body, { color: colors.error }]}>{error}</Text>
              ) : (
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {result}
                </Text>
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
});
