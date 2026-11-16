import React, { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Crown } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import {
    DEFAULT_PRICING,
    type PricingConfig,
    effectivePrice,
    hasPromoDiscount,
    formatMoney,
} from '../../lib/pricing';
import { fetchMobileControlConfig } from '../../lib/mobileControl';
import { useWelcomeModalActive } from '../../lib/welcomeModalStore';
import { useUpgradeSheet } from '../context/UpgradeSheetContext';

// One impression per calendar day so the ad never nags.
const LAST_SHOWN_KEY = '@edutu/login_offer_last_shown';
// Let the home screen settle before the interstitial fades in.
const SHOW_DELAY_MS = 1600;

/**
 * Login-time promo interstitial — a full-screen "Special Offer" banner shown
 * once per day to free users right after sign-in. When an admin promo
 * (bonanza) is active it shows the real % discount off the monthly plan;
 * otherwise it falls back to a generic premium pitch. Purchase logic stays on
 * /paywall — this screen only advertises.
 */
export function LoginOfferModal() {
    const { isDark } = useTheme();
    const { t } = useTranslation('home');
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useUser();
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);

    const [visible, setVisible] = useState(false);
    const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);
    // Wait out the first-run greeting so the promo never stacks on top of it.
    const welcomeActive = useWelcomeModalActive();
    // This is an unsolicited ad. If the user is already inside a monetization
    // surface they opened themselves (the shared upgrade sheet, or a screen's
    // Pro modal), the promo must stay out of the way rather than stack a
    // second full-screen paywall pitch on top of it. Narrowed to a boolean so
    // the effect doesn't depend on the whole context object identity.
    const upgradeFlowOpen = useUpgradeSheet()?.isUpgradeFlowOpen ?? false;

    useEffect(() => {
        if (!user?.id || proLoading || isPro || welcomeActive || upgradeFlowOpen) return;
        let cancelled = false;

        const maybeShow = async () => {
            try {
                const today = new Date().toISOString().slice(0, 10);
                const lastShown = await AsyncStorage.getItem(LAST_SHOWN_KEY);
                if (lastShown === today) return;

                // Same admin source as the paywall; defaults on any failure.
                try {
                    const config = await fetchMobileControlConfig();
                    if (!cancelled && config.pricing) setPricing(config.pricing);
                } catch { /* keep defaults */ }

                if (cancelled) return;
                setTimeout(() => {
                    if (cancelled) return;
                    setVisible(true);
                    void AsyncStorage.setItem(LAST_SHOWN_KEY, today);
                }, SHOW_DELAY_MS);
            } catch { /* storage unavailable — skip quietly */ }
        };

        void maybeShow();
        return () => { cancelled = true; };
    }, [user?.id, proLoading, isPro, welcomeActive, upgradeFlowOpen]);

    // Consumer checkout prices are provider/catalogue-owned. The admin promo
    // may be stale or unsupported by the active store/Bachs product, so this
    // unsolicited offer must never advertise a lower amount than checkout can
    // actually charge.
    const promoActive = hasPromoDiscount(pricing, 'monthly', 'pro', { applyPromo: false });
    const regular = pricing.monthlyPrice;
    const promoPrice = effectivePrice(pricing, 'monthly', 'pro', { applyPromo: false });
    const discountPct = useMemo(
        () => (promoActive && regular > 0 ? Math.round((1 - promoPrice / regular) * 100) : 0),
        [promoActive, regular, promoPrice],
    );

    const close = () => setVisible(false);
    const goToPaywall = () => {
        setVisible(false);
        router.push('/paywall' as never);
    };

    // Second half of the suppression: the delayed reveal can land in the same
    // frame a billing error opens the shared sheet, so yield at render time
    // too. The once-per-day key is already written by then — the promo simply
    // forfeits today's impression rather than fighting for the foreground.
    if (!visible || upgradeFlowOpen) return null;

    const accent = '#7C6FE8';
    const textPrimary = isDark ? '#F1F5F9' : '#1E1B33';
    const textSecondary = isDark ? '#A5A0C2' : '#5B5678';

    return (
        <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
            <LinearGradient
                colors={isDark ? ['#221E3F', '#141227', '#0F172A'] : ['#DDD9F6', '#EBE9F9', '#F7F7FB']}
                style={styles.container}
            >
                {/* Close */}
                <TouchableOpacity
                    onPress={close}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('paywall.loginOffer.close')}
                    style={[
                        styles.closeBtn,
                        { top: insets.top + 16, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#FFFFFF' },
                    ]}
                >
                    <X size={20} color={textPrimary} strokeWidth={2.4} />
                </TouchableOpacity>

                {/* Header */}
                <Animated.View entering={FadeInDown.delay(120).duration(420)} style={[styles.header, { marginTop: insets.top + 84 }]}>
                    <View style={styles.titleRow}>
                        <Crown size={18} color={accent} fill={accent} />
                        <Text style={[styles.title, { color: textPrimary }]}>
                            {promoActive ? t('paywall.loginOffer.title') : t('paywall.loginOffer.genericTitle')}
                        </Text>
                        <Crown size={18} color={accent} fill={accent} />
                    </View>
                    <Text style={[styles.subtitle, { color: textSecondary }]}>
                        {promoActive
                            ? (pricing.promo.label || t('paywall.loginOffer.subtitle'))
                            : t('paywall.loginOffer.genericSubtitle')}
                    </Text>
                </Animated.View>

                {/* Starburst seal */}
                <Animated.View entering={ZoomIn.delay(260).springify().damping(14)} style={styles.sealArea}>
                    <View style={[styles.sealSquare, styles.sealBack, { backgroundColor: '#67C79A' }]} />
                    <View style={[styles.sealSquare, styles.sealMid, { backgroundColor: accent }]} />
                    <View style={[styles.sealSquare, styles.sealFront, { backgroundColor: '#8B7FF0' }]} />
                    <View style={styles.sealContent}>
                        {promoActive ? (
                            <>
                                <Text style={styles.sealBig}>{discountPct}%</Text>
                                <Text style={styles.sealSmall}>{t('paywall.loginOffer.off')}</Text>
                            </>
                        ) : (
                            <>
                                <Crown size={44} color="#FFFFFF" fill="#FDE047" strokeWidth={1.4} />
                                <Text style={styles.sealSmall}>{t('paywall.loginOffer.premium')}</Text>
                            </>
                        )}
                    </View>
                </Animated.View>

                {/* Price block */}
                <Animated.View entering={FadeInDown.delay(420).duration(420)} style={styles.priceBlock}>
                    {promoActive ? (
                        <>
                            <Text style={[styles.wasLine, { color: textSecondary }]}>
                                {t('paywall.loginOffer.was', { price: formatMoney(regular, pricing.currency) })}
                            </Text>
                            <Text style={[styles.totalLine, { color: accent }]}>
                                {t('paywall.loginOffer.total', { price: formatMoney(promoPrice, pricing.currency) })}
                            </Text>
                        </>
                    ) : (
                        <Text style={[styles.totalLine, { color: accent }]}>
                            {t('paywall.loginOffer.total', { price: formatMoney(promoPrice, pricing.currency) })}
                        </Text>
                    )}
                    <Text style={[styles.taglineLine, { color: textSecondary }]}>
                        {t('paywall.loginOffer.tagline')}
                    </Text>

                    <TouchableOpacity onPress={goToPaywall} activeOpacity={0.7} style={styles.plansLinkWrap}>
                        <Text style={[styles.plansLink, { color: textPrimary }]}>
                            {t('paywall.loginOffer.viewAllPlans')}
                        </Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* CTA */}
                <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                    <TouchableOpacity onPress={goToPaywall} activeOpacity={0.9} style={[styles.ctaBtn, { backgroundColor: accent }]}>
                        <Text style={styles.ctaText}>{t('paywall.loginOffer.cta')}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.footnote, { color: textSecondary }]}>
                        {t('paywall.loginOffer.footnote')}
                    </Text>
                </View>
            </LinearGradient>
        </Modal>
    );
}

const SEAL_SIZE = 210;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
    },
    closeBtn: {
        position: 'absolute',
        left: 20,
        zIndex: 10,
        width: 44,
        height: 44,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
    },
    header: {
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 21,
    },
    sealArea: {
        width: SEAL_SIZE,
        height: SEAL_SIZE,
        marginTop: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sealSquare: {
        position: 'absolute',
        width: SEAL_SIZE * 0.78,
        height: SEAL_SIZE * 0.78,
        borderRadius: 34,
    },
    sealBack: {
        transform: [{ rotate: '15deg' }, { scale: 1.06 }],
    },
    sealMid: {
        transform: [{ rotate: '45deg' }],
    },
    sealFront: {
        transform: [{ rotate: '0deg' }],
    },
    sealContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    sealBig: {
        color: '#FFFFFF',
        fontSize: 56,
        fontWeight: '900',
        lineHeight: 60,
    },
    sealSmall: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 2,
    },
    priceBlock: {
        alignItems: 'center',
        marginTop: 52,
        paddingHorizontal: 32,
    },
    wasLine: {
        fontSize: 17,
        textDecorationLine: 'line-through',
        marginBottom: 6,
    },
    totalLine: {
        fontSize: 28,
        fontWeight: '900',
        marginBottom: 8,
    },
    taglineLine: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    plansLinkWrap: {
        padding: 6,
    },
    plansLink: {
        fontSize: 16,
        fontWeight: '700',
        textDecorationLine: 'underline',
    },
    ctaArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    ctaBtn: {
        alignSelf: 'stretch',
        minHeight: 54,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7C6FE8',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    ctaText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '800',
    },
    footnote: {
        fontSize: 12.5,
        marginTop: 10,
    },
});
