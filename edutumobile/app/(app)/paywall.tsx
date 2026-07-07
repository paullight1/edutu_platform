import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Check,
  Crown,
  Download,
  Palette,
  RefreshCcw,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { supabase } from '../../lib/supabase';
import {
  getOfferings,
  initRevenueCat,
  purchasePackage,
  restorePurchases,
} from '@edutu/core/src/services/payments';
import { useTranslation } from 'react-i18next';

type Plan = 'monthly' | 'yearly';

// `text` holds an i18n key (home namespace); translated at render time.
const PREMIUM_FEATURES = [
  { icon: Sparkles, text: 'paywall.features.unlimitedAi' },
  { icon: Palette, text: 'paywall.features.premiumTemplates' },
  { icon: Zap, text: 'paywall.features.aiTailoring' },
  { icon: Star, text: 'paywall.features.priorityTools' },
  { icon: Download, text: 'paywall.features.pdfExport' },
  { icon: Check, text: 'paywall.features.advancedFilters' },
];

export default function PaywallScreen() {
  const { t } = useTranslation('home');
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);

  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [availablePackages, setAvailablePackages] = useState<PurchasesPackage[]>([]);
  const [subscriptionProducts, setSubscriptionProducts] = useState<PurchasesStoreProduct[]>([]);

  const accent = colors.accent;
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const surface = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.035)' : '#F8FAFC';
  const borderColor = isDark ? 'rgba(255,255,255,0.09)' : '#E2E8F0';
  const gradientColors: [string, string] = isDark
    ? [colors.background, '#0F172A']
    : [colors.background, '#F8FAFC'];

  useEffect(() => {
    const loadProducts = async () => {
      if (!user?.id) return;

      try {
        const configured = await initRevenueCat(user.id);
        if (!configured) return;

        const offering = await getOfferings();
        if (offering) {
          setSubscriptionProducts((offering as any).subscriptionProducts || []);
          setAvailablePackages(offering.availablePackages || []);
        }
      } catch (error) {
        console.error('Failed to load subscription products:', error);
      }
    };

    void loadProducts();
  }, [user?.id]);

  const selectedPackage = useMemo(() => {
    return availablePackages.find((pkg) =>
      selectedPlan === 'monthly'
        ? pkg.identifier.includes('monthly') || pkg.identifier.includes('month')
        : pkg.identifier.includes('yearly') || pkg.identifier.includes('year'),
    );
  }, [availablePackages, selectedPlan]);

  const getSubscriptionPrice = (plan: Plan): string => {
    const pkg = availablePackages.find((item) =>
      plan === 'monthly'
        ? item.identifier.includes('monthly') || item.identifier.includes('month')
        : item.identifier.includes('yearly') || item.identifier.includes('year'),
    );

    if (pkg?.product?.priceString) return pkg.product.priceString;
    return plan === 'monthly' ? '$9.99' : '$71.88';
  };

  const getPlanCaption = (plan: Plan): string => {
    const pkg = availablePackages.find((item) =>
      plan === 'monthly'
        ? item.identifier.includes('monthly') || item.identifier.includes('month')
        : item.identifier.includes('yearly') || item.identifier.includes('year'),
    );

    if (pkg?.product?.priceString) {
      if (plan === 'monthly') return t('paywall.billedMonthly');

      const numeric = Number(pkg.product.priceString.replace(/[^0-9.]/g, ''));
      const symbol = pkg.product.priceString.replace(/[0-9.,]/g, '').trim() || '$';
      if (!Number.isNaN(numeric)) return t('paywall.perMonthBilledYearly', { price: `${symbol}${(numeric / 12).toFixed(2)}` });
    }

    return plan === 'monthly' ? t('paywall.billedMonthly') : t('paywall.perMonthBilledYearly', { price: '$5.99' });
  };

  const handleSubscribe = async () => {
    if (!selectedPackage) {
      Alert.alert(t('paywall.comingSoonTitle'), t('paywall.comingSoonMessage'));
      return;
    }

    setLoading(true);
    try {
      const result = await purchasePackage(selectedPackage);
      if (result.success) {
        Alert.alert(t('paywall.premiumActiveTitle'), t('paywall.premiumActiveMessage'));
        router.back();
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert(t('common:states.error'), result.error);
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error.message || t('paywall.purchaseFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        Alert.alert(t('paywall.restoredTitle'), t('paywall.restoredMessage'));
      } else {
        Alert.alert(t('common:states.error'), result.error || t('paywall.restoreFailed'));
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error.message || t('paywall.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  if (proLoading) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ScreenHeader title={t('paywall.title')} showBack />
          <View style={styles.centered}>
            <BrandedLoader label={t('paywall.loading')} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader
          title={t('paywall.title')}
          subtitle={isPro ? t('paywall.subscriptionActive') : t('paywall.simpleAccess')}
          showBack
          right={
            <TouchableOpacity
              onPress={handleRestore}
              disabled={restoring}
              style={[styles.restoreButton, { backgroundColor: softSurface, borderColor }]}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={textSecondary} />
              ) : (
                <RefreshCcw size={18} color={textSecondary} />
              )}
            </TouchableOpacity>
          }
        />

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        >
          <View style={[styles.hero, { backgroundColor: surface, borderColor }]}>
            <View style={[styles.heroIcon, { backgroundColor: `${accent}18` }]}>
              <Crown size={32} color={accent} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {isPro ? t('paywall.premiumIsActive') : t('paywall.unlockPremium')}
            </Text>
            <Text style={[styles.heroText, { color: textSecondary }]}>
              {isPro
                ? t('paywall.heroActive')
                : t('paywall.heroUpsell')}
            </Text>
          </View>

          {!isPro && (
            <>
              <View style={[styles.planSwitch, { backgroundColor: softSurface, borderColor }]}>
                {(['monthly', 'yearly'] as Plan[]).map((plan) => {
                  const active = selectedPlan === plan;
                  return (
                    <TouchableOpacity
                      key={plan}
                      onPress={() => setSelectedPlan(plan)}
                      activeOpacity={0.8}
                      style={[styles.planOption, active && { backgroundColor: `${accent}18` }]}
                    >
                      <Text style={[styles.planLabel, { color: active ? accent : textSecondary }]}>
                        {plan === 'monthly' ? t('paywall.monthly') : t('paywall.yearly')}
                      </Text>
                      {plan === 'yearly' && (
                        <Text style={[styles.planPill, { color: active ? accent : textSecondary }]}>
                          {t('paywall.save')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.priceCard, { backgroundColor: surface, borderColor }]}>
                <Text style={[styles.price, { color: colors.foreground }]}>
                  {getSubscriptionPrice(selectedPlan)}
                </Text>
                <Text style={[styles.priceCaption, { color: textSecondary }]}>
                  {getPlanCaption(selectedPlan)}
                </Text>
              </View>
            </>
          )}

          <View style={styles.features}>
            {PREMIUM_FEATURES.map((feature) => (
              <View
                key={feature.text}
                style={[styles.featureRow, { backgroundColor: surface, borderColor }]}
              >
                <View style={[styles.featureIcon, { backgroundColor: `${accent}14` }]}>
                  <feature.icon size={16} color={accent} />
                </View>
                <Text style={[styles.featureText, { color: colors.foreground }]}>
                  {t(feature.text)}
                </Text>
              </View>
            ))}
          </View>

          {isPro ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.back()}
              style={[styles.secondaryButton, { backgroundColor: surface, borderColor }]}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                {t('paywall.backToApp')}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={loading}
              onPress={handleSubscribe}
              style={styles.subscribeButton}
            >
              <LinearGradient
                colors={[colors.primary, accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.subscribeGradient}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Crown size={18} color="#FFFFFF" />
                    <Text style={styles.subscribeText}>
                      {t('paywall.subscribe')}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}

          <Text style={[styles.renewalText, { color: textSecondary }]}>
            {t('paywall.renewalNote')}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  hero: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 18,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  planSwitch: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    marginBottom: 14,
  },
  planOption: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  planLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  planPill: {
    fontSize: 11,
    fontWeight: '600',
  },
  priceCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    marginBottom: 18,
  },
  price: {
    fontSize: 36,
    fontWeight: '600',
  },
  priceCaption: {
    fontSize: 13,
    marginTop: 4,
  },
  features: {
    gap: 10,
    marginBottom: 18,
  },
  featureRow: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  subscribeButton: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 2,
  },
  subscribeGradient: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  subscribeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  renewalText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 16,
  },
});
