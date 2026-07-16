import {
    View, Text, FlatList, TextInput,
    StyleSheet, Image, TouchableOpacity, ActivityIndicator, Modal, ScrollView, RefreshControl,
    Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Search, BookOpen, Star, Users, Sparkles,
    X, Clock, ChevronRight, CalendarDays,
    ShieldCheck, CheckCircle, Zap, GraduationCap,
    ThumbsUp, Pencil, Plus
} from "lucide-react-native";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../components/context/ThemeContext";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { LinearGradient } from "expo-linear-gradient";
import { LoadState } from "../../components/ui/LoadState";
import { shareIcsString } from "../../lib/roadmapCalendar";
import { swr } from "../../packages/core/src/services/swrCache";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
const API_RETRY_COOLDOWN_MS = 30 * 1000;

let apiUnavailableUntil = 0;
let hasLoggedApiUnavailable = false;

function isNetworkError(error: unknown): boolean {
    return error instanceof TypeError && error.message === 'Network request failed';
}

function isApiAvailable(): boolean {
    return Boolean(API_URL) && Date.now() >= apiUnavailableUntil;
}

function markApiUnavailable(error: unknown): boolean {
    if (!isNetworkError(error)) return false;
    apiUnavailableUntil = Date.now() + API_RETRY_COOLDOWN_MS;
    if (__DEV__ && !hasLoggedApiUnavailable) {
        console.warn('Roadmaps API is not reachable; skipping remote roadmaps requests briefly');
        hasLoggedApiUnavailable = true;
    }
    return true;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response | null> {
    if (!isApiAvailable()) return null;

    try {
        const response = await fetch(`${API_URL}${path}`, init);
        hasLoggedApiUnavailable = false;
        return response;
    } catch (error) {
        if (markApiUnavailable(error)) return null;
        throw error;
    }
}

interface RoadmapStep {
    id: string;
    title: string;
    description: string;
    duration?: string;
    relative_due_day?: number | string | null;
    relativeDueDay?: number | string | null;
    due_day?: number | string | null;
    dueDay?: number | string | null;
    deadline_strategy?: string | null;
    deadlineStrategy?: string | null;
}

interface RoadmapResource {
    id: string;
    title: string;
    url: string;
    type: string;
}

interface Roadmap {
    id: string;
    title: string;
    slug: string;
    description: string;
    category: string;
    difficulty: string;
    estimated_duration: string;
    target_audience: string;
    prerequisites: string;
    outcomes: string;
    cover_image: string;
    status: string;
    creator_name: string;
    is_featured: boolean;
    enrollment_count: number;
    rating_avg: number;
    rating_count: number;
    steps: RoadmapStep[];
    resources: RoadmapResource[];
    ai_intent_tags: string[];
    satisfaction_score: number;
    created_at: string;
    creator_proof?: string | null;
    creatorProof?: string | null;
    proof?: string | null;
    deadline_strategy?: string | null;
    deadlineStrategy?: string | null;
    deadline?: string | null;
    target_deadline?: string | null;
    targetDeadline?: string | null;
    application_deadline?: string | null;
    applicationDeadline?: string | null;
    relative_due_day?: number | string | null;
    relativeDueDay?: number | string | null;
    due_day?: number | string | null;
    dueDay?: number | string | null;
}

interface RoadmapAdoptionResponse {
    id: string;
    goalsCreated?: number;
    targetDeadline?: string | null;
    target_deadline?: string | null;
    calendar?: {
        enabled: boolean;
        eventCount: number;
        filename: string;
        exportUrl: string;
    };
    reminderSchedule?: Array<Record<string, unknown>>;
    reminder_schedule?: Array<Record<string, unknown>>;
    communityAction?: {
        communityId: string;
        label: string;
        route: string;
        message?: string;
    } | null;
    community_action?: RoadmapAdoptionResponse['communityAction'];
}

interface AIQuestion {
    id: string;
    question: string;
    type: 'text' | 'select' | 'multiselect';
    options?: string[];
}

const CATEGORY_FILTERS = ['All', 'Scholarship', 'Career', 'Education', 'Skills', 'Business', 'Tech'];

export default function RoadmapsScreen() {
    const { t } = useTranslation('goals');
    const { isDark, colors } = useTheme();
    const router = useRouter();
    const { user } = useUser();
    const { getToken } = useAuth();
    const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
    const [myRoadmaps, setMyRoadmaps] = useState<Roadmap[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [selectedItem, setSelectedItem] = useState<Roadmap | null>(null);
    const [enrolling, setEnrolling] = useState(false);
    const [showIntentModal, setShowIntentModal] = useState(false);
    const [intentQuestions] = useState<AIQuestion[]>([]);
    const [intentAnswers, setIntentAnswers] = useState<Record<string, string>>({});
    const [intentLoading, setIntentLoading] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackScore, setFeedbackScore] = useState(0);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = colors.card;
    const inputBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
    const borderColor = colors.border;

    // Debounce the search box so we don't fire a request (and a spinner) per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchRoadmaps = useCallback(async () => {
        const cacheKey = `roadmaps:list:${category}:${debouncedSearch}`;
        const params = new URLSearchParams({ limit: '50' });
        if (category !== 'All') params.set('category', category.toLowerCase());
        if (debouncedSearch) params.set('search', debouncedSearch);

        // Stale-while-revalidate: paint cached results instantly, refresh in background.
        // No setLoading(true) here — the initial state already shows the loader once,
        // and cached data keeps the list on screen while filters change.
        await swr<Roadmap[]>(
            cacheKey,
            async () => {
                if (!isApiAvailable()) throw new Error('offline');
                const res = await apiFetch(`/roadmaps?${params}`);
                if (!res?.ok) throw new Error('roadmaps request failed');
                return res.json();
            },
            {
                maxAgeMs: 60000,
                onData: (data) => {
                    if (Array.isArray(data)) setRoadmaps(data);
                    setLoading(false);
                },
            },
        ).finally(() => setLoading(false));
    }, [category, debouncedSearch]);

    useEffect(() => { fetchRoadmaps(); }, [fetchRoadmaps]);

    // "My Roadmaps" — the user's own creations (personal + published). Refetched
    // whenever the screen regains focus so a roadmap just made in Creator Studio
    // shows up here immediately (no manual refresh needed).
    const fetchMine = useCallback(async () => {
        if (!user) { setMyRoadmaps([]); return; }
        try {
            const token = await getToken();
            const res = await apiFetch('/roadmaps/mine', {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (res?.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setMyRoadmaps(data);
            }
        } catch {
            /* non-critical — the main catalog still renders */
        }
    }, [user, getToken]);

    useFocusEffect(useCallback(() => { fetchMine(); }, [fetchMine]));

    const submitIntent = async () => {
        if (!user) return;
        setIntentLoading(true);
        try {
            const token = await getAuthToken();
            const goals = Object.values(intentAnswers).filter(Boolean) as string[];
            const level = intentAnswers['q1']?.toLowerCase();

            await apiFetch('/roadmaps/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    goals,
                    currentLevel: level as any,
                    targetCategory: category !== 'All' ? category.toLowerCase() : undefined,
                    additionalContext: intentAnswers['q3'] || '',
                }),
            });

            // Fetch recommended roadmaps
            const recRes = await apiFetch('/roadmaps/recommended?limit=10', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (recRes?.ok) {
                const recData = await recRes.json();
                if (recData.length > 0) {
                    setRoadmaps(recData);
                }
            }

            setShowIntentModal(false);
        } catch (e) {
            console.error('Failed to submit intent:', e);
        } finally {
            setIntentLoading(false);
        }
    };

    const submitFeedback = async () => {
        if (!user || !selectedItem || feedbackScore === 0) return;
        setFeedbackSubmitting(true);
        try {
            const token = await getAuthToken();
            await apiFetch('/roadmaps/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    roadmapId: selectedItem.id,
                    satisfactionScore: feedbackScore,
                    metExpectations: feedbackScore >= 3,
                    whatWorked: feedbackText,
                    wouldRecommend: feedbackScore >= 3,
                }),
            });
            setShowFeedbackModal(false);
            setFeedbackScore(0);
            setFeedbackText('');
            Alert.alert(t('roadmaps.feedback.thanksTitle'), t('roadmaps.feedback.thanksMessage'));
        } catch (e) {
            console.error('Feedback failed:', e);
        } finally {
            setFeedbackSubmitting(false);
        }
    };

    const getAuthToken = async () => {
        return await getToken() || '';
    };

    const getCreatorProof = (roadmap: Roadmap) => roadmap.creator_proof || roadmap.creatorProof || roadmap.proof || '';
    const getDeadlineStrategy = (roadmap: Roadmap) => roadmap.deadline_strategy || roadmap.deadlineStrategy || '';
    const getTargetDeadline = (roadmap: Roadmap) =>
        roadmap.target_deadline || roadmap.targetDeadline || roadmap.application_deadline || roadmap.applicationDeadline || roadmap.deadline || null;
    const getRelativeDueDay = (item: Roadmap | RoadmapStep) =>
        item.relative_due_day ?? item.relativeDueDay ?? item.due_day ?? item.dueDay ?? null;

    const formatTargetDeadline = useCallback((deadline?: string | null) => {
        if (!deadline) return '';
        const date = new Date(deadline);
        if (Number.isNaN(date.getTime())) return deadline;

        const diffDays = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (diffDays === 0) return t('roadmaps.deadline.dueToday', { date: formatted });
        if (diffDays === 1) return t('roadmaps.deadline.dueTomorrow', { date: formatted });
        if (diffDays > 1) return t('roadmaps.deadline.daysLeft', { date: formatted, count: diffDays });
        return t('roadmaps.deadline.overdue', { date: formatted });
    }, [t]);

    const formatRelativeDueDay = useCallback((value?: number | string | null) => {
        if (value === null || value === undefined || value === '') return '';
        const day = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(day)) {
            if (day < 0) return t('roadmaps.deadline.daysBefore', { count: Math.abs(day) });
            if (day === 0) return t('roadmaps.deadline.dueOnDeadline');
            return t('roadmaps.deadline.dueDay', { day });
        }
        return String(value);
    }, [t]);

    const buildAdoptionMessage = (adoption?: RoadmapAdoptionResponse | null) => {
        if (!adoption) return t('roadmaps.adoption.fallback');

        const reminders = adoption.reminderSchedule || adoption.reminder_schedule || [];
        const communityAction = adoption.communityAction || adoption.community_action;
        const targetDeadline = adoption.targetDeadline || adoption.target_deadline;
        const parts = [t('roadmaps.adoption.ready')];

        if (adoption.goalsCreated && adoption.goalsCreated > 0) {
            parts.push(t('roadmaps.adoption.milestones', { count: adoption.goalsCreated }));
        }
        if (targetDeadline) {
            parts.push(t('roadmaps.adoption.deadline', { date: new Date(targetDeadline).toLocaleDateString() }));
        }
        if (reminders.length > 0 || (adoption.goalsCreated ?? 0) > 0) {
            parts.push(t('roadmaps.adoption.reminders'));
        }
        if (adoption.calendar?.enabled && adoption.calendar.eventCount > 0) {
            parts.push(t('roadmaps.adoption.calendarEvents', { count: adoption.calendar.eventCount }));
        }
        if (communityAction?.communityId) {
            parts.push(t('roadmaps.adoption.community'));
        }

        return parts.join(' ');
    };

    const postEnrollment = async (token: string, roadmap: Roadmap) => {
        const targetDeadline = getTargetDeadline(roadmap);
        const adoptionPayload = {
            targetDeadline,
            calendarSyncEnabled: Boolean(targetDeadline),
        };

        const adoptionRes = await apiFetch(`/roadmaps/adopt/${roadmap.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(adoptionPayload),
        });

        if (!adoptionRes || adoptionRes.ok) return adoptionRes;
        if (![404, 405, 501].includes(adoptionRes.status)) return adoptionRes;

        return apiFetch(`/roadmaps/enroll/${roadmap.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                targetDeadline,
                calendarSyncEnabled: adoptionPayload.calendarSyncEnabled,
            }),
        });
    };

    const handleAddCalendar = async (enrollmentId: string) => {
        try {
            const token = await getAuthToken();
            const res = await apiFetch(`/roadmaps/enrollments/${enrollmentId}/calendar`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!res?.ok) {
                Alert.alert(t('roadmaps.calendar.unavailableTitle'), t('roadmaps.calendar.unavailableMessage'));
                return;
            }
            const data = await res.json();
            const result = await shareIcsString(data.ics, data.filename || 'roadmap.ics');
            if (!result.ok && result.reason === 'error') {
                Alert.alert(t('roadmaps.calendar.exportFailedTitle'), t('roadmaps.calendar.exportFailedMessage'));
            }
        } catch {
            Alert.alert(t('roadmaps.calendar.unavailableTitle'), t('roadmaps.calendar.unavailableMessage'));
        }
    };

    const handleEnroll = async () => {
        if (!selectedItem || !user) return;
        setEnrolling(true);
        try {
            const token = await getAuthToken();
            const res = await postEnrollment(token, selectedItem);
            if (!res?.ok) throw new Error(t('roadmaps.enroll.failed'));
            let adoption: RoadmapAdoptionResponse | null = null;
            try {
                adoption = await res.json();
            } catch {
                adoption = null;
            }

            setSelectedItem(null);
            Alert.alert(t('roadmaps.enroll.adoptedTitle'), buildAdoptionMessage(adoption), [
                { text: t('roadmaps.enroll.viewGoals'), onPress: () => router.push('/goals') },
                ...(adoption?.id
                    ? [{ text: t('roadmaps.enroll.addToCalendar'), onPress: () => handleAddCalendar(adoption.id) }]
                    : []),
                ...(adoption?.communityAction || adoption?.community_action
                    ? [{ text: t('roadmaps.enroll.openCommunity'), onPress: () => router.push('/roadmaps') }]
                    : []),
                { text: t('roadmaps.enroll.continueBrowsing') },
            ]);
            fetchRoadmaps();
        } catch (err: any) {
            Alert.alert(t('roadmaps.enroll.failedTitle'), err.message || t('roadmaps.enroll.failedMessage'));
        } finally {
            setEnrolling(false);
        }
    };

    const filteredRoadmaps = useMemo(() => {
        const term = search.trim().toLowerCase();
        return roadmaps.filter((r) => {
            if (category !== 'All' && r.category !== category.toLowerCase()) return false;
            if (!term) return true;
            return (
                r.title.toLowerCase().includes(term) ||
                r.description.toLowerCase().includes(term) ||
                r.creator_name.toLowerCase().includes(term)
            );
        });
    }, [roadmaps, search, category]);

    const renderCard = useCallback(({ item }: { item: Roadmap }) => {
        const categoryColor = getCategoryColor(item.category);
        const deadlineLabel = formatTargetDeadline(getTargetDeadline(item));
        const relativeDueLabel = formatRelativeDueDay(getRelativeDueDay(item));

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                onPress={() => setSelectedItem(item)}
                activeOpacity={0.85}
            >
                <View style={styles.imageContainer}>
                    {item.cover_image ? (
                        <Image source={{ uri: item.cover_image }} style={styles.cardImage} resizeMode="cover" />
                    ) : (
                        <View style={[styles.cardImagePlaceholder, { backgroundColor: `${categoryColor}10` }]}>
                            <BookOpen color={categoryColor} size={32} />
                        </View>
                    )}
                    {item.is_featured && (
                        <View style={styles.featuredBadge}>
                            <Star color="#F59E0B" size={10} fill="#F59E0B" />
                            <Text style={styles.featuredText}>{t('roadmaps.featured')}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.cardSummary, { color: textSecondary }]} numberOfLines={2}>
                        {item.description || t('roadmaps.noDescription')}
                    </Text>
                    {(deadlineLabel || relativeDueLabel) && (
                        <View style={styles.cardDeadlineRow}>
                            <CalendarDays size={12} color={categoryColor} />
                            <Text style={[styles.cardDeadlineText, { color: categoryColor }]} numberOfLines={1}>
                                {deadlineLabel || relativeDueLabel}
                            </Text>
                        </View>
                    )}
                    <View style={styles.cardFooter}>
                        <View style={styles.badgeRow}>
                            <View style={[styles.difficultyBadge, { backgroundColor: `${categoryColor}15` }]}>
                                <Text style={[styles.badgeText, { color: categoryColor }]}>{item.difficulty}</Text>
                            </View>
                            {item.steps?.length > 0 && (
                                <View style={[styles.difficultyBadge, { backgroundColor: `${categoryColor}15` }]}>
                                    <Text style={[styles.badgeText, { color: categoryColor }]}>{t('roadmaps.stepsCount', { count: item.steps.length })}</Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.userCount}>
                            <Users size={12} color={textSecondary} />
                            <Text style={[styles.userCountText, { color: textSecondary }]}>
                                {(item.enrollment_count || 0).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }, [cardBg, borderColor, textPrimary, textSecondary, t, formatTargetDeadline, formatRelativeDueDay]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('roadmaps.title')}
                subtitle={t('roadmaps.subtitle')}
                showBack
            />

            {/*
              The whole screen scrolls as one: the creator/template banners, search box,
              and category filters live in the FlatList header (not pinned above it), so
              they scroll away with the cards while the grid stays virtualized.
            */}
            <FlatList
                data={filteredRoadmaps}
                keyExtractor={(item) => item.id}
                renderItem={renderCard}
                numColumns={2}
                columnWrapperStyle={styles.row}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={6}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews
                refreshControl={
                    <RefreshControl refreshing={loading} onRefresh={() => { fetchRoadmaps(); fetchMine(); }} tintColor="#6366F1" />
                }
                ListHeaderComponent={
                    <>
                        {/*
                          Negative margin cancels listContent's horizontal padding so the
                          banners/search restore their original full-width 20px insets.
                        */}
                        <View style={styles.headerBleed}>
                            {/* Creator Banner → Creator Studio (anyone can build a roadmap now) */}
                            <TouchableOpacity
                                style={[styles.creatorBanner, { borderColor }]}
                                onPress={() => router.push('/creator-dashboard')}
                                activeOpacity={0.85}
                            >
                                <LinearGradient
                                    colors={['#F59E0B', '#EA580C', '#DC2626']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFill}
                                />
                                <View style={styles.creatorBannerContent}>
                                    <View style={styles.creatorBannerLeft}>
                                        <View style={styles.creatorBannerIcon}>
                                            <Pencil size={20} color="#FFFFFF" />
                                        </View>
                                        <View style={styles.creatorBannerText}>
                                            <Text style={styles.creatorBannerTitle}>{t('roadmaps.creatorBanner.title')}</Text>
                                            <Text style={styles.creatorBannerSubtitle}>
                                                {t('roadmaps.creatorBanner.subtitle')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.creatorBannerArrow}>
                                        <ChevronRight size={20} color="#FFFFFF" />
                                    </View>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.templateBanner, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '28' }]}
                                onPress={() => router.push('/roadmap-templates' as any)}
                                activeOpacity={0.85}
                            >
                                <View style={[styles.templateBannerIcon, { backgroundColor: colors.primary }]}>
                                    <BookOpen size={20} color="#FFFFFF" />
                                </View>
                                <View style={styles.templateBannerText}>
                                    <Text style={[styles.templateBannerTitle, { color: textPrimary }]}>{t('roadmaps.templateBanner.title')}</Text>
                                    <Text style={[styles.templateBannerSubtitle, { color: textSecondary }]}>
                                        {t('roadmaps.templateBanner.subtitle')}
                                    </Text>
                                </View>
                                <ChevronRight size={20} color={textSecondary} />
                            </TouchableOpacity>

                            <View style={styles.header}>
                                <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
                                    <Search color={textSecondary} size={18} />
                                    <TextInput
                                        placeholder={t('roadmaps.searchPlaceholder')}
                                        placeholderTextColor={textSecondary}
                                        style={[styles.searchInput, { color: textPrimary }]}
                                        value={search}
                                        onChangeText={setSearch}
                                    />
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.filterScroll} contentContainerStyle={{ gap: 8 }}>
                                    {CATEGORY_FILTERS.map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[styles.filterChip, { borderColor }, category === cat && styles.filterChipActive]}
                                            onPress={() => setCategory(cat)}
                                        >
                                            <Text style={[styles.filterChipText, { color: textSecondary }, category === cat && styles.filterChipTextActive]}>
                                                {t(`roadmaps.categories.${cat.toLowerCase()}`)}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>

                        {/* "My Roadmaps" — sits at the grid inset (no bleed) */}
                        {myRoadmaps.length > 0 ? (
                            <View style={styles.mySection}>
                                <View style={styles.myHeaderRow}>
                                    <View style={styles.myTitleGroup}>
                                        <Text style={[styles.myTitle, { color: textPrimary }]}>{t('roadmaps.myRoadmaps.title')}</Text>
                                        <View style={[styles.myCountPill, { backgroundColor: colors.primary + '18' }]}>
                                            <Text style={[styles.myCountText, { color: colors.primary }]}>{myRoadmaps.length}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity style={styles.myCreateBtn} onPress={() => router.push('/creator-dashboard')} activeOpacity={0.8}>
                                        <Plus size={14} color={colors.primary} />
                                        <Text style={[styles.myCreateText, { color: colors.primary }]}>{t('roadmaps.myRoadmaps.create')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.myScroll}>
                                    {myRoadmaps.map((item) => {
                                        const isPublished = (item as any).status === 'published';
                                        return (
                                            <TouchableOpacity
                                                key={item.id}
                                                style={[styles.myCard, { backgroundColor: cardBg, borderColor }]}
                                                activeOpacity={0.85}
                                                onPress={() => setSelectedItem(item)}
                                            >
                                                <View style={[styles.myCardIcon, { backgroundColor: `${getCategoryColor(item.category)}15` }]}>
                                                    <BookOpen size={18} color={getCategoryColor(item.category)} />
                                                </View>
                                                <Text style={[styles.myCardTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                                                <View style={[styles.myCardBadge, { backgroundColor: isPublished ? 'rgba(16,185,129,0.12)' : colors.primary + '14' }]}>
                                                    <Text style={[styles.myCardBadgeText, { color: isPublished ? '#10B981' : colors.primary }]}>
                                                        {isPublished ? t('roadmaps.myRoadmaps.published') : t('roadmaps.myRoadmaps.personal')}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                                <Text style={[styles.mySectionLabel, { color: textSecondary }]}>{t('roadmaps.myRoadmaps.discover')}</Text>
                            </View>
                        ) : null}
                    </>
                }
                ListEmptyComponent={
                    loading ? (
                        <LoadState
                            label={t('roadmaps.loading')}
                            onRetry={() => { fetchRoadmaps(); fetchMine(); }}
                            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
                        />
                    ) : (
                        <Text style={[styles.emptyText, { color: textSecondary }]}>{t('roadmaps.empty')}</Text>
                    )
                }
            />

            {/* Roadmap Detail Modal */}
            <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor }]}>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedItem(null)}>
                            <X color={textPrimary} size={18} />
                        </TouchableOpacity>
                        {selectedItem && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View style={styles.modalImageContainer}>
                                    {selectedItem.cover_image ? (
                                        <Image source={{ uri: selectedItem.cover_image }} style={styles.modalImage} resizeMode="cover" />
                                    ) : (
                                        <View style={[styles.modalImagePlaceholder, { backgroundColor: `${getCategoryColor(selectedItem.category)}15` }]}>
                                            <BookOpen color={getCategoryColor(selectedItem.category)} size={48} />
                                        </View>
                                    )}
                                </View>
                                <View style={styles.modalBody}>
                                    <View style={styles.modalHeaderRow}>
                                        <View style={[styles.categoryBadge, { backgroundColor: `${getCategoryColor(selectedItem.category)}15` }]}>
                                            <Text style={[styles.categoryBadgeText, { color: getCategoryColor(selectedItem.category) }]}>
                                                {selectedItem.category?.toUpperCase()}
                                            </Text>
                                        </View>
                                        <View style={styles.modalRating}>
                                            <Star color="#F59E0B" size={14} fill="#F59E0B" />
                                            <Text style={[styles.modalRatingText, { color: textPrimary }]}>{selectedItem.rating_avg ? (selectedItem.rating_avg / 10).toFixed(1) : t('roadmaps.notAvailable')}</Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.modalTitle, { color: textPrimary }]}>{selectedItem.title}</Text>
                                    <Text style={[styles.modalDescription, { color: textSecondary }]}>{selectedItem.description}</Text>

                                    {(getCreatorProof(selectedItem) || getDeadlineStrategy(selectedItem) || getTargetDeadline(selectedItem) || getRelativeDueDay(selectedItem)) && (
                                        <View style={styles.section}>
                                            {getCreatorProof(selectedItem) && (
                                                <View style={[styles.infoRow, { backgroundColor: inputBg }]}>
                                                    <ShieldCheck color={colors.primary} size={16} />
                                                    <Text style={[styles.infoText, { color: textPrimary }]}>{t('roadmaps.detailInfo.creatorProof', { value: getCreatorProof(selectedItem) })}</Text>
                                                </View>
                                            )}
                                            {getDeadlineStrategy(selectedItem) && (
                                                <View style={[styles.infoRow, { backgroundColor: inputBg }]}>
                                                    <Zap color="#F59E0B" size={16} />
                                                    <Text style={[styles.infoText, { color: textPrimary }]}>{t('roadmaps.detailInfo.deadlineStrategy', { value: getDeadlineStrategy(selectedItem) })}</Text>
                                                </View>
                                            )}
                                            {getTargetDeadline(selectedItem) && (
                                                <View style={[styles.infoRow, { backgroundColor: inputBg }]}>
                                                    <CalendarDays color="#10B981" size={16} />
                                                    <Text style={[styles.infoText, { color: textPrimary }]}>{t('roadmaps.detailInfo.targetDeadline', { value: formatTargetDeadline(getTargetDeadline(selectedItem)) })}</Text>
                                                </View>
                                            )}
                                            {formatRelativeDueDay(getRelativeDueDay(selectedItem)) && (
                                                <View style={[styles.infoRow, { backgroundColor: inputBg }]}>
                                                    <Clock color="#6366F1" size={16} />
                                                    <Text style={[styles.infoText, { color: textPrimary }]}>{formatRelativeDueDay(getRelativeDueDay(selectedItem))}</Text>
                                                </View>
                                            )}
                                        </View>
                                    )}

                                    {selectedItem.target_audience && (
                                        <View style={[styles.infoRow, { backgroundColor: inputBg }]}>
                                            <GraduationCap color={colors.primary} size={16} />
                                            <Text style={[styles.infoText, { color: textPrimary }]}>{t('roadmaps.detailInfo.audience', { value: selectedItem.target_audience })}</Text>
                                        </View>
                                    )}

                                    <View style={styles.statsGrid}>
                                        <View style={[styles.statBox, { backgroundColor: inputBg }]}>
                                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('roadmaps.statsLabels.difficulty')}</Text>
                                            <Text style={[styles.statValue, { color: textPrimary }]}>{selectedItem.difficulty}</Text>
                                        </View>
                                        <View style={[styles.statBox, { backgroundColor: inputBg }]}>
                                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('roadmaps.statsLabels.duration')}</Text>
                                            <Text style={[styles.statValue, { color: textPrimary }]}>{selectedItem.estimated_duration || t('roadmaps.varies')}</Text>
                                        </View>
                                        <View style={[styles.statBox, { backgroundColor: inputBg }]}>
                                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('roadmaps.statsLabels.steps')}</Text>
                                            <Text style={[styles.statValue, { color: textPrimary }]}>{selectedItem.steps?.length || 0}</Text>
                                        </View>
                                        <View style={[styles.statBox, { backgroundColor: inputBg }]}>
                                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('roadmaps.statsLabels.enrolled')}</Text>
                                            <Text style={[styles.statValue, { color: textPrimary }]}>{(selectedItem.enrollment_count || 0).toLocaleString()}</Text>
                                        </View>
                                    </View>

                                    {selectedItem.outcomes && (
                                        <View style={styles.section}>
                                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('roadmaps.achieveTitle')}</Text>
                                            <Text style={{ color: textSecondary, lineHeight: 22, fontSize: 14 }}>{selectedItem.outcomes}</Text>
                                        </View>
                                    )}

                                    {selectedItem.steps && selectedItem.steps.length > 0 && (
                                        <View style={styles.section}>
                                            <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('roadmaps.learningPath')}</Text>
                                            {selectedItem.steps.map((step: RoadmapStep, idx: number) => (
                                                <View key={step.id || idx} style={[styles.stepCard, { backgroundColor: inputBg }]}>
                                                    <View style={styles.stepHeader}>
                                                        <View style={styles.stepNumber}>
                                                            <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                                        </View>
                                                        {step.duration && (
                                                            <View style={styles.stepDuration}>
                                                                <Clock size={12} color="#6366F1" />
                                                                <Text style={styles.stepDurationText}>{step.duration}</Text>
                                                            </View>
                                                        )}
                                                        {!step.duration && formatRelativeDueDay(getRelativeDueDay(step)) && (
                                                            <View style={styles.stepDuration}>
                                                                <CalendarDays size={12} color="#6366F1" />
                                                                <Text style={styles.stepDurationText}>{formatRelativeDueDay(getRelativeDueDay(step))}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={[styles.stepTitle, { color: textPrimary }]}>{step.title}</Text>
                                                    {step.description && (
                                                        <Text style={[styles.stepDescription, { color: textSecondary }]}>{step.description}</Text>
                                                    )}
                                                    {step.duration && formatRelativeDueDay(getRelativeDueDay(step)) && (
                                                        <Text style={[styles.stepMetaText, { color: textSecondary }]}>{formatRelativeDueDay(getRelativeDueDay(step))}</Text>
                                                    )}
                                                    {(step.deadline_strategy || step.deadlineStrategy) && (
                                                        <Text style={[styles.stepMetaText, { color: textSecondary }]}>
                                                            {t('roadmaps.detailInfo.strategy', { value: step.deadline_strategy || step.deadlineStrategy })}
                                                        </Text>
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.enrollBtn, enrolling && { opacity: 0.7 }]}
                                        onPress={handleEnroll}
                                        disabled={enrolling}
                                    >
                                        {enrolling ? (
                                            <ActivityIndicator color="white" size="small" />
                                        ) : (
                                            <>
                                                <Sparkles size={18} color="white" />
                                                <Text style={styles.enrollBtnText}>{t('roadmaps.startButton')}</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.feedbackBtn, { borderColor }]}
                                        onPress={() => setShowFeedbackModal(true)}
                                    >
                                        <ThumbsUp size={16} color={textSecondary} />
                                        <Text style={[styles.feedbackBtnText, { color: textSecondary }]}>{t('roadmaps.rateButton')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Intent Questions Modal */}
            <Modal visible={showIntentModal} transparent animationType="fade" onRequestClose={() => setShowIntentModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.intentSheet, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor }]}>
                        <View style={styles.intentHeader}>
                            <Sparkles color="#3b82f6" size={24} />
                            <Text style={[styles.intentTitle, { color: textPrimary }]}>{t('roadmaps.intent.title')}</Text>
                            <Text style={[styles.intentSubtitle, { color: textSecondary }]}>{t('roadmaps.intent.subtitle')}</Text>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                            <View style={{ padding: 24, gap: 20 }}>
                                {intentQuestions.map((q) => (
                                    <View key={q.id}>
                                        <Text style={[styles.questionText, { color: textPrimary }]}>{q.question}</Text>
                                        {q.type === 'select' && q.options ? (
                                            <View style={{ gap: 8, marginTop: 8 }}>
                                                {q.options.map(opt => (
                                                    <TouchableOpacity
                                                        key={opt}
                                                        style={[styles.optionBtn, { backgroundColor: inputBg, borderColor }, intentAnswers[q.id] === opt && { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                                                        onPress={() => setIntentAnswers({ ...intentAnswers, [q.id]: opt })}
                                                    >
                                                        <Text style={[styles.optionText, { color: textSecondary }, intentAnswers[q.id] === opt && { color: colors.primary, fontWeight: '600' }]}>{opt}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        ) : (
                                            <TextInput
                                                style={[styles.answerInput, { backgroundColor: inputBg, borderColor, color: textPrimary }]}
                                                value={intentAnswers[q.id] || ''}
                                                onChangeText={(text) => setIntentAnswers({ ...intentAnswers, [q.id]: text })}
                                                placeholder={t('roadmaps.intent.answerPlaceholder')}
                                                placeholderTextColor={textSecondary}
                                                multiline
                                                numberOfLines={3}
                                            />
                                        )}
                                    </View>
                                ))}
                            </View>
                        </ScrollView>
                        <View style={[styles.intentFooter, { borderTopColor: borderColor }]}>
                            <TouchableOpacity style={[styles.intentSkipBtn]} onPress={() => setShowIntentModal(false)}>
                                <Text style={[styles.intentSkipText, { color: textSecondary }]}>{t('roadmaps.intent.skip')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.intentSubmitBtn, { backgroundColor: colors.primary }, intentLoading && { opacity: 0.7 }]}
                                onPress={submitIntent}
                                disabled={intentLoading}
                            >
                                {intentLoading ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <>
                                        <Sparkles size={16} color="white" />
                                        <Text style={styles.intentSubmitText}>{t('roadmaps.intent.submit')}</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Feedback Modal */}
            <Modal visible={showFeedbackModal} transparent animationType="fade" onRequestClose={() => setShowFeedbackModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.feedbackSheet, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor }]}>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setShowFeedbackModal(false)}>
                            <X color={textPrimary} size={18} />
                        </TouchableOpacity>
                        <View style={{ padding: 24 }}>
                            <Text style={[styles.feedbackTitle, { color: textPrimary }]}>{t('roadmaps.feedback.title')}</Text>
                            <Text style={[styles.feedbackSubtitle, { color: textSecondary }]}>{t('roadmaps.feedback.subtitle')}</Text>

                            <View style={styles.starRating}>
                                {[1, 2, 3, 4, 5].map(star => (
                                    <TouchableOpacity key={star} onPress={() => setFeedbackScore(star)}>
                                        <Star
                                            size={32}
                                            color={star <= feedbackScore ? '#F59E0B' : textSecondary}
                                            fill={star <= feedbackScore ? '#F59E0B' : 'none'}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <TextInput
                                style={[styles.feedbackInput, { backgroundColor: inputBg, borderColor, color: textPrimary }]}
                                value={feedbackText}
                                onChangeText={setFeedbackText}
                                placeholder={t('roadmaps.feedback.placeholder')}
                                placeholderTextColor={textSecondary}
                                multiline
                                numberOfLines={4}
                            />

                            <TouchableOpacity
                                style={[styles.submitFeedbackBtn, { backgroundColor: colors.primary }, feedbackSubmitting && { opacity: 0.7 }]}
                                onPress={submitFeedback}
                                disabled={feedbackSubmitting || feedbackScore === 0}
                            >
                                {feedbackSubmitting ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <>
                                        <CheckCircle size={18} color="white" />
                                        <Text style={styles.submitFeedbackText}>{t('roadmaps.feedback.submit')}</Text>
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

function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
        'scholarship': '#6366F1',
        'career': '#3b82f6',
        'education': '#3B82F6',
        'skills': '#10B981',
        'business': '#F59E0B',
        'tech': '#06B6D4',
        'personal': '#EC4899',
        'general': '#94A3B8',
    };
    return colors[category] || '#94A3B8';
}

const styles = StyleSheet.create({
    creatorBanner: {
        marginHorizontal: 20,
        marginTop: 12,
        marginBottom: 16,
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
    },
    creatorBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        position: 'relative',
    },
    creatorBannerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        flex: 1,
    },
    creatorBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatorBannerText: {
        flex: 1,
    },
    creatorBannerTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    creatorBannerSubtitle: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        lineHeight: 16,
    },
    creatorBannerArrow: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    templateBanner: {
        marginHorizontal: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderRadius: 20,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    templateBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    templateBannerText: {
        flex: 1,
    },
    templateBannerTitle: {
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 2,
    },
    templateBannerSubtitle: {
        fontSize: 12,
        lineHeight: 17,
    },
    header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
    searchBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, marginBottom: 16, gap: 10 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500' },
    filterScroll: { marginBottom: 4 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
    filterChipText: { fontSize: 13, fontWeight: '600' },
    filterChipTextActive: { color: 'white' },
    listContent: { paddingHorizontal: 14, paddingBottom: 100, flexGrow: 1 },
    headerBleed: { marginHorizontal: -14 },
    row: { justifyContent: 'space-between', marginBottom: 16 },
    mySection: { marginBottom: 4 },
    myHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingRight: 2 },
    myTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    myTitle: { fontSize: 16, fontWeight: '800' },
    myCountPill: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
    myCountText: { fontSize: 11, fontWeight: '800' },
    myCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    myCreateText: { fontSize: 13, fontWeight: '700' },
    myScroll: { gap: 12, paddingRight: 14, paddingBottom: 4 },
    myCard: { width: 150, borderRadius: 18, borderWidth: 1, padding: 14, justifyContent: 'space-between', minHeight: 130 },
    myCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    myCardTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 18, flex: 1 },
    myCardBadge: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    myCardBadgeText: { fontSize: 10.5, fontWeight: '800' },
    mySectionLabel: { fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 12 },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 14 },
    emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 20 },
    card: { width: '47.5%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    imageContainer: { position: 'relative', width: '100%', height: 100 },
    cardImage: { width: '100%', height: '100%' },
    cardImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    featuredBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(245,158,11,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    featuredText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
    cardBody: { padding: 14 },
    cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, lineHeight: 18 },
    cardSummary: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
    cardDeadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
    cardDeadlineText: { flex: 1, fontSize: 10, fontWeight: '700' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badgeRow: { flexDirection: 'row', gap: 6 },
    difficultyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '600' },
    userCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    userCountText: { fontSize: 11, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '85%', borderWidth: 1 },
    modalClose: { position: 'absolute', top: 20, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.1)', padding: 10, borderRadius: 25 },
    modalImageContainer: { width: '100%', height: 200 },
    modalImage: { width: '100%', height: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    modalImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    modalBody: { padding: 24 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    categoryBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    categoryBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    modalRating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    modalRatingText: { fontSize: 16, fontWeight: 'bold' },
    modalTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
    modalDescription: { fontSize: 15, lineHeight: 22, marginBottom: 16 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 16 },
    infoText: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    statBox: { flex: 1, minWidth: '45%', padding: 12, borderRadius: 12 },
    statLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
    statValue: { fontSize: 16, fontWeight: 'bold' },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
    stepCard: { padding: 16, borderRadius: 12, marginBottom: 8 },
    stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
    stepNumberText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
    stepDuration: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(99,102,241,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    stepDurationText: { color: '#6366F1', fontSize: 10, fontWeight: '600' },
    stepTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
    stepDescription: { fontSize: 13, lineHeight: 18 },
    stepMetaText: { fontSize: 12, lineHeight: 17, marginTop: 8 },
    enrollBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16, backgroundColor: '#6366F1' },
    enrollBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    feedbackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1, marginTop: 12 },
    feedbackBtnText: { fontWeight: '600', fontSize: 14 },
    intentSheet: { marginHorizontal: 20, marginTop: 60, borderRadius: 24, maxHeight: '80%', borderWidth: 1 },
    intentHeader: { padding: 24, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
    intentTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
    intentSubtitle: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    questionText: { fontSize: 16, fontWeight: '600' },
    optionBtn: { padding: 14, borderRadius: 12, borderWidth: 1 },
    optionText: { fontSize: 14, fontWeight: '500' },
    answerInput: { padding: 14, borderRadius: 12, borderWidth: 1, minHeight: 80, fontSize: 14, marginTop: 8 },
    intentFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderTopWidth: 1 },
    intentSkipBtn: { padding: 12 },
    intentSkipText: { fontSize: 14, fontWeight: '500' },
    intentSubmitBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 12 },
    intentSubmitText: { color: 'white', fontSize: 15, fontWeight: '700' },
    feedbackSheet: { marginHorizontal: 20, marginTop: 100, borderRadius: 24, borderWidth: 1 },
    feedbackTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
    feedbackSubtitle: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
    starRating: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 24 },
    feedbackInput: { padding: 16, borderRadius: 12, borderWidth: 1, minHeight: 100, fontSize: 14, marginBottom: 16 },
    submitFeedbackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 16 },
    submitFeedbackText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
