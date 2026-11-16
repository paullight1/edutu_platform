import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShieldCheck } from 'lucide-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * The house rules, shown ONCE, immediately before somebody's first message.
 *
 * WHY IT IS A CARD ABOVE THE COMPOSER AND NOT A MODAL. It is read at the exact
 * moment it applies — the person is already typing — and a modal would take the
 * room away to say something about the room (DESIGN.md §5.2). It is also the
 * only moment the rules are cheap to state: after a removal they are an excuse,
 * and buried in settings they are decoration.
 *
 * WHY ACKNOWLEDGEMENT IS PERSISTED AND NOT COUNTED. "Once" has to survive a
 * relaunch or it is not once, it is once per session, which is nagging. The
 * acknowledgement is written before the callback fires so a caller that
 * immediately unmounts this component still leaves the flag behind.
 *
 * The flag is device-local on purpose: it gates a piece of copy, not a
 * permission, and a server round-trip to decide whether to show a paragraph
 * would make the composer wait on the network.
 */

/** Once ever, not once per group: the rules are the same room to room. */
export const FIRST_POST_NOTICE_KEY = 'edutu:community:firstPostAcknowledged';

export async function hasAcknowledgedFirstPost(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FIRST_POST_NOTICE_KEY)) === 'true';
  } catch {
    // An unreadable flag shows the notice again. Repeating the rules is a
    // smaller failure than silently dropping them for somebody who never read
    // them, so this fails toward showing.
    return false;
  }
}

export async function acknowledgeFirstPost(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_POST_NOTICE_KEY, 'true');
  } catch {
    // Worst case the notice appears once more.
  }
}

export interface FirstPostNoticeProps {
  /**
   * Set false to keep the notice out of the way entirely (the person is not
   * about to post, or cannot). Defaults to true; the persisted flag still wins.
   */
  active?: boolean;
  onAcknowledge?: () => void;
  testID?: string;
}

export function FirstPostNotice({
  active = true,
  onAcknowledge,
  testID = 'first-post-notice',
}: FirstPostNoticeProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors } = useTheme();

  /** `null` = the flag has not been read yet; render nothing rather than flash. */
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const acknowledged = await hasAcknowledgedFirstPost();
      if (!cancelled) setVisible(!acknowledged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const acknowledge = useCallback(() => {
    // Hidden first so the tap feels instant, then persisted. The write is
    // awaited inside the promise, not by the handler, because a slow disk must
    // not hold the composer.
    setVisible(false);
    void acknowledgeFirstPost().then(() => onAcknowledge?.());
  }, [onAcknowledge]);

  if (!active || visible !== true) return null;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.head}>
        <ShieldCheck size={18} color={colors.textSecondary} />
        <Text style={[styles.badge, { color: colors.textSecondary }]} numberOfLines={1}>
          {t('community:firstPost.badge')}
        </Text>
      </View>

      <Text testID={`${testID}-title`} style={[styles.title, { color: colors.foreground }]}>
        {t('community:moderation.noToleranceTitle')}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {t('community:moderation.noToleranceBody')}
      </Text>

      <AnimatedPressable
        testID={`${testID}-acknowledge`}
        accessibilityRole="button"
        accessibilityLabel={t('community:firstPost.acknowledge')}
        hapticFeedback="selection"
        scaleTo={0.97}
        onPress={acknowledge}
        style={[styles.action, { borderColor: colors.border }]}
      >
        <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={1}>
          {t('community:firstPost.acknowledge')}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
  },
  action: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: 'continuous',
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
});
