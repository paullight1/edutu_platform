import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTheme } from '../context/ThemeContext';

/**
 * The WhatsApp channel banner.
 *
 * Until now this channel WAS Group Discussions — the Discover tile linked
 * straight out to it. The audience there is real and shouldn't be stranded, so
 * the channel survives as one dismissible room among several rather than as the
 * whole feature. Dismissal is permanent (per install) because a banner the user
 * has already said "not now" to is an ad the second time.
 */
export const WA_BANNER_DISMISSED_KEY = 'edutu:discussions:waBannerDismissed';

export const WHATSAPP_CHANNEL_URL =
  'https://whatsapp.com/channel/0029VbCHBEVJJhzPcbBboP3y';

interface WhatsAppBannerProps {
  /** Test seam: lets a caller observe the dismissal without reading storage. */
  onDismiss?: () => void;
}

export function WhatsAppBanner({ onDismiss }: WhatsAppBannerProps) {
  const { t } = useTranslation(['community', 'common']);
  const { colors, reducedMotion } = useTheme();

  // `null` = still reading storage. Rendering nothing while hydrating avoids
  // the flash of a banner the user dismissed weeks ago.
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const raw = await AsyncStorage.getItem(WA_BANNER_DISMISSED_KEY);
        if (alive) setDismissed(raw === 'true');
      } catch {
        // Unreadable storage → show it. A banner shown twice beats a banner
        // that silently disappears for everyone on a storage hiccup.
        if (alive) setDismissed(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
    void AsyncStorage.setItem(WA_BANNER_DISMISSED_KEY, 'true').catch(() => {
      // The banner is gone for this session either way; a failed write just
      // means it comes back next launch, which is not worth an error state.
    });
  }, [onDismiss]);

  const handleOpen = useCallback(async () => {
    setOpening(true);
    setFailed(false);
    try {
      await Linking.openURL(WHATSAPP_CHANNEL_URL);
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }, []);

  if (dismissed !== false) return null;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(350).springify()}
      testID="whatsapp-banner"
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}18` }]}>
          <MessageCircle size={18} color={colors.accent} strokeWidth={2} />
        </View>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {t('community:whatsappBanner.title')}
        </Text>
      </View>

      <Text
        style={[styles.body, { color: colors.textSecondary }]}
        numberOfLines={3}
      >
        {t('community:whatsappBanner.body')}
      </Text>

      {failed && (
        <Text
          testID="whatsapp-banner-error"
          style={[styles.error, { color: colors.error }]}
          numberOfLines={2}
        >
          {t('common:errors.generic')}
        </Text>
      )}

      <View style={styles.actionRow}>
        <AnimatedPressable
          testID="whatsapp-banner-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('community:whatsappBanner.dismiss')}
          hapticFeedback="selection"
          onPress={handleDismiss}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryLabel, { color: colors.textSecondary }]}>
            {t('community:whatsappBanner.dismiss')}
          </Text>
        </AnimatedPressable>

        <AnimatedPressable
          testID="whatsapp-banner-action"
          accessibilityRole="button"
          accessibilityLabel={t('community:whatsappBanner.action')}
          accessibilityState={{ disabled: opening, busy: opening }}
          disabled={opening}
          onPress={handleOpen}
          style={[
            styles.primaryButton,
            { backgroundColor: colors.accent, opacity: opening ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.primaryLabel} numberOfLines={1}>
            {opening
              ? t('common:states.loading')
              : t('community:whatsappBanner.action')}
          </Text>
        </AnimatedPressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
