import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity,
    StyleSheet, ActivityIndicator, Modal, TextInput, Alert, Dimensions, Platform,
    Animated, Image, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useTranslation, Trans } from 'react-i18next';
import {
    TrendingUp, BookOpen, Calendar, Users, Plus,
    DollarSign, Star, X, CheckCircle, ChevronRight,
    LayoutGrid, Award, Briefcase, Clock, Upload,
    ChevronLeft, ChevronDown, FileText, Link,
    ArrowRight, Info, AlertCircle, Sparkles, Target,
    Map, Eye, PenLine, Trash2
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { LoadState } from '../../components/ui/LoadState';
import { supabase } from '../../lib/supabase';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadCommunityAsset } from '@edutu/core/src/services/storage';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import { useCreatorAccess, CreatorStatus } from '@edutu/core/src/hooks/useCreatorAccess';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_SPACING = 16;
const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');

/** fetch() that aborts after `ms` so a cold Render backend can't hang the UI forever. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const CATEGORY_COLORS: Record<string, { primary: string; secondary: string; gradient: string[] }> = {
    course: { primary: '#3B82F6', secondary: '#60A5FA', gradient: ['#3B82F6', '#2563EB'] },
    event: { primary: '#3b82f6', secondary: '#60a5fa', gradient: ['#3b82f6', '#2563eb'] },
    mentorship: { primary: '#10B981', secondary: '#34D399', gradient: ['#10B981', '#059669'] },
    template: { primary: '#F59E0B', secondary: '#FBBF24', gradient: ['#F59E0B', '#D97706'] },
    resource: { primary: '#94A3B8', secondary: '#CBD5E1', gradient: ['#94A3B8', '#64748B'] },
};

type WizardStep = 'basics' | 'curriculum' | 'resources' | 'review';

interface RoadmapStage {
    id: string;
    title: string;
    description: string;
    duration: string;
}

interface Resource {
    title: string;
    type: string;
    url: string;
    fileName?: string;
}

export default function CreatorDashboard() {
    const { t } = useTranslation('misc');
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { isLoading: accessLoading, isApproved, isPending, isRejected, checkAccess } = useCreatorAccess(supabase, user?.id || null);

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dashError, setDashError] = useState<string | null>(null);
    // The roadmaps list failed to load and degraded to empty — distinct from a
    // genuinely empty list so the UI can offer a retry instead of lying.
    const [listDegraded, setListDegraded] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep>('basics');
    const [creating, setCreating] = useState(false);
    const [uploadingThumb, setUploadingThumb] = useState(false);
    // When set, the wizard edits an existing personal roadmap (PUT) instead of creating.
    const [editingId, setEditingId] = useState<string | null>(null);
    // Approved creators can promote a creation to the public catalog; everyone
    // else creates a private "My Roadmaps" entry.
    const [publishPublicly, setPublishPublicly] = useState(false);
    const [rowBusyId, setRowBusyId] = useState<string | null>(null);

    const [newListing, setNewListing] = useState({
        title: '', description: '', category: 'course',
        price: '0', experiences: '', image_url: '',
    });
    const [roadmapStages, setRoadmapStages] = useState<RoadmapStage[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [checklistItems, setChecklistItems] = useState<any[]>([]);

    const scrollX = useRef(new Animated.Value(0)).current;
    const flatListRef = useRef<any>(null);

    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc';

    const fetchDashboard = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setDashError(null);
        setListDegraded(false);
        try {
            const token = await getToken();

            // Real "My Roadmaps" — everything this user has authored (personal +
            // any they've published). Source of truth is the roadmaps table via
            // the backend, not community_posts.
            //
            // The roadmaps load must never hard-block Creator Studio: a creator
            // with zero roadmaps, an offline device, or a backend that hasn't
            // shipped /roadmaps/mine yet should all land on the same usable
            // empty dashboard (they can still create). So any non-ok response or
            // network error degrades to an empty list instead of an error screen.
            let list: any[] = [];
            try {
                const res = await fetchWithTimeout(`${API_URL}/roadmaps/mine`, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                });
                if (res.ok) {
                    const mine = await res.json();
                    list = Array.isArray(mine) ? mine : [];
                } else {
                    console.warn(`Creator dashboard: /roadmaps/mine returned ${res.status}; showing empty state`);
                    setListDegraded(true);
                }
            } catch (e) {
                console.warn('Creator dashboard: roadmaps request failed; showing empty state', e);
                setListDegraded(true);
            }

            // Credits are a nice-to-have stat — never let them block the screen.
            let credits = 0;
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('credits')
                    .eq('user_id', toSafeUUID(user.id))
                    .single();
                credits = profile?.credits || 0;
            } catch { /* ignore */ }

            setData({
                listings: list.map((r: any) => ({
                    id: r.id,
                    title: r.title,
                    category: r.category || 'general',
                    status: r.status === 'published' ? 'published' : 'personal',
                    enrollmentCount: r.enrollment_count ?? r.enrollmentCount ?? 0,
                    raw: r,
                })),
                totalEarnings: credits,
                totalEnrollments: list.reduce(
                    (acc: number, r: any) => acc + (r.enrollment_count ?? r.enrollmentCount ?? 0),
                    0,
                ),
                totalListings: list.length,
            });
        } catch (e: any) {
            console.error('Failed to load creator dashboard:', e);
            setDashError(e?.message || t('creatorDashboard.errors.loadRoadmaps'));
        } finally {
            setLoading(false);
        }
    }, [user, getToken, t]);

    // Everyone can use Creator Studio now (personal roadmaps). Load once the
    // access check resolves so `isApproved` is known for the publish toggle.
    useEffect(() => {
        if (user && !accessLoading) fetchDashboard();
    }, [user, accessLoading, fetchDashboard]);

    const retryLoading = useCallback(() => {
        setDashError(null);
        setLoading(true);
        checkAccess();
        fetchDashboard();
    }, [checkAccess, fetchDashboard]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchDashboard();
        setRefreshing(false);
    }, [fetchDashboard]);

    const handleUploadThumbnail = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
            });

            if (result.canceled) return;

            const file = result.assets[0];
            setUploadingThumb(true);
            const { url, error } = await uploadCommunityAsset(supabase, {
                uri: file.uri,
                name: 'thumbnail.jpg',
                type: file.mimeType || 'image/jpeg'
            }, toSafeUUID(user!.id));

            if (error) throw error;
            setNewListing(p => ({ ...p, image_url: url || '' }));
            Alert.alert(t('common:states.success'), t('creatorDashboard.alerts.thumbnailUploaded'));
        } catch (err: any) {
            Alert.alert(t('creatorDashboard.alerts.uploadFailedTitle'), err.message);
        } finally {
            setUploadingThumb(false);
        }
    };

    const handleUploadResource = async (index: number) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true
            });

            if (result.canceled) return;

            const file = result.assets[0];
            const { url, error } = await uploadCommunityAsset(supabase, {
                uri: file.uri,
                name: file.name || 'resource',
                type: file.mimeType || 'application/octet-stream'
            }, toSafeUUID(user!.id));

            if (error) throw error;

            const updated = [...resources];
            updated[index] = { ...updated[index], url: url || '', fileName: file.name };
            setResources(updated);
            Alert.alert(t('common:states.success'), t('creatorDashboard.alerts.fileUploaded'));
        } catch (err: any) {
            Alert.alert(t('creatorDashboard.alerts.uploadFailedTitle'), err.message);
        }
    };

    const handleCreateListing = async () => {
        if (!newListing.title || !newListing.description) {
            Alert.alert(t('creatorDashboard.alerts.missingInfoTitle'), t('creatorDashboard.alerts.missingInfoMessage'));
            return;
        }
        if (roadmapStages.length === 0) {
            Alert.alert(t('creatorDashboard.alerts.missingCurriculumTitle'), t('creatorDashboard.alerts.missingCurriculumMessage'));
            return;
        }

        setCreating(true);
        try {
            const token = await getToken();
            const categoryMap: Record<string, string> = {
                course: 'education',
                event: 'career',
                mentorship: 'career',
                template: 'skills',
                resource: 'skills',
            };
            // Route by intent:
            //  - editing an existing roadmap → PUT /roadmaps/mine/:id
            //  - approved creator opting to publish → POST /roadmaps/creator (public catalog)
            //  - everyone else → POST /roadmaps/mine (private "My Roadmaps")
            const goingPublic = !editingId && isApproved && publishPublicly;
            const wasPublished = editingId
                ? data?.listings?.find((l: any) => l.id === editingId)?.status === 'published'
                : false;
            const endpoint = editingId
                ? `${API_URL}/roadmaps/mine/${editingId}`
                : goingPublic
                    ? `${API_URL}/roadmaps/creator`
                    : `${API_URL}/roadmaps/mine`;
            const method = editingId ? 'PUT' : 'POST';

            const response = await fetchWithTimeout(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    title: newListing.title.trim(),
                    description: [
                        newListing.description.trim(),
                        newListing.experiences.trim(),
                    ].filter(Boolean).join('\n\n'),
                    category: categoryMap[newListing.category] || 'general',
                    difficulty: 'intermediate',
                    estimatedDuration: 'Varies',
                    outcomes: checklistItems.join('\n'),
                    coverImage: newListing.image_url || '',
                    creatorProof: {
                        name: user?.fullName || 'Creator',
                        avatar: user?.imageUrl,
                        email: user?.primaryEmailAddress?.emailAddress,
                        price: newListing.price || '0',
                        verified: isApproved,
                        // The backend category enum is coarser than the wizard's
                        // (course/event/… collapse into education/career/skills), so
                        // keep the wizard's own key here for a lossless edit round-trip.
                        wizardCategory: newListing.category,
                    },
                    steps: roadmapStages.map((stage, index) => ({
                        id: stage.id,
                        title: stage.title.trim(),
                        description: stage.description.trim() || `${stage.title.trim()} action plan and learner tasks.`,
                        duration: stage.duration.trim() || undefined,
                        phase: `Stage ${index + 1}`,
                        taskType: 'task',
                    })),
                    resources: (resources || [])
                        .filter((resource) => resource.title.trim())
                        .map((resource, index) => ({
                            id: `resource-${index + 1}`,
                            title: resource.title.trim(),
                            url: resource.url || '',
                            type: resource.type === 'pdf' ? 'document' : resource.type === 'video' ? 'video' : 'link',
                        })),
                    relatedOpportunities: [],
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(data?.message || data?.error || t('creatorDashboard.alerts.publishFailed'));
            }

            // Visibility is deliberately not part of PUT /roadmaps/mine/:id (the
            // backend strips status there), so an edit that flips the toggle goes
            // through the dedicated publish/unpublish endpoints afterwards.
            const visibilityChanged = !!editingId && isApproved && publishPublicly !== wasPublished;
            if (visibilityChanged) {
                const visRes = await fetchWithTimeout(
                    `${API_URL}/roadmaps/mine/${editingId}/${publishPublicly ? 'publish' : 'unpublish'}`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                    },
                );
                if (!visRes.ok) throw new Error(t('creatorDashboard.errors.visibilityFailed'));
            }

            const wasEditing = !!editingId;
            resetWizard();
            setShowWizard(false);
            await fetchDashboard();
            Alert.alert(
                wasEditing
                    ? t('creatorDashboard.alerts.updatedTitle')
                    : t('creatorDashboard.alerts.savedTitle'),
                wasEditing
                    ? visibilityChanged
                        ? publishPublicly
                            ? t('creatorDashboard.alerts.publishedMessage')
                            : t('creatorDashboard.alerts.unpublishedMessage')
                        : t('creatorDashboard.alerts.updatedMessage')
                    : goingPublic
                        ? t('creatorDashboard.alerts.publishedMessage')
                        : t('creatorDashboard.alerts.savedMessage'),
            );
        } catch (error: any) {
            const message = error?.name === 'AbortError'
                ? t('creatorDashboard.errors.timeout')
                : error?.message || t('creatorDashboard.alerts.failedFallback');
            Alert.alert(t('creatorDashboard.alerts.failedTitle'), message);
        } finally {
            setCreating(false);
        }
    };

    const resetWizard = useCallback(() => {
        setWizardStep('basics');
        setNewListing({ title: '', description: '', category: 'course', price: '0', experiences: '', image_url: '' });
        setRoadmapStages([]);
        setResources([]);
        setChecklistItems([]);
        setEditingId(null);
        setPublishPublicly(false);
    }, []);

    const openCreateWizard = useCallback(() => {
        resetWizard();
        setShowWizard(true);
    }, [resetWizard]);

    // Prefill the wizard from an existing personal roadmap for editing.
    const openEditWizard = useCallback((listing: any) => {
        const r = listing?.raw || {};
        const reverseCat: Record<string, string> = {
            education: 'course', career: 'event', skills: 'template',
        };
        // creatorProof.wizardCategory keeps the wizard's own key (the backend enum
        // is coarser); the reverse map is only a fallback for older roadmaps.
        const proof = r.creator_proof || r.creatorProof || {};
        setEditingId(listing.id);
        setPublishPublicly(listing.status === 'published');
        setNewListing({
            title: r.title || '',
            description: (r.description || '').split('\n\n')[0] || r.description || '',
            category: proof.wizardCategory || reverseCat[r.category] || 'course',
            price: String(r.creator_proof?.price ?? r.creatorProof?.price ?? '0'),
            experiences: '',
            image_url: r.cover_image || r.coverImage || '',
        });
        setRoadmapStages(
            (Array.isArray(r.steps) ? r.steps : []).map((s: any) => ({
                id: s.id || Math.random().toString(),
                title: s.title || '',
                description: s.description || '',
                duration: s.duration || '',
            })),
        );
        setResources(
            (Array.isArray(r.resources) ? r.resources : []).map((res: any) => ({
                title: res.title || '', type: res.type || 'resource', url: res.url || '',
            })),
        );
        setChecklistItems([]);
        setWizardStep('basics');
        setShowWizard(true);
    }, []);

    const handleDeleteRoadmap = useCallback((listing: any) => {
        Alert.alert(
            t('creatorDashboard.deleteConfirm.title'),
            t('creatorDashboard.deleteConfirm.message', { title: listing.title }),
            [
                { text: t('common:actions.cancel'), style: 'cancel' },
                {
                    text: t('common:actions.delete'),
                    style: 'destructive',
                    onPress: async () => {
                        setRowBusyId(listing.id);
                        try {
                            const token = await getToken();
                            const res = await fetchWithTimeout(`${API_URL}/roadmaps/mine/${listing.id}`, {
                                method: 'DELETE',
                                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            });
                            if (!res.ok) throw new Error(t('creatorDashboard.errors.deleteFailed'));
                            await fetchDashboard();
                        } catch (e: any) {
                            Alert.alert(t('creatorDashboard.alerts.failedTitle'), e?.message || t('creatorDashboard.errors.deleteFailed'));
                        } finally {
                            setRowBusyId(null);
                        }
                    },
                },
            ],
        );
    }, [getToken, fetchDashboard, t]);

    // Turn a roadmap the user owns into trackable goals (adopt → Goals section).
    const handleFollowRoadmap = useCallback(async (listing: any) => {
        setRowBusyId(listing.id);
        try {
            const token = await getToken();
            const res = await fetchWithTimeout(`${API_URL}/roadmaps/adopt/${listing.id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({}),
            });
            if (!res.ok) throw new Error(t('creatorDashboard.errors.followFailed'));
            Alert.alert(t('creatorDashboard.followSuccess.title'), t('creatorDashboard.followSuccess.message'));
        } catch (e: any) {
            Alert.alert(t('creatorDashboard.alerts.failedTitle'), e?.message || t('creatorDashboard.errors.followFailed'));
        } finally {
            setRowBusyId(null);
        }
    }, [getToken, t]);

    const canProceedToNextStep = (): boolean => {
        switch (wizardStep) {
            case 'basics':
                return !!newListing.title.trim() && !!newListing.description.trim();
            case 'curriculum':
                return roadmapStages.length > 0 && roadmapStages.every(s => s.title.trim());
            case 'resources':
                return true;
            case 'review':
                return true;
            default:
                return false;
        }
    };

    const nextStep = () => {
        if (wizardStep === 'basics') setWizardStep('curriculum');
        else if (wizardStep === 'curriculum') setWizardStep('resources');
        else if (wizardStep === 'resources') setWizardStep('review');
    };

    const prevStep = () => {
        if (wizardStep === 'curriculum') setWizardStep('basics');
        else if (wizardStep === 'resources') setWizardStep('curriculum');
        else if (wizardStep === 'review') setWizardStep('resources');
    };

    // ─── LOADING / ERROR STATES ────────────────────────────────────────────
    if (accessLoading || loading) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title={t('creatorDashboard.title')} showBack />
                <LoadState
                    label={t('creatorDashboard.loading')}
                    onRetry={retryLoading}
                    onBack={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
                />
            </SafeAreaView>
        );
    }

    if (dashError) {
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
                <ScreenHeader title={t('creatorDashboard.title')} showBack />
                <LoadState
                    error
                    label={t('creatorDashboard.loading')}
                    onRetry={retryLoading}
                    onBack={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
                />
            </SafeAreaView>
        );
    }

    // ─── DASHBOARD (open to everyone — personal roadmaps for all) ────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('creatorDashboard.title')} showBack subtitle={t('creatorDashboard.subtitle')} />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
            >
                {/* Welcome Header */}
                <View style={styles.headerSection}>
                    <View style={styles.welcomeTextGroup}>
                        <Text style={[styles.welcomeGreeting, { color: textSecondary }]}>{t('creatorDashboard.welcomeGreeting')}</Text>
                        <Text style={[styles.welcomeName, { color: textPrimary }]}>{user?.firstName || t('creatorDashboard.creatorFallback')}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.createBtn, { backgroundColor: colors.accent }]}
                        onPress={openCreateWizard}
                        activeOpacity={0.8}
                    >
                        <Plus color="white" size={18} />
                        <Text style={styles.createBtnText}>{t('creatorDashboard.createRoadmap')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Stats Cards - Horizontal Scrollable */}
                <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('creatorDashboard.overview')}</Text>
                <Animated.ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.statsScroll}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
                    snapToInterval={CARD_WIDTH + CARD_SPACING}
                    decelerationRate="fast"
                >
                    {[
                        { label: t('creatorDashboard.stats.totalCredits'), value: data?.totalEarnings ?? 0, icon: DollarSign, color: '#10B981', gradient: ['#10B981', '#059669'] },
                        { label: t('creatorDashboard.stats.totalStudents'), value: data?.totalEnrollments ?? 0, icon: Users, color: '#3B82F6', gradient: ['#3B82F6', '#2563EB'] },
                        { label: t('creatorDashboard.stats.roadmaps'), value: data?.totalListings ?? 0, icon: LayoutGrid, color: '#3b82f6', gradient: ['#3b82f6', '#2563eb'] },
                    ].map((stat, i) => (
                        <Animated.View
                            key={i}
                            style={[
                                styles.statCard,
                                {
                                    transform: [{
                                        scale: scrollX.interpolate({
                                            inputRange: [
                                                (i - 1) * (CARD_WIDTH + CARD_SPACING),
                                                i * (CARD_WIDTH + CARD_SPACING),
                                                (i + 1) * (CARD_WIDTH + CARD_SPACING),
                                            ],
                                            outputRange: [0.92, 1, 0.92],
                                            extrapolate: 'clamp',
                                        })
                                    }]
                                }
                            ]}
                        >
                            <LinearGradient
                                colors={stat.gradient as [string, string]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.statCardGradient}
                            >
                                <View style={styles.statIconBox}>
                                    <stat.icon color="white" size={24} />
                                </View>
                                <Text style={styles.statValue}>{stat.value}</Text>
                                <Text style={styles.statLabel}>{stat.label}</Text>
                            </LinearGradient>
                        </Animated.View>
                    ))}
                </Animated.ScrollView>

                {/* Status banner: rewards (approved) / under review (pending) /
                    not approved + reapply (rejected) / publish upsell (never applied) */}
                {isPending ? (
                    <View style={styles.rewardBanner}>
                        <LinearGradient
                            colors={isDark ? ['#1E1B4B', '#312E81'] : ['#E0E7FF', '#C7D2FE']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.rewardGradient}
                        >
                            <Clock color={isDark ? "#818CF8" : "#4F46E5"} size={28} />
                            <View style={styles.rewardTextGroup}>
                                <Text style={[styles.rewardTitle, { color: isDark ? "white" : "#1E1B4B" }]}>{t('creatorDashboard.access.pendingBadge')}</Text>
                                <Text style={[styles.rewardText, { color: isDark ? "#A5B4FC" : "#4338CA" }]}>{t('creatorDashboard.access.pendingDesc')}</Text>
                            </View>
                        </LinearGradient>
                    </View>
                ) : isRejected ? (
                    <TouchableOpacity
                        style={styles.rewardBanner}
                        activeOpacity={0.85}
                        onPress={() => router.push('/creator-apply')}
                    >
                        <LinearGradient
                            colors={isDark ? ['#1E1B4B', '#312E81'] : ['#E0E7FF', '#C7D2FE']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.rewardGradient}
                        >
                            <AlertCircle color={isDark ? "#818CF8" : "#4F46E5"} size={28} />
                            <View style={styles.rewardTextGroup}>
                                <Text style={[styles.rewardTitle, { color: isDark ? "white" : "#1E1B4B" }]}>{t('creatorDashboard.access.rejectedBadge')}</Text>
                                <Text style={[styles.rewardText, { color: isDark ? "#A5B4FC" : "#4338CA" }]}>{t('creatorDashboard.access.rejectedDesc')}</Text>
                            </View>
                            <ChevronRight color={isDark ? "#A5B4FC" : "#4338CA"} size={20} />
                        </LinearGradient>
                    </TouchableOpacity>
                ) : isApproved ? (
                    <View style={styles.rewardBanner}>
                        <LinearGradient
                            colors={isDark ? ['#1E1B4B', '#312E81'] : ['#E0E7FF', '#C7D2FE']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.rewardGradient}
                        >
                            <Award color={isDark ? "#818CF8" : "#4F46E5"} size={28} />
                            <View style={styles.rewardTextGroup}>
                                <Text style={[styles.rewardTitle, { color: isDark ? "white" : "#1E1B4B" }]}>{t('creatorDashboard.rewards.title')}</Text>
                                <Text style={[styles.rewardText, { color: isDark ? "#A5B4FC" : "#4338CA" }]}>
                                    <Trans t={t} i18nKey="creatorDashboard.rewards.text" components={{ bold: <Text style={{ fontWeight: '800' }} /> }} />
                                </Text>
                            </View>
                        </LinearGradient>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.rewardBanner}
                        activeOpacity={0.85}
                        onPress={() => router.push('/creator-apply')}
                    >
                        <LinearGradient
                            colors={isDark ? ['#1E1B4B', '#312E81'] : ['#E0E7FF', '#C7D2FE']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.rewardGradient}
                        >
                            <Sparkles color={isDark ? "#818CF8" : "#4F46E5"} size={28} />
                            <View style={styles.rewardTextGroup}>
                                <Text style={[styles.rewardTitle, { color: isDark ? "white" : "#1E1B4B" }]}>{t('creatorDashboard.upsell.title')}</Text>
                                <Text style={[styles.rewardText, { color: isDark ? "#A5B4FC" : "#4338CA" }]}>{t('creatorDashboard.upsell.text')}</Text>
                            </View>
                            <ChevronRight color={isDark ? "#A5B4FC" : "#4338CA"} size={20} />
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* My Roadmaps Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <Map size={18} color={colors.accent} />
                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('creatorDashboard.myRoadmaps')}</Text>
                        </View>
                    </View>

                    {listDegraded && (
                        <TouchableOpacity
                            style={[styles.infoCallout, { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)', marginHorizontal: 0 }]}
                            activeOpacity={0.8}
                            onPress={retryLoading}
                        >
                            <AlertCircle size={16} color="#F59E0B" />
                            <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                {t('creatorDashboard.listDegraded')}{' '}
                                <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('creatorDashboard.listDegradedRetry')}</Text>
                            </Text>
                        </TouchableOpacity>
                    )}

                    {(!data?.listings || data.listings.length === 0) ? (
                        <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor }]}>
                            <View style={[styles.emptyIconBox, { backgroundColor: `${colors.accent}10` }]}>
                                <BookOpen color={colors.accent} size={36} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('creatorDashboard.empty.title')}</Text>
                            <Text style={[styles.emptySubtext, { color: textSecondary }]}>
                                {t('creatorDashboard.empty.subtext')}
                            </Text>
                            <TouchableOpacity
                                style={[styles.emptyBtn, { backgroundColor: colors.accent }]}
                                onPress={openCreateWizard}
                            >
                                <Plus size={18} color="white" />
                                <Text style={styles.emptyBtnText}>{t('creatorDashboard.empty.cta')}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        data.listings.map((listing: any) => {
                            const catColor = CATEGORY_COLORS[listing.category]?.primary || '#94A3B8';
                            const isPublished = listing.status === 'published';
                            const busy = rowBusyId === listing.id;
                            return (
                                <View
                                    key={listing.id}
                                    style={[styles.listingCard, styles.listingCardColumn, { backgroundColor: cardBg, borderColor }]}
                                >
                                    <View style={styles.listingTopRow}>
                                        <View style={[styles.listingIcon, { backgroundColor: `${catColor}15` }]}>
                                            <BookOpen color={catColor} size={22} />
                                        </View>
                                        <View style={styles.listingInfo}>
                                            <Text style={[styles.listingTitle, { color: textPrimary }]} numberOfLines={1}>{listing.title}</Text>
                                            <View style={styles.listingMeta}>
                                                <View style={[styles.listingBadge, { backgroundColor: `${catColor}12` }]}>
                                                    <Text style={[styles.listingBadgeText, { color: catColor, textTransform: 'capitalize' }]}>{listing.category}</Text>
                                                </View>
                                                <View style={[styles.listingBadge, {
                                                    backgroundColor: isPublished ? 'rgba(16, 185, 129, 0.12)' : `${colors.accent}12`
                                                }]}>
                                                    <View style={[styles.statusDot, { backgroundColor: isPublished ? '#10B981' : colors.accent }]} />
                                                    <Text style={[styles.listingBadgeText, { color: isPublished ? '#10B981' : colors.accent }]}>
                                                        {isPublished ? t('creatorDashboard.badge.published') : t('creatorDashboard.badge.personal')}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                        {isPublished && (
                                            <View style={styles.enrollBox}>
                                                <Users size={12} color={textSecondary} />
                                                <Text style={[styles.enrollText, { color: textSecondary }]}>{listing.enrollmentCount}</Text>
                                            </View>
                                        )}
                                    </View>

                                    <View style={[styles.rowActions, { borderTopColor: borderColor }]}>
                                        <TouchableOpacity style={styles.rowActionBtn} disabled={busy} onPress={() => handleFollowRoadmap(listing)}>
                                            {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Target size={15} color={colors.accent} />}
                                            <Text style={[styles.rowActionText, { color: colors.accent }]}>{t('creatorDashboard.actions.follow')}</Text>
                                        </TouchableOpacity>
                                        <View style={[styles.rowActionDivider, { backgroundColor: borderColor }]} />
                                        <TouchableOpacity style={styles.rowActionBtn} disabled={busy} onPress={() => openEditWizard(listing)}>
                                            <PenLine size={15} color={textSecondary} />
                                            <Text style={[styles.rowActionText, { color: textSecondary }]}>{t('creatorDashboard.actions.edit')}</Text>
                                        </TouchableOpacity>
                                        <View style={[styles.rowActionDivider, { backgroundColor: borderColor }]} />
                                        <TouchableOpacity style={styles.rowActionBtn} disabled={busy} onPress={() => handleDeleteRoadmap(listing)}>
                                            <Trash2 size={15} color="#EF4444" />
                                            <Text style={[styles.rowActionText, { color: '#EF4444' }]}>{t('common:actions.delete')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>
            </ScrollView>

            {/* ─── MULTI-STEP WIZARD MODAL ─────────────────────────────────────── */}
            <Modal visible={showWizard} transparent animationType="slide" onRequestClose={() => setShowWizard(false)}>
                <View style={styles.wizardOverlay}>
                    <View style={[styles.wizardSheet, { backgroundColor: colors.background }]}>
                        {/* Wizard Header */}
                        <View style={[styles.wizardHeader, { borderBottomColor: borderColor }]}>
                            <TouchableOpacity onPress={() => setShowWizard(false)} style={styles.wizardCloseBtn}>
                                <X size={22} color={textSecondary} />
                            </TouchableOpacity>
                            <View style={styles.wizardProgressContainer}>
                                {(['basics', 'curriculum', 'resources', 'review'] as WizardStep[]).map((step, i) => {
                                    const stepIndex = ['basics', 'curriculum', 'resources', 'review'].indexOf(step);
                                    const currentIndex = ['basics', 'curriculum', 'resources', 'review'].indexOf(wizardStep);
                                    const isActive = step === wizardStep;
                                    const isCompleted = stepIndex < currentIndex;

                                    return (
                                        <React.Fragment key={step}>
                                            <View style={[styles.wizardStepDot, {
                                                backgroundColor: isActive || isCompleted ? colors.accent : borderColor,
                                                width: isActive ? 24 : 10,
                                            }]} />
                                            {i < 3 && <View style={[styles.wizardStepLine, {
                                                backgroundColor: isCompleted ? colors.accent : borderColor,
                                            }]} />}
                                        </React.Fragment>
                                    );
                                })}
                            </View>
                            <TouchableOpacity onPress={nextStep} style={[styles.wizardNextBtn, { opacity: canProceedToNextStep() ? 1 : 0.4 }]} disabled={!canProceedToNextStep()}>
                                {wizardStep === 'review' ? (
                                    <CheckCircle size={22} color={colors.accent} />
                                ) : (
                                    <ArrowRight size={22} color={colors.accent} />
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Wizard Title */}
                        <View style={styles.wizardTitleBar}>
                            <View>
                                <Text style={[styles.wizardStepTitle, { color: textPrimary }]}>
                                    {wizardStep === 'basics' && t('creatorDashboard.wizard.basicsTitle')}
                                    {wizardStep === 'curriculum' && t('creatorDashboard.wizard.curriculumTitle')}
                                    {wizardStep === 'resources' && t('creatorDashboard.wizard.resourcesTitle')}
                                    {wizardStep === 'review' && t('creatorDashboard.wizard.reviewTitle')}
                                </Text>
                                <Text style={[styles.wizardStepDesc, { color: textSecondary }]}>
                                    {wizardStep === 'basics' && t('creatorDashboard.wizard.basicsDesc')}
                                    {wizardStep === 'curriculum' && t('creatorDashboard.wizard.curriculumDesc')}
                                    {wizardStep === 'resources' && t('creatorDashboard.wizard.resourcesDesc')}
                                    {wizardStep === 'review' && t('creatorDashboard.wizard.reviewDesc')}
                                </Text>
                            </View>
                        </View>

                        {/* Wizard Content */}
                        <ScrollView style={styles.wizardContent} showsVerticalScrollIndicator={false}>
                            {/* STEP 1: BASICS */}
                            {wizardStep === 'basics' && (
                                <View style={styles.wizardForm}>
                                    <View style={[styles.infoCallout, { backgroundColor: `${colors.accent}08`, borderColor: `${colors.accent}20` }]}>
                                        <Info size={16} color={colors.accent} />
                                        <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                            <Trans t={t} i18nKey="creatorDashboard.wizard.basicsCallout" components={{ bold: <Text style={{ fontWeight: '700', color: colors.accent }} /> }} />
                                        </Text>
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.titleLabel')}</Text>
                                        <TextInput
                                            value={newListing.title}
                                            onChangeText={v => setNewListing(p => ({ ...p, title: v }))}
                                            style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                            placeholder={t('creatorDashboard.wizard.titlePlaceholder')}
                                            placeholderTextColor={textSecondary}
                                        />
                                        <Text style={[styles.charCount, { color: newListing.title.length > 60 ? '#EF4444' : textSecondary }]}>
                                            {newListing.title.length}/60
                                        </Text>
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.descriptionLabel')}</Text>
                                        <TextInput
                                            value={newListing.description}
                                            onChangeText={v => setNewListing(p => ({ ...p, description: v }))}
                                            style={[styles.wizardInput, styles.wizardTextArea, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                            placeholder={t('creatorDashboard.wizard.descriptionPlaceholder')}
                                            placeholderTextColor={textSecondary}
                                            multiline
                                            numberOfLines={4}
                                            textAlignVertical="top"
                                        />
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.categoryLabel')}</Text>
                                        <View style={styles.categoryGrid}>
                                            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                                                <TouchableOpacity
                                                    key={cat}
                                                    style={[
                                                        styles.categoryChip,
                                                        { borderColor: newListing.category === cat ? color.primary : borderColor },
                                                        newListing.category === cat && { backgroundColor: `${color.primary}12` }
                                                    ]}
                                                    onPress={() => setNewListing(p => ({ ...p, category: cat }))}
                                                >
                                                    <View style={[styles.categoryDot, { backgroundColor: color.primary }]} />
                                                    <Text style={[styles.categoryChipText, {
                                                        color: newListing.category === cat ? color.primary : textSecondary,
                                                        textTransform: 'capitalize'
                                                    }]}>{cat}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.thumbnailLabel')}</Text>
                                        <TouchableOpacity
                                            style={[styles.thumbUpload, { backgroundColor: inputBg, borderColor: newListing.image_url ? '#10B981' : borderColor }]}
                                            onPress={handleUploadThumbnail}
                                            disabled={uploadingThumb}
                                        >
                                            {uploadingThumb ? (
                                                <ActivityIndicator color={colors.accent} />
                                            ) : newListing.image_url ? (
                                                <>
                                                    <Image source={{ uri: newListing.image_url }} style={styles.thumbPreview} />
                                                    <View style={styles.thumbUploadedBadge}>
                                                        <CheckCircle size={14} color="white" />
                                                        <Text style={styles.thumbBadgeText}>{t('creatorDashboard.wizard.uploaded')}</Text>
                                                    </View>
                                                </>
                                            ) : (
                                                <>
                                                    <View style={[styles.thumbUploadIcon, { backgroundColor: `${colors.accent}12` }]}>
                                                        <Upload size={24} color={colors.accent} />
                                                    </View>
                                                    <Text style={[styles.thumbUploadText, { color: textPrimary }]}>{t('creatorDashboard.wizard.browseDevice')}</Text>
                                                    <Text style={[styles.thumbUploadSubtext, { color: textSecondary }]}>{t('creatorDashboard.wizard.ratioHint')}</Text>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.priceLabel')}</Text>
                                        <TextInput
                                            value={newListing.price}
                                            onChangeText={v => setNewListing(p => ({ ...p, price: v }))}
                                            style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                            keyboardType="numeric"
                                            placeholder={t('creatorDashboard.wizard.pricePlaceholder')}
                                            placeholderTextColor={textSecondary}
                                        />
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={[styles.formLabel, { color: textPrimary }]}>{t('creatorDashboard.wizard.experienceLabel')}</Text>
                                        <TextInput
                                            value={newListing.experiences}
                                            onChangeText={v => setNewListing(p => ({ ...p, experiences: v }))}
                                            style={[styles.wizardInput, styles.wizardTextArea, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                            placeholder={t('creatorDashboard.wizard.experiencePlaceholder')}
                                            placeholderTextColor={textSecondary}
                                            multiline
                                            numberOfLines={3}
                                            textAlignVertical="top"
                                        />
                                    </View>
                                </View>
                            )}

                            {/* STEP 2: CURRICULUM */}
                            {wizardStep === 'curriculum' && (
                                <View style={styles.wizardForm}>
                                    <View style={[styles.infoCallout, { backgroundColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.2)' }]}>
                                        <Target size={16} color="#3b82f6" />
                                        <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                            <Trans t={t} i18nKey="creatorDashboard.wizard.curriculumCallout" components={{ bold: <Text style={{ fontWeight: '700', color: '#3b82f6' }} /> }} />
                                        </Text>
                                    </View>

                                    {roadmapStages.map((stage, i) => (
                                        <View key={stage.id} style={[styles.stageCard, { backgroundColor: cardBg, borderColor }]}>
                                            <View style={styles.stageHeader}>
                                                <View style={[styles.stageNumber, { backgroundColor: `${colors.accent}15` }]}>
                                                    <Text style={[styles.stageNumberText, { color: colors.accent }]}>{t('creatorDashboard.wizard.stageNumber', { number: i + 1 })}</Text>
                                                </View>
                                                {roadmapStages.length > 1 && (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            const next = roadmapStages.filter((_, idx) => idx !== i);
                                                            setRoadmapStages(next);
                                                        }}
                                                    >
                                                        <Trash2 size={16} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            <TextInput
                                                placeholder={t('creatorDashboard.wizard.stageTitlePlaceholder')}
                                                placeholderTextColor={textSecondary}
                                                value={stage.title}
                                                onChangeText={v => {
                                                    const next = [...roadmapStages];
                                                    next[i].title = v;
                                                    setRoadmapStages(next);
                                                }}
                                                style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor, marginBottom: 10 }]}
                                            />
                                            <TextInput
                                                placeholder={t('creatorDashboard.wizard.stageDescPlaceholder')}
                                                placeholderTextColor={textSecondary}
                                                value={stage.description}
                                                onChangeText={v => {
                                                    const next = [...roadmapStages];
                                                    next[i].description = v;
                                                    setRoadmapStages(next);
                                                }}
                                                style={[styles.wizardInput, styles.wizardTextArea, { backgroundColor: inputBg, color: textPrimary, borderColor, marginBottom: 10, minHeight: 60 }]}
                                                multiline
                                                numberOfLines={2}
                                                textAlignVertical="top"
                                            />
                                            <TextInput
                                                placeholder={t('creatorDashboard.wizard.stageDurationPlaceholder')}
                                                placeholderTextColor={textSecondary}
                                                value={stage.duration}
                                                onChangeText={v => {
                                                    const next = [...roadmapStages];
                                                    next[i].duration = v;
                                                    setRoadmapStages(next);
                                                }}
                                                style={[styles.wizardInput, { backgroundColor: inputBg, color: textPrimary, borderColor }]}
                                            />
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        style={[styles.addStageBtn, { borderColor }]}
                                        onPress={() => setRoadmapStages([...roadmapStages, { id: Math.random().toString(), title: '', description: '', duration: '' }])}
                                    >
                                        <Plus size={20} color={colors.accent} />
                                        <Text style={[styles.addStageText, { color: colors.accent }]}>{t('creatorDashboard.wizard.addStage')}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* STEP 3: RESOURCES */}
                            {wizardStep === 'resources' && (
                                <View style={styles.wizardForm}>
                                    <View style={[styles.infoCallout, { backgroundColor: 'rgba(59, 130, 246, 0.08)', borderColor: 'rgba(59, 130, 246, 0.2)' }]}>
                                        <FileText size={16} color="#3B82F6" />
                                        <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                            {t('creatorDashboard.wizard.resourcesCallout')}
                                        </Text>
                                    </View>

                                    {resources.map((res, i) => (
                                        <View key={i} style={[styles.resourceCard, { backgroundColor: cardBg, borderColor }]}>
                                            <View style={styles.resourceHeader}>
                                                <FileText size={18} color={colors.accent} />
                                                <TextInput
                                                    placeholder={t('creatorDashboard.wizard.resourceNamePlaceholder')}
                                                    placeholderTextColor={textSecondary}
                                                    value={res.title}
                                                    onChangeText={v => {
                                                        const next = [...resources];
                                                        next[i].title = v;
                                                        setResources(next);
                                                    }}
                                                    style={[styles.resourceInput, { color: textPrimary }]}
                                                />
                                                {resources.length > 1 && (
                                                    <TouchableOpacity onPress={() => setResources(resources.filter((_, idx) => idx !== i))}>
                                                        <X size={16} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <TouchableOpacity
                                                style={[styles.resourceUploadBtn, { borderColor }]}
                                                onPress={() => handleUploadResource(i)}
                                            >
                                                <Upload size={14} color={textSecondary} />
                                                <Text style={[styles.resourceUploadText, { color: res.fileName ? '#10B981' : textSecondary }]}>
                                                    {res.fileName || t('creatorDashboard.wizard.uploadFile')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        style={[styles.addStageBtn, { borderColor }]}
                                        onPress={() => setResources([...resources, { title: '', type: 'resource', url: '' }])}
                                    >
                                        <Plus size={20} color={colors.accent} />
                                        <Text style={[styles.addStageText, { color: colors.accent }]}>{t('creatorDashboard.wizard.addResource')}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* STEP 4: REVIEW */}
                            {wizardStep === 'review' && (
                                <View style={styles.wizardForm}>
                                    <View style={[styles.infoCallout, { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.2)' }]}>
                                        <Eye size={16} color="#10B981" />
                                        <Text style={[styles.infoCalloutText, { color: textSecondary }]}>
                                            {editingId ? t('creatorDashboard.wizard.editCallout') : t('creatorDashboard.wizard.reviewCallout')}
                                        </Text>
                                    </View>

                                    {/* Where it lands: private My Roadmaps by default; approved creators
                                        can flip it public into the shared catalog — including from an
                                        edit, which is also the only way to unpublish. */}
                                    <TouchableOpacity
                                            style={[styles.visibilityRow, { backgroundColor: cardBg, borderColor }]}
                                            activeOpacity={isApproved ? 0.8 : 1}
                                            onPress={() => isApproved && setPublishPublicly(v => !v)}
                                        >
                                            <View style={[styles.visibilityIcon, { backgroundColor: `${colors.accent}12` }]}>
                                                {publishPublicly ? <Users size={18} color={colors.accent} /> : <BookOpen size={18} color={colors.accent} />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.visibilityTitle, { color: textPrimary }]}>
                                                    {publishPublicly ? t('creatorDashboard.visibility.publicTitle') : t('creatorDashboard.visibility.personalTitle')}
                                                </Text>
                                                <Text style={[styles.visibilityText, { color: textSecondary }]}>
                                                    {publishPublicly
                                                        ? t('creatorDashboard.visibility.publicText')
                                                        : isApproved
                                                            ? t('creatorDashboard.visibility.personalText')
                                                            : t('creatorDashboard.visibility.lockedText')}
                                                </Text>
                                            </View>
                                            {isApproved ? (
                                                <View style={[styles.toggle, { backgroundColor: publishPublicly ? colors.accent : borderColor }]}>
                                                    <View style={[styles.toggleKnob, { alignSelf: publishPublicly ? 'flex-end' : 'flex-start' }]} />
                                                </View>
                                            ) : (
                                                <TouchableOpacity onPress={() => router.push('/creator-apply')}>
                                                    <Text style={[styles.visibilityUnlock, { color: colors.accent }]}>{t('creatorDashboard.visibility.unlock')}</Text>
                                                </TouchableOpacity>
                                            )}
                                    </TouchableOpacity>

                                    <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>{t('creatorDashboard.wizard.reviewBasics')}</Text>
                                        <View style={styles.reviewRow}>
                                            <Text style={[styles.reviewLabel, { color: textSecondary }]}>{t('creatorDashboard.wizard.reviewTitleLabel')}</Text>
                                            <Text style={[styles.reviewValue, { color: textPrimary }]}>{newListing.title}</Text>
                                        </View>
                                        <View style={styles.reviewRow}>
                                            <Text style={[styles.reviewLabel, { color: textSecondary }]}>{t('creatorDashboard.wizard.reviewCategoryLabel')}</Text>
                                            <Text style={[styles.reviewValue, { color: textPrimary, textTransform: 'capitalize' }]}>{newListing.category}</Text>
                                        </View>
                                        <View style={styles.reviewRow}>
                                            <Text style={[styles.reviewLabel, { color: textSecondary }]}>{t('creatorDashboard.wizard.reviewPriceLabel')}</Text>
                                            <Text style={[styles.reviewValue, { color: textPrimary }]}>{newListing.price === '0' ? t('creatorDashboard.free') : t('creatorDashboard.wizard.priceCredits', { price: newListing.price })}</Text>
                                        </View>
                                    </View>

                                    <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>{t('creatorDashboard.wizard.reviewCurriculum', { total: roadmapStages.length })}</Text>
                                        {roadmapStages.map((stage, i) => (
                                            <View key={stage.id} style={styles.reviewStage}>
                                                <View style={styles.reviewStageHeader}>
                                                    <View style={[styles.stageNumber, { backgroundColor: `${colors.accent}15` }]}>
                                                        <Text style={[styles.stageNumberText, { color: colors.accent }]}>{t('creatorDashboard.wizard.stageNumber', { number: i + 1 })}</Text>
                                                    </View>
                                                    <Text style={[styles.reviewStageTitle, { color: textPrimary }]}>{stage.title}</Text>
                                                </View>
                                                {stage.duration && (
                                                    <Text style={[styles.reviewStageDuration, { color: textSecondary }]}>{stage.duration}</Text>
                                                )}
                                            </View>
                                        ))}
                                    </View>

                                    {resources.length > 0 && (
                                        <View style={[styles.reviewCard, { backgroundColor: cardBg, borderColor }]}>
                                            <Text style={[styles.reviewSectionTitle, { color: textPrimary }]}>{t('creatorDashboard.wizard.reviewResources', { total: resources.length })}</Text>
                                            {resources.map((res, i) => (
                                                <View key={i} style={styles.reviewResource}>
                                                    <FileText size={14} color={textSecondary} />
                                                    <Text style={[styles.reviewResourceText, { color: textPrimary }]}>{res.title || t('creatorDashboard.wizard.untitled')}</Text>
                                                    {res.fileName && <Text style={[styles.reviewResourceFile, { color: '#10B981' }]}>{t('creatorDashboard.wizard.fileAttached', { fileName: res.fileName })}</Text>}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            )}

                            <View style={{ height: 40 }} />
                        </ScrollView>

                        {/* Wizard Footer */}
                        <View style={[styles.wizardFooter, { borderTopColor: borderColor }]}>
                            {wizardStep !== 'basics' && (
                                <TouchableOpacity onPress={prevStep} style={[styles.wizardFooterBtn, { backgroundColor: inputBg }]}>
                                    <ChevronLeft size={18} color={textSecondary} />
                                    <Text style={[styles.wizardFooterBtnText, { color: textSecondary }]}>{t('common:actions.back')}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[
                                    styles.wizardSubmitBtn,
                                    { backgroundColor: colors.accent },
                                    (wizardStep !== 'review' && !canProceedToNextStep()) && { opacity: 0.5 }
                                ]}
                                onPress={wizardStep === 'review' ? handleCreateListing : nextStep}
                                disabled={creating || (wizardStep !== 'review' && !canProceedToNextStep())}
                            >
                                {creating ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <>
                                        <Text style={styles.wizardSubmitText}>
                                            {wizardStep !== 'review'
                                                ? t('common:actions.continue')
                                                : editingId
                                                    ? t('creatorDashboard.wizard.saveChanges')
                                                    : (isApproved && publishPublicly)
                                                        ? t('creatorDashboard.wizard.publishNow')
                                                        : t('creatorDashboard.wizard.saveRoadmap')}
                                        </Text>
                                        {wizardStep !== 'review' && <ChevronRight size={18} color="white" />}
                                    </>
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
    container: { flex: 1 },
    loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 16, fontSize: 14 },
    longLoadNotice: {
        width: width - 40,
        marginTop: 24,
        borderWidth: 1,
        borderRadius: 18,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    longLoadIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    longLoadCopy: {
        flex: 1,
    },
    longLoadTitle: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 4,
    },
    longLoadText: {
        fontSize: 12,
        lineHeight: 17,
    },
    longLoadActions: {
        marginTop: 2,
        gap: 8,
    },
    longLoadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
    },
    longLoadBtnText: {
        fontSize: 11,
        fontWeight: '700',
    },

    // Access Guard
    accessGuardContent: { paddingHorizontal: 28, paddingVertical: 34, flexGrow: 1, justifyContent: 'center' },
    accessGuardCard: { alignItems: 'center' },
    accessIconBox: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
    accessTitle: { fontSize: 24, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
    accessStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
    accessStatusText: { fontSize: 14, fontWeight: '700' },
    accessDesc: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
    accessInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderRadius: 16, marginBottom: 24 },
    accessInfoText: { fontSize: 13, flex: 1, lineHeight: 20 },
    accessBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
    accessBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
    accessPerks: { width: '100%', gap: 12, marginBottom: 24 },
    perkItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
    perkText: { fontSize: 14, fontWeight: '600' },

    // Header
    headerSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, marginBottom: 20 },
    welcomeTextGroup: { flex: 1 },
    welcomeGreeting: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    welcomeName: { fontSize: 26, fontWeight: 'bold', marginTop: 4 },
    createBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
    createBtnText: { color: 'white', fontWeight: 'bold', fontSize: 13 },

    // Stats
    sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 },
    statsScroll: { paddingHorizontal: 20 - CARD_SPACING / 2, gap: CARD_SPACING, marginBottom: 24 },
    statCard: { width: CARD_WIDTH, height: 140, borderRadius: 20, overflow: 'hidden', marginRight: CARD_SPACING },
    statCardGradient: { flex: 1, padding: 20, justifyContent: 'space-between' },
    statIconBox: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    statValue: { color: 'white', fontSize: 28, fontWeight: 'bold' },
    statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },

    // Reward Banner
    rewardBanner: { paddingHorizontal: 20, marginBottom: 28 },
    rewardGradient: { borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center' },
    rewardTextGroup: { flex: 1, marginLeft: 16 },
    rewardTitle: { fontSize: 16, fontWeight: 'bold' },
    rewardText: { fontSize: 13, marginTop: 4 },

    // Section
    section: { paddingHorizontal: 20, marginBottom: 28 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold' },

    // Empty State
    emptyState: { padding: 32, alignItems: 'center', borderRadius: 24, borderWidth: 1 },
    emptyIconBox: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
    emptySubtext: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16 },
    emptyBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },

    // Listing Card
    listingCard: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, borderRadius: 20, borderWidth: 1 },
    listingIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    listingInfo: { flex: 1, marginLeft: 14 },
    listingTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
    listingMeta: { flexDirection: 'row', gap: 8 },
    listingBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, gap: 4 },
    listingBadgeText: { fontSize: 11, fontWeight: '700' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    listingRight: { alignItems: 'flex-end' },
    listingPrice: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
    enrollBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    enrollText: { fontSize: 11, fontWeight: '600' },
    listingCardColumn: { flexDirection: 'column', alignItems: 'stretch', padding: 0, overflow: 'hidden' },
    listingTopRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
    rowActions: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1 },
    rowActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    rowActionText: { fontSize: 12.5, fontWeight: '700' },
    rowActionDivider: { width: 1, height: 20 },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
    visibilityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    visibilityTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
    visibilityText: { fontSize: 12, lineHeight: 16 },
    visibilityUnlock: { fontSize: 12, fontWeight: '800' },
    toggle: { width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
    toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },

    // Wizard Modal
    wizardOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    wizardSheet: { flex: 1, marginTop: 60, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    wizardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
    wizardCloseBtn: { padding: 4 },
    wizardProgressContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    wizardStepDot: { height: 10, borderRadius: 5 },
    wizardStepLine: { width: 20, height: 2, borderRadius: 1 },
    wizardNextBtn: { padding: 4 },
    wizardTitleBar: { paddingHorizontal: 20, paddingVertical: 16 },
    wizardStepTitle: { fontSize: 20, fontWeight: '800' },
    wizardStepDesc: { fontSize: 13, marginTop: 4 },
    wizardContent: { flex: 1 },

    // Wizard Form
    wizardForm: { paddingHorizontal: 20 },
    infoCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 20 },
    infoCalloutText: { fontSize: 13, flex: 1, lineHeight: 20 },
    formGroup: { marginBottom: 20 },
    formLabel: { fontSize: 14, fontWeight: '700', marginBottom: 10 },
    wizardInput: { borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 15 },
    wizardTextArea: { minHeight: 100 },
    charCount: { fontSize: 12, textAlign: 'right', marginTop: 4 },

    // Category Grid
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
    categoryDot: { width: 8, height: 8, borderRadius: 4 },
    categoryChipText: { fontSize: 13, fontWeight: '700' },

    // Thumbnail Upload
    thumbUpload: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', padding: 20, alignItems: 'center', overflow: 'hidden' },
    thumbUploadIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    thumbUploadText: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
    thumbUploadSubtext: { fontSize: 12 },
    thumbPreview: { width: '100%', height: 120, borderRadius: 12, marginBottom: 8 },
    thumbUploadedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    thumbBadgeText: { color: 'white', fontSize: 12, fontWeight: '600' },

    // Stage Cards
    stageCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14 },
    stageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    stageNumber: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
    stageNumberText: { fontSize: 12, fontWeight: '800' },

    // Resource Cards
    resourceCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 14 },
    resourceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    resourceInput: { flex: 1, fontSize: 15, padding: 0 },
    resourceUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
    resourceUploadText: { fontSize: 13, fontWeight: '600' },

    // Add Button
    addStageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', marginBottom: 20 },
    addStageText: { fontSize: 14, fontWeight: '700' },

    // Review Cards
    reviewCard: { borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 16 },
    reviewSectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    reviewLabel: { fontSize: 13, fontWeight: '600' },
    reviewValue: { fontSize: 13, fontWeight: '500', textAlign: 'right', flex: 1, marginLeft: 12 },
    reviewStage: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
    reviewStageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    reviewStageTitle: { fontSize: 14, fontWeight: '600' },
    reviewStageDuration: { fontSize: 12, marginLeft: 44 },
    reviewResource: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    reviewResourceText: { fontSize: 13, fontWeight: '500', flex: 1 },
    reviewResourceFile: { fontSize: 11, fontWeight: '600' },

    // Wizard Footer
    wizardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
    wizardFooterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14 },
    wizardFooterBtnText: { fontSize: 15, fontWeight: '600' },
    wizardSubmitBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 16 },
    wizardSubmitText: { color: 'white', fontWeight: '800', fontSize: 16 },
});
