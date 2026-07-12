import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { BarChart3, Coins, DollarSign, ExternalLink, Plus, Save, Tag, Trash2 } from 'lucide-react-native';
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

/** String-backed credit-pack row so numeric inputs edit cleanly. */
interface CreditPackForm {
    credits: string;
    price: string;
    label: string;
}

/** String-backed form state so numeric inputs edit cleanly. */
interface PricingForm {
    currency: string;
    weeklyPrice: string;
    monthlyPrice: string;
    yearlyPrice: string;
    checkoutBaseUrl: string;
    manageUrl: string;
    promoActive: boolean;
    promoLabel: string;
    promoWeeklyPrice: string;
    promoMonthlyPrice: string;
    promoYearlyPrice: string;
    creditPacks: CreditPackForm[];
}

function toForm(p: PricingConfig): PricingForm {
    return {
        currency: p.currency,
        weeklyPrice: String(p.weeklyPrice),
        monthlyPrice: String(p.monthlyPrice),
        yearlyPrice: String(p.yearlyPrice),
        checkoutBaseUrl: p.checkoutBaseUrl,
        manageUrl: p.manageUrl,
        promoActive: p.promo.active,
        promoLabel: p.promo.label,
        promoWeeklyPrice: p.promo.weeklyPrice != null ? String(p.promo.weeklyPrice) : '',
        promoMonthlyPrice: p.promo.monthlyPrice != null ? String(p.promo.monthlyPrice) : '',
        promoYearlyPrice: p.promo.yearlyPrice != null ? String(p.promo.yearlyPrice) : '',
        creditPacks: (p.creditPacks ?? []).map((pack) => ({
            credits: String(pack.credits),
            price: String(pack.price),
            label: pack.label ?? '',
        })),
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

    const setPack = (index: number, key: keyof CreditPackForm, value: string) =>
        setForm((prev) => ({
            ...prev,
            creditPacks: prev.creditPacks.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
        }));

    const addPack = () =>
        setForm((prev) => ({ ...prev, creditPacks: [...prev.creditPacks, { credits: '', price: '', label: '' }] }));

    const removePack = (index: number) =>
        setForm((prev) => ({ ...prev, creditPacks: prev.creditPacks.filter((_, i) => i !== index) }));

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

        const weekly = parsePrice(form.weeklyPrice);
        const monthly = parsePrice(form.monthlyPrice);
        const yearly = parsePrice(form.yearlyPrice);
        const currency = form.currency.trim().toUpperCase();

        if (currency.length < 3 || currency.length > 4) {
            Alert.alert('Invalid currency', 'Use a 3-letter ISO code like NGN, USD or GHS.');
            return;
        }
        if (weekly == null || monthly == null || yearly == null) {
            Alert.alert('Invalid price', 'Weekly, monthly and yearly prices must be valid non-negative numbers.');
            return;
        }
        if (!/^https?:\/\//.test(form.checkoutBaseUrl.trim()) || !/^https?:\/\//.test(form.manageUrl.trim())) {
            Alert.alert('Invalid URL', 'Checkout and manage URLs must start with https://');
            return;
        }

        // Ignore fully-empty rows; reject half-filled ones.
        const packRows = form.creditPacks.filter((row) => row.credits.trim() || row.price.trim() || row.label.trim());
        const creditPacks = packRows.map((row) => ({
            credits: parsePrice(row.credits),
            price: parsePrice(row.price),
            label: row.label.trim() || undefined,
        }));
        if (creditPacks.some((pack) => pack.credits == null || pack.price == null)) {
            Alert.alert('Invalid credit pack', 'Every credit pack needs a valid credits amount and price.');
            return;
        }

        const pricing: PricingConfig = {
            // Preserve any server-managed billing knobs living on the pricing
            // object (aiCosts, freeTier, proFairUse, …) that this screen
            // doesn't edit.
            ...((fullSettings.pricing as object) ?? {}),
            currency,
            weeklyPrice: weekly,
            monthlyPrice: monthly,
            yearlyPrice: yearly,
            checkoutBaseUrl: form.checkoutBaseUrl.trim().replace(/\/$/, ''),
            manageUrl: form.manageUrl.trim().replace(/\/$/, ''),
            promo: {
                active: form.promoActive,
                label: form.promoLabel.trim(),
                weeklyPrice: form.promoWeeklyPrice.trim() ? parsePrice(form.promoWeeklyPrice) : null,
                monthlyPrice: form.promoMonthlyPrice.trim() ? parsePrice(form.promoMonthlyPrice) : null,
                yearlyPrice: form.promoYearlyPrice.trim() ? parsePrice(form.promoYearlyPrice) : null,
            },
            creditPacks: creditPacks as PricingConfig['creditPacks'],
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
                        {field('Weekly price', form.weeklyPrice, (v) => set('weeklyPrice', v), { keyboardType: 'decimal-pad', placeholder: '2000' })}
                        {field('Monthly price', form.monthlyPrice, (v) => set('monthlyPrice', v), { keyboardType: 'decimal-pad', placeholder: '6500' })}
                        {field('Yearly price', form.yearlyPrice, (v) => set('yearlyPrice', v), { keyboardType: 'decimal-pad', placeholder: '60000' })}
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
                                {field('Promo weekly price (optional)', form.promoWeeklyPrice, (v) => set('promoWeeklyPrice', v), { keyboardType: 'decimal-pad', placeholder: 'blank = keep regular' })}
                                {field('Promo monthly price (optional)', form.promoMonthlyPrice, (v) => set('promoMonthlyPrice', v), { keyboardType: 'decimal-pad', placeholder: 'blank = keep regular' })}
                                {field('Promo yearly price (optional)', form.promoYearlyPrice, (v) => set('promoYearlyPrice', v), { keyboardType: 'decimal-pad', placeholder: 'blank = keep regular' })}
                            </>
                        )}
                    </View>

                    <View style={styles.sectionHeader}>
                        <Coins size={16} color={colors.accent} />
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Credit packs</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: inputBorder }]}>
                        <Text style={[styles.switchHint, { color: textSecondary }]}>
                            One-off credit top-ups shown in the wallet. Prices are in the currency above.
                        </Text>
                        {form.creditPacks.map((pack, index) => (
                            <View key={index} style={[styles.packRow, { borderColor: inputBorder }]}>
                                <View style={styles.packInputs}>
                                    {field('Credits', pack.credits, (v) => setPack(index, 'credits', v), { keyboardType: 'decimal-pad', placeholder: '50' })}
                                    {field('Price', pack.price, (v) => setPack(index, 'price', v), { keyboardType: 'decimal-pad', placeholder: '1000' })}
                                    {field('Label (optional)', pack.label, (v) => setPack(index, 'label', v), { placeholder: 'Starter pack' })}
                                </View>
                                <TouchableOpacity
                                    onPress={() => removePack(index)}
                                    style={styles.packRemove}
                                    activeOpacity={0.7}
                                    accessibilityLabel={`Remove credit pack ${index + 1}`}
                                >
                                    <Trash2 size={18} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <TouchableOpacity onPress={addPack} activeOpacity={0.8} style={[styles.packAdd, { borderColor: inputBorder }]}>
                            <Plus size={16} color={colors.accent} />
                            <Text style={[styles.packAddText, { color: colors.accent }]}>Add credit pack</Text>
                        </TouchableOpacity>
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

                    {/* Revenue: opens the pay.edutu.org admin dashboard (amount
                        generated, active Pro users, recent payments). */}
                    <TouchableOpacity
                        style={[styles.revenueButton, { borderColor: inputBorder }]}
                        activeOpacity={0.8}
                        onPress={() => {
                            const base = (form.checkoutBaseUrl.trim() || 'https://pay.edutu.org').replace(/\/$/, '');
                            Linking.openURL(`${base}/admin`).catch(() =>
                                Alert.alert('Error', 'Could not open the revenue dashboard.'),
                            );
                        }}
                    >
                        <BarChart3 size={18} color={textPrimary} />
                        <View style={styles.flex}>
                            <Text style={[styles.revenueTitle, { color: textPrimary }]}>Revenue & payments</Text>
                            <Text style={[styles.revenueHint, { color: textSecondary }]}>See amount generated, subscribers & recent payments</Text>
                        </View>
                        <ExternalLink size={16} color={textSecondary} />
                    </TouchableOpacity>
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
    packRow: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
    packInputs: { flex: 1, gap: 12 },
    packRemove: { width: 36, alignItems: 'center', justifyContent: 'center' },
    packAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 12 },
    packAddText: { fontSize: 14, fontWeight: '700' },
    revenueButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 14 },
    revenueTitle: { fontSize: 15, fontWeight: '700' },
    revenueHint: { fontSize: 12, marginTop: 2 },
});
