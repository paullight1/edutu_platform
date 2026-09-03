import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, BookmarkPlus } from 'lucide-react-native';
import type { GetAuthToken } from '@edutu/core';
import { useTheme } from '../context/ThemeContext';
import { useOpportunityJourneyActions } from '../../hooks/useOpportunityJourneyActions';
import ApplicationConfirmationSheet from './ApplicationConfirmationSheet';

export default function OpportunityJourneyActions({
  userId,
  opportunityId,
  title,
  applicationUrl,
  getAuthToken,
  onOpenMyPath,
}: {
  userId: string;
  opportunityId: string;
  title: string;
  applicationUrl?: string | null;
  getAuthToken: GetAuthToken;
  onOpenMyPath: () => void;
}) {
  const { colors } = useTheme();
  const actions = useOpportunityJourneyActions({
    userId,
    opportunityId,
    applicationUrl,
    getAuthToken,
  });
  const [confirming, setConfirming] = useState(false);

  const run = async (operation: () => Promise<unknown>) => {
    try {
      const result = (await operation()) as { queued?: boolean } | null;
      if (result?.queued) {
        Alert.alert(
          'Saved for sync',
          'Edutu will complete this action when your connection returns.',
        );
      }
    } catch (error) {
      Alert.alert(
        'Unable to update your path',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  if (actions.loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your opportunity status…</Text>
      </View>
    );
  }

  const current = actions.current;
  const actionKey = current?.nextAction.key ?? 'activate';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {actions.error ? (
        <Text style={[styles.error, { color: colors.error }]}>{actions.error}</Text>
      ) : null}
      {actions.pendingSync ? (
        <Text style={[styles.pending, { color: colors.warning }]}>Pending sync</Text>
      ) : null}

      {!current ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pursue ${title}`}
            disabled={actions.mutating}
            onPress={() => void run(actions.pursue)}
            style={[styles.primary, { backgroundColor: colors.primary, opacity: actions.mutating ? 0.5 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: colors.background }]}>Pursue this opportunity</Text>
            <ArrowRight size={17} color={colors.background} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Save ${title} for later`}
            disabled={actions.mutating}
            onPress={() => void run(actions.shortlist)}
            style={[styles.save, { borderColor: colors.border }]}
          >
            <BookmarkPlus size={17} color={colors.accent} />
          </Pressable>
        </View>
      ) : actionKey === 'activate' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Make ${title} an active pursuit`}
          disabled={actions.mutating}
          onPress={() => onOpenMyPath()}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>Make this an active pursuit</Text>
        </Pressable>
      ) : actionKey === 'continue_task' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Continue ${current.nextAction.label}`}
          onPress={onOpenMyPath}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text numberOfLines={1} style={[styles.primaryText, { color: colors.background }]}>Continue: {current.nextAction.label}</Text>
          <ArrowRight size={17} color={colors.background} />
        </Pressable>
      ) : actionKey === 'open_application' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open official application for ${title}`}
          disabled={!applicationUrl || actions.mutating}
          onPress={() => void run(actions.openApplication)}
          style={[styles.primary, { backgroundColor: colors.primary, opacity: !applicationUrl || actions.mutating ? 0.5 : 1 }]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>Open official application</Text>
          <ArrowRight size={17} color={colors.background} />
        </Pressable>
      ) : actionKey === 'confirm_application' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Confirm application status for ${title}`}
          onPress={() => setConfirming(true)}
          style={[styles.primary, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryText, { color: colors.background }]}>Confirm application status</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${title} in My Path`}
          onPress={onOpenMyPath}
          style={[styles.secondary, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryText, { color: colors.foreground }]}>
            {actionKey === 'update_outcome' ? 'Update application outcome' : 'Review your journey'}
          </Text>
        </Pressable>
      )}

      {actionKey === 'open_application' && !applicationUrl ? (
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>The official application URL is unavailable. Edutu will not mark this as submitted.</Text>
      ) : null}

      <ApplicationConfirmationSheet
        visible={confirming && current?.journey.state === 'application_opened'}
        title={title}
        busy={actions.mutating}
        onSubmitted={() =>
          void run(async () => {
            const result = await actions.confirmApplication();
            setConfirming(false);
            return result;
          })
        }
        onNotYet={() =>
          void run(async () => {
            const result = await actions.notYet();
            setConfirming(false);
            return result;
          })
        }
        onWithdraw={() =>
          void run(async () => {
            const result = await actions.withdraw();
            setConfirming(false);
            return result;
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  loading: { minHeight: 92, borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { fontSize: 12 },
  error: { fontSize: 12, fontWeight: '600' },
  pending: { fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 9 },
  primary: { minHeight: 48, flex: 1, borderRadius: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { flexShrink: 1, fontSize: 14, fontWeight: '900' },
  save: { width: 48, height: 48, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '800' },
  helper: { fontSize: 11, lineHeight: 16 },
});
