import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { DollarSign, Save, Tag } from 'lucide-react-native';
import { requestProductApi } from '@edutu/core/src/services/productApi';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { AdminGuard } from '../../components/auth/AdminGuard';
import { useTheme } from '../../components/context/ThemeContext';
import { DEFAULT_PRICING, formatMoney, type PricingConfig } from '../../lib/pricing';

// Admin console for subscription pricing, currency and promos ("bonanza").
// State lives in admin_settings.pricing (GET/PUT /admin/settings); the paywall
// and pay.edutu.org read it from the public /mobile-control/config payload, so
// a change reaches users without a store release. No secrets here — Paystack
// keys live on pay.edutu.org.

interface AdminSettingsPayload {
    success: boolean;
    settings: Record<string, unknown> & { pricing?: PricingConfig };
    error?: string;
}

/** String-backed form state so numeric inputs edit cleanly. */
interface PricingForm {
    currency: string;
    monthlyPrice: string;
    yearlyPrice: string;
    checkoutBaseUrl: string;
    manageUrl: string;
    promoActive: boolean;
    promoLabel: string;
    promoMonthlyPrice: string;
    promoYearlyPrice: string;
}

function toForm(p: PricingConfig): PricingForm {
    return {
        currency: p.currency,
        monthlyPrice: String(p.monthlyPrice),
        yearlyPrice: String(p.yearlyPrice),
        checkoutBaseUrl: p.checkoutBaseUrl,
        manageUrl: p.manageUrl,
        promoActive: p.promo.active,
        promoLabel: p.promo.label,
        promoMonthlyPrice: p.promo.monthlyPrice != null ? String(p.promo.monthlyPrice) : '',
        promoYearlyPrice: p.promo.yearlyPrice != null ? String(p.promo.yearlyPrice) : '',
    };
}

function parsePrice(value: string): number | null {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function AdminPricingContent() {
    const { getToken } = useAuth();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fullSettings, setFullSettings] = useState<Record<string, unknown> | null>(null);
    const [form, setForm] = useState<PricingForm>(toForm(DEFAULT_PRICING));

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
    const inputBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';
    const cardBg = colors.card;

    const set = <K extends keyof PricingForm>(key: K, value: PricingForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const load = useCallback(async () => {
        setLoading(true);
        const response = await requestProductApi<AdminSettingsPayload>('/admin/settings', {}, getToken);
        if (response?.settings) {
            setFullSettings(response.settings);
            setForm(toForm({ ...DEFAULT_PRICING, ...(response.settings.pricing ?? {}), promo: { ...DEFAULT_PRICING.promo, ...(response.settings.pricing?.promo ?? {}) } }));
        } else {
            Alert.alert('Error', 'Could not load pricing settings. Check your connection and admin access.');
        }
        setLoading(false);
    }, [getToken]);

    useEffect(() => { void load(); }, [load]);

    const handleSave = async () => {
        if (!fullSettings) return;

        const monthly = parsePrice(form.monthlyPrice);
        const yearly = parsePrice(form.yearlyPrice);
        const currency = form.currency.trim().toUpperCase();

        if (currency.length < 3 || currency.length > 4) {
            Alert.alert('Invalid currency', 'Use a 3-letter ISO code like NGN, USD or GHS.');
            return;
        }
        if (monthly == null || yearly == null) {
            Alert.alert('Invalid price', 'Monthly and yearly prices must be valid non-negative numbers.');
            return;
        }
        if (!/^https?:\/\//.test(form.checkoutBaseUrl.trim()) || !/^https?:\/\//.test(form.manageUrl.trim())) {
            Alert.alert('Invalid URL', 'Checkout and manage URLs must start with https://');
            return;
        }

        const pricing: PricingConfig = {
            currency,
            monthlyPrice: monthly,
            yearlyPrice: yearly,
            checkoutBaseUrl: form.checkoutBaseUrl.trim().replace(/\/$/, ''),
            manageUrl: form.manageUrl.trim().replace(/\/$/, ''),
            promo: {
                active: form.promoActive,
                label: form.promoLabel.trim(),
                monthlyPrice: form.promoMonthlyPrice.trim() ? parsePrice(form.promoMonthlyPrice) : null,
                yearlyPrice: form.promoYearlyPrice.trim() ? parsePrice(form.promoYearlyPrice) : null,
            },
        };

        setSaving(true);
        const response = await requestProductApi<AdminSettingsPayload>(
            '/admin/settings',
            { method: 'PUT', body: JSON.stringify({ ...fullSettings, pricing }) },
            getToken,
        );
        setSaving(false);
        if (response?.success) {
            setFullSettings((prev) => ({ ...(prev ?? {}), pricing }));
            Alert.alert('Saved', 'Pricing is live. Apps pick it up on next launch or when the paywall opens.');
        } else {
            Alert.alert('Error', response?.error || 'Pricing could not be saved.');
        }
    };

    const field = (
        label: string,
        value: string,
        onChangeText: (v: string) => void,
        opts: { keyboardType?: 'default' | 'decimal-pad'; placeholder?: string; autoCapitalize?: 'none' | 'characters' } = {},
    ) => (
        <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: textSecondary }]}>{label}</Text>
            <TextInput
                style={[styles.input, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={opts.placeholder}
                placeholderTextColor={textSecondary}
                keyboardType={opts.keyboardType ?? 'default'}
                autoCapitalize={opts.autoCapitalize ?? 'sentences'}
                autoCorrect={false}
            />
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                <ScreenHeader title="Pricing & Promos" showBack />
                <View style={styles.loading}><BrandedLoader label="Loading pricing…" /></View>
            </SafeAreaView>
        );
    }

    const previewMonthly = parsePrice(form.promoActive && form.promoMonthlyPrice ? form.promoMonthlyPrice : form.monthlyPrice);
    const previewCurrency = form.currency.trim().toUpperCase() || 'USD';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title="Pricing & Promos" subtitle="Set plan prices, currency & bonanzas" showBack />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Live preview */}
                    <View style={[styles.preview, { backgroundColor: `${colors.accent}12`, borderColor: `${colors.accent}33` }]}>
                        <Text style={[styles.previewLabel, { color: textSecondary }]}>Paywall shows</Text>
                        <Text style={[styles.previewPrice, { color: textPrimary }]}>
                            {previewMonthly != null ? formatMoney(previewMonthly, previewCurrency) : '—'}
                            <Text style={[styles.previewPer, { color: textSecondary }]}>  / month</Text>
                        </Text>
                        {form.promoActive && !!form.promoLabel.trim() && (
                            <View style={styles.previewPromoRow}>
                                <Tag size={13} color={colors.accent} />
                                <Text style={[styles.previewPromo, { color: colors.accent }]}>{form.promoLabel.trim()}</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.sectionHeader}>
                        <DollarSign size={16} color={colors.accent} />
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Plans</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: inputBorder }]}>
                        {field('Currency (ISO code)', form.currency, (v) => set('currency', v), { placeholder: 'NGN', autoCapitalize: 'characters' })}
                        {field('Monthly price', form.monthlyPrice, (v) => set('monthlyPrice', v), { keyboardType: 'decimal-pad', placeholder: '4000' })}
                        {field('Yearly price', form.yearlyPrice, (v) => set('yearlyPrice', v), { keyboardType: 'decimal-pad', placeholder: '40000' })}
                    </View>

                    <View style={styles.sectionHeader}>
                        <Tag size={16} color={colors.accent} />
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Bonanza / Promo</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: inputBorder }]}>
                        <View style={styles.switchRow}>
                            <View style={styles.flex}>
                                <Text style={[styles.switchLabel, { color: textPrimary }]}>Promo active</Text>
                                <Text style={[styles.switchHint, { color: textSecondary }]}>Show a highlighted offer and charge the promo price.</Text>
                            </View>
                            <Switch
                                value={form.promoActive}
                                onValueChange={(v) => set('promoActive', v)}
                                trackColor={{ false: '#CBD5E1', true: colors.accent }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
                        {form.promoActive && (
                            <>
                                {field('Promo label', form.promoLabel, (v) => set('promoLabel', v), { placeholder: 'New Year Bonanza — 50% off' })}
                                {field('Promo monthly price (optional)', form.promoMonthlyPrice, (v) => set('promoMonthlyPrice', v), { keyboardType: 'decimal-pad', placeholder: 'blank = keep regular' })}
                                {field('Promo yearly price (optional)', form.promoYearlyPrice, (v) => set('promoYearlyPrice', v), { keyboardType: 'decimal-pad', placeholder: 'blank = keep regular' })}
                            </>
                        )}
                    </View>

                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Checkout</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: inputBorder }]}>
                        {field('Checkout base URL', form.checkoutBaseUrl, (v) => set('checkoutBaseUrl', v), { placeholder: 'https://pay.edutu.org', autoCapitalize: 'none' })}
                        {field('Manage subscription URL', form.manageUrl, (v) => set('manageUrl', v), { placeholder: 'https://pay.edutu.org/account', autoCapitalize: 'none' })}
                    </View>

                    <AnimatedPressable onPress={handleSave} disabled={saving} hapticFeedback="medium" style={[styles.saveButton, { backgroundColor: colors.accent, opacity: saving ? 0.6 : 1 }]}>
                        <Save size={18} color="#FFFFFF" />
                        <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save pricing'}</Text>
                    </AnimatedPressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export default function AdminPricing() {
    return (
        <AdminGuard>
            <AdminPricingContent />
        </AdminGuard>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    preview: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
    previewLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    previewPrice: { fontSize: 30, fontWeight: '800', marginTop: 4 },
    previewPer: { fontSize: 14, fontWeight: '600' },
    previewPromoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    previewPromo: { fontSize: 13, fontWeight: '700' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
    sectionTitle: { fontSize: 15, fontWeight: '700' },
    card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20, gap: 14 },
    field: { gap: 6 },
    fieldLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
    input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    switchLabel: { fontSize: 15, fontWeight: '600' },
    switchHint: { fontSize: 12, lineHeight: 17, marginTop: 2 },
    saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 16, marginTop: 4 },
    saveButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
