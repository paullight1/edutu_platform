import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_PRICING,
  type PricingConfig,
  effectivePrice,
  formatMoney,
} from '../../lib/pricing';
import { fetchMobileControlConfig } from '../../lib/mobileControl';

export interface UpgradeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Optional context line, e.g. "You've run out of credits". */
  reason?: string;
  /** Optional pre-fetched pricing; otherwise fetched once (falls back to defaults). */
  pricing?: PricingConfig;
}

// Feature keys live in the home namespace under paywall.features.*.
const SHEET_FEATURES = [
  'paywall.features.unlimitedAi',
  'paywall.features.aiTailoring',
  'paywall.features.priorityTools',
];

/**
 * Bottom-sheet upgrade card — a vivid gradient panel that slides up over a
 * dark scrim. Purely presentational: the UPGRADE button routes to /paywall,
 * where the real purchase logic lives.
 */
export function UpgradeSheet({ visible, onClose, reason, pricing: pricingProp }: UpgradeSheetProps) {
  const { t } = useTranslation('home');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [fetchedPricing, setFetchedPricing] = useState<PricingConfig | null>(null);

  // Admin pricing (same source as the paywall); silent fallback to defaults.
  useEffect(() => {
    if (pricingProp) return;
    let cancelled = false;
    fetchMobileControlConfig()
      .then((config) => { if (!cancelled) setFetchedPricing(config.pricing); })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, [pricingProp]);

  const pricing = pricingProp ?? fetchedPricing ?? DEFAULT_PRICING;

  const priceLine = t('paywall.upgradeSheet.priceLine', {
    monthly: formatMoney(effectivePrice(pricing, 'monthly'), pricing.currency),
    weekly: formatMoney(effectivePrice(pricing, 'weekly'), pricing.currency),
  });

  const handleUpgrade = () => {
    onClose();
    router.push('/paywall' as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Dark scrim — tap to dismiss */}
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => { /* swallow taps inside the sheet */ }}
        >
          <LinearGradient
            colors={['#2563EB', '#7C3AED', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.panel}
          >
            <View style={styles.grabber} />

            <View style={styles.badgeChip}>
              <Text style={styles.badgeChipText}>{t('paywall.upgradeSheet.badge')}</Text>
            </View>

            <Text style={styles.title}>{t('paywall.upgradeSheet.title')}</Text>
            {!!reason && <Text style={styles.reason}>{reason}</Text>}
            <Text style={styles.priceLine}>{priceLine}</Text>

            <View style={styles.features}>
              {SHEET_FEATURES.map((key) => (
                <View key={key} style={styles.featureRow}>
                  <View style={styles.featureCheck}>
                    <Check size={13} color="#FFFFFF" strokeWidth={3.2} />
                  </View>
                  <Text style={styles.featureText}>{t(key)}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity activeOpacity={0.9} onPress={handleUpgrade} style={styles.upgradeButton}>
              <LinearGradient
                colors={['#F97316', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.upgradeGradient}
              >
                <Text style={styles.upgradeText}>{t('paywall.upgradeSheet.cta')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.cancelRow}>
              <ShieldCheck size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.cancelText}>{t('paywall.upgradeSheet.cancelAnytime')}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: 12,
  },
  panel: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 22,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginBottom: 16,
  },
  badgeChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginBottom: 6 },
  reason: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, lineHeight: 19, marginBottom: 6 },
  priceLine: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '700', marginBottom: 16 },
  features: { gap: 10, marginBottom: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
  upgradeButton: { borderRadius: 999, overflow: 'hidden' },
  upgradeGradient: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  upgradeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  cancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  cancelText: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600' },
});
