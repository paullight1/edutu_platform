import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Image,
  Linking,
  Platform,
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
import { PremiumCelebration } from '../../components/ui/PremiumCelebration';
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
  waitForServerFulfillment,
} from '@edutu/core/src/services/payments';
import {
  DEFAULT_PRICING,
  DEFAULT_PAYWALL_CONTENT,
  type PricingConfig,
  type PaywallContent,
  type BillingPlan,
  type SubscriptionTier,
  effectivePrice,
  hasPromoDiscount,
  formatMoney,
} from '../../lib/pricing';
import {
  createCheckoutIdempotencyKey,
  getPaymentRail,
  nativePackageForPlan,
  requestBachsCheckout,
  requestBachsPortalSession,
  visibleBillingPlans,
  webProductKeyForPlan,
} from '../../lib/billingRouting';
import { useTranslation } from 'react-i18next';

// Both stores REQUIRE their own billing for in-app digital goods (Apple 3.1.1,
// Google Play Payments). So every on-device purchase goes through RevenueCat
// (StoreKit on iOS, Play Billing on Android). Only the web build (Platform.OS
// === 'web', which the stores don't police) uses the authenticated Bachs API.
// The app NEVER routes an iOS/Android user to external payment for Pro.
const USE_NATIVE_IAP = getPaymentRail(Platform.OS) === 'revenuecat';


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
  const {
    isPro,
    planTier,
    isLoading: proLoading,
    refreshStatus,
    refreshServerStatus = async () => false,
  } = useProStatus(supabase, user?.id || null);
  // Narrowed locals so memoized callbacks depend on exactly these values —
  // reading `user.id` inside a callback makes the compiler infer a dependency
  // on the whole `user` object, which breaks manual memoization.
  const userId = user?.id;

  const [selectedPlan, setSelectedPlan] = useState<BillingPlan>(USE_NATIVE_IAP ? 'monthly' : 'weekly');
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('pro');
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
  // Short devices (SE, small Androids) get a tighter type scale so the plans +
  // CTA never get pushed off the bottom — the page never scrolls.
  const compact = screenHeight < 780;
  const [redirecting, setRedirecting] = useState(false);
  // Native in-app purchase state (iOS StoreKit / Android Play Billing).
  const [iapPackages, setIapPackages] = useState<PurchasesPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // On device we only ever sell via IAP. Track whether offerings are still
  // loading vs unavailable so the CTA can show a spinner while loading, and an
  // explanation + retry when they never arrived — never a redirect to a
  // (store-forbidden) external checkout, and never a dead greyed-out button.
  // Raw state is only meaningful on the native+signed-in path; the two bail
  // cases (web build, guest) are derived below instead of synchronously
  // setState-ing them in the offerings effect.
  const [iapLoadingRaw, setIapLoading] = useState(USE_NATIVE_IAP);
  const [iapUnavailableRaw, setIapUnavailable] = useState(false);
  const iapLoading = userId ? iapLoadingRaw : false;
  // Purchases need an identity, so IAP is unavailable for guests on device.
  const iapUnavailable = userId ? iapUnavailableRaw : USE_NATIVE_IAP;
  // Set true once we hand off to the browser, so the next foreground re-checks
  // Pro after the backend confirms the provider event.
  const awaitingReturnRef = useRef(false);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);
  const retryProFulfillmentRef = useRef<(onFulfilled: () => void) => void>(() => {});

  // Device: load StoreKit (iOS) / Play Billing (Android) offerings via
  // RevenueCat. If they can't load we mark IAP unavailable — we must NOT fall
  // back to an external checkout on device (store policy), so the recovery is a
  // retry, never a redirect. Extracted from the effect so the CTA's "Try again"
  // re-runs exactly this load without remounting the screen.
  const loadIapOfferings = useCallback(async () => {
    // Web build and guest cases are derived at render (see the iapLoading /
    // iapUnavailable locals above) — nothing to load on those paths.
    if (!USE_NATIVE_IAP || !userId) return;
    // Deliberately no synchronous setState before the first await: this runs
    // straight from an effect, and a sync setState there cascades a render
    // (react-hooks/set-state-in-effect). The initial loading state is seeded by
    // useState; the retry path flips it itself (see retryIapOfferings).
    try {
      const configured = await initRevenueCat(userId);
      if (!configured) {
        setIapUnavailable(true);
        setIapLoading(false);
        return;
      }
      const offering = await getOfferings();
      const packages = offering?.availablePackages || [];
      setIapPackages(packages);
      setIapUnavailable(packages.length === 0);
      setIapLoading(false);
    } catch {
      setIapUnavailable(true);
      setIapLoading(false);
    }
  }, [userId]);

  // User-initiated reload (CTA dialog / the note under the CTA): unlike the
  // mount path this one shows the spinner again, so the tap visibly does
  // something even when the retry ends up failing the same way.
  const retryIapOfferings = useCallback(() => {
    setIapLoading(true);
    setIapUnavailable(false);
    void loadIapOfferings();
  }, [loadIapOfferings]);

  // A userId change refetches without flipping the loader first (accepted
  // SWR-style). Settling after unmount is a no-op in React 18, so this drops
  // the old cancellation flag rather than duplicating it on the retry path.
  useEffect(() => {
    // Wrapped in an async IIFE so nothing this effect calls can settle state
    // synchronously in the effect body (react-hooks/set-state-in-effect).
    void (async () => {
      await loadIapOfferings();
    })();
  }, [loadIapOfferings]);

  const iapPackageForPlan = (plan: BillingPlan) => nativePackageForPlan(plan, iapPackages, selectedTier);
  const displayedPlans = visibleBillingPlans(Platform.OS, iapPackages);
  const selectedPackage = iapPackageForPlan(selectedPlan);
  // True when this purchase will actually be charged by the store — i.e. we're
  // on device AND a matching StoreKit/Play product loaded. It gates the Apple
  // auto-renew disclosure ONLY; it is not a checkout switch. There is no
  // web-checkout fallback on device (see handleCheckout below): when no product
  // loaded the CTA explains itself and offers a retry instead.
  const iapActive = USE_NATIVE_IAP && Boolean(selectedPackage);
  // Two different failures deserve two different sentences: the store never
  // came up at all, vs it came up without a product for THIS plan — in which
  // case the other plan cards may well still be buyable.
  const iapBlockedMessage = iapUnavailable
    ? t('paywall.iapUnavailable', {
        defaultValue: 'Subscriptions are temporarily unavailable. Please try again in a moment.',
      })
    : t('paywall.planUnavailable', {
        defaultValue: 'This plan is not available on your device right now. Try another plan, or try again.',
      });

  // One-off Season Pass. Native: only surfaced when a `season_pass` RC product
  // actually exists in the fetched offerings (guard on the lookup) — if the
  // dashboard product hasn't been created it stays hidden. Web build: gated on
  // the admin config flag, and only when signed in (an empty uid must never
  // reach the hosted checkout).
  const seasonPackage = iapPackages.find(
    (pkg) => pkg.product?.identifier === 'season_pass' || pkg.identifier.toLowerCase().includes('season'),
  );
  const seasonForSale = USE_NATIVE_IAP
    ? Boolean(seasonPackage)
    : pricing.seasonPass.enabled && Boolean(userId);
  const seasonPriceText = USE_NATIVE_IAP
    ? seasonPackage?.product?.priceString ?? formatMoney(pricing.seasonPass.price, pricing.currency)
    : formatMoney(pricing.seasonPass.price, pricing.currency);

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
        if (!userPickedPlanRef.current) {
          setSelectedPlan(
            USE_NATIVE_IAP && config.paywall.defaultPlan === 'weekly' && !nativePackageForPlan('weekly', iapPackages)
              ? 'monthly'
              : config.paywall.defaultPlan,
          );
        }
      })
      .catch(() => { /* keep defaults */ });
    return () => { cancelled = true; };
  }, [iapPackages]);

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

  const waitForProFulfillment = useCallback(async (onFulfilled: () => void): Promise<boolean> => {
    const fulfilled = await waitForServerFulfillment(refreshServerStatus);
    if (fulfilled) {
      onFulfilled();
      return true;
    }

    Alert.alert(
      t('paywall.paymentProcessingTitle', { defaultValue: 'Payment is still processing' }),
      t('paywall.paymentProcessingMessage', {
        defaultValue: 'Your purchase was received. Access will unlock after the payment provider confirms it.',
      }),
      [
        { text: t('common:actions.notNow', { defaultValue: 'Not now' }), style: 'cancel' },
        {
          text: t('paywall.checkAgain', { defaultValue: 'Check again' }),
          onPress: () => {
            retryProFulfillmentRef.current(onFulfilled);
          },
        },
      ],
    );
    return false;
  }, [refreshServerStatus, t]);

  useEffect(() => {
    retryProFulfillmentRef.current = (onFulfilled) => {
      setPurchasing(true);
      void waitForProFulfillment(onFulfilled).finally(() => setPurchasing(false));
    };
  }, [waitForProFulfillment]);

  // A browser return is not fulfillment. The provider webhook writes the
  // canonical server entitlement asynchronously, so reconcile it with bounded
  // polling rather than showing success after a single foreground refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && awaitingReturnRef.current) {
        awaitingReturnRef.current = false;
        setPurchasing(true);
        void waitForProFulfillment(() => setShowCelebration(true)).finally(() => setPurchasing(false));
      }
    });
    return () => sub.remove();
  }, [waitForProFulfillment]);

  const openExternal = useCallback(async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('cannot open url');
      awaitingReturnRef.current = true;
      await Linking.openURL(url);
    } catch {
      awaitingReturnRef.current = false;
      Alert.alert(t('common:states.error'), t('paywall.checkoutFailed'));
    }
  }, [t]);

  const redirectToWebCheckout = useCallback(async () => {
    if (!userId) return;
    setRedirecting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('missing session');
      const idempotencyKey = checkoutIdempotencyKeyRef.current ?? createCheckoutIdempotencyKey();
      checkoutIdempotencyKeyRef.current = idempotencyKey;
      const checkout = await requestBachsCheckout({
        accessToken: token,
        productKey: webProductKeyForPlan(selectedPlan, selectedTier),
        idempotencyKey,
      });
      await openExternal(checkout.checkoutUrl);
    } catch {
      Alert.alert(t('common:states.error'), t('paywall.checkoutFailed'));
    } finally {
      // Give the app-switch a beat before releasing the button spinner.
      setTimeout(() => setRedirecting(false), 800);
    }
  }, [userId, getToken, selectedPlan, selectedTier, openExternal, t]);

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

  const purchaseWithIap = useCallback(async () => {
    if (!selectedPackage) {
      // Store policy forbids an external checkout here, so this branch can't
      // route anywhere — but it must not be a dead end either. The CTA stays
      // TAPPABLE (see the disabled prop below) so pressing it lands on this
      // dialog, which offers the two things that can actually resolve it:
      // reload the store products, or restore an existing subscription.
      Alert.alert(
        t('paywall.iapUnavailableTitle', { defaultValue: 'Subscriptions unavailable right now' }),
        iapBlockedMessage,
        [
          { text: t('common:actions.cancel'), style: 'cancel' },
          { text: t('paywall.restore'), onPress: () => { void handleRestore(); } },
          { text: t('common:actions.tryAgain'), onPress: retryIapOfferings },
        ],
      );
      return;
    }
    setPurchasing(true);
    try {
      const result = await purchasePackage(selectedPackage);
      if (result.success) {
        // RevenueCat returning success only means StoreKit/Play accepted the
        // transaction. The webhook's entitlement is the completion signal.
        await waitForProFulfillment(() => setShowCelebration(true));
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert(t('common:states.error'), result.error);
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error?.message || t('paywall.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }, [selectedPackage, waitForProFulfillment, handleRestore, retryIapOfferings, iapBlockedMessage, t]);

  // Season Pass purchase — native buys the RC product; web asks the authenticated
  // backend to create the Bachs checkout for its server-owned product key.
  const purchaseSeasonIap = useCallback(async () => {
    if (!seasonPackage) return;
    setPurchasing(true);
    try {
      const result = await purchasePackage(seasonPackage);
      if (result.success) {
        await waitForProFulfillment(() => {
          Alert.alert(t('paywall.premiumActiveTitle'), t('paywall.premiumActiveMessage'));
          router.back();
        });
      } else if (result.error && result.error !== 'User cancelled') {
        Alert.alert(t('common:states.error'), result.error);
      }
    } catch (error: any) {
      Alert.alert(t('common:states.error'), error?.message || t('paywall.purchaseFailed'));
    } finally {
      setPurchasing(false);
    }
  }, [seasonPackage, waitForProFulfillment, router, t]);

  const redirectSeasonCheckout = useCallback(async () => {
    if (!userId) return;
    setRedirecting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('missing session');
      const idempotencyKey = checkoutIdempotencyKeyRef.current ?? createCheckoutIdempotencyKey();
      checkoutIdempotencyKeyRef.current = idempotencyKey;
      const checkout = await requestBachsCheckout({
        accessToken: token,
        productKey: webProductKeyForPlan('season'),
        idempotencyKey,
      });
      await openExternal(checkout.checkoutUrl);
    } catch {
      Alert.alert(t('common:states.error'), t('paywall.checkoutFailed'));
    } finally {
      setTimeout(() => setRedirecting(false), 800);
    }
  }, [userId, getToken, openExternal, t]);

  const handleSeason = USE_NATIVE_IAP ? purchaseSeasonIap : redirectSeasonCheckout;

  // On device ALWAYS go through native IAP (never the external web checkout —
  // store policy). Only the web build uses an authenticated Bachs checkout.
  const handleCheckout = USE_NATIVE_IAP ? purchaseWithIap : redirectToWebCheckout;
  // Whether a purchase can complete right now. Used to DIM the CTA and to show
  // the explanatory line — not to disable it: a greyed-out button with no way
  // forward is the dead end we're avoiding (purchaseWithIap handles the tap).
  const canPurchase = USE_NATIVE_IAP ? Boolean(selectedPackage) : true;

  const handleManage = useCallback(async () => {
    if (!userId) return;
    // A store-billed subscription must be managed/cancelled through the store's
    // own UI (Apple/Google) — steering IAP subscribers to an external page is a
    // 3.1.1 violation. The web build asks the backend for a fresh Bachs portal session.
    if (USE_NATIVE_IAP) {
      await manageSubscriptions();
      return;
    }
    try {
      const token = await getToken();
      if (!token) throw new Error('missing session');
      await openExternal(await requestBachsPortalSession({ accessToken: token }));
    } catch {
      Alert.alert(t('common:states.error'), t('paywall.checkoutFailed'));
    }
  }, [userId, getToken, openExternal, t]);

  // StoreKit/Play owns the charged amount on native. Use the product returned
  // by RevenueCat whenever it is available; admin prices remain the fallback
  // for web and unconfigured store products.
  const storeProductForPlan = (plan: BillingPlan) => iapPackageForPlan(plan)?.product;
  const displayPrice = (plan: BillingPlan) => {
    const storePrice = storeProductForPlan(plan)?.price;
    return typeof storePrice === 'number' && Number.isFinite(storePrice)
      ? storePrice
      : effectivePrice(pricing, plan, selectedTier, { applyPromo: false });
  };
  const displayCurrency = (plan: BillingPlan) => storeProductForPlan(plan)?.currencyCode || pricing.currency;
  const displayPriceText = (plan: BillingPlan) =>
    storeProductForPlan(plan)?.priceString || formatMoney(displayPrice(plan), displayCurrency(plan));

  const regularPriceOf = (plan: BillingPlan) =>
    plan === 'weekly' ? pricing[selectedTier].weeklyPrice : plan === 'monthly' ? pricing[selectedTier].monthlyPrice : pricing[selectedTier].yearlyPrice;

  const planLabel = (plan: BillingPlan) =>
    plan === 'weekly' ? t('paywall.weekly') : plan === 'monthly' ? t('paywall.monthly') : t('paywall.yearly');

  const cadenceLabel = (plan: BillingPlan) =>
    plan === 'weekly'
      ? t('paywall.billedWeekly')
      : plan === 'monthly'
        ? t('paywall.billedMonthly')
        : t('paywall.billedYearly', { defaultValue: 'Billed yearly' });

  // Admin override wins when set; otherwise the built-in translated copy.
  const copy = (override: string, fallback: string) => override || fallback;
  const accent = paywall.accentColor || ACCENT;

  // Admin bullets win; otherwise three concrete unlocks from the translations.
  const benefits = (
    paywall.features.length
      ? paywall.features
      : [
          t('paywall.features.unlimitedAi'),
          t('paywall.features.aiTailoring'),
          t('paywall.features.priorityTools'),
        ]
  ).slice(0, 3);

  // Everything compared on one axis: what the plan costs per week.
  const perWeekOf = (plan: BillingPlan) => {
    const price = displayPrice(plan);
    return plan === 'weekly' ? price : plan === 'monthly' ? price / 4.33 : price / 52;
  };

  // Real savings against the weekly rate — the honest baseline, since weekly is
  // the most expensive way to buy the same thing.
  const savingsPct = (plan: BillingPlan) => {
    const baseline = perWeekOf('weekly');
    const rate = perWeekOf(plan);
    if (baseline <= 0 || rate >= baseline) return 0;
    return Math.round((1 - rate / baseline) * 100);
  };

  // A chip on every card means a chip on none of them. Admin copy still wins,
  // but the built-in badge now only appears where there's a fact to state.
  const planBadge = (plan: BillingPlan) => {
    const override =
      plan === 'weekly' ? paywall.badgeWeekly : plan === 'monthly' ? paywall.badgeMonthly : paywall.badgeYearly;
    if (override) return override;
    const pct = savingsPct(plan);
    return pct >= 5 ? t('paywall.savePct', { pct }) : '';
  };

  const bestValuePlan = displayedPlans.reduce((best, plan) =>
    perWeekOf(plan) < perWeekOf(best) ? plan : best,
  );

  const promoOffPct = (plan: BillingPlan) => {
    const regular = regularPriceOf(plan);
    const price = displayPrice(plan);
    if (!hasPromoDiscount(pricing, plan, selectedTier, { applyPromo: false }) || regular <= 0) return 0;
    return Math.max(0, Math.round((1 - price / regular) * 100));
  };

  // Lite has premium access but can still upgrade to Pro or Scholar. Full Pro
  // and Scholar users should see their active state instead of another plan
  // purchase surface.
  const canUpgrade = planTier === 'none' || planTier === 'lite';

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
  const tileWidth = screenWidth * 0.44;
  // Tie the tile to viewport height so three rows always reach the scrim.
  const tileHeight = Math.max(screenWidth * 0.34, screenHeight * 0.16);
  // Cycle whatever posters we have into a full 3×3. With only 4–5 cached
  // images the columns came out ragged and the mosaic stopped a third of the
  // way down, leaving the bald slab of canvas under the hero.
  const tiles = heroImages.length
    ? Array.from({ length: 9 }, (_, index) => heroImages[index % heroImages.length])
    : [];
  // Headline tracks the viewport (clamped) instead of a fixed 30pt: big on
  // large phones, small enough on short ones that nothing gets clipped.
  const headlineSize = Math.round(Math.min(compact ? 24 : 28, screenWidth * 0.071));
  const headlineType = { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) };
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
            {tiles
              .filter((_, index) => index % 3 === column)
              .map((url, row) => (
                <Image
                  key={`${column}-${row}`}
                  source={{ uri: url }}
                  style={[styles.collageImage, { width: tileWidth, height: tileHeight }]}
                  resizeMode="cover"
                />
              ))}
          </View>
        ))}
      </View>
      {/* Scrim: darker band up top so the headline stays legible over the
          posters, clearer in the middle so the imagery shows, solid canvas by
          ~60% down where the copy, plans and CTA now live. */}
      <LinearGradient
        colors={['rgba(10,10,15,0.42)', 'rgba(10,10,15,0.18)', 'rgba(10,10,15,0.92)', CANVAS]}
        locations={[0, 0.3, 0.48, 0.6]}
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

      {/* Fixed one-screen layout — no scrolling. The stack is bottom-anchored:
          leftover space can only ever land ABOVE the copy (where the collage
          wants it), never as a slab in the middle, and an oversized stack
          slides up under the hero instead of pushing the CTA off-screen. */}
      <View
        style={[
          styles.pageContent,
          {
            paddingTop: insets.top + 52,
            paddingBottom: Math.max(insets.bottom, 12),
            paddingHorizontal: 18,
          },
        ]}
      >
        {/* TOP: brand + headline live up in the gradient / collage area */}
        <View style={styles.topGroup}>
          <View style={styles.brandRow}>
            <Text style={styles.brandText}>edutu</Text>
            <View style={styles.proPill}>
              <Text style={styles.proPillText}>{t('paywall.proBadge')}</Text>
            </View>
          </View>

          {/* Two-tone headline over the collage. Sized off the viewport so long
              admin copy stays on two lines instead of stealing vertical space. */}
          <View style={styles.headline}>
            <Text style={[styles.headlineLine, headlineType, { color: accent }]} numberOfLines={2}>
              {planTier === 'pro' || planTier === 'scholar'
                ? t('paywall.premiumIsActive')
                : planTier === 'lite'
                  ? 'You are on Lite — upgrade to Pro for 10× more daily usage.'
                  : copy(paywall.heroLine1, t('paywall.heroLine1'))}
            </Text>
            {canUpgrade && (
              <Text style={[styles.headlineLine, headlineType, { color: '#FFFFFF' }]} numberOfLines={2}>
                {copy(paywall.heroLine2, t('paywall.heroLine2'))}
              </Text>
            )}
          </View>
          {!canUpgrade ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {t('paywall.heroActive')}
            </Text>
          ) : (
            <>
              {/* The subtitle paragraph is deliberately NOT rendered here: it
                  restates the bullets below almost word for word. The unlock
                  list is the value block — one voice, not two. */}
              <View style={styles.benefits}>
                {benefits.map((benefit) => (
                  <View key={benefit} style={styles.benefitRow}>
                    <View style={[styles.benefitTick, { backgroundColor: `${accent}2E` }]}>
                      <Check size={11} color={accent} strokeWidth={3.2} />
                    </View>
                    {/* Two lines: the translated feature strings run long in
                        several locales and truncation reads as a bug. */}
                    <Text style={styles.benefitText} numberOfLines={2}>
                      {benefit}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* BOTTOM: plans, CTA, legal */}
        <View style={styles.bottomGroup}>
        {canUpgrade ? (
          <>
            <View style={styles.tierToggle}>
              {(['lite', 'pro', 'scholar'] as const).map((tier) => (
                <TouchableOpacity
                  key={tier}
                  onPress={() => {
                    setSelectedTier(tier);
                    checkoutIdempotencyKeyRef.current = null;
                  }}
                  style={[styles.tierOption, selectedTier === tier && { backgroundColor: accent }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedTier === tier }}
                >
                  <Text style={[styles.tierOptionText, selectedTier === tier && { color: CANVAS }]}>
                    {tier === 'lite' ? 'Lite' : tier === 'pro' ? 'Pro · 10× usage' : 'Scholar · max'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Plan cards — badge slot / name / per-week rate / total + cadence */}
            <View style={styles.planRow}>
              {displayedPlans.map((plan) => {
                const active = selectedPlan === plan;
                    const discounted = hasPromoDiscount(pricing, plan, selectedTier, { applyPromo: false });
                const offPct = promoOffPct(plan);
                const badge = planBadge(plan);
                return (
                  <TouchableOpacity
                    key={plan}
                    onPress={() => {
                      userPickedPlanRef.current = true;
                      checkoutIdempotencyKeyRef.current = null;
                      setSelectedPlan(plan);
                    }}
                    activeOpacity={0.85}
                    style={[
                      styles.planCard,
                      active && styles.planCardActive,
                      active && { shadowColor: accent },
                      // The cheapest-per-week card keeps a faint accent edge
                      // even unselected, so the recommendation survives the
                      // user tapping something else.
                      { borderColor: active ? accent : plan === bestValuePlan ? `${accent}55` : CARD_BORDER },
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
                    {/* Badge slot is always reserved so the three cards keep a
                        common baseline even when only one of them earns a chip. */}
                    <View style={styles.planBadgeSlot}>
                      {Boolean(badge) && (
                        <View
                          style={[
                            styles.planBadgeChip,
                            active ? { backgroundColor: accent } : { backgroundColor: 'rgba(255,255,255,0.10)' },
                          ]}
                        >
                          <Text
                            style={[styles.planBadgeText, { color: active ? CANVAS : 'rgba(255,255,255,0.88)' }]}
                            numberOfLines={1}
                          >
                            {badge}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.planName} numberOfLines={1} adjustsFontSizeToFit>
                      {planLabel(plan)}
                    </Text>
                    {/* Per-week is the comparison axis, so it's the big number;
                        the amount actually charged sits right under it. Both are
                        legible — the total is no longer the loudest thing here. */}
                    <Text style={[styles.planRate, active && { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                      {t('paywall.perWeek', {
                        price: formatMoney(Math.round(perWeekOf(plan) * 100) / 100, displayCurrency(plan)),
                      })}
                    </Text>
                    <View style={styles.planDivider} />
                    <Text style={styles.planTotal} numberOfLines={1} adjustsFontSizeToFit>
                      {displayPriceText(plan)}
                    </Text>
                    {discounted ? (
                      <Text style={styles.planStrike} numberOfLines={1}>
                        {formatMoney(regularPriceOf(plan), pricing.currency)}
                      </Text>
                    ) : (
                      <Text style={styles.planCadence} numberOfLines={1}>
                        {cadenceLabel(plan)}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Big white CTA (reference style) */}
            <TouchableOpacity
              activeOpacity={0.9}
              // Only ever disabled while something is genuinely in flight. When
              // store products are missing the button stays live and its tap
              // opens the retry/restore dialog.
              disabled={redirecting || purchasing || (USE_NATIVE_IAP && iapLoading)}
              onPress={handleCheckout}
              style={[
                styles.ctaButton,
                USE_NATIVE_IAP && !iapLoading && !canPurchase && styles.ctaButtonDisabled,
              ]}
            >
              {(redirecting || purchasing || (USE_NATIVE_IAP && iapLoading)) ? (
                <ActivityIndicator color={CANVAS} />
              ) : (
                <Text style={styles.ctaText} numberOfLines={1} adjustsFontSizeToFit>
                  {copy(
                    paywall.ctaLabel,
                    t('paywall.startPlan', {
                      defaultValue: 'Start {{plan}} — {{price}}',
                      plan: planLabel(selectedPlan),
                      price: displayPriceText(selectedPlan),
                    }),
                  )}
                </Text>
              )}
            </TouchableOpacity>

            {/* One-off Season Pass — a single charge that grants Pro for a
                fixed run of days. Hidden unless it's actually for sale on this
                platform (admin flag on web; a real RC product on device). */}
            {seasonForSale && (
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={redirecting || purchasing}
                onPress={handleSeason}
                style={[styles.seasonButton, { borderColor: accent }]}
                accessibilityRole="button"
                accessibilityLabel={pricing.seasonPass.label}
              >
                <View style={styles.seasonTextWrap}>
                  <Text style={styles.seasonTitle} numberOfLines={1}>
                    {pricing.seasonPass.label}
                  </Text>
                  <Text style={styles.seasonSub} numberOfLines={1}>
                    {t('paywall.seasonDuration', {
                      count: pricing.seasonPass.durationDays,
                      defaultValue: '{{count}}-day Pro access',
                    })}
                  </Text>
                </View>
                <Text style={[styles.seasonPrice, { color: accent }]} numberOfLines={1}>
                  {seasonPriceText}
                </Text>
              </TouchableOpacity>
            )}

            {/* The three questions every paywall gets asked, answered in one
                row instead of nowhere. */}
            <View style={styles.trustRow}>
              {[
                t('paywall.trustCancel', { defaultValue: 'Cancel anytime' }),
                t('paywall.trustSecure', { defaultValue: 'Secure payment' }),
                t('paywall.trustInstant', { defaultValue: 'Instant access' }),
              ].map((item, index) => (
                <React.Fragment key={item}>
                  {index > 0 && <View style={styles.trustDot} />}
                  <Text style={styles.trustText} numberOfLines={1}>
                    {item}
                  </Text>
                </React.Fragment>
              ))}
            </View>

            {/* On device we only sell via the store. If products can't load we
                say so rather than dead-ending — one short line, not a paragraph.
                Keyed off canPurchase (not iapUnavailable) so the case where
                offerings loaded but THIS plan has no matching product explains
                itself too, instead of a silently unbuyable card. Tapping the
                line reloads the products; so does tapping the CTA. */}
            {USE_NATIVE_IAP && !iapLoading && !canPurchase && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={retryIapOfferings}
                accessibilityRole="button"
                hitSlop={{ top: 6, bottom: 6 }}
              >
                <Text style={styles.secureNote} numberOfLines={2}>
                  {iapBlockedMessage}
                </Text>
                {/* The action is its own line, not appended to the sentence:
                    it has to read as something you can press. */}
                <Text style={styles.retryLink} numberOfLines={1}>
                  {t('common:actions.tryAgain')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Apple REQUIRES the auto-renew disclosure when charging via
                StoreKit — kept only on that path; the web/Paystack note is gone. */}
            {iapActive && (
              <Text style={styles.secureNote} numberOfLines={2}>
                {t('paywall.renewalNote')}
              </Text>
            )}

            {/* Both links are required alongside an auto-renewing subscription
                (App Store review guideline 3.1.2) — "T&Cs apply" isn't enough. */}
            <View style={styles.legalRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => void Linking.openURL('https://edutu.org/terms')}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="link"
              >
                <Text style={styles.legalText}>{t('paywall.terms')}</Text>
              </TouchableOpacity>
              <View style={styles.trustDot} />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => void Linking.openURL('https://edutu.org/privacy')}
                hitSlop={{ top: 8, bottom: 8 }}
                accessibilityRole="link"
              >
                <Text style={styles.legalText}>{t('paywall.privacy')}</Text>
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
        </View>
      </View>

      {/* Legibility scrim for the overlay controls — they sit directly on the
          poster mosaic, which is bright and unpredictable (white logos, paper
          scans). Cheap, and it doubles as a lens hood for the status bar. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.50)', 'rgba(0,0,0,0.14)', 'transparent']}
        locations={[0, 0.6, 1]}
        pointerEvents="none"
        style={[styles.topScrim, { height: insets.top + 46 }]}
      />

      {/* Overlay controls pinned to the very top of the page. Rendered as a
          sibling of pageContent (not a child): RN offsets absolutely-positioned
          children by the parent's padding, which was pushing this row down by
          an extra safe-area + 56. */}
      <View style={[styles.topRow, { top: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.closeButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.notNow')}
        >
          <X size={19} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        {USE_NATIVE_IAP && canUpgrade ? (
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            activeOpacity={0.7}
            style={styles.restoreButton}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.restore')}
          >
            {/* A spinner, not a label swap — "Loading premium…" was the wrong
                sentence for a restore, and the pill jumped width mid-tap. */}
            {restoring ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.75)" />
            ) : (
              <Text style={styles.restoreText} numberOfLines={1}>
                {t('paywall.restore')}
              </Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Dev-only visual preview; it does not create a payment or entitlement. */}
      {__DEV__ ? (
        <View style={[styles.devTools, { top: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={() => setShowCelebration(true)}
            style={styles.devPreviewBtn}
            accessibilityLabel="Preview premium celebration"
          >
            <Text style={styles.devPreviewLabel}>🎉 Preview</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <PremiumCelebration
        visible={showCelebration}
        accent={accent}
        onClose={() => {
          setShowCelebration(false);
          // A real purchase pushes this screen, so popping returns the user to
          // where they upgraded from. Dev preview just pops the paywall (fine).
          if (router.canGoBack()) router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  devTools: {
    position: 'absolute',
    right: 12,
    zIndex: 50,
    flexDirection: 'row',
    gap: 8,
  },
  devPreviewBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(139,157,255,0.9)',
  },
  devPreviewLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pageContent: { flex: 1, justifyContent: 'flex-end' },

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
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4 },
  // Both controls share one glass treatment so the row reads as a pair of
  // chrome affordances rather than a button and some loose white text.
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  // Relevant to a small minority of visitors — present, reachable, but no
  // longer competing with the CTA for attention.
  restoreButton: {
    minHeight: 34,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  restoreText: { color: 'rgba(255,255,255,0.72)', fontSize: 12.5, fontWeight: '600' },

  // ── Layout groups ──
  // Nothing here flexes: the stack is bottom-anchored (pageContent uses
  // justifyContent: 'flex-end'), so slack collects above the copy in the
  // collage — never as a void between the two groups.
  topGroup: { marginBottom: 18 },
  bottomGroup: {},

  // ── Copy ──
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
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
  headline: { alignItems: 'center', marginBottom: 8 },
  headlineLine: {
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
    // Sits directly over the poster collage — keep it legible on busy tiles.
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 18,
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  // ── Benefits ──
  // Left-aligned rows inside a centred block: a centred checklist has no
  // common edge for the eye to run down.
  benefits: { alignSelf: 'center', gap: 8, paddingHorizontal: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  benefitTick: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 13.5,
    fontWeight: '600',
    flexShrink: 1,
  },

  // ── Plan cards ──
  tierToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 999,
    padding: 3,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  tierOption: {
    minWidth: 112,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  tierOptionText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '800' },
  planRow: { flexDirection: 'row', gap: 9, marginBottom: 14, alignItems: 'flex-end' },
  planCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: CARD_BG,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
  },
  planCardActive: {
    borderWidth: 2.5,
    paddingTop: 14,
    paddingBottom: 14,
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
  planBadgeSlot: { height: 21, justifyContent: 'center', marginBottom: 6, maxWidth: '100%' },
  planBadgeChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    maxWidth: '100%',
  },
  // Tight tracking so "SAVE 42%" fits a third of the row without the ellipsis
  // the previous scale forced.
  planBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  planName: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '700', marginBottom: 5 },
  planRate: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  planDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'stretch',
    marginTop: 8,
    marginBottom: 7,
  },
  planTotal: { color: 'rgba(255,255,255,0.94)', fontSize: 13.5, fontWeight: '700' },
  planCadence: { color: TEXT_DIM, fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  planStrike: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    marginTop: 2,
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
  // ── CTA + legal ──
  ctaButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  ctaButtonDisabled: { opacity: 0.5 },
  ctaText: { color: CANVAS, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  seasonButton: {
    marginTop: 10,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: CARD_BG,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  seasonTextWrap: { flex: 1, paddingRight: 12 },
  seasonTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  seasonSub: { color: TEXT_DIM, fontSize: 12, fontWeight: '600', marginTop: 2 },
  seasonPrice: { fontSize: 15, fontWeight: '800' },
  secureNote: {
    color: TEXT_DIM,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
  },
  // Reads as a link (brighter, underlined) so the recovery from an unbuyable
  // CTA looks pressable instead of like more fine print.
  retryLink: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 3,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  trustText: { color: 'rgba(255,255,255,0.62)', fontSize: 11.5, fontWeight: '600' },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 26,
    marginTop: 4,
  },
  legalText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11.5,
    fontWeight: '600',
  },

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
