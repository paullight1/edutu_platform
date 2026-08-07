import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness, ChevronRight, Lock } from 'lucide-react-native';
import { FadeInDown } from 'react-native-reanimated';
import type {
  CommunityGroup,
  MembershipStatus,
} from '@edutu/core/src/services/communities';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';
import { formatRelativeTime } from '../../lib/utils';
import { GroupAvatar } from './GroupAvatar';

/**
 * One group as a LIST ROW — the affordance for rooms you are already in or
 * already have a standing with. Deliberately not a card: the browse screen
 * renders three different shapes (rows here, a rail for opportunity-anchored
 * groups, inline pills for discovery) because DESIGN.md §5.1 bans repeating one
 * card grid for every list on a screen.
 *
 * The membership line is the reason this component exists. `invited` and
 * `pending` look identical in the data and mean opposite things to the person
 * reading them: an invitee can walk in, an applicant is waiting on somebody
 * else. `removed` and `banned` are departures, and `banned` never offers a way
 * back in.
 */
interface GroupRowProps {
  group: CommunityGroup;
  /** `null` when the caller has no relationship with this group at all. */
  membership?: MembershipStatus | null;
  /** Drives the accent dot. Unread is one of the only things accent carries. */
  unread?: boolean;
  /** Position in its own list, for the staggered entrance. */
  index?: number;
  onPress?: (group: CommunityGroup) => void;
  disabled?: boolean;
  /** A row waiting on something (accepting an invite, opening) shows a spinner. */
  loading?: boolean;
  /**
   * `list` is deliberately borderless so a parent can provide one coherent
   * list surface. `card` remains available for a standalone row.
   */
  variant?: 'list' | 'card';
  /** Suppresses the separator after the final row in a list surface. */
  isLast?: boolean;
}

/**
 * How each membership state reads. `tone` picks the colour role rather than a
 * literal so every theme package stays honest.
 */
const MEMBERSHIP_TONE: Record<
  MembershipStatus,
  'muted' | 'accent' | 'warning' | 'error'
> = {
  active: 'muted',
  invited: 'accent',
  pending: 'warning',
  removed: 'muted',
  banned: 'error',
};

export function GroupRow({
  group,
  membership = null,
  unread = false,
  index = 0,
  onPress,
  disabled = false,
  loading = false,
  variant = 'list',
  isLast = false,
}: GroupRowProps) {
  const { t } = useTranslation('community');
  const { colors, reducedMotion } = useTheme();

  const membershipTone = membership ? MEMBERSHIP_TONE[membership] : null;
  const membershipColor =
    membershipTone === 'accent'
      ? colors.accent
      : membershipTone === 'warning'
        ? colors.warning
        : membershipTone === 'error'
          ? colors.error
          : colors.textSecondary;

  // Members + last activity. The list endpoint carries no message body, so the
  // honest "last message" signal is when it landed — and "no messages yet" when
  // nothing has.
  const meta = useMemo(() => {
    const members = t('groupState.memberCount', { count: group.memberCount });
    const activity = group.lastMessageAt
      ? formatRelativeTime(group.lastMessageAt)
      : t('chat.emptyTitle');
    return `${members} · ${activity}`;
  }, [group.memberCount, group.lastMessageAt, t]);

  const inert = disabled || loading;
  const linkedOpportunityLabel = group.opportunityId
    ? t('groupState.linkedOpportunity', { defaultValue: 'Opportunity group' })
    : null;
  const membershipLabel = membership ? t(`membership.${membership}`) : null;
  const accessibilityLabel = [
    group.name,
    meta,
    linkedOpportunityLabel,
    membershipLabel,
    group.visibility === 'private' ? t('visibility.private') : null,
    unread ? t('groupState.unread', { defaultValue: 'Unread messages' }) : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <AnimatedPressable
      testID={`group-row-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('actions.viewGroup')}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={() => onPress?.(group)}
      hapticFeedback="light"
      entering={
        reducedMotion
          ? undefined
          : FadeInDown.delay(index * 60)
              .duration(350)
              .springify()
      }
      style={[
        styles.row,
        variant === 'card' ? styles.cardRow : styles.listRow,
        {
          backgroundColor: variant === 'card' ? colors.card : 'transparent',
          borderColor:
            variant === 'card'
              ? unread
                ? colors.accent
                : colors.border
              : colors.border,
          opacity: inert ? 0.55 : 1,
        },
        variant === 'list' && isLast && styles.lastListRow,
      ]}
    >
      <View style={styles.inner}>
        <GroupAvatar
          testID={`group-row-avatar-${group.id}`}
          resourceUrl={group.coverImageResourceUrl}
          emoji={group.coverEmoji}
          size={42}
          radius={12}
        />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            {/* Decorative: the unread meaning is already in the row's label
                order, and a second focusable node per row is noise. */}
            {unread && (
              <View
                testID={`group-row-unread-${group.id}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.unreadDot, { backgroundColor: colors.accent }]}
              />
            )}
            <Text
              style={[
                styles.name,
                {
                  color: colors.foreground,
                  fontWeight: unread ? '700' : '600',
                },
              ]}
              numberOfLines={2}
            >
              {group.name}
            </Text>
            {group.visibility === 'private' && (
              <Lock
                size={13}
                color={colors.textSecondary}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            )}
          </View>

          <View style={styles.metaRow}>
            <Text
              style={[styles.meta, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {meta}
            </Text>
            {!!linkedOpportunityLabel && (
              <View
                testID={`group-row-opportunity-${group.id}`}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.opportunityBadge,
                  { backgroundColor: `${colors.accent}14` },
                ]}
              >
                <BriefcaseBusiness
                  size={11}
                  color={colors.accent}
                  strokeWidth={2.4}
                />
                <Text
                  style={[styles.opportunityLabel, { color: colors.accent }]}
                  numberOfLines={1}
                >
                  {linkedOpportunityLabel}
                </Text>
              </View>
            )}
          </View>

          {membership && (
            <Text
              testID={`group-row-membership-${group.id}`}
              style={[styles.membership, { color: membershipColor }]}
              numberOfLines={1}
            >
              {membershipLabel}
            </Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator
            testID={`group-row-loading-${group.id}`}
            size="small"
            color={colors.textSecondary}
          />
        ) : (
          <ChevronRight
            size={18}
            color={colors.textSecondary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        )}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    overflow: 'hidden',
  },
  cardRow: {
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: 'continuous',
  },
  listRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lastListRow: {
    borderBottomWidth: 0,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  meta: {
    flexShrink: 1,
    fontSize: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  opportunityBadge: {
    maxWidth: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  opportunityLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },
  membership: {
    fontSize: 12,
    fontWeight: '600',
  },
});
