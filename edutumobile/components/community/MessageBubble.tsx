import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ban, Flag, Trash2 } from 'lucide-react-native';
import type { CommunityMessage } from '@edutu/core/src/services/communities';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';
import { formatRelativeTime } from '../../lib/utils';

/**
 * One message.
 *
 * TWO THINGS THIS COMPONENT EXISTS TO GET RIGHT.
 *
 * 1. TOMBSTONES. A moderated message is not an absence — the backend keeps the
 *    row, blanks `body` and stamps `deletedAt` precisely so every reader learns
 *    that something was removed. Rendering it as a quiet italic line in the
 *    position the message occupied is the whole point; dropping the row would
 *    reflow the conversation and leave the reader believing nothing happened.
 *
 * 2. MODERATION WITHOUT A MODAL. Long-press reveals report / block / delete
 *    INLINE, under the bubble. DESIGN.md §5.2 lists the modal reflex as a known
 *    debt: an action row on a message you are already looking at is content in
 *    place, not an interruption that needs to seize the screen.
 *
 * Colour stays Restrained (DESIGN.md §1): the accent tints the caller's own
 * bubble because that is "current selection / state", and nothing here earns a
 * saturated field — chat is not an AI moment.
 */
export interface MessageBubbleProps {
  message: CommunityMessage;
  /** Right-aligned, accent-tinted when true. */
  own: boolean;
  /** A send that has left the composer but is not yet acknowledged. */
  pending?: boolean;
  /** Owners, mods and the author may delete; everyone else may not. */
  canDelete?: boolean;
  onReport?: (message: CommunityMessage) => Promise<void> | void;
  onBlock?: (message: CommunityMessage) => Promise<void> | void;
  onDelete?: (message: CommunityMessage) => Promise<void> | void;
}

export function MessageBubble({
  message,
  own,
  pending = false,
  canDelete = false,
  onReport,
  onBlock,
  onDelete,
}: MessageBubbleProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  const [actionsOpen, setActionsOpen] = useState(false);
  const [busy, setBusy] = useState<'report' | 'block' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const deleted = !!message.deletedAt;
  const canAct = !deleted && !pending && (!!onReport || !!onBlock || !!onDelete);

  const run = useCallback(
    async (
      kind: 'report' | 'block' | 'delete',
      handler?: (message: CommunityMessage) => Promise<void> | void,
    ) => {
      if (!handler || busy) return;
      setActionError(null);
      setBusy(kind);
      try {
        await handler(message);
        if (kind === 'report') {
          // Stays open, marked done: closing instantly reads as "nothing
          // happened" for an action with no other visible consequence.
          setReported(true);
        } else {
          setActionsOpen(false);
        }
      } catch (caught) {
        setActionError(
          caught instanceof Error && caught.message
            ? caught.message
            : t('common:errors.generic'),
        );
      } finally {
        setBusy(null);
      }
    },
    [busy, message, t],
  );

  // ── Tombstone ──────────────────────────────────────────────────────────────
  if (deleted) {
    return (
      <View
        testID={`message-tombstone-${message.id}`}
        style={[styles.row, own ? styles.rowOwn : styles.rowOther]}
      >
        <View
          style={[
            styles.bubble,
            styles.tombstone,
            { borderColor: colors.border, backgroundColor: 'transparent' },
          ]}
        >
          <Text
            style={[styles.tombstoneText, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {t('community:chat.messageDeleted')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, own ? styles.rowOwn : styles.rowOther]}>
      <AnimatedPressable
        testID={`message-bubble-${message.id}`}
        accessibilityRole="button"
        accessibilityLabel={message.body}
        accessibilityState={{ expanded: actionsOpen, busy: pending }}
        hapticFeedback="none"
        scaleTo={0.98}
        disabled={!canAct}
        onPress={() => {
          if (canAct && actionsOpen) setActionsOpen(false);
        }}
        onLongPress={() => {
          if (canAct) setActionsOpen(true);
        }}
        style={[
          styles.bubble,
          {
            backgroundColor: own ? `${colors.accent}1A` : colors.card,
            borderColor: own ? colors.accent : colors.border,
            opacity: pending ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.body, { color: colors.foreground }]}>{message.body}</Text>
        <View style={styles.metaRow}>
          <Text
            style={[styles.meta, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {formatRelativeTime(message.createdAt)}
          </Text>
          {pending && (
            <ActivityIndicator
              testID={`message-pending-${message.id}`}
              size="small"
              color={colors.textSecondary}
            />
          )}
        </View>
      </AnimatedPressable>

      {actionsOpen && (
        <View
          testID={`message-actions-${message.id}`}
          style={[
            styles.actions,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          {!!onReport && (
            <AnimatedPressable
              testID={`message-report-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('community:moderation.reportMessage')}
              accessibilityState={{ disabled: reported || busy !== null, busy: busy === 'report' }}
              disabled={reported || busy !== null}
              hapticFeedback="selection"
              onPress={() => void run('report', onReport)}
              style={styles.action}
            >
              <View style={styles.actionInner}>
                <Flag size={14} color={colors.textSecondary} />
                <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {reported
                    ? t('common:states.success')
                    : t('community:moderation.reportMessage')}
                </Text>
              </View>
            </AnimatedPressable>
          )}

          {!!onBlock && !own && (
            <AnimatedPressable
              testID={`message-block-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('community:moderation.blockUser')}
              accessibilityState={{ disabled: busy !== null, busy: busy === 'block' }}
              disabled={busy !== null}
              hapticFeedback="medium"
              onPress={() => void run('block', onBlock)}
              style={styles.action}
            >
              <View style={styles.actionInner}>
                <Ban size={14} color={colors.textSecondary} />
                <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={1}>
                  {t('community:moderation.blockUser')}
                </Text>
              </View>
            </AnimatedPressable>
          )}

          {!!onDelete && canDelete && (
            <AnimatedPressable
              testID={`message-delete-${message.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('community:moderation.deleteMessage')}
              accessibilityState={{ disabled: busy !== null, busy: busy === 'delete' }}
              disabled={busy !== null}
              hapticFeedback="heavy"
              onPress={() => void run('delete', onDelete)}
              style={styles.action}
            >
              <View style={styles.actionInner}>
                <Trash2 size={14} color={colors.error} />
                <Text style={[styles.actionLabel, { color: colors.error }]} numberOfLines={1}>
                  {t('community:moderation.deleteMessage')}
                </Text>
              </View>
            </AnimatedPressable>
          )}

          {!!actionError && (
            <Text
              testID={`message-action-error-${message.id}`}
              style={[styles.actionError, { color: colors.error }]}
            >
              {actionError}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 8,
    maxWidth: '86%',
  },
  rowOwn: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  tombstone: {
    borderStyle: 'dashed',
  },
  tombstoneText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meta: {
    fontSize: 11,
  },
  actions: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  action: {
    minHeight: 38,
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionError: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
