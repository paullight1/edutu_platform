import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { Ban, EyeOff, Flag, Trash2, UserMinus } from 'lucide-react-native';
import * as communityApi from '@edutu/core/src/services/communities';
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
 *    Reporting the GROUP is deliberately NOT here: a group is not a message,
 *    and its report lives once, in the chat header's kebab, where the gating
 *    and the confirm step already are.
 *
 * 3. A REPORT WITH NO ADMIN CONSOLE BEHIND IT. Nobody at Edutu reads a queue in
 *    this release, so a report does two things and the copy promises exactly
 *    those two: the message disappears from the reporter's transcript
 *    immediately, and the group's owner — who holds remove-member and
 *    delete-message — is notified by the backend. "We'll review it" would be a
 *    promise with nothing behind it, and a report button people learn is
 *    theatre is worse than no button.
 *
 * 4. DESTRUCTIVE ACTIONS CONFIRM. Block, remove and delete each open a second
 *    step that states what is and is not reversible, because all three are
 *    one tap from a long-press and two of them cannot be undone in the app.
 *
 * Colour stays Restrained (DESIGN.md §1): the accent tints the caller's own
 * bubble because that is "current selection / state", the destructive red is
 * the only strong colour, and nothing here earns a saturated field — chat is
 * not an AI moment.
 */

/** Every action the long-press menu can start. */
type BubbleAction = 'report' | 'block' | 'remove' | 'delete';

export interface MessageBubbleProps {
  message: CommunityMessage;
  /** Right-aligned, accent-tinted when true. */
  own: boolean;
  /** A send that has left the composer but is not yet acknowledged. */
  pending?: boolean;
  /**
   * Owners, mods and the author may delete; everyone else may not.
   *
   * It doubles as the moderator signal: being able to delete SOMEBODY ELSE'S
   * message is only ever true for an owner or a mod, so `canDelete && !own` is
   * what reveals "remove from group" without the screen having to pass a second
   * flag that could disagree with the first.
   */
  canDelete?: boolean;
  onReport?: (message: CommunityMessage) => Promise<void> | void;
  onBlock?: (message: CommunityMessage) => Promise<void> | void;
  onDelete?: (message: CommunityMessage) => Promise<void> | void;
  /** Optional: the screen may want to refresh its roster after a removal. */
  onRemoveMember?: (message: CommunityMessage) => Promise<void> | void;
}

export function MessageBubble({
  message,
  own,
  pending = false,
  canDelete = false,
  onReport,
  onBlock,
  onDelete,
  onRemoveMember,
}: MessageBubbleProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();
  const { getToken } = useAuth();

  const [actionsOpen, setActionsOpen] = useState(false);
  const [confirming, setConfirming] = useState<BubbleAction | null>(null);
  const [busy, setBusy] = useState<BubbleAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  const deleted = !!message.deletedAt;
  const canAct = !deleted && !pending;

  /**
   * Perform one action. Every branch falls back to calling the API itself when
   * the screen passed no handler, so the safety kit is never one missing prop
   * away from being unreachable.
   */
  const perform = useCallback(
    async (action: BubbleAction) => {
      switch (action) {
        case 'report': {
          if (onReport) return onReport(message);
          await communityApi.reportTarget(
            { targetType: 'message', targetId: message.id, reason: 'member_report' },
            getToken,
          );
          return;
        }
        case 'block': {
          // SERVER FIRST, and then the caller's local mute. The server write is
          // what survives a reinstall and reaches the member's other device;
          // `onBlock` is what makes the transcript update in this frame. If the
          // server refuses ("You can't block yourself"), the local mute must not
          // pretend it worked, so it never runs.
          await communityApi.blockUser(message.userId, getToken);
          if (onBlock) await onBlock(message);
          return;
        }
        case 'remove': {
          if (onRemoveMember) return onRemoveMember(message);
          await communityApi.removeMember(message.groupId, message.userId, getToken);
          return;
        }
        case 'delete': {
          if (onDelete) return onDelete(message);
          await communityApi.deleteMessage(message.id, getToken);
          return;
        }
      }
    },
    [message, getToken, onReport, onBlock, onDelete, onRemoveMember],
  );

  const run = useCallback(
    async (action: BubbleAction) => {
      if (busy) return;
      setActionError(null);
      setBusy(action);
      try {
        await perform(action);
        setConfirming(null);
        if (action === 'report') {
          // The visible consequence of a report, and the whole of it: the
          // message goes. Nothing else in this release makes it disappear.
          setReported(true);
        } else {
          setActionsOpen(false);
        }
      } catch (caught) {
        // The server's sentence, never a status code — see CommunityApiError.
        setActionError(
          caught instanceof Error && caught.message
            ? caught.message
            : t('common:errors.generic'),
        );
      } finally {
        setBusy(null);
      }
    },
    [busy, perform, t],
  );

  /**
   * Report is a confirm too, because it is irreversible in the direction that
   * matters: the reporter cannot un-hide the message, and the owner cannot
   * un-see the notification.
   */
  const confirmCopy: Record<BubbleAction, { title: string; body: string; label: string }> = {
    report: {
      title: t('community:moderation.reportConfirmTitle'),
      body: t('community:moderation.reportConfirmBody'),
      label: t('community:moderation.reportMessage'),
    },
    block: {
      title: t('community:moderation.blockConfirmTitle'),
      body: t('community:moderation.blockConfirmBody'),
      label: t('community:moderation.blockUser'),
    },
    remove: {
      title: t('community:moderation.removeConfirmTitle'),
      body: t('community:moderation.removeConfirmBody'),
      label: t('community:moderation.removeMember'),
    },
    delete: {
      title: t('community:moderation.deleteConfirmTitle'),
      body: t('community:moderation.deleteConfirmBody'),
      label: t('community:moderation.deleteMessage'),
    },
  };

  /** Block, remove and delete take something away; a report does not. */
  const destructive = confirming === 'block' || confirming === 'remove' || confirming === 'delete';

  // ── Reported: hidden from the reporter, at once ────────────────────────────
  // Same shape as a tombstone, because it is the same idea — the row stays so
  // the transcript does not silently reflow — but the body is gone for THIS
  // reader only, and the copy says exactly who was told.
  if (reported) {
    return (
      <View
        testID={`message-reported-${message.id}`}
        style={[styles.row, own ? styles.rowOwn : styles.rowOther]}
      >
        <View
          style={[
            styles.bubble,
            styles.tombstone,
            { borderColor: colors.border, backgroundColor: 'transparent' },
          ]}
        >
          <View style={styles.head}>
            <EyeOff size={14} color={colors.textSecondary} />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              {t('community:moderation.reportedNotice')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

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
          {confirming ? (
            // ── The second step ──────────────────────────────────────────────
            // In place, under the message it is about. It states the outcome in
            // full — what goes, what stays, what cannot be undone — because a
            // confirmation that only repeats the verb confirms nothing.
            <View testID={`message-confirm-${message.id}`} style={styles.confirm}>
              <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
                {confirmCopy[confirming].title}
              </Text>
              <Text style={[styles.confirmBody, { color: colors.textSecondary }]}>
                {confirmCopy[confirming].body}
              </Text>
              <View style={styles.confirmRow}>
                <AnimatedPressable
                  testID={`message-confirm-cancel-${message.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('common:actions.cancel')}
                  accessibilityState={{ disabled: busy !== null }}
                  disabled={busy !== null}
                  hapticFeedback="selection"
                  scaleTo={0.97}
                  onPress={() => setConfirming(null)}
                  style={[styles.confirmButton, { borderColor: colors.border }]}
                >
                  <Text
                    style={[styles.confirmButtonLabel, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {t('common:actions.cancel')}
                  </Text>
                </AnimatedPressable>

                <AnimatedPressable
                  testID={`message-confirm-accept-${message.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={confirmCopy[confirming].label}
                  accessibilityState={{ disabled: busy !== null, busy: busy !== null }}
                  disabled={busy !== null}
                  hapticFeedback={destructive ? 'heavy' : 'medium'}
                  scaleTo={0.97}
                  onPress={() => void run(confirming)}
                  style={[
                    styles.confirmButton,
                    {
                      borderColor: destructive ? colors.error : colors.foreground,
                      backgroundColor: destructive ? `${colors.error}14` : 'transparent',
                      opacity: busy !== null ? 0.6 : 1,
                    },
                  ]}
                >
                  {busy !== null ? (
                    <ActivityIndicator
                      testID={`message-confirm-busy-${message.id}`}
                      size="small"
                      color={destructive ? colors.error : colors.foreground}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.confirmButtonLabel,
                        { color: destructive ? colors.error : colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {confirmCopy[confirming].label}
                    </Text>
                  )}
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            <>
              {!own && (
                <BubbleActionRow
                  testID={`message-report-${message.id}`}
                  label={t('community:moderation.reportMessage')}
                  icon={Flag}
                  color={colors.textSecondary}
                  labelColor={colors.foreground}
                  disabled={busy !== null}
                  onPress={() => setConfirming('report')}
                />
              )}

              {!own && (
                <BubbleActionRow
                  testID={`message-block-${message.id}`}
                  label={t('community:moderation.blockUser')}
                  icon={Ban}
                  color={colors.textSecondary}
                  labelColor={colors.foreground}
                  disabled={busy !== null}
                  onPress={() => setConfirming('block')}
                />
              )}

              {/* Deleting somebody else's message is a moderator power, so the
                  same condition reveals the other one they hold. */}
              {!own && canDelete && (
                <BubbleActionRow
                  testID={`message-remove-member-${message.id}`}
                  label={t('community:moderation.removeMember')}
                  icon={UserMinus}
                  color={colors.error}
                  labelColor={colors.error}
                  disabled={busy !== null}
                  onPress={() => setConfirming('remove')}
                />
              )}

              {canDelete && (
                <BubbleActionRow
                  testID={`message-delete-${message.id}`}
                  label={t('community:moderation.deleteMessage')}
                  icon={Trash2}
                  color={colors.error}
                  labelColor={colors.error}
                  disabled={busy !== null}
                  onPress={() => setConfirming('delete')}
                />
              )}
            </>
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

/** One row of the long-press menu. Icon + label, never icon alone. */
function BubbleActionRow({
  testID,
  label,
  icon: Icon,
  color,
  labelColor,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  labelColor: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={onPress}
      style={[styles.action, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.actionInner}>
        <Icon size={14} color={color} />
        <Text style={[styles.actionLabel, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  confirm: {
    padding: 12,
    gap: 8,
  },
  confirmTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: 'continuous',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  confirmButtonLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
