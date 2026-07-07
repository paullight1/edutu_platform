import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { X, Zap, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { PurchasesOffering } from 'react-native-purchases';
import { useTheme } from '../context/ThemeContext';
import {
    getOfferings,
    initRevenueCat,
    purchaseCredits,
    PRODUCTS,
    CREDIT_AMOUNTS,
} from '@edutu/core/src/services/payments';
import { useTranslation } from 'react-i18next';

interface Props {
    visible: boolean;
    onClose: () => void;
    userId: string | null;
    /** Called after a successful purchase. Balance still updates via realtime. */
    onPurchased?: () => void;
}

// Presentational metadata for each credit pack, ordered small → xlarge.
// `label` holds an i18n key (home namespace); translated at render time.
const PACKS: { productId: string; label: string; highlight?: boolean }[] = [
    { productId: PRODUCTS.CREDITS_SMALL, label: 'creditPack.packs.starter' },
    { productId: PRODUCTS.CREDITS_MEDIUM, label: 'creditPack.packs.popular', highlight: true },
    { productId: PRODUCTS.CREDITS_LARGE, label: 'creditPack.packs.pro' },
    { productId: PRODUCTS.CREDITS_XLARGE, label: 'creditPack.packs.megaValue' },
];

export function CreditPackSheet({ visible, onClose, userId, onPurchased }: Props) {
    const { t } = useTranslation('home');
    const { colors, isDark } = useTheme();
    const muted = colors.textSecondary;
    const surface = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.09)' : '#E2E8F0';

    const [offering, setOffering] = useState<PurchasesOffering | null>(null);
    const [configured, setConfigured] = useState(false);
    const [loadingOfferings, setLoadingOfferings] = useState(true);
    const [purchasingId, setPurchasingId] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;

        let active = true;
        const load = async () => {
            setLoadingOfferings(true);
            try {
                if (!userId) {
                    if (active) setConfigured(false);
                    return;
                }
                const ok = await initRevenueCat(userId);
                if (!active) return;
                setConfigured(ok);
                if (!ok) return;

                const current = await getOfferings();
                if (active) setOffering(current);
            } catch (error) {
                console.error('Failed to load credit offerings:', error);
                if (active) setConfigured(false);
            } finally {
                if (active) setLoadingOfferings(false);
            }
        };

        void load();
        return () => {
            active = false;
        };
    }, [visible, userId]);

    // Map each credit product id → its live store price string (if configured).
    const priceByProduct = useMemo(() => {
        const map: Record<string, string> = {};
        for (const pkg of offering?.availablePackages || []) {
            const id = pkg.product?.identifier;
            if (id && pkg.product?.priceString) {
                map[id] = pkg.product.priceString;
            }
        }
        return map;
    }, [offering]);

    const handleBuy = async (productId: string) => {
        if (purchasingId) return;

        if (!configured || !priceByProduct[productId]) {
            Alert.alert(
                t('creditPack.comingSoonTitle'),
                t('creditPack.comingSoonMessage'),
            );
            return;
        }

        setPurchasingId(productId);
        try {
            const result = await purchaseCredits(productId);
            if (result.success) {
                onPurchased?.();
                Alert.alert(
                    t('creditPack.purchaseCompleteTitle'),
                    t('creditPack.purchaseCompleteMessage', { count: CREDIT_AMOUNTS[productId] }),
                );
                onClose();
            } else if (result.error && result.error !== 'User cancelled') {
                Alert.alert(t('creditPack.purchaseFailedTitle'), result.error);
            }
        } catch (error: any) {
            Alert.alert(t('creditPack.purchaseFailedTitle'), error?.message || t('creditPack.somethingWentWrong'));
        } finally {
            setPurchasingId(null);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, { backgroundColor: colors.background }]}>
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <View style={styles.titleRow}>
                            <View style={[styles.titleIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                                <Zap size={18} color="#10B981" />
                            </View>
                            <Text style={[styles.title, { color: colors.foreground }]}>{t('creditPack.title')}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={[styles.close, { backgroundColor: colors.muted }]}>
                            <X size={20} color={muted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.subtitle, { color: muted }]}>
                        {t('creditPack.subtitle')}
                    </Text>

                    {loadingOfferings ? (
                        <ActivityIndicator color={colors.accent} style={{ marginVertical: 40 }} />
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
                            {PACKS.map((pack) => {
                                const amount = CREDIT_AMOUNTS[pack.productId] || 0;
                                const price = priceByProduct[pack.productId];
                                const available = configured && !!price;
                                const busy = purchasingId === pack.productId;
                                const disabled = !!purchasingId;

                                return (
                                    <TouchableOpacity
                                        key={pack.productId}
                                        activeOpacity={0.85}
                                        disabled={disabled}
                                        onPress={() => handleBuy(pack.productId)}
                                        style={[
                                            styles.packRow,
                                            { backgroundColor: surface, borderColor },
                                            pack.highlight && { borderColor: colors.accent },
                                        ]}
                                    >
                                        <View style={styles.packLeft}>
                                            <View style={styles.packTitleRow}>
                                                <Text style={[styles.packAmount, { color: colors.foreground }]}>
                                                    {amount.toLocaleString()}
                                                </Text>
                                                <Text style={[styles.packUnit, { color: muted }]}>{t('creditPack.creditsUnit')}</Text>
                                                {pack.highlight && (
                                                    <View style={[styles.badge, { backgroundColor: `${colors.accent}18` }]}>
                                                        <Text style={[styles.badgeText, { color: colors.accent }]}>
                                                            {t('creditPack.bestValue')}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.packLabel, { color: muted }]}>{t(pack.label)}</Text>
                                        </View>

                                        <View style={styles.packRight}>
                                            {busy ? (
                                                <ActivityIndicator color={colors.accent} />
                                            ) : available ? (
                                                <View style={[styles.buyPill, { backgroundColor: colors.accent }]}>
                                                    <Text style={styles.buyPillText}>{price}</Text>
                                                </View>
                                            ) : (
                                                <View style={[styles.soonPill, { borderColor }]}>
                                                    <Text style={[styles.soonText, { color: muted }]}>{t('common:states.comingSoon')}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}

                            <View style={styles.footer}>
                                <Check size={13} color={muted} />
                                <Text style={[styles.footerText, { color: muted }]}>
                                    {t('creditPack.autoAddNote')}
                                </Text>
                            </View>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 32,
        maxHeight: '85%',
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(148,163,184,0.4)',
        alignSelf: 'center',
        marginBottom: 16,
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    titleIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontWeight: '800' },
    close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 13, lineHeight: 19, marginTop: 12, marginBottom: 8 },
    list: { marginTop: 8 },
    packRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    packLeft: { flex: 1 },
    packTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
    packAmount: { fontSize: 22, fontWeight: '800' },
    packUnit: { fontSize: 13, fontWeight: '500' },
    packLabel: { fontSize: 12, marginTop: 4, fontWeight: '500' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 4 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    packRight: { marginLeft: 12 },
    buyPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: 76, alignItems: 'center' },
    buyPillText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    soonPill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    soonText: { fontSize: 12, fontWeight: '600' },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
    footerText: { fontSize: 12, textAlign: 'center' },
});
