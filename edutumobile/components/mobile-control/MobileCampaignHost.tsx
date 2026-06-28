import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../context/ThemeContext';
import {
  canShowCampaign,
  dismissCampaign,
  fetchMobileControlConfig,
  recordCampaignEvent,
  selectCampaign,
  type MobileCampaign,
} from '../../lib/mobileControl';

export function MobileCampaignHost() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { colors, isDark } = useTheme();
  const [campaign, setCampaign] = useState<MobileCampaign | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCampaign() {
      try {
        const config = await fetchMobileControlConfig();
        const nextCampaign = selectCampaign(config.campaigns);

        if (!nextCampaign || !(await canShowCampaign(nextCampaign))) {
          return;
        }

        if (mounted) {
          setCampaign(nextCampaign);
          const token = await getToken().catch(() => null);
          void recordCampaignEvent(nextCampaign.id, 'impression', token);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Unable to load mobile campaign config', error);
        }
      }
    }

    void loadCampaign();

    return () => {
      mounted = false;
    };
  }, [getToken]);

  if (!campaign) return null;

  const activeCampaign = campaign;
  const accentColor = campaign.creative?.accentColor || '#5B7CFA';
  const isBanner = campaign.campaign_type === 'banner';

  async function close(eventType: 'dismiss' | 'click' = 'dismiss') {
    await dismissCampaign(activeCampaign.id);
    setCampaign(null);
    const token = await getToken().catch(() => null);
    void recordCampaignEvent(activeCampaign.id, eventType, token);
  }

  async function handleAction() {
    const route = activeCampaign.creative?.ctaRoute;
    await close('click');
    if (typeof route === 'string' && route.startsWith('/')) {
      router.push(route as never);
    }
  }

  if (isBanner) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
        <View style={styles.bannerCopy}>
          <Text style={[styles.bannerTitle, { color: colors.foreground }]} numberOfLines={1}>{campaign.title}</Text>
          {!!campaign.body && <Text style={[styles.bannerBody, { color: colors.textSecondary }]} numberOfLines={2}>{campaign.body}</Text>}
        </View>
        {!!campaign.creative?.ctaLabel && (
          <TouchableOpacity style={[styles.smallButton, { backgroundColor: accentColor }]} onPress={handleAction}>
            <Text style={styles.smallButtonText}>{campaign.creative.ctaLabel}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.iconButton} onPress={() => void close()}>
          <X size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => void close()}>
      <View style={styles.overlay}>
        <View style={[styles.modal, { backgroundColor: colors.card }]}>
          <TouchableOpacity style={styles.closeButton} onPress={() => void close()}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.badge, { backgroundColor: accentColor }]}>
            <Text style={styles.badgeText}>Edu2Mobile</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{campaign.title}</Text>
          {!!campaign.body && (
            <Text style={[styles.body, { color: isDark ? '#C7C7CC' : '#4B5563' }]}>
              {campaign.body}
            </Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={() => void close()}>
              <Text style={[styles.secondaryText, { color: colors.foreground }]}>Close</Text>
            </TouchableOpacity>
            {!!campaign.creative?.ctaLabel && (
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={handleAction}>
                <Text style={styles.primaryText}>{campaign.creative.ctaLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    padding: 22,
  },
  closeButton: {
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 1,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginRight: 34,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  secondaryText: {
    fontWeight: '800',
  },
  banner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 78,
    minHeight: 74,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    paddingRight: 8,
    zIndex: 20,
  },
  accent: {
    width: 6,
    alignSelf: 'stretch',
  },
  bannerCopy: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  bannerBody: {
    fontSize: 13,
    marginTop: 3,
  },
  smallButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
