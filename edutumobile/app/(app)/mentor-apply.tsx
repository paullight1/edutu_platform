import React, { useState } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
    Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import {
    ChevronLeft, CheckCircle2, Sparkles, Users, Award, Star,
    Heart, BookOpen, Zap, ArrowRight, Check, Loader2, Globe
} from 'lucide-react-native';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

const MENTOR_STEPS = ['intro', 'motivation', 'details', 'review'] as const;
type MentorStep = typeof MENTOR_STEPS[number];

const MOTIVATION_OPTIONS = [
    { id: 'help_others', text: "I want to help others achieve what I achieved", icon: Heart },
    { id: 'mentor', text: "I enjoy mentoring and sharing knowledge", icon: Users },
    { id: 'give_back', text: "I want to give back to the community", icon: Sparkles },
    { id: 'document', text: "I want to document my journey for others", icon: BookOpen },
    { id: 'pay_forward', text: "I believe in paying it forward", icon: Zap },
];

const CONTENT_TYPES = [
    { id: 'mentorship', label: 'Mentorship', icon: Users, color: '#146ef5', desc: '1-on-1 guidance' },
    { id: 'course', label: 'Course', icon: BookOpen, color: '#7a3dff', desc: 'Learning paths' },
    { id: 'template', label: 'Templates', icon: Award, color: '#00d722', desc: 'CV & resume templates' },
    { id: 'resource', label: 'Resources', icon: Star, color: '#ff6b00', desc: 'Study materials' },
];

export default function MentorApply() {
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
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('creator_applications')
                .insert({
                    userId: user?.id || 'anonymous',
                    displayName: formData.displayName,
                    bio: formData.bio,
                    contentType: formData.contentType,
                    experience: formData.experience,
                    sampleContentUrl: formData.portfolioUrl || formData.linkedInUrl,
                    status: 'pending',
                    submittedAt: new Date().toISOString(),
                });

            if (error) throw error;
            setIsSubmitted(true);
        } catch (err) {
            console.error('Submission error:', err);
            Alert.alert('Error', 'Something went wrong. Please try again.');
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
                    <Text style={[styles.successTitle, { color: textPrimary }]}>Application Sent!</Text>
                    <Text style={[styles.successDesc, { color: textSecondary }]}>
                        Thanks for applying to be a mentor. We'll review your application and get back to you within 2-3 business days.
                    </Text>
                    <TouchableOpacity
                        style={[styles.successBtn, { backgroundColor: '#146ef5' }]}
                        onPress={() => router.replace('/profile')}
                    >
                        <Text style={styles.successBtnText}>Back to Profile</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['top']}>
            <ScreenHeader title="Become a Mentor" showBack />

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
                                <Text style={styles.badgeText}>Become a Mentor</Text>
                            </View>
                            <Text style={[styles.heroTitle, { color: textPrimary }]}>
                                Share Your{'\n'}
                                <Text style={{ color: '#146ef5' }}>Success Story</Text>
                            </Text>
                            <Text style={[styles.heroDesc, { color: textSecondary }]}>
                                You've achieved something incredible. Help others get there too by sharing your knowledge and experience.
                            </Text>

                            <View style={styles.statsRow}>
                                {[
                                    { num: '10K+', label: 'Learners', color: '#146ef5' },
                                    { num: '500+', label: 'Mentors', color: '#7a3dff' },
                                    { num: '85%', label: 'Revenue', color: '#00d722' },
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
                                    Reach learners from 31+ countries. Your experience can change someone's life anywhere in the world.
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.primaryBtn, { backgroundColor: '#146ef5' }]}
                                onPress={nextStep}
                            >
                                <Text style={styles.primaryBtnText}>Get Started</Text>
                                <ArrowRight size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 2: MOTIVATION */}
                    {currentStep === 'motivation' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>Back</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>What motivates you?</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>Choose the reason that best describes why you want to mentor.</Text>

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
                                                {option.text}
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
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>Continue</Text>
                                <ArrowRight size={16} color={canProceed() ? '#fff' : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 3: DETAILS */}
                    {currentStep === 'details' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>Back</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>Tell us about yourself</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>Help learners understand your expertise.</Text>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>Display Name</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder="How should learners know you?"
                                    placeholderTextColor={textSecondary}
                                    value={formData.displayName}
                                    onChangeText={(v) => updateField('displayName', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>What will you teach?</Text>
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
                                                <Text style={[styles.typeLabel, { color: textPrimary }]}>{type.label}</Text>
                                                <Text style={[styles.typeDesc, { color: textSecondary }]}>{type.desc}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>Your Bio</Text>
                                <TextInput
                                    style={[styles.textarea, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder="Share your background, achievements..."
                                    placeholderTextColor={textSecondary}
                                    multiline
                                    numberOfLines={4}
                                    value={formData.bio}
                                    onChangeText={(v) => updateField('bio', v)}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.label, { color: textPrimary }]}>Years of Experience</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                    placeholder="e.g., 5 years in software engineering"
                                    placeholderTextColor={textSecondary}
                                    value={formData.experience}
                                    onChangeText={(v) => updateField('experience', v)}
                                />
                            </View>

                            <View style={styles.formRow}>
                                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                                    <Text style={[styles.label, { color: textPrimary }]}>LinkedIn URL</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: cardBg, borderColor, color: textPrimary }]}
                                        placeholder="linkedin.com/in/..."
                                        placeholderTextColor={textSecondary}
                                        value={formData.linkedInUrl}
                                        onChangeText={(v) => updateField('linkedInUrl', v)}
                                    />
                                </View>
                                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                                    <Text style={[styles.label, { color: textPrimary }]}>Portfolio URL</Text>
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
                                <Text style={[styles.primaryBtnText, { color: canProceed() ? '#fff' : textSecondary }]}>Review Application</Text>
                                <ArrowRight size={16} color={canProceed() ? '#fff' : textSecondary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* STEP 4: REVIEW */}
                    {currentStep === 'review' && (
                        <View>
                            <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                <ChevronLeft size={14} color={textSecondary} />
                                <Text style={[styles.backText, { color: textSecondary }]}>Back</Text>
                            </TouchableOpacity>
                            <Text style={[styles.stepTitle, { color: textPrimary }]}>Review your application</Text>
                            <Text style={[styles.stepDesc, { color: textSecondary }]}>Make sure everything looks good before submitting.</Text>

                            <View style={styles.reviewList}>
                                {[
                                    { label: 'Display Name', value: formData.displayName },
                                    { label: 'Motivation', value: MOTIVATION_OPTIONS.find(m => m.id === formData.motivation)?.text || '' },
                                    { label: 'Content Type', value: CONTENT_TYPES.find(c => c.id === formData.contentType)?.label || '' },
                                    { label: 'Experience', value: formData.experience },
                                    { label: 'Bio', value: formData.bio },
                                    { label: 'LinkedIn', value: formData.linkedInUrl || 'Not provided' },
                                    { label: 'Portfolio', value: formData.portfolioUrl || 'Not provided' },
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
                                        <Text style={styles.primaryBtnText}>Submitting...</Text>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.primaryBtnText}>Submit Application</Text>
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
