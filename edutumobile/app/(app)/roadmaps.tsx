import {
    View, Text, FlatList, TextInput,
    StyleSheet, Image, TouchableOpacity, ActivityIndicator, Modal, ScrollView, RefreshControl,
    Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Search, BookOpen, Star, Users, Rocket, Wand2,
    X, Clock, ChevronRight, CalendarDays,
    ShieldCheck, CheckCircle, Zap, GraduationCap,
    ThumbsUp, Pencil, Plus, CalendarPlus, MessagesSquare, ArrowRight
} from "lucide-react-native";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../components/context/ThemeContext";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ScreenHeader } from "../../components/ui/ScreenHeader";
import { LinearGradient } from "expo-linear-gradient";
import { LoadState } from "../../components/ui/LoadState";
import { SuccessDialog } from "../../components/ui/SuccessDialog";
import { shareIcsString } from "../../lib/roadmapCalendar";
import { swr } from "../../packages/core/src/services/swrCache";
import { urgencyColor, type UrgencyLevel } from "../../packages/core/src/utils/deadline";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://edutu-platform.onrender.com').replace(/\/$/, '');
const API_RETRY_COOLDOWN_MS = 30 * 1000;
// Set when the user skips the intent intake, so the modal never nags.
// Submitting stores the intent server-side, which also stops future prompts.
const INTENT_PROMPT_DISMISSED_KEY = 'edutu_roadmaps_intent_prompt_dismissed';

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

// Pull the human-readable reason out of a failed API response. NestJS error
// bodies are { message: string | string[] }; fall back to the status text so
// the user never sees a bare, duplicated "Enrollment failed".
async function extractErrorMessage(res: Response): Promise<string> {
    try {
        const body = await res.clone().json();
        const raw = body?.message ?? body?.error;
        const message = Array.isArray(raw) ? raw.filter(Boolean).join('\n') : raw;
        if (typeof message === 'string' && message.trim()) return message.trim();
    } catch {
        // Not JSON (HTML error page, empty body) — fall through to status text.
    }
    return res.statusText ? `${res.status} ${res.statusText}` : `HTTP ${res.status}`;
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

/**
 * What the catalog needs to know about a roadmap the user already started:
 * enough to swap "Start" for "Continue" and draw a progress figure. Built from
 * GET /roadmaps/my-enrollments, keyed by roadmap id.
 */
interface EnrollmentSummary {
    enrollmentId: string;
    completedSteps: number;
    totalSteps: number;
    communityAction?: RoadmapAdoptionResponse['communityAction'];
}

const CATEGORY_FILTERS = ['All', 'Scholarship', 'Career', 'Education', 'Skills', 'Business', 'Tech'];

/**
 * Urgency level from a target deadline, so the deadline row on a card uses the
 * app-wide green → amber → red ramp instead of the roadmap's category hue
 * (which is decorative, and fails contrast at label sizes).
 */
function deadlineUrgency(deadline?: string | null): UrgencyLevel {
    if (!deadline) return 'none';
    const time = new Date(deadline).getTime();
    if (Number.isNaN(time)) return 'none';
    const days = Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'expired';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days <= 7) return 'urgent';
    if (days <= 30) return 'soon';
    return 'normal';
}

export default function RoadmapsScreen() {
    const { t, i18n } = useTranslation('goals');
    const { isDark, colors } = useTheme();
    const router = useRouter();
    // `edutu://roadmap/<id>` redirects here carrying the id, so a shared link
    // opens the roadmap it names instead of an unfiltered catalog.
    const { open: openRoadmapId } = useLocalSearchParams<{ open?: string }>();
    const { user } = useUser();
    const { getToken } = useAuth();
    const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
    const [myRoadmaps, setMyRoadmaps] = useState<Roadmap[]>([]);
    const [enrollments, setEnrollments] = useState<Record<string, EnrollmentSummary>>({});
    const [loading, setLoading] = useState(true);
    // Pull-to-refresh owns its own flag. Sharing `loading` made the first paint
    // render the pull spinner *and* the full-screen LoadState at the same time.
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [selectedItem, setSelectedItem] = useState<Roadmap | null>(null);
    const [enrolling, setEnrolling] = useState(false);
    const [showIntentModal, setShowIntentModal] = useState(false);
    const [intentQuestions, setIntentQuestions] = useState<AIQuestion[]>([]);
    const [intentAnswers, setIntentAnswers] = useState<Record<string, string>>({});
    const [intentLoading, setIntentLoading] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackScore, setFeedbackScore] = useState(0);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
    // The adoption that just happened, if any — drives the success dialog and
    // the sheet's post-adoption state (calendar / community live there now,
    // instead of as extra buttons on a four-option Alert).
    const [justAdopted, setJustAdopted] = useState<RoadmapAdoptionResponse | null>(null);
    const [showAdoptedDialog, setShowAdoptedDialog] = useState(false);

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

    // Which roadmaps has this user already started? Without this the catalog has
    // no memory: every card offers "Start", and tapping it a second time adopts
    // the same roadmap again and duplicates its milestone goals.
    const fetchEnrollments = useCallback(async () => {
        if (!user) { setEnrollments({}); return; }
        try {
            const token = await getToken();
            if (!token) return;
            const res = await apiFetch('/roadmaps/my-enrollments', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res?.ok) return;
            const rows = await res.json();
            if (!Array.isArray(rows)) return;

            const next: Record<string, EnrollmentSummary> = {};
            for (const row of rows) {
                const enrollment = row?.enrollment ?? row;
                const roadmap = row?.roadmap;
                const roadmapId = enrollment?.roadmap_id ?? enrollment?.roadmapId;
                if (!roadmapId) continue;
                const completed = enrollment?.completed_steps ?? enrollment?.completedSteps ?? [];
                next[String(roadmapId)] = {
                    enrollmentId: String(enrollment.id),
                    completedSteps: Array.isArray(completed) ? completed.length : 0,
                    totalSteps: Array.isArray(roadmap?.steps) ? roadmap.steps.length : 0,
                    communityAction: enrollment?.communityAction ?? enrollment?.community_action ?? null,
                };
            }
            setEnrollments(next);
        } catch {
            /* non-critical — the catalog still renders without progress marks */
        }
    }, [user, getToken]);

    useFocusEffect(useCallback(() => {
        fetchMine();
        fetchEnrollments();
    }, [fetchMine, fetchEnrollments]));

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchRoadmaps(), fetchMine(), fetchEnrollments()]);
        } finally {
            setRefreshing(false);
        }
    }, [fetchRoadmaps, fetchMine, fetchEnrollments]);

    // A deep-linked roadmap opens its sheet directly. Prefer the copy already in
    // the list (instant), fall back to fetching it by id so a link to a roadmap
    // outside the current page/filter still resolves.
    const openedDeepLinkRef = useRef<string | null>(null);
    useEffect(() => {
        const id = typeof openRoadmapId === 'string' ? openRoadmapId : '';
        if (!id || openedDeepLinkRef.current === id) return;
        openedDeepLinkRef.current = id;

        const local = roadmaps.find((r) => r.id === id) || myRoadmaps.find((r) => r.id === id);
        if (local) { setSelectedItem(local); return; }

        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetch(`/roadmaps/${id}`);
                if (!res?.ok || cancelled) return;
                const data = await res.json();
                if (data?.id && !cancelled) setSelectedItem(data);
            } catch {
                /* the catalog is already on screen — a dead link just stays on it */
            }
        })();
        return () => { cancelled = true; };
    }, [openRoadmapId, roadmaps, myRoadmaps]);

    // ── Intent intake (ask once) ─────────────────────────────────────────────
    // After the catalog first paints, check whether this user has a stored
    // roadmap intent (GET /roadmaps/intent → null when none):
    //   • has intent  → seed the default view with personalized picks
    //     (/roadmaps/recommended); any category/search interaction refetches
    //     the full catalog as usual.
    //   • no intent   → open the intake modal once — AI-generated questions
    //     via /roadmaps/ai/assist, falling back to three built-in translated
    //     questions when that's unavailable (offline / out of credits).
    // Skipping is remembered on-device so the modal never nags.
    const intentCheckedRef = useRef(false);
    useEffect(() => {
        if (intentCheckedRef.current || loading || !user) return;
        intentCheckedRef.current = true;
        let cancelled = false;
        (async () => {
            try {
                const dismissed = await AsyncStorage.getItem(INTENT_PROMPT_DISMISSED_KEY);
                const token = await getToken();
                if (!token || cancelled) return;
                const intentRes = await apiFetch('/roadmaps/intent', {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!intentRes?.ok || cancelled) return;
                // 200 with an empty/null body means "no intent yet".
                const intent = await intentRes.json().catch(() => null);
                if (cancelled) return;

                if (intent) {
                    const recRes = await apiFetch('/roadmaps/recommended?limit=10', {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (recRes?.ok && !cancelled) {
                        const recData = await recRes.json();
                        // The SWR background refresh of the catalog can, rarely,
                        // land after this and win — acceptable: the personalized
                        // view is a default, not a mode, and re-applies next visit.
                        if (Array.isArray(recData) && recData.length > 0 && !cancelled) {
                            setRoadmaps(recData);
                        }
                    }
                    return;
                }

                if (dismissed) return;

                // No intent on file: fetch intake questions, preferring the
                // AI-personalized set. /roadmaps/ai/* is credit-metered — a
                // 402/429/offline simply uses the built-in questions.
                let questions: AIQuestion[] | null = null;
                try {
                    const assistRes = await apiFetch('/roadmaps/ai/assist', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            topic: 'learning and career growth',
                            category: category !== 'All' ? category.toLowerCase() : undefined,
                        }),
                    });
                    if (assistRes?.ok) {
                        const data = await assistRes.json();
                        if (Array.isArray(data?.questions) && data.questions.length > 0) {
                            questions = data.questions;
                        }
                    }
                } catch { /* fall through to the default questions */ }

                if (cancelled) return;
                setIntentQuestions(
                    questions ?? [
                        { id: 'q1', question: t('roadmaps.intent.q1'), type: 'select', options: [t('roadmaps.intent.levels.beginner'), t('roadmaps.intent.levels.intermediate'), t('roadmaps.intent.levels.advanced')] },
                        { id: 'q2', question: t('roadmaps.intent.q2'), type: 'select', options: [t('roadmaps.intent.time.lessThan5'), t('roadmaps.intent.time.hours5to10'), t('roadmaps.intent.time.hours10to20'), t('roadmaps.intent.time.hours20plus')] },
                        { id: 'q3', question: t('roadmaps.intent.q3'), type: 'text' },
                    ],
                );
                setShowIntentModal(true);
            } catch (e) {
                // Intent is a nice-to-have on top of the already-rendered
                // catalog — never let it surface an error state.
                console.warn('Roadmap intent check skipped:', e);
            }
        })();
        return () => { cancelled = true; };
    }, [loading, user, getToken, category, t]);

    // Skip = "don't ask me again" (on this device). Submitting stores the
    // intent server-side, which stops future prompts everywhere.
    const dismissIntentPrompt = useCallback(() => {
        setShowIntentModal(false);
        AsyncStorage.setItem(INTENT_PROMPT_DISMISSED_KEY, '1').catch(() => { /* best effort */ });
    }, []);

    const hasIntentAnswer = useMemo(
        () => Object.values(intentAnswers).some((answer) => (answer || '').trim().length > 0),
        [intentAnswers],
    );

    const submitIntent = async () => {
        if (!user || !hasIntentAnswer) return;
        setIntentLoading(true);
        try {
            const token = await getAuthToken();
            const goals = Object.values(intentAnswers).filter(Boolean) as string[];

            // The DTO wants the ENGLISH enum, but the answer the user tapped is
            // translated copy — map by option position instead of lowercasing
            // the label (which 400'd for every non-English locale). AI-generated
            // question sets have no q1, so the level is simply omitted there.
            const levelQuestion = intentQuestions.find((q) => q.id === 'q1');
            const levelIndex = levelQuestion?.options?.indexOf(intentAnswers['q1'] ?? '') ?? -1;
            const currentLevel = (['beginner', 'intermediate', 'advanced'] as const)[levelIndex];

            const res = await apiFetch('/roadmaps/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    goals,
                    currentLevel,
                    targetCategory: category !== 'All' ? category.toLowerCase() : undefined,
                    additionalContext: intentAnswers['q3'] || '',
                }),
            });
            // Keep the modal open on failure so the answers aren't lost —
            // the old fire-and-forget close made a rejected save look saved.
            if (!res?.ok) throw new Error(`intent save failed (${res?.status ?? 'offline'})`);

            // Seed the list with personalized picks now that intent exists.
            const recRes = await apiFetch('/roadmaps/recommended?limit=10', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (recRes?.ok) {
                const recData = await recRes.json();
                if (Array.isArray(recData) && recData.length > 0) {
                    setRoadmaps(recData);
                }
            }

            setShowIntentModal(false);
        } catch (e) {
            console.error('Failed to submit intent:', e);
            Alert.alert(t('common:states.error'), t('roadmaps.intent.saveFailed'));
        } finally {
            setIntentLoading(false);
        }
    };

    const submitFeedback = async () => {
        if (!user || !selectedItem || feedbackScore === 0) return;
        setFeedbackSubmitting(true);
        try {
            const token = await getAuthToken();
            const res = await apiFetch('/roadmaps/feedback', {
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

            // apiFetch resolves any status and returns null only when the API is
            // unreachable — so an unchecked response thanked the user for a
            // rating the server had rejected. Keep the sheet open on failure so
            // the stars and note aren't lost.
            if (res === null) {
                Alert.alert(t('roadmaps.enroll.offlineTitle'), t('roadmaps.enroll.offlineMessage'));
                return;
            }
            if (!res.ok) {
                Alert.alert(t('roadmaps.feedback.failedTitle'), await extractErrorMessage(res));
                return;
            }

            setShowFeedbackModal(false);
            setFeedbackScore(0);
            setFeedbackText('');
            Alert.alert(t('roadmaps.feedback.thanksTitle'), t('roadmaps.feedback.thanksMessage'));
        } catch (e) {
            console.error('Feedback failed:', e);
            Alert.alert(t('roadmaps.enroll.offlineTitle'), t('roadmaps.enroll.offlineMessage'));
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
        // Follow the app's active language, not en-US — an American date inside
        // translated copy (and inside RTL Arabic) is the tell that this string
        // was never localised.
        const formatted = date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' });
        if (diffDays === 0) return t('roadmaps.deadline.dueToday', { date: formatted });
        if (diffDays === 1) return t('roadmaps.deadline.dueTomorrow', { date: formatted });
        if (diffDays > 1) return t('roadmaps.deadline.daysLeft', { date: formatted, count: diffDays });
        return t('roadmaps.deadline.overdue', { date: formatted });
    }, [t, i18n.language]);

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

    // The backend hands back where this roadmap's community lives; honour it
    // rather than pushing back to the screen the user is already looking at.
    const openCommunity = useCallback((action?: RoadmapAdoptionResponse['communityAction']) => {
        const route = action?.route;
        if (!route) return;
        setShowAdoptedDialog(false);
        setSelectedItem(null);
        router.push(route as never);
    }, [router]);

    const closeSheet = useCallback(() => {
        setSelectedItem(null);
        setJustAdopted(null);
    }, []);

    const handleEnroll = async () => {
        if (!selectedItem || !user) return;
        const target = selectedItem;
        setEnrolling(true);
        try {
            const token = await getAuthToken();
            // A missing token means the session lapsed — sending an empty
            // bearer just earns a 401 the user can't read. Say so plainly.
            if (!token) {
                Alert.alert(t('roadmaps.enroll.signInTitle'), t('roadmaps.enroll.signInMessage'));
                return;
            }

            const res = await postEnrollment(token, target);

            // apiFetch returns null only when the network/API is unreachable —
            // that's an offline state, not an enrollment failure. Keep the
            // sheet open so a single Retry finishes the job once back online.
            if (res === null) {
                Alert.alert(t('roadmaps.enroll.offlineTitle'), t('roadmaps.enroll.offlineMessage'), [
                    { text: t('roadmaps.enroll.cancel'), style: 'cancel' },
                    { text: t('roadmaps.enroll.retry'), onPress: () => { void handleEnroll(); } },
                ]);
                return;
            }

            if (!res.ok) {
                // Surface the server's own reason (NestJS sends { message }) and
                // the status, so "Enrollment failed" becomes something the user —
                // and we — can actually act on.
                const reason = await extractErrorMessage(res);
                Alert.alert(t('roadmaps.enroll.failedTitle'), reason, [
                    { text: t('roadmaps.enroll.cancel'), style: 'cancel' },
                    { text: t('roadmaps.enroll.retry'), onPress: () => { void handleEnroll(); } },
                ]);
                return;
            }

            let adoption: RoadmapAdoptionResponse | null = null;
            try {
                adoption = await res.json();
            } catch {
                adoption = null;
            }

            // Keep the sheet mounted and switch it to its adopted state. The old
            // four-button Alert stacked vertically on iOS with no visual primary,
            // and its "Open Community" action pushed back to this same screen.
            setJustAdopted(adoption);
            setShowAdoptedDialog(true);
            if (adoption?.id) {
                setEnrollments((existing) => ({
                    ...existing,
                    [target.id]: {
                        enrollmentId: adoption.id,
                        completedSteps: 0,
                        totalSteps: target.steps?.length ?? 0,
                        communityAction: adoption.communityAction || adoption.community_action || null,
                    },
                }));
            }
            fetchRoadmaps();
            fetchEnrollments();
        } catch {
            // fetch() rejected despite apiFetch's guard (rare) — treat as offline.
            Alert.alert(t('roadmaps.enroll.offlineTitle'), t('roadmaps.enroll.offlineMessage'), [
                { text: t('roadmaps.enroll.cancel'), style: 'cancel' },
                { text: t('roadmaps.enroll.retry'), onPress: () => { void handleEnroll(); } },
            ]);
        } finally {
            setEnrolling(false);
        }
    };

    const filteredRoadmaps = useMemo(() => {
        // The server already applied the category filter. Re-applying it here
        // against a hardcoded seven-name list meant any category the backend
        // knows about but this screen doesn't rendered as "No roadmaps found".
        // Only the search term is narrowed locally, so typing feels instant
        // while the debounced request is still in flight.
        const term = search.trim().toLowerCase();
        if (!term) return roadmaps;
        return roadmaps.filter((r) => (
            r.title.toLowerCase().includes(term) ||
            (r.description || '').toLowerCase().includes(term) ||
            (r.creator_name || '').toLowerCase().includes(term)
        ));
    }, [roadmaps, search]);

    const renderCard = useCallback(({ item }: { item: Roadmap }) => {
        const categoryColor = getCategoryColor(item.category);
        const targetDeadline = getTargetDeadline(item);
        const deadlineLabel = formatTargetDeadline(targetDeadline);
        const relativeDueLabel = formatRelativeDueDay(getRelativeDueDay(item));
        const deadlineTint = urgencyColor(deadlineUrgency(targetDeadline));
        const enrollment = enrollments[item.id];
        const progress = enrollment && enrollment.totalSteps > 0
            ? Math.round((enrollment.completedSteps / enrollment.totalSteps) * 100)
            : 0;

        return (
            <TouchableOpacity
                style={[styles.card, { backgroundColor: cardBg, borderColor }]}
                onPress={() => setSelectedItem(item)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                    enrollment
                        ? t('roadmaps.a11y.cardStarted', {
                            title: item.title,
                            completed: enrollment.completedSteps,
                            total: enrollment.totalSteps,
                        })
                        : t('roadmaps.a11y.card', { title: item.title, difficulty: item.difficulty })
                }
                accessibilityHint={t('roadmaps.a11y.cardHint')}
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
                            <Star color="#FFFFFF" size={11} fill="#FFFFFF" />
                            <Text style={styles.featuredText}>{t('roadmaps.featured')}</Text>
                        </View>
                    )}
                    {enrollment && (
                        <View style={styles.startedBadge}>
                            <CheckCircle color="#FFFFFF" size={11} />
                            <Text style={styles.startedText}>{t('roadmaps.started')}</Text>
                        </View>
                    )}
                </View>
                <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={2}>{item.title}</Text>
                    <Text style={[styles.cardSummary, { color: textSecondary }]} numberOfLines={2}>
                        {item.description || t('roadmaps.noDescription')}
                    </Text>
                    {enrollment && enrollment.totalSteps > 0 && (
                        <View style={styles.progressBlock}>
                            <View style={[styles.progressTrack, { backgroundColor: `${colors.primary}22` }]}>
                                <View style={[styles.progressFill, { width: `${Math.max(progress, 3)}%`, backgroundColor: colors.primary }]} />
                            </View>
                            <Text style={[styles.progressLabel, { color: textSecondary }]} numberOfLines={1}>
                                {t('roadmaps.progressLabel', { completed: enrollment.completedSteps, total: enrollment.totalSteps })}
                            </Text>
                        </View>
                    )}
                    {(deadlineLabel || relativeDueLabel) && (
                        // The urgency ramp carries the meaning through the icon and
                        // the pill tint; the label itself stays at ink contrast.
                        // 10px category-hue text on a white card measured ~2.1:1.
                        <View style={[styles.cardDeadlineRow, { backgroundColor: `${deadlineTint}1A` }]}>
                            <CalendarDays size={12} color={deadlineTint} />
                            <Text style={[styles.cardDeadlineText, { color: textPrimary }]} numberOfLines={1}>
                                {deadlineLabel || relativeDueLabel}
                            </Text>
                        </View>
                    )}
                    <View style={styles.cardFooter}>
                        <View style={styles.badgeRow}>
                            <View style={[styles.difficultyBadge, { backgroundColor: `${categoryColor}22` }]}>
                                <Text style={[styles.badgeText, { color: textPrimary }]}>{item.difficulty}</Text>
                            </View>
                            {item.steps?.length > 0 && (
                                <View style={[styles.difficultyBadge, { backgroundColor: `${categoryColor}22` }]}>
                                    <Text style={[styles.badgeText, { color: textPrimary }]}>{t('roadmaps.stepsCount', { count: item.steps.length })}</Text>
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
    }, [cardBg, borderColor, textPrimary, textSecondary, t, formatTargetDeadline, formatRelativeDueDay, enrollments, colors.primary]);

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
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
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
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: category === cat }}
                                            accessibilityLabel={t(`roadmaps.categories.${cat.toLowerCase()}`)}
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
                            onRetry={handleRefresh}
                            onBack={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
                        />
                    ) : (
                        <View style={styles.emptyWrap}>
                            <BookOpen size={40} color={textSecondary} />
                            <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('roadmaps.emptyTitle')}</Text>
                            <Text style={[styles.emptyText, { color: textSecondary }]}>{t('roadmaps.empty')}</Text>
                            {(search || category !== 'All') && (
                                <TouchableOpacity
                                    style={[styles.emptyAction, { borderColor: colors.primary }]}
                                    onPress={() => { setSearch(''); setCategory('All'); }}
                                    accessibilityRole="button"
                                >
                                    <Text style={[styles.emptyActionText, { color: colors.primary }]}>{t('roadmaps.clearFilters')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )
                }
            />

            {/* Roadmap Detail Modal */}
            <Modal visible={!!selectedItem} transparent animationType="slide" onRequestClose={closeSheet}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor }]}>
                        <TouchableOpacity
                            style={styles.modalClose}
                            onPress={closeSheet}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={t('roadmaps.a11y.close')}
                        >
                            <X color="#FFFFFF" size={20} />
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
                                        {/* rating_avg is numeric(3,2) — already a 0–5 mean. It was
                                            being divided by 10, so a 4.6-rated roadmap displayed
                                            as "0.5" beside a filled star. */}
                                        {selectedItem.rating_count > 0 && selectedItem.rating_avg > 0 ? (
                                            <View style={styles.modalRating}>
                                                <Star color="#F59E0B" size={14} fill="#F59E0B" />
                                                <Text style={[styles.modalRatingText, { color: textPrimary }]}>
                                                    {selectedItem.rating_avg.toFixed(1)}
                                                </Text>
                                                <Text style={[styles.modalRatingCount, { color: textSecondary }]}>
                                                    ({selectedItem.rating_count})
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={[styles.modalRatingCount, { color: textSecondary }]}>
                                                {t('roadmaps.notRatedYet')}
                                            </Text>
                                        )}
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

                                    {(() => {
                                        const enrollment = enrollments[selectedItem.id];
                                        const communityAction =
                                            justAdopted?.communityAction ||
                                            justAdopted?.community_action ||
                                            enrollment?.communityAction;

                                        // Already started: never offer "Start" again — a second
                                        // adoption silently duplicates every milestone goal.
                                        if (enrollment) {
                                            return (
                                                <>
                                                    <View style={[styles.adoptedNotice, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                                                        <CheckCircle size={16} color="#10B981" />
                                                        <Text style={[styles.adoptedNoticeText, { color: textPrimary }]}>
                                                            {enrollment.totalSteps > 0
                                                                ? t('roadmaps.adopted.progress', {
                                                                    completed: enrollment.completedSteps,
                                                                    total: enrollment.totalSteps,
                                                                })
                                                                : t('roadmaps.adopted.inPlan')}
                                                        </Text>
                                                    </View>

                                                    <TouchableOpacity
                                                        style={styles.enrollBtn}
                                                        onPress={() => { closeSheet(); router.push('/goals'); }}
                                                        accessibilityRole="button"
                                                    >
                                                        <ArrowRight size={18} color="white" />
                                                        <Text style={styles.enrollBtnText}>{t('roadmaps.continueButton')}</Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[styles.feedbackBtn, { borderColor }]}
                                                        onPress={() => handleAddCalendar(enrollment.enrollmentId)}
                                                        accessibilityRole="button"
                                                    >
                                                        <CalendarPlus size={16} color={textSecondary} />
                                                        <Text style={[styles.feedbackBtnText, { color: textSecondary }]}>
                                                            {t('roadmaps.enroll.addToCalendar')}
                                                        </Text>
                                                    </TouchableOpacity>

                                                    {communityAction?.route ? (
                                                        <TouchableOpacity
                                                            style={[styles.feedbackBtn, { borderColor }]}
                                                            onPress={() => openCommunity(communityAction)}
                                                            accessibilityRole="button"
                                                        >
                                                            <MessagesSquare size={16} color={textSecondary} />
                                                            <Text style={[styles.feedbackBtnText, { color: textSecondary }]}>
                                                                {communityAction.label || t('roadmaps.enroll.openCommunity')}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ) : null}

                                                    <TouchableOpacity
                                                        style={[styles.feedbackBtn, { borderColor }]}
                                                        onPress={() => setShowFeedbackModal(true)}
                                                        accessibilityRole="button"
                                                    >
                                                        <ThumbsUp size={16} color={textSecondary} />
                                                        <Text style={[styles.feedbackBtnText, { color: textSecondary }]}>{t('roadmaps.rateButton')}</Text>
                                                    </TouchableOpacity>
                                                </>
                                            );
                                        }

                                        return (
                                            <>
                                                {/* Say what the button will actually do before it does it:
                                                    adopting creates goals and schedules reminders, and the
                                                    user was never told. */}
                                                <Text style={[styles.enrollHint, { color: textSecondary }]}>
                                                    {t('roadmaps.startHint', { count: selectedItem.steps?.length || 0 })}
                                                </Text>
                                                <TouchableOpacity
                                                    style={[styles.enrollBtn, enrolling && { opacity: 0.7 }]}
                                                    onPress={handleEnroll}
                                                    disabled={enrolling}
                                                    accessibilityRole="button"
                                                    accessibilityState={{ disabled: enrolling, busy: enrolling }}
                                                >
                                                    {enrolling ? (
                                                        <ActivityIndicator color="white" size="small" />
                                                    ) : (
                                                        <>
                                                            <Rocket size={18} color="white" />
                                                            <Text style={styles.enrollBtnText}>{t('roadmaps.startButton')}</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={[styles.feedbackBtn, { borderColor }]}
                                                    onPress={() => setShowFeedbackModal(true)}
                                                    accessibilityRole="button"
                                                >
                                                    <ThumbsUp size={16} color={textSecondary} />
                                                    <Text style={[styles.feedbackBtnText, { color: textSecondary }]}>{t('roadmaps.rateButton')}</Text>
                                                </TouchableOpacity>
                                            </>
                                        );
                                    })()}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Intent Questions Modal */}
            <Modal visible={showIntentModal} transparent animationType="fade" onRequestClose={dismissIntentPrompt}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.intentSheet, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF", borderColor }]}>
                        <View style={styles.intentHeader}>
                            <Wand2 color="#3b82f6" size={24} />
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
                            <TouchableOpacity style={[styles.intentSkipBtn]} onPress={dismissIntentPrompt}>
                                <Text style={[styles.intentSkipText, { color: textSecondary }]}>{t('roadmaps.intent.skip')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.intentSubmitBtn,
                                    { backgroundColor: colors.primary },
                                    (intentLoading || !hasIntentAnswer) && { opacity: 0.5 },
                                ]}
                                onPress={submitIntent}
                                // Submitting with nothing filled posts goals: [] and the
                                // DTO rejects it — block the dead tap instead.
                                disabled={intentLoading || !hasIntentAnswer}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: intentLoading || !hasIntentAnswer }}
                            >
                                {intentLoading ? (
                                    <ActivityIndicator color="white" size="small" />
                                ) : (
                                    <>
                                        <Wand2 size={16} color="white" />
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

            {/*
              Adoption succeeded. One primary route forward ("See my plan"), one
              quiet way back to browsing — the calendar and community actions
              that used to crowd this moment now live in the sheet behind it,
              which stays open and has switched to its adopted state.
            */}
            <SuccessDialog
                visible={showAdoptedDialog}
                kind="roadmap"
                title={t('roadmaps.enroll.adoptedTitle')}
                message={buildAdoptionMessage(justAdopted)}
                actionLabel={t('roadmaps.enroll.viewGoals')}
                onAction={() => {
                    setShowAdoptedDialog(false);
                    closeSheet();
                    router.push('/goals');
                }}
                secondaryLabel={t('roadmaps.enroll.continueBrowsing')}
                onSecondary={() => setShowAdoptedDialog(false)}
            />
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
    emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 10 },
    emptyTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
    emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
    emptyAction: { marginTop: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    emptyActionText: { fontSize: 13, fontWeight: '800' },
    card: { width: '47.5%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
    imageContainer: { position: 'relative', width: '100%', height: 100 },
    cardImage: { width: '100%', height: '100%' },
    cardImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    featuredBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(180,83,9,0.94)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    featuredText: { color: 'white', fontSize: 11, fontWeight: '800' },
    startedBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(4,120,87,0.94)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    startedText: { color: 'white', fontSize: 11, fontWeight: '800' },
    cardBody: { padding: 14 },
    cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, lineHeight: 18 },
    cardSummary: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
    progressBlock: { marginBottom: 10, gap: 5 },
    progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressLabel: { fontSize: 11, fontWeight: '700' },
    cardDeadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8 },
    cardDeadlineText: { flex: 1, fontSize: 11, fontWeight: '700' },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badgeRow: { flexDirection: 'row', gap: 6 },
    difficultyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    userCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    userCountText: { fontSize: 11, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '85%', borderWidth: 1 },
    // 44×44 minimum: the old 18px icon in 10px padding gave a ~38pt target in
    // the hardest corner for a thumb, over an image whose brightness is unknown
    // — hence the fixed dark scrim rather than a 10%-white wash.
    modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, backgroundColor: 'rgba(2,6,23,0.6)', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    modalImageContainer: { width: '100%', height: 200 },
    modalImage: { width: '100%', height: '100%', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    modalImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
    modalBody: { padding: 24 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    categoryBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    categoryBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    modalRating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    modalRatingText: { fontSize: 16, fontWeight: 'bold' },
    modalRatingCount: { fontSize: 13, fontWeight: '600' },
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
    adoptedNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 14 },
    adoptedNoticeText: { flex: 1, fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
    enrollHint: { fontSize: 12.5, lineHeight: 18, marginBottom: 10, textAlign: 'center' },
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
