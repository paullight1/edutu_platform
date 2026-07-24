import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Plus,
    ChevronLeft,
    Eye,
    Crown,
    ChevronRight,
    FilePlus,
    Import,
    Target,
    Upload,
    Sparkles,
    GraduationCap,
    Code2,
    FolderOpen,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { BrandedLoader } from '../../../components/ui/BrandedLoader';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../components/context/ThemeContext';
import { CVTemplate, UserCV } from '@edutu/core/src/types/cv';
import * as cvService from '@edutu/core/src/services/cv';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { isAiBillingError } from '@edutu/core/src/services/productApi';
import { useUpgradeSheet } from '../../../components/context/UpgradeSheetContext';
import { buildExportName, exportCVAsPdf } from '../../../lib/exportCv';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { fetchOpportunities } from '@edutu/core/src/services/opportunities';

// Import extracted components
import { CVTemplateCard } from '../../../components/cv/CVTemplateCard';
import { CVListItem } from '../../../components/cv/CVListItem';
import { CVEditor } from '../../../components/cv/CVEditor';
import { CVPreview } from '../../../components/cv/CVPreview';
import { ProUpgradeModal } from '../../../components/cv/ProUpgradeModal';
import { AITailorModal } from '../../../components/cv/AITailorModal';
import { CVTailorResultModal, TailorResult } from '../../../components/cv/CVTailorResultModal';
import { CoverLetterSheet } from '../../../components/cv/CoverLetterSheet';
import { CvToast } from '../../../components/cv/CvToast';
import { CvModalBackdrop } from '../../../components/cv/CvModalBackdrop';
import {
    deriveCvPreviewModel,
    getTemplateAccent,
    TemplateResumePreview,
} from '../../../components/cv/CVTemplateLivePreview';
import { AnimatedPressable } from '../../../components/ui/AnimatedPressable';
import { haptics } from '../../../lib/haptics';

type CVSection = 'templates' | 'editor' | 'preview';

/** Branded "AI draft ready" sheet content — replaces the old Alert.alert. */
interface DraftSheetContent {
    title: string;
    message?: string;
    suggestions: string[];
}

const DRAFT_SUGGESTION_ICONS = [GraduationCap, Code2, FolderOpen];

// Values are i18n keys in the `cv` namespace; translate with t() at render time.
const SAMPLE_BY_CATEGORY = {
    academic: {
        name: 'templates.samples.academic.name',
        headline: 'templates.samples.academic.headline',
        summary: 'templates.samples.academic.summary',
        bullets: ['templates.samples.academic.bullets.0', 'templates.samples.academic.bullets.1', 'templates.samples.academic.bullets.2'],
    },
    professional: {
        name: 'templates.samples.professional.name',
        headline: 'templates.samples.professional.headline',
        summary: 'templates.samples.professional.summary',
        bullets: ['templates.samples.professional.bullets.0', 'templates.samples.professional.bullets.1', 'templates.samples.professional.bullets.2'],
    },
    creative: {
        name: 'templates.samples.creative.name',
        headline: 'templates.samples.creative.headline',
        summary: 'templates.samples.creative.summary',
        bullets: ['templates.samples.creative.bullets.0', 'templates.samples.creative.bullets.1', 'templates.samples.creative.bullets.2'],
    },
    general: {
        name: 'templates.samples.general.name',
        headline: 'templates.samples.general.headline',
        summary: 'templates.samples.general.summary',
        bullets: ['templates.samples.general.bullets.0', 'templates.samples.general.bullets.1', 'templates.samples.general.bullets.2'],
    },
};

function getTemplateSample(template?: CVTemplate | null) {
    const category = template?.category?.toLowerCase() || 'general';
    return SAMPLE_BY_CATEGORY[category as keyof typeof SAMPLE_BY_CATEGORY] || SAMPLE_BY_CATEGORY.general;
}

// Self-contained gradient per category — no fragile external image hotlinks
// that fail on weak connections and leave the preview blank.
const TEMPLATE_PREVIEW_GRADIENTS: Record<string, [string, string]> = {
    academic: ['#2563EB', '#1D4ED8'],
    professional: ['#0F766E', '#0D9488'],
    creative: ['#7C3AED', '#DB2777'],
    general: ['#6366F1', '#8B5CF6'],
};

function getTemplatePreviewGradient(template?: CVTemplate | null): [string, string] {
    const category = template?.category?.toLowerCase() || 'general';
    return TEMPLATE_PREVIEW_GRADIENTS[category] || TEMPLATE_PREVIEW_GRADIENTS.general;
}

function QuickActionCard({
    title,
    subtitle,
    icon: Icon,
    accent,
    colors,
    isDark,
    onPress,
}: {
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    accent: string;
    colors: any;
    isDark: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[
                styles.quickActionCard,
                {
                    backgroundColor: colors.card,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
                },
            ]}
            onPress={onPress}
            activeOpacity={0.85}
        >
            {/* Subtle accent wash so each card stays dark and on-theme */}
            <LinearGradient
                colors={[`${accent}26`, `${accent}0D`, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            <View style={[styles.quickActionIcon, { backgroundColor: `${accent}24` }]}>
                <Icon size={22} color={accent} strokeWidth={2.2} />
            </View>
            <View style={styles.quickActionCopy}>
                <Text style={[styles.quickActionCardTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {title}
                </Text>
                <Text
                    style={[styles.quickActionCardSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}
                    numberOfLines={2}
                >
                    {subtitle}
                </Text>
            </View>
            <View
                style={[
                    styles.quickActionArrow,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
                ]}
            >
                <ChevronRight size={18} color={isDark ? '#E2E8F0' : '#0F172A'} />
            </View>
        </TouchableOpacity>
    );
}

export default function CVBuilderScreen() {
    const { t } = useTranslation('cv');
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const { colors, isDark } = useTheme();
    // Single source of truth for Pro across the whole app (RevenueCat on-device
    // + profiles.is_pro + billing_entitlements). CV used to read profiles.is_pro
    // alone, which disagreed with the rest of the app after an on-device purchase.
    const { isPro } = useProStatus(supabase, user?.id || null);
    const upgradeSheet = useUpgradeSheet();

    const [activeSection, setActiveSection] = useState<CVSection>('templates');
    const [templates, setTemplates] = useState<CVTemplate[]>([]);
    const [userCVs, setUserCVs] = useState<UserCV[]>([]);
    const [, setSelectedTemplate] = useState<CVTemplate | null>(null);
    const [currentCV, setCurrentCV] = useState<Partial<UserCV>>({
        name: t('defaults.myCv'),
        data_json: {},
    });
    const [trialUsed, setTrialUsed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
    const [opportunitiesLoaded, setOpportunitiesLoaded] = useState(false);
    const [isTailoring, setIsTailoring] = useState(false);
    const [isImprovingSummary, setIsImprovingSummary] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Modals
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [upgradeFeature, setUpgradeFeature] = useState<string>('');
    const [showAIModal, setShowAIModal] = useState(false);
    const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
    const [tailorTargetTitle, setTailorTargetTitle] = useState<string | undefined>(undefined);
    // Org (falls back to title) of the last tailored opportunity — used for
    // professional export names like "Amara Okafor - CV - Acme Health.pdf".
    const [tailorTargetOrg, setTailorTargetOrg] = useState<string | undefined>(undefined);
    // Cover letter sheet state (generated for the tailored opportunity).
    const [coverLetter, setCoverLetter] = useState('');
    const [coverLetterVisible, setCoverLetterVisible] = useState(false);
    const [isCoverLetterLoading, setIsCoverLetterLoading] = useState(false);
    const [showLinkedInModal, setShowLinkedInModal] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<CVTemplate | null>(null);
    // Which of the user's CVs feeds the template previews (null = most recent).
    const [previewCvId, setPreviewCvId] = useState<string | null>(null);
    const [linkedInUrl, setLinkedInUrl] = useState('');
    const [isLinkedInImporting, setIsLinkedInImporting] = useState(false);
    // The one-off free CV trial grants premium access for the session so the
    // "Upgrade to Pro" nag disappears the moment the user starts it.
    const [trialActive, setTrialActive] = useState(false);
    // Branded feedback UI replacing system Alert.alert for success paths.
    const [toast, setToast] = useState<string | null>(null);
    const [draftSheet, setDraftSheet] = useState<DraftSheetContent | null>(null);
    // Pre-AI-rewrite summary stash, so the user can undo the rewrite.
    const [summaryUndo, setSummaryUndo] = useState<string | null>(null);
    // "Consider adding" chips already inserted into skills from the tailor sheet.
    const [addedKeywords, setAddedKeywords] = useState<string[]>([]);
    const hideToast = useCallback(() => setToast(null), []);

    // Identity from the signed-in user — used to name the CV after the user and
    // to seed the header even when the profile row is missing/offline.
    const displayName = (
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        user?.firstName ||
        ''
    ).trim();
    const profileFallback = {
        full_name: displayName || undefined,
        email: user?.primaryEmailAddress?.emailAddress || undefined,
    };
    const defaultCvName = () => (displayName ? `${displayName}'s CV` : t('defaults.myCv'));
    const hasPro = isPro || trialActive;

    // Real-data template previews: the selected (or most recent) CV drives the
    // gallery thumbnails and the preview modal. Falls back to the labeled
    // sample persona only when the user has no CV content at all.
    const previewCv =
        userCVs.find((cv) => cv.id === previewCvId) ||
        // Default: the most recent CV that actually has content to show.
        userCVs.find((cv) => deriveCvPreviewModel(cv.data_json)) ||
        null;
    const previewModel = deriveCvPreviewModel(previewCv?.data_json);

    // Server-side billing refusal (402 insufficient credits / 429 fair-use
    // limit) — the backend debits credits for /cv/ai/* itself now.
    const showBillingAlert = (error: unknown): boolean => {
        if (!isAiBillingError(error)) return false;
        // Prefer the shared upgrade bottom sheet; the alert stays as a
        // fallback if the provider isn't mounted for any reason.
        if (upgradeSheet) {
            upgradeSheet.show(error.message);
            return true;
        }
        Alert.alert(
            error.code === 'limit' ? 'Limit reached' : 'Not enough credits',
            error.message,
            [
                { text: t('common:actions.cancel'), style: 'cancel' },
                { text: 'Buy Credits', onPress: () => router.push('/wallet' as never) },
                { text: 'Go Pro', onPress: () => router.push('/paywall' as never) },
            ],
        );
        return true;
    };

    const handleLinkedInSubmit = async () => {
        if (!linkedInUrl || !user) return;
        setIsLinkedInImporting(true);
        try {
            const result = await cvService.generateCVDraftWithAI(supabase, user.id, {
                linkedInUrl,
                currentData: currentCV.data_json,
                prompt: 'scholarships, internships, and early-career opportunities',
                getToken,
                profileFallback,
            });
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                name:
                    result.cv.header?.full_name
                        ? `${result.cv.header.full_name}'s CV`
                        : prev.name || defaultCvName(),
                data_json: result.cv,
            }));
            setIsLinkedInImporting(false);
            setShowLinkedInModal(false);
            setActiveSection('editor');
            const suggestions = result.suggestions.slice(0, 3).filter(Boolean);
            setDraftSheet({
                title: result.source === 'ai' ? t('alerts.aiDraftReadyTitle') : t('alerts.draftReadyOfflineTitle'),
                message: t('alerts.draftReadyMessage'),
                suggestions,
            });
        } catch (error) {
            console.error('AI CV generation error:', error);
            setIsLinkedInImporting(false);
            if (!showBillingAlert(error)) {
                Alert.alert(t('common:states.error'), t('alerts.generateFailed'));
            }
        }
    };

    // First-party import: pick the user's own LinkedIn export (PDF or ZIP) and
    // parse it on our backend — no third-party scraper.
    const handleLinkedInFileImport = async () => {
        try {
            const picked = await DocumentPicker.getDocumentAsync({
                type: [
                    'application/pdf',
                    'application/zip',
                    'application/x-zip-compressed',
                    'multipart/x-zip',
                ],
                copyToCacheDirectory: true,
                multiple: false,
            });
            if (picked.canceled || !picked.assets?.length) return;
            const asset = picked.assets[0];

            setIsLinkedInImporting(true);
            const result = await cvService.importLinkedInFromFile(
                { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined },
                getToken,
            );
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                name: result.cv.header?.full_name
                    ? `${result.cv.header.full_name}'s CV`
                    : prev.name || defaultCvName(),
                data_json: result.cv,
            }));
            setShowLinkedInModal(false);
            setLinkedInUrl('');
            setActiveSection('editor');
            setDraftSheet({
                title: t('alerts.aiDraftReadyTitle'),
                message: t('linkedInModal.importedFromFile'),
                suggestions: [],
            });
        } catch (error: any) {
            console.error('LinkedIn file import error:', error);
            Alert.alert(t('common:states.error'), error?.message || t('alerts.generateFailed'));
        } finally {
            setIsLinkedInImporting(false);
        }
    };

    // Rewrite just the summary with the backend LLM (falls back locally).
    const handleImproveSummary = async () => {
        if (!user || isImprovingSummary) return;
        setIsImprovingSummary(true);
        // Stash the pre-rewrite text so the user can undo the AI rewrite.
        const previousSummary = currentCV.data_json?.summary || '';
        try {
            const result = await cvService.improveCVSummaryWithAI(
                supabase,
                user.id,
                currentCV.data_json || {},
                getToken,
            );
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                data_json: { ...prev.data_json, summary: result.summary },
            }));
            setSummaryUndo(previousSummary);
            setToast(
                result.source === 'local'
                    ? t('toast.summaryUpdatedOffline')
                    : t('toast.summaryUpdated'),
            );
        } catch (error) {
            console.error('Error improving summary:', error);
            if (!showBillingAlert(error)) {
                Alert.alert(t('common:states.error'), t('alerts.improveSummaryFailed'));
            }
        } finally {
            setIsImprovingSummary(false);
        }
    };

    // Restore the summary text stashed before the last AI rewrite.
    const handleUndoSummaryRewrite = () => {
        if (summaryUndo === null) return;
        const restore = summaryUndo;
        haptics.light();
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: { ...prev.data_json, summary: restore },
        }));
        setSummaryUndo(null);
    };

    // One-tap insert from the tailor sheet's "Consider adding" chips: append
    // the keyword to skills (deduped, case-insensitive) and mark it covered.
    const handleAddMissingKeyword = (keyword: string) => {
        const kw = keyword.trim();
        if (!kw) return;
        setCurrentCV((prev: Partial<UserCV>) => {
            const skills = prev.data_json?.skills || [];
            if (skills.some((s: string) => s.toLowerCase() === kw.toLowerCase())) return prev;
            return {
                ...prev,
                data_json: { ...prev.data_json, skills: [...skills, kw] },
            };
        });
        setAddedKeywords((prev) =>
            prev.some((a) => a.toLowerCase() === kw.toLowerCase()) ? prev : [...prev, kw],
        );
    };

    // One-tap fix from the ATS checklist's title_match row: mirror the
    // opportunity's exact title as the CV's title.
    const handleUseProposedTitle = (title: string) => {
        const next = title.trim();
        if (!next) return;
        setCurrentCV((prev: Partial<UserCV>) => ({ ...prev, name: next }));
    };

    // "Make it measurable": append the user's number to the bullet the AI asked
    // about. Only mutates when the target text matches exactly (summary, an
    // experience description, or a highlight); otherwise the question stays
    // guidance-only in the sheet.
    const handleQuantify = (target: string, answer: string): boolean => {
        const trimmedTarget = target.trim();
        const trimmedAnswer = answer.trim();
        if (!trimmedTarget || !trimmedAnswer) return false;

        const data = currentCV.data_json;
        if (!data) return false;
        const appended = `${trimmedTarget} — ${trimmedAnswer}`;
        let applied = false;

        let summary = data.summary;
        if (summary?.trim() === trimmedTarget) {
            summary = appended;
            applied = true;
        }
        const experience = (data.experience || []).map((item) => {
            let next = item;
            if (item.description?.trim() === trimmedTarget) {
                next = { ...next, description: appended };
                applied = true;
            }
            if ((item.highlights || []).some((h) => h.trim() === trimmedTarget)) {
                next = {
                    ...next,
                    highlights: (item.highlights || []).map((h) =>
                        h.trim() === trimmedTarget ? appended : h,
                    ),
                };
                applied = true;
            }
            return next;
        });
        const projects = (data.projects || []).map((item) => {
            if (item.description?.trim() === trimmedTarget) {
                applied = true;
                return { ...item, description: appended };
            }
            return item;
        });

        if (!applied) return false;
        setCurrentCV((prev: Partial<UserCV>) => ({
            ...prev,
            data_json: { ...prev.data_json, summary, experience, projects },
        }));
        return true;
    };

    // Cover letter for the opportunity the CV was last tailored to.
    const handleCoverLetter = async () => {
        const opportunityId = currentCV.target_opportunity_id;
        if (!user || !opportunityId || isCoverLetterLoading) return;
        setCoverLetter('');
        setCoverLetterVisible(true);
        setIsCoverLetterLoading(true);
        try {
            const letter = await cvService.generateCoverLetterWithAI({
                opportunityId,
                currentCVData: currentCV.data_json || {},
                cvId: currentCV.id,
                getToken,
            });
            setCoverLetter(letter);
        } catch (error) {
            console.error('Error generating cover letter:', error);
            setCoverLetterVisible(false);
            if (!showBillingAlert(error)) {
                Alert.alert(t('common:states.error'), t('coverLetter.failed'));
            }
        } finally {
            setIsCoverLetterLoading(false);
        }
    };

    // Promise-chain style (not async/await) so every setState lives in an
    // async callback — the set-state-in-effect rule treats awaited sets in a
    // named async callee as synchronous. `isLoading` starts true, so the mount
    // load needs no synchronous loading flip; manual reloads use reloadData.
    const loadData = useCallback(() => {
        const userId = user?.id || '';
        return Promise.all([
            cvService.fetchCVTemplates(supabase, { includePremium: true }),
            cvService.fetchUserCVs(supabase, userId),
            cvService.getCvTrialStatus(supabase, userId),
        ])
            .then(([templatesData, cvsData, trialStatus]) => {
                setTemplates(templatesData);
                setUserCVs(cvsData);
                setTrialUsed(trialStatus.cvTrialUsed);
            })
            .catch((error) => {
                console.error('Error loading CV data:', error);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [user?.id]);

    // Event-handler refresh: re-raise the loader before refetching (setState
    // in an event handler is fine).
    const reloadData = useCallback(() => {
        setIsLoading(true);
        return loadData();
    }, [loadData]);

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user, loadData]);

    const loadTailorOpportunities = async () => {
        if (!user || opportunitiesLoaded || opportunities.length) return;

        try {
            const opportunityData = await fetchOpportunities({
                supabase,
                userId: user.id,
                force: false,
            });
            setOpportunities(opportunityData.slice(0, 40));
        } catch (error) {
            console.error('Error loading opportunities for tailoring:', error);
        } finally {
            setOpportunitiesLoaded(true);
        }
    };

    const handleSelectTemplate = (template: CVTemplate) => {
        if (template.is_premium && !hasPro) {
            setUpgradeFeature(t('upgrade.templateFeature', { name: template.name }));
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
        setSummaryUndo(null);
        // Seed the header with the signed-in user's identity so the editor never
        // opens as a blank "John Doe" form. The rest stays empty to fill in.
        setCurrentCV({
            name: defaultCvName(),
            data_json: {
                header: {
                    full_name: displayName,
                    email: profileFallback.email || '',
                    phone: '',
                    location: '',
                    linkedin: '',
                    portfolio: '',
                    website: '',
                },
            },
        });
        setActiveSection('editor');
    };

    const handleEditCV = (cv: UserCV) => {
        const template = templates.find(t => t.id === cv.template_id);
        setSelectedTemplate(template || null);
        setSummaryUndo(null);
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

        setIsSaving(true);
        try {
            // Drop empty highlight lines the editor keeps around while typing.
            const cleanList = (items?: any[]) =>
                (items || []).map((item) => ({
                    ...item,
                    ...(Array.isArray(item.highlights)
                        ? { highlights: item.highlights.map((h: string) => h.trim()).filter(Boolean) }
                        : {}),
                }));
            const cvToSave: Partial<UserCV> = {
                ...currentCV,
                name: currentCV.name?.trim() || t('defaults.untitled'),
                data_json: {
                    ...currentCV.data_json,
                    experience: cleanList(currentCV.data_json?.experience),
                    education: cleanList(currentCV.data_json?.education),
                },
            };

            if (cvToSave.id) {
                await cvService.updateUserCV(supabase, cvToSave.id, cvToSave);
            } else {
                const newCV = await cvService.createUserCV(supabase, user.id, cvToSave);
                setCurrentCV((prev: Partial<UserCV>) => ({ ...prev, id: newCV.id }));
            }
            // Refresh the CV list in the background WITHOUT raising the loading
            // screen — reloadData() flips isLoading, which swaps the whole screen
            // to the loader and remounts the editor, resetting its scroll position.
            await loadData();
            setToast(t('toast.saved'));
        } catch (error) {
            console.error('Error saving CV:', error);
            Alert.alert(t('common:states.error'), t('alerts.saveFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCV = async (cvId: string) => {
        Alert.alert(
            t('alerts.deleteTitle'),
            t('alerts.deleteMessage'),
            [
                { text: t('common:actions.cancel'), style: 'cancel' },
                {
                    text: t('common:actions.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await cvService.deleteUserCV(supabase, cvId);
                        } catch (error) {
                            console.error('Error deleting CV:', error);
                            Alert.alert(t('common:states.error'), t('alerts.deleteFailed'));
                        } finally {
                            await reloadData();
                        }
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
        if (isExporting) return;
        setIsExporting(true);
        try {
            // "{Full Name} - CV - {Org}" naming when the CV was tailored to an
            // opportunity this session; plain "{Full Name} - CV" otherwise.
            const mode = await exportCVAsPdf(currentCV, {
                tailoredTo: currentCV.target_opportunity_id ? tailorTargetOrg : undefined,
            });
            if (mode === 'text') {
                Alert.alert(t('alerts.sharedAsTextTitle'), t('alerts.sharedAsTextMessage'));
            }
        } catch (error) {
            console.error('Error exporting CV:', error);
            Alert.alert(t('common:states.error'), t('alerts.exportFailed'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleTrialActivated = async () => {
        if (user) {
            await cvService.useCVTrial(supabase, user.id);
            setTrialUsed(true);
            // Unlock premium for the session so the upgrade nag disappears
            // immediately after the user starts their free trial.
            setTrialActive(true);
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
                getToken,
            });
            setCurrentCV((prev: Partial<UserCV>) => ({
                ...prev,
                data_json: result.tailored_cv,
                match_score: result.match_score,
                target_opportunity_id: opportunityId,
            }));
            setShowAIModal(false);
            setActiveSection('editor');
            // Surface a designed outcome sheet (with a direct PDF export) instead
            // of a raw system alert.
            const targetOpportunity = opportunities.find((o) => o.id === opportunityId);
            setTailorTargetTitle(targetOpportunity?.title);
            setTailorTargetOrg(targetOpportunity?.organization || targetOpportunity?.title);
            setAddedKeywords([]);
            setTailorResult({
                match_score: result.match_score,
                improvements: result.improvements || [],
                matched_keywords: result.matched_keywords || [],
                missing_keywords: result.missing_keywords || [],
                atsChecklist: result.atsChecklist,
                proposedTitle: result.proposedTitle,
                quantifyQuestions: result.quantifyQuestions,
            });
        } catch (error) {
            console.error('Error tailoring CV:', error);
            if (!showBillingAlert(error)) {
                Alert.alert(t('common:states.error'), t('alerts.tailorFailed'));
            }
        } finally {
            setIsTailoring(false);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title={t('header.title')} showBack />
                <View style={styles.loadingContainer}>
                    <BrandedLoader label={t('loading')} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            {/* Single-header rule: the outer screen header only shows on the
                landing (templates) section. The editor and preview each render
                exactly one header row of their own — no stacked back chevrons. */}
            {activeSection === 'templates' && (
                <ScreenHeader
                    title={t('header.title')}
                    showBack
                    right={
                        <TouchableOpacity onPress={handleCreateNewCV}>
                            <Plus size={24} color={colors.primary} />
                        </TouchableOpacity>
                    }
                />
            )}

            {/* Pro Status Banner — hidden once the user is Pro or has an active trial */}
            {!hasPro && (
                <TouchableOpacity
                    style={[styles.proBanner, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}
                    onPress={() => setShowUpgradeModal(true)}
                >
                    <View style={[styles.proBannerIcon, { backgroundColor: '#F59E0B' }]}>
                        <Crown size={18} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.proBannerText, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                        {trialUsed
                            ? t('proBanner.upgrade')
                            : t('proBanner.trial')}
                    </Text>
                    <ChevronRight size={18} color={isDark ? '#FBBF24' : '#D97706'} />
                </TouchableOpacity>
            )}

            {/* Active trial confirmation — replaces the upgrade nag after activation */}
            {trialActive && !isPro && (
                <View style={[styles.proBanner, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#DCFCE7' }]}>
                    <View style={[styles.proBannerIcon, { backgroundColor: '#10B981' }]}>
                        <Crown size={18} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.proBannerText, { color: isDark ? '#34D399' : '#047857' }]}>
                        {t('proBanner.trialActive')}
                    </Text>
                </View>
            )}

            {activeSection === 'templates' && (
                <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Quick Actions Tabs */}
                    <Animated.View entering={FadeInDown} style={styles.quickActionsContainer}>
                        <Text style={[styles.quickActionsTitle, { color: colors.foreground }]}>{t('quickActions.title')}</Text>
                        <Text style={[styles.quickActionsSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                            {t('quickActions.subtitle')}
                        </Text>
                        <QuickActionCard
                            title={t('quickActions.create.title')}
                            subtitle={t('quickActions.create.subtitle')}
                            icon={FilePlus}
                            accent="#6366F1"
                            colors={colors}
                            isDark={isDark}
                            onPress={handleCreateNewCV}
                        />
                        <QuickActionCard
                            title={t('quickActions.linkedIn.title')}
                            subtitle={t('quickActions.linkedIn.subtitle')}
                            icon={Import}
                            accent="#0A66C2"
                            colors={colors}
                            isDark={isDark}
                            onPress={() => setShowLinkedInModal(true)}
                        />
                        <QuickActionCard
                            title={t('quickActions.tailor.title')}
                            subtitle={t('quickActions.tailor.subtitle')}
                            icon={Target}
                            accent="#8B5CF6"
                            colors={colors}
                            isDark={isDark}
                            onPress={handleAITailor}
                        />
                    </Animated.View>

                    {/* Existing CVs */}
                    {userCVs.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(100)}>
                            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('sections.yourCvs')}</Text>
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
                            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 0 }]}>{t('sections.chooseTemplate')}</Text>
                        </View>
                        <FlatList
                            data={templates}
                            renderItem={({ item }) => (
                                <CVTemplateCard
                                    item={item}
                                    onSelect={setPreviewTemplate}
                                    isPro={hasPro}
                                    preview={previewModel}
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
                <View
                    style={[
                        styles.editorHeader,
                        { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                    ]}
                >
                    <TouchableOpacity
                        style={[
                            styles.backBtn,
                            { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
                        ]}
                        onPress={() => setActiveSection('templates')}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <ChevronLeft size={22} color={isDark ? '#FFFFFF' : '#1E293B'} strokeWidth={2.5} />
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
                    isPro={hasPro}
                    isSaving={isSaving}
                    isExporting={isExporting}
                    isImprovingSummary={isImprovingSummary}
                    onSave={handleSaveCV}
                    onExport={handleExport}
                    onAITailor={handleAITailor}
                    onImproveSummary={handleImproveSummary}
                    onUpgradeFeature={(feature) => {
                        setUpgradeFeature(feature);
                        setShowUpgradeModal(true);
                    }}
                    canUndoSummary={summaryUndo !== null}
                    onUndoSummary={handleUndoSummaryRewrite}
                />
            )}

            {activeSection === 'preview' && (
                <CVPreview
                    currentCV={currentCV}
                    onBack={() => setActiveSection('editor')}
                    onExport={handleExport}
                    isExporting={isExporting}
                />
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

            <CVTailorResultModal
                visible={!!tailorResult}
                onClose={() => setTailorResult(null)}
                result={tailorResult}
                opportunityTitle={tailorTargetTitle}
                isExporting={isExporting}
                onExport={handleExport}
                onViewCv={() => setTailorResult(null)}
                onAddKeyword={handleAddMissingKeyword}
                addedKeywords={addedKeywords}
                onUseProposedTitle={handleUseProposedTitle}
                onQuantify={handleQuantify}
                onCoverLetter={currentCV.target_opportunity_id ? handleCoverLetter : undefined}
                isCoverLetterLoading={isCoverLetterLoading}
            />

            <CoverLetterSheet
                visible={coverLetterVisible}
                onClose={() => setCoverLetterVisible(false)}
                letter={coverLetter}
                isLoading={isCoverLetterLoading}
                opportunityTitle={tailorTargetTitle}
                shareTitle={buildExportName({
                    fullName: currentCV.data_json?.header?.full_name,
                    kind: 'Cover Letter',
                    context: tailorTargetOrg,
                })}
            />

            {/* Tailoring in progress — the picker closes on select, so give the
                user clear feedback while the AI reworks the CV. */}
            <Modal visible={isTailoring} transparent animationType="fade">
                <View style={styles.tailoringOverlay}>
                    <View style={[styles.tailoringCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.tailoringText, { color: colors.foreground }]}>
                            {t('tailorModal.working')}
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* LinkedIn Import Modal */}
            <Modal
                visible={!!previewTemplate}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setPreviewTemplate(null)}
            >
                <View style={styles.modalOverlay}>
                    <CvModalBackdrop onPress={() => setPreviewTemplate(null)} />
                    <View style={[styles.sampleModalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <LinearGradient
                            colors={getTemplatePreviewGradient(previewTemplate)}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.sampleHero}
                        >
                            <View style={styles.sampleHeroTop}>
                                <View style={styles.sampleBadge}>
                                    <Text style={styles.sampleBadgeText}>{previewTemplate?.category || t('templates.badgeFallback')}</Text>
                                </View>
                                {previewTemplate?.is_premium && (
                                    <View style={styles.samplePremiumBadge}>
                                        <Crown size={13} color="#FFFFFF" />
                                        <Text style={styles.sampleBadgeText}>{t('templates.proBadge')}</Text>
                                    </View>
                                )}
                            </View>
                        </LinearGradient>

                        <Text style={[styles.sampleTitle, { color: colors.foreground }]}>{previewTemplate?.name}</Text>
                        <Text style={[styles.sampleDesc, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                            {previewTemplate?.description || t(getTemplateSample(previewTemplate).summary)}
                        </Text>

                        {/* Real-data preview: the user's own CV styled by this
                            template. The sample persona only appears (labeled)
                            when there is no CV content to show. */}
                        {previewModel && userCVs.length > 1 && (
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.previewCvSwitcher}
                            >
                                {userCVs.map((cv) => {
                                    const active = previewCv?.id === cv.id;
                                    return (
                                        <AnimatedPressable
                                            key={cv.id}
                                            onPress={() => setPreviewCvId(cv.id)}
                                            style={[
                                                styles.previewCvChip,
                                                {
                                                    backgroundColor: active
                                                        ? colors.primary
                                                        : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.previewCvChipText,
                                                    { color: active ? '#FFFFFF' : colors.foreground },
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {cv.name}
                                            </Text>
                                        </AnimatedPressable>
                                    );
                                })}
                            </ScrollView>
                        )}
                        {previewModel ? (
                            <TemplateResumePreview
                                model={previewModel}
                                accent={getTemplateAccent(previewTemplate?.category)}
                                isDark={isDark}
                            />
                        ) : (
                            <>
                                <View style={[styles.resumeSample, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
                                    <View style={styles.resumeSampleHeader}>
                                        <View>
                                            <Text style={[styles.resumeName, { color: colors.foreground }]}>{t(getTemplateSample(previewTemplate).name)}</Text>
                                            <Text style={[styles.resumeHeadline, { color: '#6366F1' }]}>{t(getTemplateSample(previewTemplate).headline)}</Text>
                                        </View>
                                        <View style={styles.resumeAvatar} />
                                    </View>
                                    <Text style={[styles.resumeSummary, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                                        {t(getTemplateSample(previewTemplate).summary)}
                                    </Text>
                                    {getTemplateSample(previewTemplate).bullets.map((bullet) => (
                                        <View key={bullet} style={styles.resumeBulletRow}>
                                            <View style={styles.resumeBulletDot} />
                                            <Text style={[styles.resumeBulletText, { color: isDark ? '#E2E8F0' : '#334155' }]}>{t(bullet)}</Text>
                                        </View>
                                    ))}
                                </View>
                                <Text style={[styles.sampleFallbackLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                    {t('templates.sampleFallback')}
                                </Text>
                            </>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setPreviewTemplate(null)}>
                                <Text style={styles.modalBtnCancelText}>{t('common:actions.close')}</Text>
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
                                    {previewTemplate?.is_premium && !hasPro ? t('templates.unlock') : t('templates.use')}
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
                    <CvModalBackdrop
                        onPress={isLinkedInImporting ? undefined : () => setShowLinkedInModal(false)}
                    />
                    <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                        <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('linkedInModal.title')}</Text>
                        <Text style={styles.modalDesc}>{t('linkedInModal.description')}</Text>

                        <TextInput
                            style={[styles.linkInput, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9', color: colors.foreground }]}
                            placeholder="https://linkedin.com/in/username"
                            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                            value={linkedInUrl}
                            onChangeText={setLinkedInUrl}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={styles.linkedInDivider}>
                            <View style={[styles.linkedInDividerLine, { backgroundColor: colors.border }]} />
                            <Text style={[styles.linkedInDividerText, { color: isDark ? '#64748B' : '#94A3B8' }]}>{t('linkedInModal.or')}</Text>
                            <View style={[styles.linkedInDividerLine, { backgroundColor: colors.border }]} />
                        </View>

                        <TouchableOpacity
                            style={[styles.uploadExportBtn, { borderColor: colors.border, opacity: isLinkedInImporting ? 0.7 : 1 }]}
                            onPress={handleLinkedInFileImport}
                            disabled={isLinkedInImporting}
                        >
                            <Upload size={18} color={colors.primary} />
                            <Text style={[styles.uploadExportText, { color: colors.foreground }]}>
                                {t('linkedInModal.uploadExport')}
                            </Text>
                        </TouchableOpacity>
                        <Text style={[styles.linkedInHint, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                            {t('linkedInModal.uploadHint')}
                        </Text>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowLinkedInModal(false)} disabled={isLinkedInImporting}>
                                <Text style={styles.modalBtnCancelText}>{t('common:actions.cancel')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtnConfirm, { backgroundColor: colors.primary, opacity: isLinkedInImporting ? 0.7 : 1 }]}
                                onPress={handleLinkedInSubmit}
                                disabled={isLinkedInImporting || !linkedInUrl}
                            >
                                {isLinkedInImporting ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.modalBtnConfirmText}>{t('linkedInModal.generate')}</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* AI draft ready — branded bottom sheet replacing Alert.alert */}
            <Modal
                visible={!!draftSheet}
                animationType="fade"
                transparent
                onRequestClose={() => setDraftSheet(null)}
            >
                <View style={styles.sheetOverlay}>
                    <CvModalBackdrop onPress={() => setDraftSheet(null)} />
                    <Animated.View
                        entering={FadeInUp.springify().damping(18)}
                        style={[styles.draftSheetCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
                    >
                        <View style={[styles.draftSheetIconCircle, { backgroundColor: `${colors.primary}1F` }]}>
                            <Sparkles size={40} color={colors.primary} strokeWidth={1.8} />
                        </View>
                        <Text style={[styles.draftSheetTitle, { color: colors.foreground }]}>
                            {draftSheet?.title}
                        </Text>
                        {!!draftSheet?.message && (
                            <Text style={[styles.draftSheetMessage, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                {draftSheet.message}
                            </Text>
                        )}
                        {(draftSheet?.suggestions.length ?? 0) > 0 && (
                            <View style={styles.draftSheetSteps}>
                                <Text style={[styles.draftSheetStepsTitle, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                                    {t('draftSheet.nextSteps')}
                                </Text>
                                {draftSheet?.suggestions.map((suggestion, index) => {
                                    const StepIcon = DRAFT_SUGGESTION_ICONS[index % DRAFT_SUGGESTION_ICONS.length];
                                    return (
                                        <View key={`step-${index}`} style={styles.draftSheetStepRow}>
                                            <View style={[styles.draftSheetStepIcon, { backgroundColor: `${colors.primary}14` }]}>
                                                <StepIcon size={16} color={colors.primary} />
                                            </View>
                                            <Text style={[styles.draftSheetStepText, { color: isDark ? '#E2E8F0' : '#334155' }]}>
                                                {suggestion}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                        <TouchableOpacity
                            style={[styles.draftSheetCta, { backgroundColor: colors.primary }]}
                            onPress={() => setDraftSheet(null)}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.draftSheetCtaText}>{t('draftSheet.gotIt')}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>

            {/* Branded success toast — replaces Alert.alert for saves */}
            <CvToast message={toast} onHide={hideToast} />

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
        minHeight: 92,
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 14,
        elevation: 4,
    },
    quickActionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickActionCopy: {
        flex: 1,
    },
    quickActionCardTitle: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '800',
    },
    quickActionCardSubtitle: {
        fontSize: 12.5,
        lineHeight: 17,
        marginTop: 3,
        fontWeight: '600',
    },
    quickActionArrow: {
        width: 34,
        height: 34,
        borderRadius: 17,
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
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
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
    sheetOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    draftSheetCard: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 36,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
        elevation: 12,
    },
    draftSheetIconCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    draftSheetTitle: {
        fontSize: 21,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 8,
    },
    draftSheetMessage: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        marginBottom: 18,
    },
    draftSheetSteps: {
        alignSelf: 'stretch',
        marginBottom: 20,
    },
    draftSheetStepsTitle: {
        fontSize: 13,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: 10,
    },
    draftSheetStepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
    },
    draftSheetStepIcon: {
        width: 30,
        height: 30,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    draftSheetStepText: {
        flex: 1,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '500',
        paddingTop: 5,
    },
    draftSheetCta: {
        alignSelf: 'stretch',
        paddingVertical: 15,
        borderRadius: 16,
        alignItems: 'center',
    },
    draftSheetCtaText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    tailoringOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    tailoringCard: {
        paddingVertical: 28,
        paddingHorizontal: 36,
        borderRadius: 20,
        alignItems: 'center',
        gap: 16,
        minWidth: 200,
    },
    tailoringText: {
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
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
        justifyContent: 'flex-start',
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
    previewCvSwitcher: {
        gap: 8,
        paddingBottom: 12,
    },
    previewCvChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        maxWidth: 180,
    },
    previewCvChipText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    sampleFallbackLabel: {
        fontSize: 12,
        lineHeight: 16,
        textAlign: 'center',
        fontStyle: 'italic',
        marginTop: -8,
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
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.2)',
    },
    linkedInDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    linkedInDividerLine: {
        flex: 1,
        height: 1,
    },
    linkedInDividerText: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    uploadExportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
    },
    uploadExportText: {
        fontSize: 15,
        fontWeight: '600',
    },
    linkedInHint: {
        fontSize: 12,
        lineHeight: 16,
        marginTop: 8,
        marginBottom: 20,
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
