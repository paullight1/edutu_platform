import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
    Image, Modal, Animated, Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import {
    ChevronLeft, CheckCircle2 as CheckCircle, Star,
    Send, Info, Sparkles, Briefcase, ChevronDown, ChevronRight,
    Camera, ExternalLink, Heart, Target, Globe,
    BookOpen, GraduationCap, Trophy, User, FileText,
    ArrowRight, Check, Award, Zap
} from 'lucide-react-native';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Avatar } from '../../components/ui/Avatar';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { toSafeUUID } from '@edutu/core/src/utils/auth';

const { width } = Dimensions.get('window');

type ApplyStep = 'intro' | 'motivation' | 'achievement' | 'verification' | 'review';

const OPPORTUNITY_TYPES = [
    { id: 'scholarship', label: 'Scholarship', icon: GraduationCap, color: '#3B82F6', desc: 'Academic scholarships & grants' },
    { id: 'fellowship', label: 'Fellowship', icon: Trophy, color: '#3b82f6', desc: 'Research & professional fellowships' },
    { id: 'internship', label: 'Internship', icon: Briefcase, color: '#10B981', desc: 'Professional internship programs' },
    { id: 'job', label: 'Full-time Job', icon: Target, color: '#F59E0B', desc: 'Full-time employment offers' },
    { id: 'program', label: 'Accelerator/Program', icon: BookOpen, color: '#EF4444', desc: 'Accelerators & training programs' },
    { id: 'other', label: 'Other', icon: Globe, color: '#94A3B8', desc: 'Other opportunities' },
];

const MOTIVATION_OPTIONS = [
    { id: 'help_others', text: "I want to help others achieve what I achieved", icon: Heart },
    { id: 'mentor', text: "I enjoy mentoring and sharing knowledge", icon: User },
    { id: 'give_back', text: "I want to give back to the community", icon: Sparkles },
    { id: 'document', text: "I want to document my journey for others", icon: FileText },
    { id: 'pay_forward', text: "I believe in paying it forward", icon: Zap },
];

export default function CreatorApply() {
    const { user } = useUser();
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();

    const [step, setStep] = useState<ApplyStep>('intro');
    const [form, setForm] = useState({
        motivation: '',
        opportunityType: '',
        opportunityTitle: '',
        linkedinUrl: '',
        proofUrl: '',
        portfolioUrl: '',
        bio: '',
        socialLinks: ''
    });
    const [kycImage, setKycImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [showTypeModal, setShowTypeModal] = useState(false);

    const slideAnim = useRef(new Animated.Value(0)).current;

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';

    const animateStep = useCallback((direction: 'forward' | 'backward') => {
        slideAnim.setValue(direction === 'forward' ? width : -width);
        Animated.spring(slideAnim, {
            toValue: 0,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
        }).start();
    }, [slideAnim]);

    const nextStep = (newStep: ApplyStep) => {
        animateStep('forward');
        setStep(newStep);
    };

    const prevStep = (newStep: ApplyStep) => {
        animateStep('backward');
        setStep(newStep);
    };

    const pickKYCImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]) {
                setUploadingImage(true);
                const file = result.assets[0];
                const fileName = `kyc/${toSafeUUID(user?.id!)}/${Date.now()}.jpg`;

                const { data, error } = await supabase.storage
                    .from('creator-applications')
                    .upload(fileName, {
                        uri: file.uri,
                        type: 'image/jpeg',
                        name: fileName,
                    } as any);

                if (error) throw error;

                const { data: { publicUrl } } = supabase.storage
                    .from('creator-applications')
                    .getPublicUrl(fileName);

                setKycImage(publicUrl);
            }
        } catch (error: any) {
            Alert.alert('Error', 'Failed to upload image. Please try again.');
        } finally {
            setUploadingImage(false);
        }
    };

    const canProceed = (): boolean => {
        switch (step) {
            case 'intro': return true;
            case 'motivation': return !!form.motivation;
            case 'achievement': return !!form.opportunityType && !!form.opportunityTitle && !!form.linkedinUrl;
            case 'verification': return !!kycImage && !!form.bio;
            case 'review': return true;
            default: return false;
        }
    };

    const handleApply = async () => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('creator_applications')
                .insert({
                    user_id: toSafeUUID(user?.id!),
                    motivation: form.motivation,
                    opportunity_type: form.opportunityType,
                    opportunity_title: form.opportunityTitle,
                    linkedin_url: form.linkedinUrl,
                    proof_url: form.proofUrl,
                    portfolio_url: form.portfolioUrl,
                    bio: form.bio,
                    social_links: form.socialLinks,
                    kyc_image_url: kycImage,
                    status: 'pending',
                    applied_at: new Date().toISOString()
                });

            if (error) throw error;

            await supabase
                .from('profiles')
                .update({ creator_status: 'pending' })
                .eq('user_id', toSafeUUID(user?.id!));

            setSubmitted(true);
        } catch (e: any) {
            Alert.alert('Error', e.message || 'Connection failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const stepIndex = ['intro', 'motivation', 'achievement', 'verification', 'review'].indexOf(step);

    if (submitted) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
                <ScreenHeader title="Application Submitted" showBack={false} />
                <View style={styles.successContent}>
                    <Animated.View style={{ transform: [{ scale: slideAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.5, 1, 0.5] }) }] }}>
                        <View style={[styles.successIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <CheckCircle color="#10b981" size={64} />
                        </View>
                    </Animated.View>
                    <Text style={[styles.successTitle, { color: textPrimary }]}>Welcome to the Creator Community!</Text>
                    <Text style={[styles.successText, { color: textSecondary }]}>
                        We have received your application and are excited to review your journey. Our team will verify your credentials within 2-3 business days.
                    </Text>
                    <View style={[styles.successDetails, { backgroundColor: inputBg }]}>
                        <View style={styles.successDetailRow}>
                            <Text style={[styles.successDetailLabel, { color: textSecondary }]}>Application ID</Text>
                            <Text style={[styles.successDetailValue, { color: textPrimary }]}>{user?.id?.slice(0, 8).toUpperCase()}</Text>
                        </View>
                        <View style={styles.successDetailRow}>
                            <Text style={[styles.successDetailLabel, { color: textSecondary }]}>Status</Text>
                            <View style={[styles.pendingBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                                <Text style={[styles.pendingBadgeText, { color: '#F59E0B' }]}>Pending Review</Text>
                            </View>
                        </View>
                        <View style={styles.successDetailRow}>
                            <Text style={[styles.successDetailLabel, { color: textSecondary }]}>Response Time</Text>
                            <Text style={[styles.successDetailValue, { color: textPrimary }]}>2-3 days</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.backHomeBtn, { backgroundColor: colors.accent }]}
                        onPress={() => router.replace('/profile')}
                    >
                        <Text style={styles.backHomeText}>Back to Profile</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <ScreenHeader title="Become a Creator" showBack />

            {/* Step Progress */}
            <View style={[styles.stepProgress, { borderBottomColor: borderColor }]}>
                {['intro', 'motivation', 'achievement', 'verification', 'review'].map((s, i) => (
                    <View key={s} style={styles.stepProgressItem}>
                        <View style={[styles.stepDot, {
                            backgroundColor: i <= stepIndex ? colors.accent : borderColor,
                            width: i === stepIndex ? 24 : 10,
                        }]} />
                        {i < 4 && <View style={[styles.stepLine, { backgroundColor: i < stepIndex ? colors.accent : borderColor }]} />}
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
                    {step === 'intro' && (
                        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                            <View style={styles.heroSection}>
                                <View style={[styles.heroIcon, { backgroundColor: `${colors.accent}12` }]}>
                                    <Sparkles color={colors.accent} size={32} />
                                </View>
                                <Text style={[styles.heroTitle, { color: textPrimary }]}>Share Your Victory Story</Text>
                                <Text style={[styles.heroSubtitle, { color: textSecondary }]}>
                                    You've achieved something incredible. Inspire the next generation by sharing your roadmap to success.
                                </Text>
                            </View>

                            <View style={styles.creatorPreview}>
                                <Avatar name={user?.fullName || 'You'} imageUrl={user?.imageUrl} size="md" />
                                <View style={styles.creatorPreviewText}>
                                    <Text style={[styles.creatorName, { color: textPrimary }]}>{user?.fullName || 'Your Name'}</Text>
                                    <Text style={[styles.creatorRole, { color: colors.accent }]}>Future Creator</Text>
                                </View>
                                <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                                    <Star color="#fff" size={12} />
                                </View>
                            </View>

                            <View style={styles.statsSection}>
                                {[
                                    { num: '10K+', label: 'Students Helped', color: '#3B82F6' },
                                    { num: '500+', label: 'Success Stories', color: '#3b82f6' },
                                    { num: '85%', label: 'Revenue Share', color: '#10B981' },
                                ].map((stat, i) => (
                                    <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.statNumber, { color: stat.color }]}>{stat.num}</Text>
                                        <Text style={[styles.statLabel, { color: textSecondary }]}>{stat.label}</Text>
                                    </View>
                                ))}
                            </View>

                            <View style={[styles.benefitCard, { backgroundColor: `${colors.accent}08`, borderColor: `${colors.accent}20` }]}>
                                <Award size={20} color={colors.accent} />
                                <Text style={[styles.benefitText, { color: textSecondary }]}>
                                    As a verified creator, you'll earn <Text style={{ fontWeight: '800', color: colors.accent }}>85% revenue share</Text> from every roadmap sale and reach thousands of learners worldwide.
                                </Text>
                            </View>
                        </Animated.View>
                    )}

                    {/* STEP 2: MOTIVATION */}
                    {step === 'motivation' && (
                        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                            <View style={styles.stepHeader}>
                                <Text style={[styles.stepHeaderTitle, { color: textPrimary }]}>What motivates you?</Text>
                                <Text style={[styles.stepHeaderDesc, { color: textSecondary }]}>
                                    Select the reason that best describes why you want to become a creator.
                                </Text>
                            </View>

                            <View style={styles.motivationGrid}>
                                {MOTIVATION_OPTIONS.map((opt) => {
                                    const isSelected = form.motivation === opt.text;
                                    const Icon = opt.icon;
                                    return (
                                        <TouchableOpacity
                                            key={opt.id}
                                            style={[
                                                styles.motivationCard,
                                                { backgroundColor: cardBg, borderColor: isSelected ? colors.accent : borderColor },
                                                isSelected && { backgroundColor: `${colors.accent}08` }
                                            ]}
                                            onPress={() => setForm(p => ({ ...p, motivation: opt.text }))}
                                        >
                                            <View style={[styles.motivationIconBox, { backgroundColor: `${colors.accent}12` }]}>
                                                <Icon size={24} color={isSelected ? colors.accent : textSecondary} />
                                            </View>
                                            <Text style={[styles.motivationText, { color: isSelected ? colors.accent : textPrimary }]}>{opt.text}</Text>
                                            {isSelected && (
                                                <View style={[styles.motivationCheck, { backgroundColor: colors.accent }]}>
                                                    <Check size={14} color="white" />
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </Animated.View>
                    )}

                    {/* STEP 3: ACHIEVEMENT */}
                    {step === 'achievement' && (
                        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                            <View style={styles.stepHeader}>
                                <Text style={[styles.stepHeaderTitle, { color: textPrimary }]}>Your Achievement</Text>
                                <Text style={[styles.stepHeaderDesc, { color: textSecondary }]}>
                                    Tell us about the opportunity you secured so we can help others follow your path.
                                </Text>
                            </View>

                            {/* Opportunity Type Grid */}
                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Opportunity Type</Text>
                                <View style={styles.typeGrid}>
                                    {OPPORTUNITY_TYPES.map((type) => {
                                        const isSelected = form.opportunityType === type.id;
                                        const Icon = type.icon;
                                        return (
                                            <TouchableOpacity
                                                key={type.id}
                                                style={[
                                                    styles.typeCard,
                                                    { backgroundColor: cardBg, borderColor: isSelected ? type.color : borderColor },
                                                    isSelected && { backgroundColor: `${type.color}08` }
                                                ]}
                                                onPress={() => setForm(p => ({ ...p, opportunityType: type.id }))}
                                            >
                                                <View style={[styles.typeIconBox, { backgroundColor: `${type.color}15` }]}>
                                                    <Icon size={20} color={isSelected ? type.color : textSecondary} />
                                                </View>
                                                <Text style={[styles.typeLabel, { color: isSelected ? type.color : textPrimary }]}>{type.label}</Text>
                                                <Text style={[styles.typeDesc, { color: textSecondary }]}>{type.desc}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Opportunity Name</Text>
                                <TextInput
                                    style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                    placeholder="e.g., Mastercard Foundation Scholarship 2024"
                                    placeholderTextColor={textSecondary}
                                    value={form.opportunityTitle}
                                    onChangeText={v => setForm(p => ({ ...p, opportunityTitle: v }))}
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>LinkedIn Profile</Text>
                                <View style={[styles.inputWithIcon, { backgroundColor: inputBg, borderColor }]}>
                                    <ExternalLink color={textSecondary} size={20} />
                                    <TextInput
                                        style={[styles.inputWithIconText, { color: textPrimary }]}
                                        placeholder="https://linkedin.com/in/yourprofile"
                                        placeholderTextColor={textSecondary}
                                        value={form.linkedinUrl}
                                        onChangeText={v => setForm(p => ({ ...p, linkedinUrl: v }))}
                                        autoCapitalize="none"
                                        keyboardType="url"
                                    />
                                </View>
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Portfolio URL (Optional)</Text>
                                <TextInput
                                    style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                    placeholder="Link to your portfolio or personal website"
                                    placeholderTextColor={textSecondary}
                                    value={form.portfolioUrl}
                                    onChangeText={v => setForm(p => ({ ...p, portfolioUrl: v }))}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                />
                            </View>
                        </Animated.View>
                    )}

                    {/* STEP 4: VERIFICATION */}
                    {step === 'verification' && (
                        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                            <View style={styles.stepHeader}>
                                <Text style={[styles.stepHeaderTitle, { color: textPrimary }]}>Verification</Text>
                                <Text style={[styles.stepHeaderDesc, { color: textSecondary }]}>
                                    We verify all creators to maintain quality and trust. Upload a document to confirm your achievement.
                                </Text>
                            </View>

                            {/* KYC Upload */}
                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Verification Document</Text>
                                <Text style={[styles.inputHint, { color: textSecondary }]}>
                                    Upload your award letter, certificate, acceptance email, or ID
                                </Text>

                                <TouchableOpacity
                                    style={[styles.imageUpload, { backgroundColor: inputBg, borderColor: kycImage ? '#10B981' : borderColor }]}
                                    onPress={pickKYCImage}
                                    disabled={uploadingImage}
                                >
                                    {uploadingImage ? (
                                        <ActivityIndicator color={colors.accent} />
                                    ) : kycImage ? (
                                        <>
                                            <Image source={{ uri: kycImage }} style={styles.uploadedImage} />
                                            <View style={[styles.uploadedBadge, { backgroundColor: '#10B981' }]}>
                                                <CheckCircle color="#fff" size={14} />
                                                <Text style={styles.uploadedText}>Verified</Text>
                                            </View>
                                        </>
                                    ) : (
                                        <>
                                            <View style={[styles.uploadIcon, { backgroundColor: `${colors.accent}12` }]}>
                                                <Camera color={colors.accent} size={28} />
                                            </View>
                                            <Text style={[styles.uploadText, { color: textPrimary }]}>Tap to upload</Text>
                                            <Text style={[styles.uploadSubtext, { color: textSecondary }]}>JPG, PNG accepted</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Bio */}
                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Your Story</Text>
                                <TextInput
                                    style={[styles.wizardInput, styles.wizardTextArea, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                    placeholder="Share your journey - how you prepared, challenges you faced, and advice for others..."
                                    placeholderTextColor={textSecondary}
                                    multiline
                                    numberOfLines={5}
                                    value={form.bio}
                                    onChangeText={v => setForm(p => ({ ...p, bio: v }))}
                                    textAlignVertical="top"
                                />
                            </View>

                            <View style={styles.formGroup}>
                                <Text style={[styles.formLabel, { color: textPrimary }]}>Social Links (Optional)</Text>
                                <TextInput
                                    style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                    placeholder="Twitter, YouTube, etc. (comma separated)"
                                    placeholderTextColor={textSecondary}
                                    value={form.socialLinks}
                                    onChangeText={v => setForm(p => ({ ...p, socialLinks: v }))}
                                />
                            </View>
                        </Animated.View>
                    )}

                    {/* STEP 5: REVIEW */}
                    {step === 'review' && (
                        <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>
                            <View style={styles.stepHeader}>
                                <Text style={[styles.stepHeaderTitle, { color: textPrimary }]}>Review Application</Text>
                                <Text style={[styles.stepHeaderDesc, { color: textSecondary }]}>
                                    Double-check your details before submitting.
                                </Text>
                            </View>

                            <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>Motivation</Text>
                                <View style={styles.reviewRow}>
                                    <Heart size={16} color={colors.accent} />
                                    <Text style={[styles.reviewValue, { color: textPrimary }]}>{form.motivation}</Text>
                                </View>
                            </View>

                            <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>Achievement</Text>
                                <View style={styles.reviewRow}>
                                    <Text style={[styles.reviewLabel, { color: textSecondary }]}>Type</Text>
                                    <Text style={[styles.reviewValue, { color: textPrimary }]}>
                                        {OPPORTUNITY_TYPES.find(t => t.id === form.opportunityType)?.label}
                                    </Text>
                                </View>
                                <View style={styles.reviewRow}>
                                    <Text style={[styles.reviewLabel, { color: textSecondary }]}>Name</Text>
                                    <Text style={[styles.reviewValue, { color: textPrimary }]}>{form.opportunityTitle}</Text>
                                </View>
                            </View>

                            <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>Verification</Text>
                                {kycImage && (
                                    <View style={styles.reviewRow}>
                                        <FileText size={16} color={textSecondary} />
                                        <Text style={[styles.reviewValue, { color: '#10B981' }]}>Document uploaded</Text>
                                    </View>
                                )}
                                <View style={styles.reviewRow}>
                                    <Text style={[styles.reviewLabel, { color: textSecondary }]}>Bio</Text>
                                    <Text style={[styles.reviewValue, { color: textPrimary }]} numberOfLines={3}>{form.bio}</Text>
                                </View>
                            </View>

                            <View style={[styles.infoCallout, { backgroundColor: `${colors.accent}08`, borderColor: `${colors.accent}20` }]}>
                                <Info size={16} color={colors.accent} />
                                <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                    Your application will be reviewed within <Text style={{ fontWeight: '700', color: colors.accent }}>2-3 business days</Text>. You'll be notified once approved.
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer Navigation */}
            <View style={[styles.footerNav, { borderTopColor: borderColor, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
                {step !== 'intro' && step !== 'review' && (
                    <TouchableOpacity onPress={() => {
                        const steps: ApplyStep[] = ['intro', 'motivation', 'achievement', 'verification', 'review'];
                        const idx = steps.indexOf(step);
                        prevStep(steps[idx - 1]);
                    }} style={[styles.footerBtn, { backgroundColor: inputBg }]}>
                        <ChevronLeft size={18} color={textSecondary} />
                        <Text style={[styles.footerBtnText, { color: textSecondary }]}>Back</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.footerSubmitBtn, { backgroundColor: colors.accent }]}
                    onPress={step === 'review' ? handleApply : () => {
                        const steps: ApplyStep[] = ['intro', 'motivation', 'achievement', 'verification', 'review'];
                        const idx = steps.indexOf(step);
                        nextStep(steps[idx + 1]);
                    }}
                    disabled={loading || !canProceed()}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : step === 'review' ? (
                        <>
                            <Send color="white" size={18} />
                            <Text style={styles.footerSubmitText}>Submit Application</Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.footerSubmitText}>Continue</Text>
                            <ChevronRight size={18} color="white" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 16 },

    // Step Progress
    stepProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderBottomWidth: 1 },
    stepProgressItem: { flexDirection: 'row', alignItems: 'center' },
    stepDot: { height: 10, borderRadius: 5 },
    stepLine: { width: 30, height: 2, marginHorizontal: 4 },

    // Hero Section
    heroSection: { paddingHorizontal: 8, paddingVertical: 12, marginBottom: 20, alignItems: 'center' },
    heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    heroSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

    // Creator Preview
    creatorPreview: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20 },
    creatorPreviewText: { flex: 1, marginLeft: 12 },
    creatorName: { fontSize: 16, fontWeight: '600' },
    creatorRole: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

    // Stats
    statsSection: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
    statNumber: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
    statLabel: { fontSize: 11, fontWeight: '500' },

    // Benefit Card
    benefitCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
    benefitText: { fontSize: 13, flex: 1, lineHeight: 20 },

    // Step Header
    stepHeader: { marginBottom: 24 },
    stepHeaderTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
    stepHeaderDesc: { fontSize: 14, lineHeight: 22 },

    // Motivation Grid
    motivationGrid: { gap: 12 },
    motivationCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 16, borderWidth: 1, position: 'relative' },
    motivationIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    motivationText: { fontSize: 14, fontWeight: '600', flex: 1, lineHeight: 20 },
    motivationCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

    // Type Grid
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    typeCard: { width: (width - 60) / 2, padding: 16, borderRadius: 16, borderWidth: 1 },
    typeIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    typeLabel: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
    typeDesc: { fontSize: 11, lineHeight: 16 },

    // Form
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
    inputHint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
    wizardInput: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15 },
    wizardTextArea: { minHeight: 120 },
    inputWithIcon: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, borderWidth: 1, gap: 12 },
    inputWithIconText: { flex: 1, fontSize: 15, padding: 0 },

    // Image Upload
    imageUpload: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', padding: 24, alignItems: 'center', overflow: 'hidden' },
    uploadIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    uploadText: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
    uploadSubtext: { fontSize: 12 },
    uploadedImage: { width: '100%', height: 150, borderRadius: 12, marginBottom: 12 },
    uploadedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 6 },
    uploadedText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Review
    reviewCard: { borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 16 },
    reviewSectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
    reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    reviewLabel: { fontSize: 13, fontWeight: '600', width: 80 },
    reviewValue: { fontSize: 13, fontWeight: '500', flex: 1 },

    // Info Callout
    infoCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
    infoCalloutText: { fontSize: 13, flex: 1, lineHeight: 20 },

    // Footer
    footerNav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
    footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
    footerBtnText: { fontSize: 15, fontWeight: '600' },
    footerSubmitBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
    footerSubmitText: { color: 'white', fontWeight: '800', fontSize: 16 },

    // Success
    successContent: { flex: 1, padding: 40, alignItems: 'center', justifyContent: 'center' },
    successIconBox: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    successTitle: { fontSize: 24, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    successText: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
    successDetails: { borderRadius: 16, padding: 20, width: '100%', marginBottom: 32 },
    successDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    successDetailLabel: { fontSize: 13, fontWeight: '500' },
    successDetailValue: { fontSize: 13, fontWeight: '600' },
    pendingBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    pendingBadgeText: { fontSize: 12, fontWeight: '700' },
    backHomeBtn: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 100 },
    backHomeText: { color: 'white', fontWeight: '600', fontSize: 16 },
});
