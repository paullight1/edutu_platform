import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react-native';
import { FadeInDown } from 'react-native-reanimated';
import type { CommunityGroup } from '@edutu/core/src/services/communities';
import { getDeadlineBadge, urgencyColor } from '@edutu/core/src/utils/deadline';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * A group pinned to an opportunity, rendered as a card in a HORIZONTAL RAIL.
 *
 * The rail is the point: these groups are time-boxed — they close when the
 * opportunity does — so they get a shape that reads as a queue you scan, not a
 * library you browse. The deadline chip takes its colour from the shared
 * `urgencyColor` ramp so a group closing in three days is the same red as the
 * opportunity card, the saved list and the home widget. A local colour scale
 * here would quietly disagree with every other deadline in the app.
 */
interface GroupRailCardProps {
  group: CommunityGroup;
  /**
   * The linked opportunity's deadline. Falls back to the group's own
   * `expiresAt`, which the backend inherits from that same deadline.
   */
  deadline?: string | null;
  /** Title of the opportunity this group hangs off, when known. */
  opportunityTitle?: string | null;
  index?: number;
  onPress?: (group: CommunityGroup) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function GroupRailCard({
  group,
  deadline,
  opportunityTitle,
  index = 0,
  onPress,
  disabled = false,
  loading = false,
}: GroupRailCardProps) {
  const { t } = useTranslation('community');
  const { colors, reducedMotion } = useTheme();

  const badge = useMemo(
    () => getDeadlineBadge(deadline ?? group.expiresAt),
    [deadline, group.expiresAt],
  );
  const badgeColor = urgencyColor(badge.level);

  const inert = disabled || loading;

  return (
    <AnimatedPressable
      testID={`group-rail-card-${group.id}`}
      accessibilityRole="button"
      accessibilityLabel={group.name}
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
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: inert ? 0.55 : 1,
        },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <View style={[styles.emojiWrap, { backgroundColor: colors.muted }]}>
            <Text style={styles.emoji}>{group.coverEmoji}</Text>
          </View>
          {loading && (
            <ActivityIndicator
              testID={`group-rail-loading-${group.id}`}
              size="small"
              color={colors.textSecondary}
            />
          )}
        </View>

        <Text
          style={[styles.name, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {group.name}
        </Text>

        {!!opportunityTitle && (
          <Text
            style={[styles.opportunity, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {opportunityTitle}
          </Text>
        )}

        <View style={styles.footer}>
          <View style={styles.members}>
            <Users size={12} color={colors.textSecondary} />
            <Text
              style={[styles.membersLabel, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {t('groupState.memberCount', { count: group.memberCount })}
            </Text>
          </View>

          <View
            testID={`group-rail-deadline-${group.id}`}
            style={[styles.chip, { backgroundColor: `${badgeColor}1F` }]}
          >
            <Text
              style={[styles.chipLabel, { color: badgeColor }]}
              numberOfLines={1}
            >
              {group.archivedAt ? t('groupState.archived') : badge.shortLabel}
            </Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 208,
    borderWidth: 1,
    borderRadius: 16,
    marginRight: 12,
  },
  inner: {
    padding: 14,
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emojiWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 18,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  opportunity: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  members: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  membersLabel: {
    fontSize: 12,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});
