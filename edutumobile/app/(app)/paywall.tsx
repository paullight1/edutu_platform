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

type Plan = 'monthly' | 'yearly';

const PREMIUM_FEATURES = [
  { icon: Sparkles, text: 'Unlimited AI generation' },
  { icon: Palette, text: 'Premium CV templates' },
  { icon: Zap, text: 'AI-powered tailoring' },
  { icon: Star, text: 'Priority opportunity tools' },
  { icon: Download, text: 'PDF export' },
  { icon: Check, text: 'Advanced filters' },
];

export default function PaywallScreen() {
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
      if (plan === 'monthly') return 'Billed monthly';

      const numeric = Number(pkg.product.priceString.replace(/[^0-9.]/g, ''));
      const symbol = pkg.product.priceString.replace(/[0-9.,]/g, '').trim() || '$';
      if (!Number.isNaN(numeric)) return `${symbol}${(numeric / 12).toFixed(2)} per month, billed yearly`;
    }

    return plan === 'monthly' ? 'Billed monthly' : '$5.99 per month, billed yearly';
  };

  const handleSubscribe = async () => {
    if (!selectedPackage) {
      Alert.alert('Coming Soon', 'Subscriptions will be available once App Store products are configured.');
      return;
    }

    setLoading(true);
    try {
      const result = await purchasePackage(selectedPackage);
      if (result.success) {
        Alert.alert('Premium Active', 'Your premium subscription is now active.');
        router.back();
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert('Error', result.error);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Purchase failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        Alert.alert('Restored', 'Your purchases have been restored.');
      } else {
        Alert.alert('Error', result.error || 'Failed to restore purchases');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases');
    } finally {
      setRestoring(false);
    }
  };

  if (proLoading) {
    return (
      <LinearGradient colors={gradientColors} style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ScreenHeader title="Premium" showBack />
          <View style={styles.centered}>
            <BrandedLoader label="Loading premium..." />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={gradientColors} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScreenHeader
          title="Premium"
          subtitle={isPro ? 'Your subscription is active' : 'Simple subscription access'}
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
              {isPro ? 'Premium is active' : 'Unlock premium'}
            </Text>
            <Text style={[styles.heroText, { color: textSecondary }]}>
              {isPro
                ? 'You already have access to premium tools and templates.'
                : 'Subscribe for premium templates, AI tools, exports, and advanced matching.'}
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
                        {plan === 'monthly' ? 'Monthly' : 'Yearly'}
                      </Text>
                      {plan === 'yearly' && (
                        <Text style={[styles.planPill, { color: active ? accent : textSecondary }]}>
                          Save
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
                  {feature.text}
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
                Back to app
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
                      Subscribe to premium
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}

          <Text style={[styles.renewalText, { color: textSecondary }]}>
            Subscription renews automatically and can be managed in your device settings.
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
