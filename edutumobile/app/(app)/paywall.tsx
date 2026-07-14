import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Check, Settings2, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesPackage } from 'react-native-purchases';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { supabase } from '../../lib/supabase';
import { fetchMobileControlConfig } from '../../lib/mobileControl';
import { getCachedOpportunitiesSnapshot } from '@edutu/core/src/services/opportunities';
import {
  getOfferings,
  initRevenueCat,
  manageSubscriptions,
  purchasePackage,
  restorePurchases,
} from '@edutu/core/src/services/payments';

// Both stores REQUIRE their own billing for in-app digital goods (Apple 3.1.1,
// Google Play Payments). So every on-device purchase goes through RevenueCat
// (StoreKit on iOS, Play Billing on Android). Only the web build (Platform.OS
// === 'web', which the stores don't police) uses the pay.edutu.org checkout.
// The app NEVER routes an iOS/Android user to external payment for Pro.
const USE_NATIVE_IAP = Platform.OS === 'ios' || Platform.OS === 'android';
import {
  DEFAULT_PRICING,
  DEFAULT_PAYWALL_CONTENT,
  type PricingConfig,
  type PaywallContent,
  type BillingPlan,
  effectivePrice,
  hasPromoDiscount,
  formatMoney,
  buildCheckoutUrl,
} from '../../lib/pricing';
import { useTranslation } from 'react-i18next';

// The paywall is intentionally ALWAYS dark (reference design): the collage of
// opportunity posters + near-black canvas reads premium in both app themes.
const CANVAS = '#0A0A0F';
const CARD_BG = '#16161C';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const ACCENT = '#8B9DFF';

export default function PaywallScreen() {
  const { t } = useTranslation('home');
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro, isLoading: proLoading, refreshStatus } = useProStatus(supabase, user?.id || null);

  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>('weekly');
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
  // Admin-controlled design + copy overrides (mobile-control config). Empty
  // fields fall back to the built-in translated copy below.
  const [paywall, setPaywall] = useState<PaywallContent>(DEFAULT_PAYWALL_CONTENT);
  // Once the user taps a plan, the admin's default plan must not override it.
  const userPickedPlanRef = useRef(false);
  // Real opportunity posters (Mastercard Foundation, scholarships, country
  // programs…) from the offline snapshot — the collage sells what Pro unlocks.
  const [heroImages, setHeroImages] = useState<string[]>([]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [redirecting, setRedirecting] = useState(false);
  // Native in-app purchase state (iOS StoreKit / Android Play Billing).
  const [iapPackages, setIapPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // On device we only ever sell via IAP. Track whether offerings are still
  // loading vs unavailable so the CTA can show a spinner / disabled state
  // instead of silently routing to an (store-forbidden) external checkout.
  const [iapLoading, setIapLoading] = useState(USE_NATIVE_IAP);
  const [iapUnavailable, setIapUnavailable] = useState(false);
  // Set true once we hand off to the browser, so the next foreground re-checks
  // Pro (the pay.edutu.org webhook grants it while we're away).
  const awaitingReturnRef = useRef(false);

  // Device: load StoreKit (iOS) / Play Billing (Android) offerings via
  // RevenueCat. If they can't load we mark IAP unavailable and disable the CTA —
  // we must NOT fall back to an external checkout on device (store policy).
  useEffect(() => {
    if (!USE_NATIVE_IAP) { setIapLoading(false); return; }
    if (!user?.id) return;
    let cancelled = false;
    setIapLoading(true);
    setIapUnavailable(false);
    (async () => {
      try {
        const configured = await initRevenueCat(user.id);
        if (!configured) {
          if (!cancelled) { setIapUnavailable(true); setIapLoading(false); }
          return;
        }
        const offering = await getOfferings();
        if (cancelled) return;
        const packages = offering?.availablePackages || [];
        setIapPackages(packages);
        setIapUnavailable(packages.length === 0);
        setIapLoading(false);
      } catch {
        if (!cancelled) { setIapUnavailable(true); setIapLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const iapPackageForPlan = (plan: BillingPlan) =>
    iapPackages.find((pkg) =>
      plan === 'weekly'
        ? pkg.identifier.includes('week')
        : plan === 'monthly'
          ? pkg.identifier.includes('month')
          : pkg.identifier.includes('year'),
    );
  const selectedPackage = iapPackageForPlan(selectedPlan);
  // On iOS use IAP only when a matching StoreKit product actually loaded;
  // otherwise fall back to the web checkout so the button is never a dead end.
  const iapActive = USE_NATIVE_IAP && Boolean(selectedPackage);

  // Admin-controlled prices/currency/promo + paywall design/copy (mobile-
  // control config). Falls back to defaults if the feed is unreachable, so the
  // paywall always works.
  useEffect(() => {
    let cancelled = false;
    fetchMobileControlConfig()
      .then((config) => {
        if (cancelled) return;
        setPricing(config.pricing);
        setPaywall(config.paywall);
        if (!userPickedPlanRef.current) setSelectedPlan(config.paywall.defaultPlan);
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCachedOpportunitiesSnapshot()
      .then((opportunities) => {
        if (cancelled) return;
        const urls = Array.from(
          new Set(
            (opportunities || [])
              .map((opportunity: any) => opportunity?.image)
              .filter((url: unknown): url is string => typeof url === 'string' && /^https?:\/\//.test(url)),
          ),
        ).slice(0, 9);
        setHeroImages(urls);
      })
      .catch(() => { /* gradient-only hero */ });
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

  const redirectToWebCheckout = useCallback(async () => {
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

  const purchaseWithIap = useCallback(async () => {
    if (!selectedPackage) {
      // No external fallback on device (store policy) — surface a retry instead.
      Alert.alert(
        t('common:states.error'),
        t('paywall.iapUnavailable', {
          defaultValue: 'Subscriptions are temporarily unavailable. Please try again in a moment.',
        }),
      );
      return;
    }
    setPurchasing(true);
    try {
      const result = await purchasePackage(selectedPackage);
      if (result.success) {
        await refreshStatus();
        Alert.alert(t('paywall.premiumActiveTitle'), t('paywall.premiumActiveMessage'));
        router.back();
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert(t('common:states.error'), result.error);
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error?.message || t('paywall.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }, [selectedPackage, refreshStatus, router, t]);

  // On device ALWAYS go through native IAP (never the external web checkout —
  // store policy). Only the web build uses the hosted pay.edutu.org checkout.
  const handleCheckout = USE_NATIVE_IAP ? purchaseWithIap : redirectToWebCheckout;
  // Native purchase is only actionable once a matching store product loaded.
  const canPurchase = USE_NATIVE_IAP ? Boolean(selectedPackage) : true;

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        await refreshStatus();
        Alert.alert(t('paywall.restoredTitle'), t('paywall.restoredMessage'));
      } else {
        Alert.alert(t('common:states.error'), result.error || t('paywall.restoreFailed'));
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error?.message || t('paywall.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  }, [refreshStatus, t]);

  const handleManage = useCallback(async () => {
    if (!user?.id) return;
    // A store-billed subscription must be managed/cancelled through the store's
    // own UI (Apple/Google) — steering IAP subscribers to an external page is a
    // 3.1.1 violation. Only the web build uses the pay.edutu.org account page.
    if (USE_NATIVE_IAP) {
      await manageSubscriptions();
      return;
    }
    // Pass a Clerk token so pay.edutu.org can prove the caller owns the account
    // before allowing a cancel (it mints a short-lived session cookie).
    let token: string | null | undefined = null;
    try { token = await getToken(); } catch { token = null; }
    const base = pricing.manageUrl.replace(/\/$/, '');
    const q = new URLSearchParams({ uid: user.id });
    if (token) q.set('t', token);
    await openExternal(`${base}/start?${q.toString()}`);
  }, [user?.id, pricing.manageUrl, getToken, openExternal]);

  // Admin pricing is the single source of truth for what we display. When the
  // charge actually goes through Apple IAP, the exact StoreKit price is shown
  // as a footnote instead of replacing the admin price (stale App Store
  // products were rendering "$9.99" over the real ₦ prices).
  const displayPrice = (plan: BillingPlan) => effectivePrice(pricing, plan);

  const regularPriceOf = (plan: BillingPlan) =>
    plan === 'weekly' ? pricing.weeklyPrice : plan === 'monthly' ? pricing.monthlyPrice : pricing.yearlyPrice;

  const planLabel = (plan: BillingPlan) =>
    plan === 'weekly' ? t('paywall.weekly') : plan === 'monthly' ? t('paywall.monthly') : t('paywall.yearly');

  // Admin override wins when set; otherwise the built-in translated copy.
  const copy = (override: string, fallback: string) => override || fallback;
  const accent = paywall.accentColor || ACCENT;

  // Reference-style merchandising chips above each plan.
  const planBadge = (plan: BillingPlan) =>
    plan === 'weekly'
      ? copy(paywall.badgeWeekly, t('paywall.badgeMostTaken'))
      : plan === 'monthly'
        ? copy(paywall.badgeMonthly, t('paywall.badgePopular'))
        : copy(paywall.badgeYearly, t('paywall.badgeBestDeal'));

  // Everything compared on one axis: what the plan costs per week.
  const perWeekOf = (plan: BillingPlan) => {
    const price = displayPrice(plan);
    return plan === 'weekly' ? price : plan === 'monthly' ? price / 4.33 : price / 52;
  };

  const promoOffPct = (plan: BillingPlan) => {
    const regular = regularPriceOf(plan);
    const price = displayPrice(plan);
    if (!hasPromoDiscount(pricing, plan) || regular <= 0) return 0;
    return Math.max(0, Math.round((1 - price / regular) * 100));
  };

  if (proLoading) {
    return (
      <View style={[styles.container, { backgroundColor: CANVAS }]}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
          <ScreenHeader title={t('paywall.title')} showBack />
          <View style={styles.centered}>
            <BrandedLoader label={t('paywall.loading')} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Full-screen tilted mosaic of real opportunity posters behind everything
  // (reference style): imagery owns the top ~60%, then a scrim melts it into
  // the near-black canvas where the copy, plan cards, and CTA live.
  const tileWidth = screenWidth * 0.42;
  const tileHeight = screenWidth * 0.36;
  const collage = paywall.heroStyle !== 'gradient' && heroImages.length >= 3 && (
    <View style={styles.collageWrap} pointerEvents="none">
      <View
        style={[
          styles.collageGrid,
          { width: screenWidth * 1.45, marginLeft: -screenWidth * 0.22, marginTop: -tileHeight * 0.35 },
        ]}
      >
        {[0, 1, 2].map((column) => (
          <View key={column} style={[styles.collageColumn, column === 1 && { marginTop: -tileHeight * 0.45 }]}>
            {heroImages
              .filter((_, index) => index % 3 === column)
              .slice(0, 3)
              .map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={[styles.collageImage, { width: tileWidth, height: tileHeight }]}
                  resizeMode="cover"
                />
              ))}
          </View>
        ))}
      </View>
      {/* Scrim: imagery clear up top, solid canvas by ~70% down the screen. */}
      <LinearGradient
        colors={['rgba(10,10,15,0.18)', 'rgba(10,10,15,0.45)', 'rgba(10,10,15,0.92)', CANVAS]}
        locations={[0, 0.38, 0.62, 0.74]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: CANVAS }]}>
      {collage || (
        <LinearGradient
          colors={[CANVAS, '#0B1B3F', CANVAS]}
          style={StyleSheet.absoluteFill}
        />
      )}

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{
          minHeight: screenHeight,
          paddingTop: insets.top + 10,
          paddingBottom: Math.max(insets.bottom, 14),
          paddingHorizontal: 18,
          justifyContent: 'flex-end',
        }}
      >
        {/* Overlay controls pinned to the very top */}
        <View style={[styles.topRow, { top: insets.top + 10 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.notNow')}
          >
            <X size={19} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          {USE_NATIVE_IAP && !isPro ? (
            <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.7} style={styles.restoreButton}>
              <Text style={styles.restoreText}>
                {restoring ? t('paywall.loading') : t('paywall.restore')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Brand mini-mark */}
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>edutu</Text>
          <View style={styles.proPill}>
            <Text style={styles.proPillText}>{t('paywall.proBadge')}</Text>
          </View>
        </View>

        {/* Two-tone headline over the collage */}
        <View style={styles.headline}>
          <Text style={[styles.headlineLine, { color: accent }]}>
            {isPro ? t('paywall.premiumIsActive') : copy(paywall.heroLine1, t('paywall.heroLine1'))}
          </Text>
          {!isPro && (
            <Text style={[styles.headlineLine, { color: '#FFFFFF' }]}>
              {copy(paywall.heroLine2, t('paywall.heroLine2'))}
            </Text>
          )}
        </View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {isPro ? t('paywall.heroActive') : copy(paywall.subtitle, t('paywall.heroUpsell'))}
        </Text>

        {!isPro ? (
          <>
            {/* Optional admin-set benefit bullets */}
            {paywall.features.length > 0 && (
              <View style={styles.featureList}>
                {paywall.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Check size={13} color={accent} strokeWidth={3} />
                    <Text style={styles.featureText} numberOfLines={1}>{feature}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Plan cards — reference layout: chip / name / price pill / per-week */}
            <View style={styles.planRow}>
              {(['monthly', 'weekly', 'yearly'] as BillingPlan[]).map((plan) => {
                const active = selectedPlan === plan;
                const discounted = hasPromoDiscount(pricing, plan);
                const offPct = promoOffPct(plan);
                return (
                  <TouchableOpacity
                    key={plan}
                    onPress={() => {
                      userPickedPlanRef.current = true;
                      setSelectedPlan(plan);
                    }}
                    activeOpacity={0.85}
                    style={[
                      styles.planCard,
                      active && styles.planCardActive,
                      active && { shadowColor: accent },
                      { borderColor: active ? accent : CARD_BORDER },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={planLabel(plan)}
                  >
                    {discounted && offPct > 0 && (
                      <View style={styles.offBurst}>
                        <Text style={styles.offBurstText}>{t('paywall.promoOff', { pct: offPct })}</Text>
                      </View>
                    )}
                    {active && (
                      <View style={[styles.planCheckBadge, { backgroundColor: accent }]}>
                        <Check size={11} color={CANVAS} strokeWidth={3.4} />
                      </View>
                    )}
                    <View
                      style={[
                        styles.planBadgeChip,
                        active ? { backgroundColor: accent } : { backgroundColor: 'rgba(255,255,255,0.08)' },
                      ]}
                    >
                      <Text
                        style={[styles.planBadgeText, { color: active ? CANVAS : 'rgba(255,255,255,0.85)' }]}
                        numberOfLines={1}
                      >
                        {planBadge(plan)}
                      </Text>
                    </View>
                    <Text style={styles.planName} numberOfLines={1} adjustsFontSizeToFit>
                      {planLabel(plan)}
                    </Text>
                    <View style={styles.pricePill}>
                      <Text style={styles.pricePillText} numberOfLines={1} adjustsFontSizeToFit>
                        {formatMoney(displayPrice(plan), pricing.currency)}
                      </Text>
                    </View>
                    {discounted && (
                      <Text style={styles.planStrike} numberOfLines={1}>
                        {formatMoney(regularPriceOf(plan), pricing.currency)}
                      </Text>
                    )}
                    <View style={styles.perWeekDivider} />
                    <Text style={styles.perWeekText} numberOfLines={1} adjustsFontSizeToFit>
                      {t('paywall.perWeek', {
                        price: formatMoney(Math.round(perWeekOf(plan) * 100) / 100, pricing.currency),
                      })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Big white CTA (reference style) */}
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={redirecting || purchasing || (USE_NATIVE_IAP && (iapLoading || !canPurchase))}
              onPress={handleCheckout}
              style={[
                styles.ctaButton,
                USE_NATIVE_IAP && !iapLoading && !canPurchase && styles.ctaButtonDisabled,
              ]}
            >
              {(redirecting || purchasing || (USE_NATIVE_IAP && iapLoading)) ? (
                <ActivityIndicator color={CANVAS} />
              ) : (
                <Text style={styles.ctaText}>{copy(paywall.ctaLabel, t('paywall.subscribe'))}</Text>
              )}
            </TouchableOpacity>

            {/* On device we only sell via the store. If products can't load we
                say so rather than dead-ending — never an external checkout. */}
            {USE_NATIVE_IAP && !iapLoading && iapUnavailable && (
              <Text style={styles.secureNote} numberOfLines={2}>
                {t('paywall.iapUnavailable', {
                  defaultValue: 'Subscriptions are temporarily unavailable. Please try again in a moment.',
                })}
              </Text>
            )}

            {/* iOS IAP keeps the fixed renewal disclosure (App Store rules);
                only the web-checkout note is admin-overridable. */}
            <Text style={styles.secureNote} numberOfLines={2}>
              {iapActive ? t('paywall.renewalNote') : copy(paywall.secureNote, t('paywall.secureNote'))}
            </Text>

            <View style={styles.legalRow}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => void Linking.openURL('https://edutu.org/terms')}>
                <Text style={styles.legalLink}>{t('paywall.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>·</Text>
              <TouchableOpacity activeOpacity={0.7} onPress={() => void Linking.openURL('https://edutu.org/privacy')}>
                <Text style={styles.legalLink}>{t('paywall.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity activeOpacity={0.9} onPress={handleManage} style={styles.manageButton}>
              <Settings2 size={18} color="#FFFFFF" />
              <Text style={styles.manageText}>{t('paywall.manageSubscription')}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} onPress={() => router.back()} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>{t('paywall.backToApp')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },

  // ── Background collage ──
  collageWrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  collageGrid: {
    flexDirection: 'row',
    gap: 10,
    transform: [{ rotate: '-8deg' }],
  },
  collageColumn: { gap: 10 },
  collageImage: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // ── Top controls ──
  topRow: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  restoreButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 4 },
  restoreText: { color: 'rgba(255,255,255,0.92)', fontSize: 14.5, fontWeight: '600' },

  // ── Copy ──
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  brandText: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  proPill: {
    borderWidth: 1.3,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proPillText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800', letterSpacing: 1.5 },
  headline: { alignItems: 'center', marginBottom: 10 },
  headlineLine: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 37, textAlign: 'center' },
  subtitle: {
    color: TEXT_DIM,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },

  // ── Admin-set benefit bullets ──
  featureList: { alignSelf: 'center', gap: 6, marginTop: -8, marginBottom: 18, paddingHorizontal: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },

  // ── Plan cards ──
  planRow: { flexDirection: 'row', gap: 9, marginBottom: 18, alignItems: 'flex-end' },
  planCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: CARD_BG,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
  },
  planCardActive: {
    borderWidth: 2.5,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: ACCENT,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  planCheckBadge: {
    position: 'absolute',
    top: -9,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    zIndex: 3,
  },
  planBadgeChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 9,
    maxWidth: '100%',
  },
  planBadgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  planName: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  pricePill: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  pricePillText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  planStrike: {
    color: TEXT_DIM,
    fontSize: 11.5,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    marginTop: 4,
  },
  offBurst: {
    position: 'absolute',
    top: -12,
    right: -9,
    backgroundColor: '#FF6600',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    transform: [{ rotate: '9deg' }],
    zIndex: 4,
  },
  offBurstText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  perWeekDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'stretch',
    marginTop: 11,
    marginBottom: 8,
  },
  perWeekText: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, fontWeight: '700' },

  // ── CTA + legal ──
  ctaButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ctaButtonDisabled: { opacity: 0.5 },
  ctaText: { color: CANVAS, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  secureNote: {
    color: TEXT_DIM,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 30,
    marginTop: 2,
  },
  legalLink: { color: TEXT_DIM, fontSize: 12, fontWeight: '600' },
  legalDot: { color: TEXT_DIM, fontSize: 12 },

  // ── Pro-active state ──
  manageButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  manageText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  textButtonLabel: { color: TEXT_DIM, fontSize: 15, fontWeight: '600' },
});
