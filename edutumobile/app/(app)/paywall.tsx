import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
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
  ExternalLink,
  Palette,
  Settings2,
  Sparkles,
  Star,
  Tag,
  Zap,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { supabase } from '../../lib/supabase';
import { fetchMobileControlConfig } from '../../lib/mobileControl';
import {
  DEFAULT_PRICING,
  type PricingConfig,
  type BillingPlan,
  effectivePrice,
  hasPromoDiscount,
  formatMoney,
  buildCheckoutUrl,
  buildManageUrl,
} from '../../lib/pricing';
import { useTranslation } from 'react-i18next';

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
  const { isPro, isLoading: proLoading, refreshStatus } = useProStatus(supabase, user?.id || null);

  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('yearly');
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  const [redirecting, setRedirecting] = useState(false);
  // Set true once we hand off to the browser, so the next foreground re-checks
  // Pro (the pay.edutu.org webhook grants it while we're away).
  const awaitingReturnRef = useRef(false);

  const accent = colors.accent;
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const surface = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.035)' : '#F8FAFC';
  const borderColor = isDark ? 'rgba(255,255,255,0.09)' : '#E2E8F0';
  const gradientColors: [string, string] = isDark
    ? [colors.background, '#0F172A']
    : [colors.background, '#F8FAFC'];

  // Admin-controlled prices/currency/promo (mobile-control config). Falls back
  // to DEFAULT_PRICING if the feed is unreachable, so the paywall always works.
  useEffect(() => {
    let cancelled = false;
    fetchMobileControlConfig()
      .then((config) => { if (!cancelled) setPricing(config.pricing); })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  // Re-check Pro whenever we come back from the hosted checkout.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && awaitingReturnRef.current) {
        awaitingReturnRef.current = false;
        void refreshStatus();
      }
    });
    return () => sub.remove();
  }, [refreshStatus]);

  const openExternal = useCallback(async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('cannot open url');
      awaitingReturnRef.current = true;
      await Linking.openURL(url);
    } catch (error) {
      awaitingReturnRef.current = false;
      Alert.alert(t('common:states.error'), t('paywall.checkoutFailed'));
    }
  }, [t]);

  const handleCheckout = useCallback(async () => {
    if (!user?.id) return;
    setRedirecting(true);
    const url = buildCheckoutUrl(pricing, {
      uid: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      plan: selectedPlan,
      platform: Platform.OS,
    });
    await openExternal(url);
    // Give the app-switch a beat before releasing the button spinner.
    setTimeout(() => setRedirecting(false), 800);
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, pricing, selectedPlan, openExternal]);

  const handleManage = useCallback(() => {
    if (!user?.id) return;
    void openExternal(buildManageUrl(pricing, user.id));
  }, [user?.id, pricing, openExternal]);

  const renderPrice = (plan: BillingPlan) => {
    const price = effectivePrice(pricing, plan);
    const discounted = hasPromoDiscount(pricing, plan);
    const regular = plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;
    return (
      <View style={styles.priceInline}>
        <Text style={[styles.price, { color: colors.foreground }]}>{formatMoney(price, pricing.currency)}</Text>
        {discounted && (
          <Text style={[styles.priceStrike, { color: textSecondary }]}>{formatMoney(regular, pricing.currency)}</Text>
        )}
      </View>
    );
  };

  const priceCaption = (plan: BillingPlan) => {
    if (plan === 'monthly') return t('paywall.billedMonthly');
    const perMonth = effectivePrice(pricing, 'yearly') / 12;
    return t('paywall.perMonthBilledYearly', { price: formatMoney(perMonth, pricing.currency) });
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
        />

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        >
          <View style={[styles.hero, { backgroundColor: surface, borderColor }]}>
            <View style={[styles.heroIcon, { backgroundColor: `${accent}18` }]}>
              <Crown size={32} color={accent} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.foreground }]}>
              {isPro ? t('paywall.premiumIsActive') : t('paywall.unlockPremium')}
            </Text>
            <Text style={[styles.heroText, { color: textSecondary }]}>
              {isPro ? t('paywall.heroActive') : t('paywall.heroUpsell')}
            </Text>
          </View>

          {!isPro && pricing.promo.active && (
            <View style={[styles.promoBanner, { backgroundColor: `${accent}14`, borderColor: `${accent}44` }]}>
              <View style={[styles.promoIcon, { backgroundColor: accent }]}>
                <Tag size={16} color="#FFFFFF" />
              </View>
              <Text style={[styles.promoText, { color: colors.foreground }]} numberOfLines={2}>
                {pricing.promo.label || t('paywall.promoDefault')}
              </Text>
            </View>
          )}

          {!isPro && (
            <>
              <View style={[styles.planSwitch, { backgroundColor: softSurface, borderColor }]}>
                {(['monthly', 'yearly'] as BillingPlan[]).map((plan) => {
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
                {renderPrice(selectedPlan)}
                <Text style={[styles.priceCaption, { color: textSecondary }]}>{priceCaption(selectedPlan)}</Text>
              </View>
            </>
          )}

          <View style={styles.features}>
            {PREMIUM_FEATURES.map((feature) => (
              <View key={feature.text} style={[styles.featureRow, { backgroundColor: surface, borderColor }]}>
                <View style={[styles.featureIcon, { backgroundColor: `${accent}14` }]}>
                  <feature.icon size={16} color={accent} />
                </View>
                <Text style={[styles.featureText, { color: colors.foreground }]}>{t(feature.text)}</Text>
              </View>
            ))}
          </View>

          {isPro ? (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleManage}
                style={[styles.secondaryButton, { backgroundColor: surface, borderColor }]}
              >
                <Settings2 size={18} color={colors.foreground} />
                <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>{t('paywall.manageSubscription')}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.85} onPress={() => router.back()} style={styles.textButton}>
                <Text style={[styles.textButtonLabel, { color: textSecondary }]}>{t('paywall.backToApp')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity activeOpacity={0.9} disabled={redirecting} onPress={handleCheckout} style={styles.subscribeButton}>
                <LinearGradient
                  colors={[colors.primary, accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.subscribeGradient}
                >
                  {redirecting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <ExternalLink size={18} color="#FFFFFF" />
                      <Text style={styles.subscribeText}>{t('paywall.continueCheckout')}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={[styles.secureNote, { color: textSecondary }]}>{t('paywall.secureNote')}</Text>

              <TouchableOpacity activeOpacity={0.85} onPress={() => router.back()} style={styles.textButton}>
                <Text style={[styles.textButtonLabel, { color: textSecondary }]}>{t('paywall.notNow')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18 },
  hero: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginBottom: 16,
  },
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 24, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  heroText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },

  promoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  promoIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  promoText: { flex: 1, fontSize: 13.5, fontWeight: '700', lineHeight: 19 },

  planSwitch: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 4, marginBottom: 14 },
  planOption: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  planLabel: { fontSize: 14, fontWeight: '600' },
  planPill: { fontSize: 11, fontWeight: '600' },

  priceCard: { borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 18 },
  priceInline: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  price: { fontSize: 36, fontWeight: '700' },
  priceStrike: { fontSize: 18, fontWeight: '600', textDecorationLine: 'line-through' },
  priceCaption: { fontSize: 13, marginTop: 4 },

  features: { gap: 10, marginBottom: 18 },
  featureRow: { minHeight: 54, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },

  subscribeButton: { borderRadius: 18, overflow: 'hidden', marginTop: 2 },
  subscribeGradient: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  subscribeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secureNote: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12 },

  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },

  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
});
