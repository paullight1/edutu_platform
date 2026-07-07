import React, { useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
    Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation, Trans } from 'react-i18next';
import {
    ChevronLeft, CheckCircle2, Sparkles, Users, Award, Star,
    Heart, BookOpen, Zap, ArrowRight, Check, Loader2, Globe
} from 'lucide-react-native';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { toSafeUUID } from '@edutu/core/src/utils/auth';

const { width } = Dimensions.get('window');

const MENTOR_STEPS = ['intro', 'motivation', 'details', 'review'] as const;
type MentorStep = typeof MENTOR_STEPS[number];

const MOTIVATION_OPTIONS = [
    { id: 'help_others', textKey: 'mentorApply.motivations.helpOthers', icon: Heart },
    { id: 'mentor', textKey: 'mentorApply.motivations.mentor', icon: Users },
    { id: 'give_back', textKey: 'mentorApply.motivations.giveBack', icon: Sparkles },
    { id: 'document', textKey: 'mentorApply.motivations.document', icon: BookOpen },
    { id: 'pay_forward', textKey: 'mentorApply.motivations.payForward', icon: Zap },
];

const CONTENT_TYPES = [
    { id: 'mentorship', labelKey: 'mentorApply.contentTypes.mentorship.label', icon: Users, color: '#146ef5', descKey: 'mentorApply.contentTypes.mentorship.desc' },
    { id: 'course', labelKey: 'mentorApply.contentTypes.course.label', icon: BookOpen, color: '#7a3dff', descKey: 'mentorApply.contentTypes.course.desc' },
    { id: 'template', labelKey: 'mentorApply.contentTypes.template.label', icon: Award, color: '#00d722', descKey: 'mentorApply.contentTypes.template.desc' },
    { id: 'resource', labelKey: 'mentorApply.contentTypes.resource.label', icon: Star, color: '#ff6b00', descKey: 'mentorApply.contentTypes.resource.desc' },
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
            // applications so approval routes to mentor_status, not the studio.
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

    const bg = isDark ? '#0a0a0a' : '#ffffff';
    const textPrimary = isDark ? '#fafafa' : '#0a0a0a';
    const textSecondary = isDark ? '#888888' : '#666666';
    const cardBg = isDark ? '#111111' : '#fafafa';
    const borderColor = isDark ? '#1e1e1e' : '#e8e8e8';

    if (isSubmitted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top']}>
                <View style={styles.successContainer}>
                    <View style={[styles.successIcon, { backgroundColor: '#146ef5' }]}>
                        <CheckCircle2 size={40} color="#fff" />
                    </View>
                    <Text style={[styles.successTitle, { color: textPrimary }]}>{t('mentorApply.success.title')}</Text>
                    <Text style={[styles.successDesc, { color: textSecondary }]}>
                        {t('mentorApply.success.desc')}
                    </Text>
                    <TouchableOpacity
                        style={[styles.successBtn, { backgroundColor: '#146ef5' }]}
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
            <ScreenHeader title={t('mentorApply.title')} showBack />

            {/* Step Progress */}
            <View style={[styles.stepProgress, { borderBottomColor: borderColor }]}>
                {MENTOR_STEPS.map((s, i) => (
                    <View key={s} style={styles.stepProgressItem}>
                        <View style={[styles.stepDot, {
                            backgroundColor: i <= stepIndex ? '#146ef5' : borderColor,
                        }]}>
                            {i < stepIndex && <Check size={12} color="#fff" />}
                            {i === stepIndex && <Text style={styles.stepNumber}>{i + 1}</Text>}
                        </View>
                        {i < MENTOR_STEPS.length - 1 && (
                            <View style={[styles.stepLine, { backgroundColor: i < stepIndex ? '#146ef5' : borderColor }]} />
                        )}
                    </View>
                ))}
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                >
                    {/* STEP 1: INTRO */}
                    {currentStep === 'intro' && (
                        <View>
                            <View style={styles.badge}>
                                <Sparkles size={12} color="#146ef5" />
                                <Text style={styles.badgeText}>{t('mentorApply.title')}</Text>
                            </View>
                            <Text style={[styles.heroTitle, { color: textPrimary }]}>
                                <Trans t={t} i18nKey="mentorApply.intro.heroTitle" components={{ accent: <Text style={{ color: '#146ef5' }} /> }} />
                            </Text>
                            <Text style={[styles.heroDesc, { color: textSecondary }]}>
                                {t('mentorApply.intro.heroDesc')}
                            </Text>

                            <View style={styles.statsRow}>
                                {[
                                    { num: '10K+', label: t('mentorApply.intro.statLearners'), color: '#146ef5' },
                                    { num: '500+', label: t('mentorApply.intro.statMentors'), color: '#7a3dff' },
                                    { num: '85%', label: t('mentorApply.intro.statRevenue'), color: '#00d722' },
                                ].map((stat, i) => (
                                    <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.statNum, { color: stat.color }]}>{stat.num}</Text>
                                        <Text style={[styles.statLabel, { color: textSecondary }]}>{stat.label}</Text>
                                    </View>
                                ))}
                            </View>

                            <View style={[styles.infoCard, { backgroundColor: `${colors.accent}08`, borderColor: `${colors.accent}20` }]}>
                                <Globe size={18} color={colors.accent} />
                                <Text style={[styles.infoText, { color: textSecondary }]}>
                                    {t('mentorApply.intro.info')}
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: '#146ef5' }]}
                                onPress={nextStep}
                            >
                                <Text style={styles.primaryBtnText}>{t('mentorApply.intro.getStarted')}</Text>
                                <ArrowRight size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 2: MOTIVATION */}
                    {currentStep === 'motivation' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>{t('common:actions.back')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.motivation.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.motivation.desc')}</Text>

                            <View style={styles.optionsList}>
                                {MOTIVATION_OPTIONS.map((option) => {
                                    const isSelected = formData.motivation === option.id;
                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            onPress={() => updateField('motivation', option.id)}
                                            style={[styles.optionCard, {
                                                backgroundColor: isSelected
                                                    ? isDark ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.06)'
                                                    : cardBg,
                                                borderColor: isSelected ? '#146ef5' : borderColor,
                                                borderWidth: 2,
                                            }]}
                                        >
                                            <View style={[styles.optionIcon, {
                                                backgroundColor: isSelected ? '#146ef5' : isDark ? '#1e1e1e' : '#e5e5e5',
                                            }]}>
                                                <option.icon size={16} color={isSelected ? '#fff' : textSecondary} />
                                            </View>
                                            <Text style={[styles.optionText, { color: isSelected ? '#146ef5' : textPrimary }]}>
                                                {t(option.textKey)}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryBtn, {
                                    backgroundColor: canProceed() ? '#146ef5' : borderColor,
                                }]}
                                onPress={nextStep}
                                disabled={!canProceed()}
                            >
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>{t('common:actions.continue')}</Text>
                                <ArrowRight size={16} color={canProceed() ? '#fff' : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 3: DETAILS */}
                    {currentStep === 'details' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>{t('common:actions.back')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.details.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.details.desc')}</Text>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.displayNameLabel')}</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder={t('mentorApply.details.displayNamePlaceholder')}
                                    placeholderTextColor={textSecondary}
                                    value={formData.displayName}
                                    onChangeText={(v) => updateField('displayName', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.teachLabel')}</Text>
                                <View style={styles.typeGrid}>
                                    {CONTENT_TYPES.map((type) => {
                                        const isSelected = formData.contentType === type.id;
                                        return (
                                            <TouchableOpacity
                                                key={type.id}
                                                onPress={() => updateField('contentType', type.id)}
                                                style={[styles.typeCard, {
                                                    backgroundColor: isSelected
                                                        ? isDark ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.06)'
                                                        : cardBg,
                                                    borderColor: isSelected ? type.color : borderColor,
                                                    borderWidth: 2,
                                                }]}
                                            >
                                                <type.icon size={16} color={type.color} />
                                                <Text style={[styles.typeLabel, { color: textPrimary }]}>{t(type.labelKey)}</Text>
                                                <Text style={[styles.typeDesc, { color: textSecondary }]}>{t(type.descKey)}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.bioLabel')}</Text>
                                <TextInput
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
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder={t('mentorApply.details.experiencePlaceholder')}
                                    placeholderTextColor={textSecondary}
                                    value={formData.experience}
                                    onChangeText={(v) => updateField('experience', v)}
                                />
                            </View>

                            <View style={styles.formRow}>
                                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                                    <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.linkedinLabel')}</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                        placeholder="linkedin.com/in/..."
                                        placeholderTextColor={textSecondary}
                                        value={formData.linkedInUrl}
                                        onChangeText={(v) => updateField('linkedInUrl', v)}
                                    />
                                </View>
                                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                                    <Text style={[styles.label, { color: textPrimary }]}>{t('mentorApply.details.portfolioLabel')}</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                        placeholder="your-portfolio.com"
                                        placeholderTextColor={textSecondary}
                                        value={formData.portfolioUrl}
                                        onChangeText={(v) => updateField('portfolioUrl', v)}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryBtn, {
                                    backgroundColor: canProceed() ? '#146ef5' : borderColor,
                                }]}
                                onPress={nextStep}
                                disabled={!canProceed()}
                            >
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>{t('mentorApply.details.reviewApplication')}</Text>
                                <ArrowRight size={16} color={canProceed() ? '#fff' : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 4: REVIEW */}
                    {currentStep === 'review' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>{t('common:actions.back')}</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>{t('mentorApply.review.title')}</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>{t('mentorApply.review.desc')}</Text>

                            <View style={styles.reviewList}>
                                {[
                                    { label: t('mentorApply.review.displayName'), value: formData.displayName },
                                    { label: t('mentorApply.review.motivation'), value: (() => { const selected = MOTIVATION_OPTIONS.find(m => m.id === formData.motivation); return selected ? t(selected.textKey) : ''; })() },
                                    { label: t('mentorApply.review.contentType'), value: (() => { const selected = CONTENT_TYPES.find(c => c.id === formData.contentType); return selected ? t(selected.labelKey) : ''; })() },
                                    { label: t('mentorApply.review.experience'), value: formData.experience },
                                    { label: t('mentorApply.review.bio'), value: formData.bio },
                                    { label: t('mentorApply.review.linkedin'), value: formData.linkedInUrl || t('mentorApply.review.notProvided') },
                                    { label: t('mentorApply.review.portfolio'), value: formData.portfolioUrl || t('mentorApply.review.notProvided') },
                                ].map((item, i) => (
                                    <View key={i} style={[styles.reviewItem, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.reviewLabel, { color: textSecondary }]}>{item.label}</Text>
                                        <Text style={[styles.reviewValue, { color: textPrimary }]}>{item.value}</Text>
                                    </View>
                                ))}
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: '#146ef5' }]}
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
                                        <ArrowRight size={16} color="#fff" />
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
    stepProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderBottomWidth: 1 },
    stepProgressItem: { flexDirection: 'row', alignItems: 'center' },
    stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    stepNumber: { fontSize: 12, fontWeight: '700', color: '#fff' },
    stepLine: { width: 40, height: 2, borderRadius: 1 },
    scrollContent: { padding: 20 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 20, backgroundColor: 'rgba(20,110,245,0.06)' },
    badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', color: '#146ef5' },
    heroTitle: { fontSize: 32, fontWeight: '800', lineHeight: 38, marginBottom: 12 },
    heroDesc: { fontSize: 14, lineHeight: 22, marginBottom: 24 },
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
    statNum: { fontSize: 20, fontWeight: '800' },
    statLabel: { fontSize: 10, fontWeight: '600', marginTop: 4 },
    infoCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
    infoText: { flex: 1, fontSize: 12, lineHeight: 18 },
    primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, marginTop: 8 },
    primaryBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
    backText: { fontSize: 13, fontWeight: '500' },
    stepTitle: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
    stepDesc: { fontSize: 13, lineHeight: 20, marginBottom: 24 },
    optionsList: { gap: 12, marginBottom: 24 },
    optionCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 2 },
    optionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    optionText: { fontSize: 13, fontWeight: '600', flex: 1 },
    formGroup: { marginBottom: 18 },
    label: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
    input: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 14 },
    textarea: { padding: 14, borderRadius: 12, borderWidth: 1, fontSize: 14, textAlignVertical: 'top', minHeight: 100 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    typeCard: { width: (width - 64) / 2 - 5, padding: 14, borderRadius: 12, borderWidth: 2 },
    typeLabel: { fontSize: 13, fontWeight: '700', marginTop: 8 },
    typeDesc: { fontSize: 11, marginTop: 2 },
    formRow: { flexDirection: 'row', marginBottom: 18 },
    reviewList: { gap: 12, marginBottom: 24 },
    reviewItem: { padding: 14, borderRadius: 12, borderWidth: 1 },
    reviewLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
    reviewValue: { fontSize: 13, lineHeight: 18 },
    successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 24, shadowColor: '#146ef5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 16 },
    successTitle: { fontSize: 28, fontWeight: '800', marginBottom: 8 },
    successDesc: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 32 },
    successBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
    successBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
