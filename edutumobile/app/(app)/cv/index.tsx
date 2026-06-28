import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Alert,
    FlatList,
    ActivityIndicator,
    Modal,
    ImageBackground,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Plus, ChevronLeft, Eye, Crown, ChevronRight } from 'lucide-react-native';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../../components/ui/BrandedLoader';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../components/context/ThemeContext';
import { CVTemplate, UserCV } from '@edutu/core/src/types/cv';
import * as cvService from '@edutu/core/src/services/cv';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { fetchOpportunities } from '@edutu/core/src/services/opportunities';

// Import extracted components
import { CVTemplateCard } from '../../../components/cv/CVTemplateCard';
import { CVListItem } from '../../../components/cv/CVListItem';
import { CVEditor } from '../../../components/cv/CVEditor';
import { CVPreview } from '../../../components/cv/CVPreview';
import { ProUpgradeModal } from '../../../components/cv/ProUpgradeModal';
import { AITailorModal } from '../../../components/cv/AITailorModal';

type CVSection = 'templates' | 'editor' | 'preview';

const QUICK_ACTION_IMAGES = {
    create: 'https://img.freepik.com/free-vector/white-abstract-background_23-2148810113.jpg?w=2000',
    linkedin: 'https://img.freepik.com/free-photo/group-people-working-out-business-plan-office_1303-15773.jpg',
    tailor: 'https://img.freepik.com/free-photo/still-life-books-versus-technology_23-2150063046.jpg',
};

const SAMPLE_BY_CATEGORY = {
    academic: {
        name: 'Amara Okafor',
        headline: 'MSc Public Health Applicant',
        summary: 'Research-focused profile with education, publications, field projects, and academic achievements placed before work history.',
        bullets: ['Education and research first', 'Publications and awards visible', 'Good for scholarships and graduate admissions'],
    },
    professional: {
        name: 'Daniel Mensah',
        headline: 'Operations Analyst',
        summary: 'Outcome-led profile for internships, jobs, fellowships, and early-career programs with measurable work impact.',
        bullets: ['Work impact before coursework', 'Strong skills and metrics section', 'Good for internships and jobs'],
    },
    creative: {
        name: 'Leah Adeyemi',
        headline: 'Product Designer',
        summary: 'Portfolio-friendly structure that highlights projects, tools, links, and visual achievements without losing ATS readability.',
        bullets: ['Projects and portfolio links', 'Tools and case-study highlights', 'Good for design and media roles'],
    },
    general: {
        name: 'Edutu Student',
        headline: 'Opportunity Applicant',
        summary: 'Balanced structure for students applying across scholarships, school programs, internships, and community opportunities.',
        bullets: ['Clean student profile', 'Flexible section order', 'Good for broad applications'],
    },
};

function getTemplateSample(template?: CVTemplate | null) {
    const category = template?.category?.toLowerCase() || 'general';
    return SAMPLE_BY_CATEGORY[category as keyof typeof SAMPLE_BY_CATEGORY] || SAMPLE_BY_CATEGORY.general;
}

function getTemplatePreviewImage(template?: CVTemplate | null) {
    if (template?.thumbnail_url) return template.thumbnail_url;
    const category = template?.category?.toLowerCase() || 'general';
    if (category === 'academic') return 'https://img.freepik.com/free-photo/still-life-books-versus-technology_23-2150063046.jpg';
    if (category === 'professional') return 'https://img.freepik.com/free-photo/meeting-with-business-partners_1098-17048.jpg';
    if (category === 'creative') return 'https://img.freepik.com/free-photo/businesswoman-posing_23-2148142829.jpg';
    return 'https://img.freepik.com/free-vector/white-abstract-background_23-2148810113.jpg?w=2000';
}

function QuickActionCard({
    title,
    subtitle,
    image,
    onPress,
}: {
    title: string;
    subtitle: string;
    image: string;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity style={styles.quickActionCard} onPress={onPress} activeOpacity={0.88}>
            <ImageBackground source={{ uri: image }} style={styles.quickActionImage} imageStyle={styles.quickActionImageInner}>
                <View style={styles.quickActionScrim} />
                <View style={styles.quickActionCopy}>
                    <Text style={styles.quickActionCardTitle}>{title}</Text>
                    <Text style={styles.quickActionCardSubtitle}>{subtitle}</Text>
                </View>
                <View style={styles.quickActionArrow}>
                    <ChevronRight size={20} color="#0F172A" />
                </View>
            </ImageBackground>
        </TouchableOpacity>
    );
}

export default function CVBuilderScreen() {
    const { user } = useUser();
    const router = useRouter();
    const { colors, isDark } = useTheme();

    const [activeSection, setActiveSection] = useState<CVSection>('templates');
    const [templates, setTemplates] = useState<CVTemplate[]>([]);
    const [userCVs, setUserCVs] = useState<UserCV[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<CVTemplate | null>(null);
    const [currentCV, setCurrentCV] = useState<Partial<UserCV>>({
        name: 'My CV',
        data_json: {},
    });
    const [isPro, setIsPro] = useState(false);
    const [trialUsed, setTrialUsed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [opportunitiesLoaded, setOpportunitiesLoaded] = useState(false);
    const [isTailoring, setIsTailoring] = useState(false);

    // Modals
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState<string>('');
    const [showAIModal, setShowAIModal] = useState(false);
    const [showLinkedInModal, setShowLinkedInModal] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<CVTemplate | null>(null);
    const [linkedInUrl, setLinkedInUrl] = useState('');
    const [isLinkedInImporting, setIsLinkedInImporting] = useState(false);

    const handleLinkedInSubmit = async () => {
        if (!linkedInUrl || !user) return;
        setIsLinkedInImporting(true);
        try {
            const draft = await cvService.generateAICVDraft(supabase, user.id, {
                linkedInUrl,
                currentData: currentCV.data_json,
                prompt: 'scholarships, internships, and early-career opportunities',
            });
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                name: prev.name || 'AI Draft CV',
                data_json: draft,
            }));
            setIsLinkedInImporting(false);
            setShowLinkedInModal(false);
            setActiveSection('editor');
            Alert.alert('Success', 'Your CV draft has been generated from your profile context.');
        } catch (error) {
            console.error('AI CV generation error:', error);
            setIsLinkedInImporting(false);
            Alert.alert('Error', 'Failed to generate CV draft.');
        }
    };

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    useEffect(() => {
        const urls = [
            QUICK_ACTION_IMAGES.create,
            QUICK_ACTION_IMAGES.linkedin,
            QUICK_ACTION_IMAGES.tailor,
            'https://img.freepik.com/free-photo/still-life-books-versus-technology_23-2150063046.jpg',
            'https://img.freepik.com/free-photo/meeting-with-business-partners_1098-17048.jpg',
            'https://img.freepik.com/free-photo/businesswoman-posing_23-2148142829.jpg',
            'https://img.freepik.com/free-vector/white-abstract-background_23-2148810113.jpg?w=2000',
        ];

        urls.forEach((url) => {
            Image.prefetch(url).catch(() => undefined);
        });
    }, []);

    async function loadData() {
        try {
            setIsLoading(true);
            const userId = user?.id || '';
            const [templatesData, cvsData, proStatus] = await Promise.all([
                cvService.fetchCVTemplates(supabase, { includePremium: true }),
                cvService.fetchUserCVs(supabase, userId),
                cvService.getUserProStatus(supabase, userId),
            ]);

            setTemplates(templatesData);
            setUserCVs(cvsData);
            setIsPro(proStatus.isPro);
            setTrialUsed(proStatus.cvTrialUsed);
        } catch (error) {
            console.error('Error loading CV data:', error);
        } finally {
            setIsLoading(false);
        }
    }

    const loadTailorOpportunities = async () => {
        if (!user || opportunitiesLoaded || opportunities.length) return;

        try {
            const opportunityData = await fetchOpportunities({
                supabase,
                userId: user.id,
                force: false,
            });
            setOpportunities(opportunityData.slice(0, 8));
        } catch (error) {
            console.error('Error loading opportunities for tailoring:', error);
        } finally {
            setOpportunitiesLoaded(true);
        }
    };

    const handleSelectTemplate = (template: CVTemplate) => {
        if (template.is_premium && !isPro) {
            setUpgradeFeature(`${template.name} template`);
            setShowUpgradeModal(true);
            return;
        }
        setSelectedTemplate(template);
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            template_id: template.id,
            data_json: { ...prev.data_json },
        }));
        setActiveSection('editor');
    };

    const handleCreateNewCV = () => {
        setSelectedTemplate(null);
        setCurrentCV({ name: 'Untitled CV', data_json: {} });
        setActiveSection('templates');
    };

    const handleEditCV = (cv: UserCV) => {
        const template = templates.find(t => t.id === cv.template_id);
        setSelectedTemplate(template || null);
        setCurrentCV({
            id: cv.id,
            name: cv.name,
            template_id: cv.template_id,
            data_json: cv.data_json,
            is_primary: cv.is_primary,
        });
        setActiveSection('editor');
    };

    const handleSaveCV = async () => {
        if (!user) return;

        // Check for premium features before saving
        setIsSaving(true);
        try {
            if (currentCV.id) {
                await cvService.updateUserCV(supabase, currentCV.id, currentCV);
            } else {
                const newCV = await cvService.createUserCV(supabase, user.id, currentCV);
                setCurrentCV((prev: Partial<UserCV>) => ({ ...prev, id: newCV.id }));
            }
            await loadData();
            Alert.alert('Success', 'CV saved successfully!');
        } catch (error) {
            console.error('Error saving CV:', error);
            Alert.alert('Error', 'Failed to save CV');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCV = async (cvId: string) => {
        Alert.alert(
            'Delete CV',
            'Are you sure you want to delete this CV?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await cvService.deleteUserCV(supabase, cvId);
                        await loadData();
                    },
                },
            ]
        );
    };

    const handleAITailor = () => {
        setShowAIModal(true);
        void loadTailorOpportunities();
    };

    const handleExport = async () => {
        try {
            await cvService.shareCV(currentCV);
        } catch (error) {
            console.error('Error sharing CV:', error);
            Alert.alert('Error', 'Failed to share CV');
        }
    };

    const handleTrialActivated = async () => {
        if (user) {
            await cvService.useCVTrial(supabase, user.id);
            setTrialUsed(true);
        }
    };

    const handleTailorToOpportunity = async (opportunityId: string) => {
        if (!user) return;
        try {
            setIsTailoring(true);
            const result = await cvService.tailorCVForOpportunity(supabase, {
                userId: user.id,
                currentCVData: currentCV.data_json || {},
                opportunityId,
            });
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                data_json: result.tailored_cv,
                match_score: result.match_score,
                target_opportunity_id: opportunityId,
            }));
            setActiveSection('editor');
            Alert.alert('CV Tailored', result.improvements.join('\n'));
        } catch (error) {
            console.error('Error tailoring CV:', error);
            Alert.alert('Error', 'Failed to tailor CV for this opportunity.');
        } finally {
            setIsTailoring(false);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title="CV Builder" showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label="Loading CV Builder..." />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title="CV Builder"
                showBack
                right={
                    <TouchableOpacity onPress={handleCreateNewCV}>
                        <Plus size={24} color={colors.primary} />
                    </TouchableOpacity>
                }
            />

            {/* Pro Status Banner */}
            {!isPro && (
                <TouchableOpacity
                    style={[styles.proBanner, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}
                    onPress={() => setShowUpgradeModal(true)}
                >
                    <View style={[styles.proBannerIcon, { backgroundColor: '#F59E0B' }]}>
                        <Crown size={18} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.proBannerText, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                        {trialUsed
                            ? 'Upgrade to Pro for unlimited CVs'
                            : 'Free trial available - Try Pro features!'}
                    </Text>
                    <ChevronRight size={18} color={isDark ? '#FBBF24' : '#D97706'} />
                </TouchableOpacity>
            )}

            {activeSection === 'templates' && (
                <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Quick Actions Tabs */}
                    <Animated.View entering={FadeInDown} style={styles.quickActionsContainer}>
                        <Text style={[styles.quickActionsTitle, { color: colors.foreground }]}>Build faster</Text>
                        <Text style={[styles.quickActionsSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            Start from a blank CV, generate from LinkedIn, or tailor your draft toward a real opportunity.
                        </Text>
                        <QuickActionCard
                            title="Create a fresh CV"
                            subtitle="Start with a structured editor and choose a template after previewing samples."
                            image={QUICK_ACTION_IMAGES.create}
                            onPress={handleCreateNewCV}
                        />
                        <QuickActionCard
                            title="Import from LinkedIn"
                            subtitle="Use your profile context to draft a stronger first version with AI."
                            image={QUICK_ACTION_IMAGES.linkedin}
                            onPress={() => setShowLinkedInModal(true)}
                        />
                        <QuickActionCard
                            title="Tailor to an opportunity"
                            subtitle="Match your CV against scholarships, internships, and programs in your bank."
                            image={QUICK_ACTION_IMAGES.tailor}
                            onPress={handleAITailor}
                        />
                    </Animated.View>

                    {/* Existing CVs */}
                    {userCVs.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(100)}>
                            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your CVs</Text>
                            <FlatList
                                data={userCVs}
                                renderItem={({ item }) => (
                                    <CVListItem
                                        item={item}
                                        onEdit={handleEditCV}
                                        onDelete={handleDeleteCV}
                                    />
                                )}
                                keyExtractor={(item) => item.id}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.cvListContainer}
                            />
                        </Animated.View>
                    )}

                    {/* Template Selection */}
                    <Animated.View entering={FadeInUp.delay(200)}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>Choose a Template</Text>
                        </View>
                        <FlatList
                            data={templates}
                            renderItem={({ item }) => (
                                <CVTemplateCard
                                    item={item}
                                    onSelect={setPreviewTemplate}
                                    isPro={isPro}
                                />
                            )}
                            keyExtractor={(item) => item.id}
                            numColumns={2}
                            columnWrapperStyle={styles.templateRow}
                            contentContainerStyle={styles.templateContainer}
                            scrollEnabled={false}
                        />
                    </Animated.View>
                </ScrollView>
            )}

            {activeSection === 'editor' && (
                <View style={styles.editorHeader}>
                    <TouchableOpacity
                        style={styles.backBtn}
                        onPress={() => setActiveSection('templates')}
                    >
                        <ChevronLeft size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <TextInput
                        style={[styles.cvNameInput, { color: colors.foreground }]}
                        value={currentCV.name}
                        onChangeText={(text) => setCurrentCV((prev: Partial<UserCV>) => ({ ...prev, name: text }))}
                    />
                    <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => setActiveSection('preview')}
                    >
                        <Eye size={20} color={colors.primary} />
                    </TouchableOpacity>
                </View>
            )}

            {activeSection === 'editor' && (
                <CVEditor
                    currentCV={currentCV}
                    setCurrentCV={setCurrentCV}
                    isPro={isPro}
                    isSaving={isSaving}
                    onSave={handleSaveCV}
                    onExport={handleExport}
                    onAITailor={handleAITailor}
                    onUpgradeFeature={(feature) => {
                        setUpgradeFeature(feature);
                        setShowUpgradeModal(true);
                    }}
                />
            )}

            {activeSection === 'preview' && (
                <CVPreview currentCV={currentCV} onBack={() => setActiveSection('editor')} />
            )}

            {/* Modals */}
            <ProUpgradeModal
                visible={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                feature={upgradeFeature}
                trialUsed={trialUsed}
                onTrialActivated={handleTrialActivated}
            />

            <AITailorModal
                visible={showAIModal}
                onClose={() => setShowAIModal(false)}
                opportunities={opportunities}
                isLoading={isTailoring || (!opportunities.length && !opportunitiesLoaded)}
                onSelectOpportunity={handleTailorToOpportunity}
            />

            {/* LinkedIn Import Modal */}
            <Modal
                visible={!!previewTemplate}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setPreviewTemplate(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.sampleModalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <ImageBackground
                            source={{ uri: getTemplatePreviewImage(previewTemplate) }}
                            style={styles.sampleHero}
                            imageStyle={styles.sampleHeroImage}
                        >
                            <View style={styles.sampleHeroScrim} />
                            <View style={styles.sampleHeroTop}>
                                <View style={styles.sampleBadge}>
                                    <Text style={styles.sampleBadgeText}>{previewTemplate?.category || 'Template'}</Text>
                                </View>
                                {previewTemplate?.is_premium && (
                                    <View style={styles.samplePremiumBadge}>
                                        <Crown size={13} color="#FFFFFF" />
                                        <Text style={styles.sampleBadgeText}>Pro</Text>
                                    </View>
                                )}
                            </View>
                        </ImageBackground>

                        <Text style={[styles.sampleTitle, { color: colors.foreground }]}>{previewTemplate?.name}</Text>
                        <Text style={[styles.sampleDesc, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                            {previewTemplate?.description || getTemplateSample(previewTemplate).summary}
                        </Text>

                        <View style={[styles.resumeSample, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
                            <View style={styles.resumeSampleHeader}>
                                <View>
                                    <Text style={[styles.resumeName, { color: colors.foreground }]}>{getTemplateSample(previewTemplate).name}</Text>
                                    <Text style={[styles.resumeHeadline, { color: '#6366F1' }]}>{getTemplateSample(previewTemplate).headline}</Text>
                                </View>
                                <View style={styles.resumeAvatar} />
                            </View>
                            <Text style={[styles.resumeSummary, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                                {getTemplateSample(previewTemplate).summary}
                            </Text>
                            {getTemplateSample(previewTemplate).bullets.map((bullet) => (
                                <View key={bullet} style={styles.resumeBulletRow}>
                                    <View style={styles.resumeBulletDot} />
                                    <Text style={[styles.resumeBulletText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{bullet}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setPreviewTemplate(null)}>
                                <Text style={styles.modalBtnCancelText}>Close</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtnConfirm, { backgroundColor: colors.primary }]}
                                onPress={() => {
                                    const template = previewTemplate;
                                    setPreviewTemplate(null);
                                    if (template) handleSelectTemplate(template);
                                }}
                            >
                                <Text style={styles.modalBtnConfirmText}>
                                    {previewTemplate?.is_premium && !isPro ? 'Unlock Template' : 'Use Template'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={showLinkedInModal}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowLinkedInModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <Text style={[styles.modalTitle, { color: colors.foreground }]}>Build CV with AI</Text>
                        <Text style={styles.modalDesc}>Paste your LinkedIn profile URL below and our AI will automatically gather your experience and build your CV.</Text>

                        <TextInput
                            style={[styles.linkInput, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', color: colors.foreground }]}
                            placeholder="https://linkedin.com/in/username"
                            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                            value={linkedInUrl}
                            onChangeText={setLinkedInUrl}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowLinkedInModal(false)} disabled={isLinkedInImporting}>
                                <Text style={styles.modalBtnCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtnConfirm, { backgroundColor: colors.primary, opacity: isLinkedInImporting ? 0.7 : 1 }]}
                                onPress={handleLinkedInSubmit}
                                disabled={isLinkedInImporting || !linkedInUrl}
                            >
                                {isLinkedInImporting ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.modalBtnConfirmText}>Generate CV</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickActionsContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
    },
    quickActionsTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 6,
    },
    quickActionsSubtitle: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 14,
    },
    quickActionCard: {
        height: 138,
        borderRadius: 22,
        overflow: 'hidden',
        marginBottom: 12,
        backgroundColor: '#0F172A',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 5,
    },
    quickActionImage: {
        flex: 1,
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickActionImageInner: {
        borderRadius: 22,
    },
    quickActionScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.72)',
    },
    quickActionCopy: {
        paddingHorizontal: 22,
        alignItems: 'center',
    },
    quickActionCardTitle: {
        color: '#FFFFFF',
        fontSize: 19,
        lineHeight: 24,
        fontWeight: '800',
        textAlign: 'center',
    },
    quickActionCardSubtitle: {
        color: 'rgba(255,255,255,0.78)',
        fontSize: 13,
        lineHeight: 18,
        marginTop: 5,
        fontWeight: '600',
        textAlign: 'center',
    },
    quickActionArrow: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    proBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 12,
    },
    proBannerIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    proBannerText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginHorizontal: 16,
        marginTop: 20,
        marginBottom: 12,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        paddingRight: 16,
        marginTop: 20,
        marginBottom: 4,
    },
    cvListContainer: {
        paddingHorizontal: 16,
    },
    templateRow: {
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    templateContainer: {
        paddingBottom: 20,
    },
    editorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    backBtn: {
        padding: 4,
    },
    cvNameInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        marginHorizontal: 12,
    },
    previewBtn: {
        padding: 8,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
    },
    sampleModalCard: {
        width: '100%',
        borderRadius: 26,
        overflow: 'hidden',
        padding: 18,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
        elevation: 10,
    },
    sampleHero: {
        height: 132,
        borderRadius: 20,
        overflow: 'hidden',
        padding: 14,
        marginBottom: 16,
    },
    sampleHeroImage: {
        borderRadius: 20,
    },
    sampleHeroScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.42)',
    },
    sampleHeroTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sampleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    samplePremiumBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: '#F59E0B',
    },
    sampleBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    sampleTitle: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '900',
        marginBottom: 6,
    },
    sampleDesc: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 14,
    },
    resumeSample: {
        borderWidth: 1,
        borderRadius: 18,
        padding: 16,
        marginBottom: 18,
    },
    resumeSampleHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    resumeName: {
        fontSize: 18,
        fontWeight: '900',
    },
    resumeHeadline: {
        fontSize: 12,
        fontWeight: '800',
        marginTop: 3,
    },
    resumeAvatar: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#CBD5E1',
    },
    resumeSummary: {
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 12,
    },
    resumeBulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 8,
    },
    resumeBulletDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#6366F1',
        marginTop: 6,
    },
    resumeBulletText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    modalDesc: {
        fontSize: 14,
        color: '#64748B',
        marginBottom: 20,
        lineHeight: 20,
    },
    linkInput: {
        height: 48,
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.2)',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    modalBtnCancel: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        justifyContent: 'center',
    },
    modalBtnCancelText: {
        color: '#64748B',
        fontWeight: '600',
    },
    modalBtnConfirm: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 12,
        justifyContent: 'center',
        minWidth: 120,
        alignItems: 'center',
    },
    modalBtnConfirmText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
});
