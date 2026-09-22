import React, { useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation, Trans } from 'react-i18next';
import {
    CheckCircle2, HandHeart, Users, Award, Star,
    Heart, BookOpen, Zap, ArrowRight, Globe
} from 'lucide-react-native';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { toSafeUUID } from '@edutu/core/src/utils/auth';

const MENTOR_STEPS = ['intro', 'motivation', 'details', 'review'] as const;
type MentorStep = typeof MENTOR_STEPS[number];

const BRAND_BLUE = '#146ef5';
const STEP_LABELS: Record<MentorStep, string> = {
    intro: 'Introduction',
    motivation: 'Your motivation',
    details: 'Your experience',
    review: 'Review',
};

const MOTIVATION_OPTIONS = [
    { id: 'help_others', textKey: 'mentorApply.motivations.helpOthers', icon: Heart },
    { id: 'mentor', textKey: 'mentorApply.motivations.mentor', icon: Users },
    { id: 'give_back', textKey: 'mentorApply.motivations.giveBack', icon: HandHeart },
    { id: 'document', textKey: 'mentorApply.motivations.document', icon: BookOpen },
    { id: 'pay_forward', textKey: 'mentorApply.motivations.payForward', icon: Zap },
];

const CONTENT_TYPES = [
    { id: 'mentorship', labelKey: 'mentorApply.contentTypes.mentorship.label', icon: Users, descKey: 'mentorApply.contentTypes.mentorship.desc' },
    { id: 'course', labelKey: 'mentorApply.contentTypes.course.label', icon: BookOpen, descKey: 'mentorApply.contentTypes.course.desc' },
    { id: 'template', labelKey: 'mentorApply.contentTypes.template.label', icon: Award, descKey: 'mentorApply.contentTypes.template.desc' },
    { id: 'resource', labelKey: 'mentorApply.contentTypes.resource.label', icon: Star, descKey: 'mentorApply.contentTypes.resource.desc' },
];

export default function MentorApply() {
    const { t } = useTranslation('misc');
    const { user } = useUser();
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();

    const [currentStep, setCurrentStep] = useState<MentorStep>('intro');
    const [formData, setFormData] = useState({
        displayName: '',
        bio: '',
        contentType: 'mentorship',
        experience: '',
        motivation: '',
        linkedInUrl: '',
        portfolioUrl: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const stepIndex = MENTOR_STEPS.indexOf(currentStep);
    const stepLabel = t(`mentorApply.steps.${currentStep}`, {
        defaultValue: STEP_LABELS[currentStep],
    });
    const progressCount = t('mentorApply.progressCount', {
        current: stepIndex + 1,
        total: MENTOR_STEPS.length,
        defaultValue: '{{current}} of {{total}}',
    });

    const updateField = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const canProceed = (): boolean => {
        switch (currentStep) {
            case 'intro': return true;
            case 'motivation': return !!formData.motivation;
            case 'details': return !!formData.displayName && !!formData.bio && !!formData.experience;
            case 'review': return true;
            default: return false;
        }
    };

    const handleSubmit = async () => {
        if (!user?.id) {
            Alert.alert(t('mentorApply.alerts.notSignedInTitle'), t('mentorApply.alerts.notSignedInMessage'));
            return;
        }
        setIsSubmitting(true);
        try {
            // Column names are snake_case (PostgREST rejected the old camelCase
            // keys). application_kind='mentor' distinguishes this from creator
            // applications for review purposes, but the backend gate is
            // creator_status==='approved' OR mentor_status==='approved', so
            // either grants studio access. On approval, the mobile admin's
            // review_creator_application RPC routes by kind (mentor→mentor_status,
            // else creator_status), matching the backend's reviewApplication;
            // only its rare exception-fallback (set_creator_status, used if the
            // RPC call itself errors) sets creator_status regardless of kind.
            const { error } = await supabase
                .from('creator_applications')
                .insert({
                    user_id: toSafeUUID(user.id),
                    application_kind: 'mentor',
                    display_name: formData.displayName,
                    bio: formData.bio,
                    content_type: formData.contentType,
                    experience: formData.experience,
                    motivation: formData.motivation,
                    linkedin_url: formData.linkedInUrl,
                    portfolio_url: formData.portfolioUrl,
                    sample_content_url: formData.portfolioUrl || formData.linkedInUrl,
                    status: 'pending',
                    applied_at: new Date().toISOString(),
                });

            if (error) throw error;
            setIsSubmitted(true);
        } catch (err: any) {
            console.error('Submission error:', err);
            Alert.alert(t('common:states.error'), err?.message || t('common:errors.generic'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const nextStep = () => {
        const idx = MENTOR_STEPS.indexOf(currentStep);
        if (idx < MENTOR_STEPS.length - 1) {
            setCurrentStep(MENTOR_STEPS[idx + 1]);
        }
    };

    const prevStep = () => {
        const idx = MENTOR_STEPS.indexOf(currentStep);
        if (idx > 0) {
            setCurrentStep(MENTOR_STEPS[idx - 1]);
        }
    };

    const handleBack = () => {
        if (stepIndex > 0) {
            prevStep();
            return;
        }

        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/(app)');
    };

    const bg = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = colors.textSecondary;
    const cardBg = colors.card;
    const borderColor = colors.border;
    const mutedBg = colors.muted;
    const accentSoft = isDark ? 'rgba(20,110,245,0.16)' : 'rgba(20,110,245,0.08)';

    if (isSubmitted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top']}>
                <View style={styles.successContainer}>
                    <View style={[styles.successIconHalo, { backgroundColor: accentSoft }]}>
                        <View style={[styles.successIcon, { backgroundColor: BRAND_BLUE }]}>
                            <CheckCircle2 size={34} color="#fff" strokeWidth={2.2} />
                        </View>
                    </View>
                    <Text style={[styles.successTitle, { color: textPrimary }]}>{t('mentorApply.success.title')}</Text>
                    <Text style={[styles.successDesc, { color: textSecondary }]}>
                        {t('mentorApply.success.desc')}
                    </Text>
                    <TouchableOpacity
                        accessibilityRole="button"
                        activeOpacity={0.82}
                        style={[styles.successBtn, { backgroundColor: BRAND_BLUE }]}
                        onPress={() => router.replace('/profile')}
                    >
                        <Text style={styles.successBtnText}>{t('mentorApply.success.backToProfile')}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top']}>
            <ScreenHeader title={t('mentorApply.title')} showBack onBack={handleBack} />

            <View style={[styles.progressSection, { borderBottomColor: borderColor }]}>
                <View style={styles.progressMeta}>
                    <Text style={[styles.progressLabel, { color: textPrimary }]}>{stepLabel}</Text>
                    <Text style={[styles.progressCount, { color: textSecondary }]}>{progressCount}</Text>
                </View>
                <View
                    accessibilityRole="progressbar"
                    accessibilityLabel={t('mentorApply.progressLabel', { defaultValue: 'Application progress' })}
                    accessibilityValue={{ min: 1, max: MENTOR_STEPS.length, now: stepIndex + 1 }}
                    style={[styles.progressTrack, { backgroundColor: mutedBg }]}
                >
                    <View
                        style={[
                            styles.progressFill,
                            { backgroundColor: BRAND_BLUE, width: `${((stepIndex + 1) / MENTOR_STEPS.length) * 100}%` },
                        ]}
                    />
                </View>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
                >
                    {/* STEP 1: INTRO */}
                    {currentStep === 'intro' && (
                        <View style={styles.stepFrame}>
                            <View style={[styles.heroMark, { backgroundColor: accentSoft }]}>
                                <Award size={22} color={BRAND_BLUE} strokeWidth={2} />
                            </View>
                            <Text style={[styles.heroTitle, { color: textPrimary }]}>
                                <Trans t={t} i18nKey="mentorApply.intro.heroTitle" components={{ accent: <Text style={{ color: BRAND_BLUE }} /> }} />
                            </Text>
                            <Text style={[styles.heroDesc, { color: textSecondary }]}>
                                {t('mentorApply.intro.heroDesc')}
                            </Text>

                            <View style={[styles.valuePanel, { backgroundColor: cardBg, borderColor }]}>
                                <View style={[styles.revenueBlock, { backgroundColor: accentSoft }]}>
                                    <Text style={styles.revenueValue}>85%</Text>
                                    <Text style={[styles.revenueLabel, { color: textSecondary }]}>
                                        {t('mentorApply.intro.statRevenue')}
                                    </Text>
                                </View>
                                <View style={styles.secondaryStats}>
                                    <View style={styles.secondaryStat}>
                                        <Text style={[styles.secondaryValue, { color: textPrimary }]}>
                                            {t('mentorApply.intro.freeValue', { defaultValue: 'Free' })}
                                        </Text>
                                        <Text style={[styles.secondaryLabel, { color: textSecondary }]}>
                                            {t('mentorApply.intro.statFree', { defaultValue: 'No cost to apply' })}
                                        </Text>
                                    </View>
                                    <View style={[styles.secondaryDivider, { backgroundColor: borderColor }]} />
                                    <View style={styles.secondaryStat}>
                                        <Text style={[styles.secondaryValue, { color: textPrimary }]}>
                                            {t('mentorApply.intro.reviewValue', { defaultValue: '2-3 days' })}
                                        </Text>
                                        <Text style={[styles.secondaryLabel, { color: textSecondary }]}>
                                            {t('mentorApply.intro.statReview', { defaultValue: 'Application review' })}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View style={[styles.reachRow, { borderColor }]}>
                                <View style={[styles.reachIcon, { backgroundColor: accentSoft }]}>
                                    <Globe size={18} color={BRAND_BLUE} strokeWidth={2} />
                                </View>
                                <Text style={[styles.infoText, { color: textSecondary }]}>
                                    {t('mentorApply.intro.info')}
                                </Text>
                            </View>

                            <TouchableOpacity
                                accessibilityRole="button"
                                activeOpacity={0.82}
                                style={[styles.primaryBtn, styles.introCta, { backgroundColor: BRAND_BLUE }]}
                                onPress={nextStep}
                            >
                                <Text style={styles.primaryBtnText}>{t('mentorApply.intro.getStarted')}</Text>
                                <ArrowRight size={18} color="#fff" strokeWidth={2.2} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 2: MOTIVATION */}
                    {currentStep === 'motivation' && (
                        <View style={styles.stepFrame}>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.motivation.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.motivation.desc')}</Text>

                            <View
                                accessibilityRole="radiogroup"
                                accessibilityLabel={t('mentorApply.motivation.title')}
                                style={styles.optionsList}
                            >
                                {MOTIVATION_OPTIONS.map((option) => {
                                    const isSelected = formData.motivation === option.id;
                                    const optionText = t(option.textKey);
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            accessibilityLabel={optionText}
                                            accessibilityRole="radio"
                                            accessibilityState={{ selected: isSelected }}
                                            activeOpacity={0.82}
                                            onPress={() => updateField('motivation', option.id)}
                                            style={[styles.optionCard, {
                                                backgroundColor: isSelected
                                                    ? accentSoft
                                                    : cardBg,
                                                borderColor: isSelected ? BRAND_BLUE : borderColor,
                                            }]}
                                        >
                                            <View style={[styles.optionIcon, {
                                                backgroundColor: isSelected ? BRAND_BLUE : mutedBg,
                                            }]}>
                                                <option.icon size={18} color={isSelected ? '#fff' : textSecondary} strokeWidth={2} />
                                            </View>
                                            <Text style={[styles.optionText, { color: isSelected ? BRAND_BLUE : textPrimary }]}>
                                                {optionText}
                                            </Text>
                                            <CheckCircle2
                                                size={20}
                                                color={isSelected ? BRAND_BLUE : borderColor}
                                                strokeWidth={2}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canProceed() }}
                                activeOpacity={0.82}
                                style={[styles.primaryBtn, {
                                    backgroundColor: canProceed() ? BRAND_BLUE : mutedBg,
                                }]}
                                onPress={nextStep}
                                disabled={!canProceed()}
                            >
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>{t('common:actions.continue')}</Text>
                                <ArrowRight size={18} color={canProceed() ? '#fff' : textSecondary} strokeWidth={2.2} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 3: DETAILS */}
                    {currentStep === 'details' && (
                        <View style={styles.stepFrame}>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.details.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.details.desc')}</Text>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.displayNameLabel')}</Text>
                                <TextInput
                                    accessibilityLabel={t('mentorApply.details.displayNameLabel')}
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder={t('mentorApply.details.displayNamePlaceholder')}
                                    placeholderTextColor={textSecondary}
                                    value={formData.displayName}
                                    onChangeText={(v) => updateField('displayName', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.teachLabel')}</Text>
                                <View
                                    accessibilityRole="radiogroup"
                                    accessibilityLabel={t('mentorApply.details.teachLabel')}
                                    style={styles.typeGrid}
                                >
                                    {CONTENT_TYPES.map((type) => {
                                        const isSelected = formData.contentType === type.id;
                                        const typeLabel = t(type.labelKey);
                                        return (
                                            <TouchableOpacity
                                                key={type.id}
                                                accessibilityLabel={`${typeLabel}. ${t(type.descKey)}`}
                                                accessibilityRole="radio"
                                                accessibilityState={{ selected: isSelected }}
                                                activeOpacity={0.82}
                                                onPress={() => updateField('contentType', type.id)}
                                                style={[styles.typeCard, {
                                                    backgroundColor: isSelected
                                                        ? accentSoft
                                                        : cardBg,
                                                    borderColor: isSelected ? BRAND_BLUE : borderColor,
                                                }]}
                                            >
                                                <View style={[styles.typeIcon, { backgroundColor: isSelected ? BRAND_BLUE : mutedBg }]}>
                                                    <type.icon size={18} color={isSelected ? '#fff' : textSecondary} strokeWidth={2} />
                                                </View>
                                                <Text style={[styles.typeLabel, { color: isSelected ? BRAND_BLUE : textPrimary }]}>{typeLabel}</Text>
                                                <Text style={[styles.typeDesc, { color: textSecondary }]}>{t(type.descKey)}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.bioLabel')}</Text>
                                <TextInput
                                    accessibilityLabel={t('mentorApply.details.bioLabel')}
                                    style={[styles.textarea, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder={t('mentorApply.details.bioPlaceholder')}
                                    placeholderTextColor={textSecondary}
                                    multiline
                                    numberOfLines={4}
                                    value={formData.bio}
                                    onChangeText={(v) => updateField('bio', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.experienceLabel')}</Text>
                                <TextInput
                                    accessibilityLabel={t('mentorApply.details.experienceLabel')}
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder={t('mentorApply.details.experiencePlaceholder')}
                                    placeholderTextColor={textSecondary}
                                    value={formData.experience}
                                    onChangeText={(v) => updateField('experience', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.linkedinLabel')}</Text>
                                <TextInput
                                    accessibilityLabel={t('mentorApply.details.linkedinLabel')}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder="linkedin.com/in/..."
                                    placeholderTextColor={textSecondary}
                                    value={formData.linkedInUrl}
                                    onChangeText={(v) => updateField('linkedInUrl', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.portfolioLabel')}</Text>
                                <TextInput
                                    accessibilityLabel={t('mentorApply.details.portfolioLabel')}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder="your-portfolio.com"
                                    placeholderTextColor={textSecondary}
                                    value={formData.portfolioUrl}
                                    onChangeText={(v) => updateField('portfolioUrl', v)}
                                />
                            </View>

                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !canProceed() }}
                                activeOpacity={0.82}
                                style={[styles.primaryBtn, {
                                    backgroundColor: canProceed() ? BRAND_BLUE : mutedBg,
                                }]}
                                onPress={nextStep}
                                disabled={!canProceed()}
                            >
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>{t('mentorApply.details.reviewApplication')}</Text>
                                <ArrowRight size={18} color={canProceed() ? '#fff' : textSecondary} strokeWidth={2.2} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 4: REVIEW */}
                    {currentStep === 'review' && (
                        <View style={styles.stepFrame}>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.review.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.review.desc')}</Text>

                            <View style={[styles.reviewList, { backgroundColor: cardBg, borderColor }]}>
                                {[
                                    { label: t('mentorApply.review.displayName'), value: formData.displayName },
                                    { label: t('mentorApply.review.motivation'), value: (() => { const selected = MOTIVATION_OPTIONS.find(m => m.id === formData.motivation); return selected ? t(selected.textKey) : ''; })() },
                                    { label: t('mentorApply.review.contentType'), value: (() => { const selected = CONTENT_TYPES.find(c => c.id === formData.contentType); return selected ? t(selected.labelKey) : ''; })() },
                                    { label: t('mentorApply.review.experience'), value: formData.experience },
                                    { label: t('mentorApply.review.bio'), value: formData.bio },
                                    { label: t('mentorApply.review.linkedin'), value: formData.linkedInUrl || t('mentorApply.review.notProvided') },
                                    { label: t('mentorApply.review.portfolio'), value: formData.portfolioUrl || t('mentorApply.review.notProvided') },
                                ].map((item, i) => (
                                    <View
                                        key={item.label}
                                        style={[
                                            styles.reviewItem,
                                            i < 6 && { borderBottomColor: borderColor, borderBottomWidth: StyleSheet.hairlineWidth },
                                        ]}
                                    >
                                        <Text style={[styles.reviewLabel, { color: textSecondary }]}>{item.label}</Text>
                                        <Text style={[styles.reviewValue, { color: textPrimary }]}>{item.value}</Text>
                                    </View>
                                ))}
                            </View>

                            <TouchableOpacity
                                accessibilityRole="button"
                                accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                                activeOpacity={0.82}
                                style={[styles.primaryBtn, { backgroundColor: BRAND_BLUE }]}
                                onPress={handleSubmit}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? (
                                    <>
                                        <ActivityIndicator size="small" color="#fff" />
                                        <Text style={styles.primaryBtnText}>{t('mentorApply.review.submitting')}</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.primaryBtnText}>{t('mentorApply.review.submit')}</Text>
                                        <ArrowRight size={18} color="#fff" strokeWidth={2.2} />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    progressSection: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    progressMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    progressLabel: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
    progressCount: { fontSize: 12, fontWeight: '600' },
    progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2 },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 28,
    },
    stepFrame: { flexGrow: 1 },
    heroMark: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    heroTitle: {
        fontSize: 36,
        fontWeight: '800',
        lineHeight: 41,
        letterSpacing: -1.2,
        marginBottom: 14,
    },
    heroDesc: { fontSize: 15, lineHeight: 23, marginBottom: 28, maxWidth: 520 },
    valuePanel: {
        flexDirection: 'row',
        padding: 8,
        gap: 8,
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
    },
    revenueBlock: {
        flex: 1.08,
        minHeight: 138,
        justifyContent: 'flex-end',
        padding: 16,
        borderRadius: 12,
    },
    revenueValue: { color: BRAND_BLUE, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
    revenueLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
    secondaryStats: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
    secondaryStat: { paddingVertical: 10 },
    secondaryDivider: { height: StyleSheet.hairlineWidth },
    secondaryValue: { fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -0.3 },
    secondaryLabel: { fontSize: 11, lineHeight: 15, fontWeight: '600', marginTop: 3 },
    reachRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    reachIcon: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoText: { flex: 1, fontSize: 12.5, lineHeight: 19 },
    primaryBtn: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderRadius: 14,
        marginTop: 22,
    },
    introCta: { marginTop: 'auto' },
    primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.1 },
    stepTitle: { fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.8, marginBottom: 8 },
    stepDesc: { fontSize: 14.5, lineHeight: 22, marginBottom: 28 },
    optionsList: { gap: 10, marginBottom: 4 },
    optionCard: {
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    optionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    optionText: { fontSize: 14, lineHeight: 20, fontWeight: '600', flex: 1 },
    formGroup: { marginBottom: 20 },
    label: { fontSize: 13, fontWeight: '700', marginBottom: 9 },
    input: {
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        fontSize: 15,
    },
    textarea: {
        minHeight: 118,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        fontSize: 15,
        lineHeight: 21,
        textAlignVertical: 'top',
    },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    typeCard: {
        minHeight: 126,
        flexBasis: '46%',
        flexGrow: 1,
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
    },
    typeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    typeLabel: { fontSize: 14, fontWeight: '700', marginTop: 10 },
    typeDesc: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },
    reviewList: { marginBottom: 4, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    reviewItem: { paddingHorizontal: 16, paddingVertical: 15 },
    reviewLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
    reviewValue: { fontSize: 14, lineHeight: 20 },
    successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    successIconHalo: {
        width: 92,
        height: 92,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    successIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    successTitle: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, marginBottom: 10, textAlign: 'center' },
    successDesc: { maxWidth: 360, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 32 },
    successBtn: { width: '100%', minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, borderRadius: 14 },
    successBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
