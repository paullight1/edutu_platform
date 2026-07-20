import React, { useEffect, useState } from 'react';
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
import { BarChart3, Coins, DollarSign, ExternalLink, Palette, Plus, Save, Tag, Trash2 } from 'lucide-react-native';
import { requestProductApi } from '@edutu/core/src/services/productApi';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { AdminGuard } from '../../components/auth/AdminGuard';
import { useTheme } from '../../components/context/ThemeContext';
import {
    DEFAULT_PAYWALL_CONTENT,
    DEFAULT_PRICING,
    formatMoney,
    normalisePaywallContent,
    type BillingPlan,
    type PaywallContent,
    type PricingConfig,
} from '../../lib/pricing';

// Admin console for subscription pricing, currency, promos ("bonanza") and the
// paywall's design + copy. State lives in admin_settings (pricing + paywall
// groups, GET/PUT /admin/settings); the paywall and pay.edutu.org read it from
// the public /mobile-control/config payload, so a change reaches users without
// a store release. No secrets here — Paystack keys live on pay.edutu.org.

interface AdminSettingsPayload {
    success: boolean;
    settings: Record<string, unknown> & { pricing?: PricingConfig; paywall?: PaywallContent };
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

/** String-backed paywall design/copy form (features edited one-per-line). */
interface PaywallForm {
    heroLine1: string;
    heroLine2: string;
    subtitle: string;
    ctaLabel: string;
    secureNote: string;
    badgeWeekly: string;
    badgeMonthly: string;
    badgeYearly: string;
    features: string;
    accentColor: string;
    heroStyle: 'collage' | 'gradient';
    defaultPlan: BillingPlan;
}

function toPaywallForm(p: PaywallContent): PaywallForm {
    return {
        heroLine1: p.heroLine1,
        heroLine2: p.heroLine2,
        subtitle: p.subtitle,
        ctaLabel: p.ctaLabel,
        secureNote: p.secureNote,
        badgeWeekly: p.badgeWeekly,
        badgeMonthly: p.badgeMonthly,
        badgeYearly: p.badgeYearly,
        features: p.features.join('\n'),
        accentColor: p.accentColor,
        heroStyle: p.heroStyle,
        defaultPlan: p.defaultPlan,
    };
}

// The paywall's built-in accent — used to preview the swatch when no override
// is set. Keep in sync with ACCENT in app/(app)/paywall.tsx.
const PAYWALL_DEFAULT_ACCENT = '#8B9DFF';

function AdminPricingContent() {
    const { getToken } = useAuth();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [fullSettings, setFullSettings] = useState<Record<string, unknown> | null>(null);
    const [form, setForm] = useState<PricingForm>(toForm(DEFAULT_PRICING));
    const [paywallForm, setPaywallForm] = useState<PaywallForm>(toPaywallForm(DEFAULT_PAYWALL_CONTENT));

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
    const inputBorder = isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0';
    const cardBg = colors.card;

    const set = <K extends keyof PricingForm>(key: K, value: PricingForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const setPaywall = <K extends keyof PaywallForm>(key: K, value: PaywallForm[K]) =>
        setPaywallForm((prev) => ({ ...prev, [key]: value }));

    const setPack = (index: number, key: keyof CreditPackForm, value: string) =>
        setForm((prev) => ({
            ...prev,
            creditPacks: prev.creditPacks.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
        }));

    const addPack = () =>
        setForm((prev) => ({ ...prev, creditPacks: [...prev.creditPacks, { credits: '', price: '', label: '' }] }));

    const removePack = (index: number) =>
        setForm((prev) => ({ ...prev, creditPacks: prev.creditPacks.filter((_, i) => i !== index) }));

    // Loading starts true and the effect-local loader only sets state after
    // the await, so nothing is set synchronously during the effect.
    useEffect(() => {
        const load = async () => {
            const response = await requestProductApi<AdminSettingsPayload>('/admin/settings', {}, getToken);
            if (response?.settings) {
                setFullSettings(response.settings);
                setForm(toForm({ ...DEFAULT_PRICING, ...(response.settings.pricing ?? {}), promo: { ...DEFAULT_PRICING.promo, ...(response.settings.pricing?.promo ?? {}) } }));
                setPaywallForm(toPaywallForm(normalisePaywallContent(response.settings.paywall)));
            } else {
                Alert.alert('Error', 'Could not load pricing settings. Check your connection and admin access.');
            }
            setLoading(false);
        };
        void load();
    }, [getToken]);

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

        const accentColor = paywallForm.accentColor.trim();
        if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
            Alert.alert('Invalid accent color', 'Use a 6-digit hex color like #8B9DFF, or leave it blank for the default.');
            return;
        }
        const features = paywallForm.features
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, 6);

        const paywall: PaywallContent = {
            heroLine1: paywallForm.heroLine1.trim(),
            heroLine2: paywallForm.heroLine2.trim(),
            subtitle: paywallForm.subtitle.trim(),
            ctaLabel: paywallForm.ctaLabel.trim(),
            secureNote: paywallForm.secureNote.trim(),
            badgeWeekly: paywallForm.badgeWeekly.trim(),
            badgeMonthly: paywallForm.badgeMonthly.trim(),
            badgeYearly: paywallForm.badgeYearly.trim(),
            features,
            accentColor,
            heroStyle: paywallForm.heroStyle,
            defaultPlan: paywallForm.defaultPlan,
        };

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
            // Season pass is edited on the admin web portal, not here — preserve
            // whatever the server sent (the spread carries it at runtime; this
            // keeps the type satisfied and never blanks it).
            seasonPass:
                ((fullSettings.pricing as PricingConfig | undefined)?.seasonPass) ?? DEFAULT_PRICING.seasonPass,
        };

        setSaving(true);
        const response = await requestProductApi<AdminSettingsPayload>(
            '/admin/settings',
            { method: 'PUT', body: JSON.stringify({ ...fullSettings, pricing, paywall }) },
            getToken,
        );
        setSaving(false);
        if (response?.success) {
            setFullSettings((prev) => ({ ...(prev ?? {}), pricing, paywall }));
            Alert.alert('Saved', 'Pricing & paywall are live. Apps pick them up on next launch or when the paywall opens.');
        } else {
            Alert.alert('Error', response?.error || 'Pricing could not be saved.');
        }
    };

    const field = (
        label: string,
        value: string,
        onChangeText: (v: string) => void,
        opts: { keyboardType?: 'default' | 'decimal-pad'; placeholder?: string; autoCapitalize?: 'none' | 'characters'; multiline?: boolean } = {},
    ) => (
        <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: textSecondary }]}>{label}</Text>
            <TextInput
                style={[
                    styles.input,
                    { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary },
                    opts.multiline && styles.inputMultiline,
                ]}
                value={value}
                onChangeText={onChangeText}
                placeholder={opts.placeholder}
                placeholderTextColor={textSecondary}
                keyboardType={opts.keyboardType ?? 'default'}
                autoCapitalize={opts.autoCapitalize ?? 'sentences'}
                autoCorrect={false}
                multiline={opts.multiline}
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
                        <Palette size={16} color={colors.accent} />
                        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Paywall design & copy</Text>
                    </View>
                    <View style={[styles.card, { backgroundColor: cardBg, borderColor: inputBorder }]}>
                        <Text style={[styles.switchHint, { color: textSecondary }]}>
                            Restyle the paywall over the air — no app update needed. Blank fields keep the
                            app&apos;s built-in copy (translated per language); filled fields show exactly as
                            written for everyone.
                        </Text>
                        {field('Headline line 1 (accent color)', paywallForm.heroLine1, (v) => setPaywall('heroLine1', v), { placeholder: 'Unlock every opportunity' })}
                        {field('Headline line 2', paywallForm.heroLine2, (v) => setPaywall('heroLine2', v), { placeholder: 'without limits' })}
                        {field('Subtitle', paywallForm.subtitle, (v) => setPaywall('subtitle', v), { placeholder: 'Subscribe for premium templates, AI tools…', multiline: true })}
                        {field('Subscribe button label', paywallForm.ctaLabel, (v) => setPaywall('ctaLabel', v), { placeholder: 'Subscribe to premium' })}
                        {field('Note under the button', paywallForm.secureNote, (v) => setPaywall('secureNote', v), { placeholder: "You'll be taken to pay.edutu.org…", multiline: true })}
                        {field('Weekly plan badge', paywallForm.badgeWeekly, (v) => setPaywall('badgeWeekly', v), { placeholder: 'Most taken' })}
                        {field('Monthly plan badge', paywallForm.badgeMonthly, (v) => setPaywall('badgeMonthly', v), { placeholder: 'Popular' })}
                        {field('Yearly plan badge', paywallForm.badgeYearly, (v) => setPaywall('badgeYearly', v), { placeholder: 'Best deal' })}
                        {field('Benefit bullets (one per line, max 6)', paywallForm.features, (v) => setPaywall('features', v), { placeholder: 'Unlimited AI coaching\nPremium CV templates', multiline: true })}

                        <View style={styles.field}>
                            <Text style={[styles.fieldLabel, { color: textSecondary }]}>Accent color (hex)</Text>
                            <View style={styles.accentRow}>
                                <TextInput
                                    style={[styles.input, styles.flex, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
                                    value={paywallForm.accentColor}
                                    onChangeText={(v) => setPaywall('accentColor', v)}
                                    placeholder={PAYWALL_DEFAULT_ACCENT}
                                    placeholderTextColor={textSecondary}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                />
                                <View
                                    style={[
                                        styles.accentSwatch,
                                        {
                                            borderColor: inputBorder,
                                            backgroundColor: /^#[0-9a-fA-F]{6}$/.test(paywallForm.accentColor.trim())
                                                ? paywallForm.accentColor.trim()
                                                : PAYWALL_DEFAULT_ACCENT,
                                        },
                                    ]}
                                />
                            </View>
                        </View>

                        <View style={styles.field}>
                            <Text style={[styles.fieldLabel, { color: textSecondary }]}>Pre-selected plan</Text>
                            <View style={styles.segmentRow}>
                                {(['weekly', 'monthly', 'yearly'] as BillingPlan[]).map((plan) => {
                                    const active = paywallForm.defaultPlan === plan;
                                    return (
                                        <TouchableOpacity
                                            key={plan}
                                            onPress={() => setPaywall('defaultPlan', plan)}
                                            activeOpacity={0.8}
                                            style={[
                                                styles.segment,
                                                { borderColor: active ? colors.accent : inputBorder, backgroundColor: active ? `${colors.accent}18` : inputBg },
                                            ]}
                                        >
                                            <Text style={[styles.segmentText, { color: active ? colors.accent : textSecondary }]}>
                                                {plan.charAt(0).toUpperCase() + plan.slice(1)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.switchRow}>
                            <View style={styles.flex}>
                                <Text style={[styles.switchLabel, { color: textPrimary }]}>Poster collage background</Text>
                                <Text style={[styles.switchHint, { color: textSecondary }]}>Off = plain gradient backdrop instead of opportunity posters.</Text>
                            </View>
                            <Switch
                                value={paywallForm.heroStyle === 'collage'}
                                onValueChange={(v) => setPaywall('heroStyle', v ? 'collage' : 'gradient')}
                                trackColor={{ false: '#CBD5E1', true: colors.accent }}
                                thumbColor="#FFFFFF"
                            />
                        </View>
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
    inputMultiline: { minHeight: 76, textAlignVertical: 'top' },
    accentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    accentSwatch: { width: 44, height: 44, borderRadius: 12, borderWidth: 1 },
    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    segmentText: { fontSize: 13, fontWeight: '700' },
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
