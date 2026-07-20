import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Send,
    Plus,
    History,
    X,
    Compass,
    Crown,
    GraduationCap,
    ChevronRight,
    Volume2,
    Pause,
    Route,
    Mic,
    AudioLines,
    AlertCircle,
    RotateCcw,
    Flag,
    FileText,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import i18n from '../../lib/i18n';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { useChat } from '@edutu/core/src/hooks/useChat';
import { ChatRateLimitError } from '@edutu/core/src/services/chat';
import { ChatActionButton, ChatDeviceAction, ChatDocumentCard, ChatImageCard, ChatMessage, ChatOpportunityCard, ChatThread, stripChatContext } from '@edutu/core/src/types/chat';
import { syncMilestonesToCalendar } from '../../lib/calendarSync';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { generateRoadmapFromOpportunity } from '@edutu/core/src/services/aiRoadmapGenerator';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { setPremiumVoiceEnabled } from '../../lib/edutuSpeech';
import { EdutuLogo } from '../../components/branding/EdutuLogo';
import Animated, {
    Easing,
    FadeInDown,
    PinwheelIn,
    cancelAnimation,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { haptics } from '../../lib/haptics';
import { getDeadlineBadge } from '@edutu/core/src/utils/deadline';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { notificationService } from '../../lib/notifications';
import { useReportAIContent } from '../../lib/reportAiContent';
import { openVoiceMode, useVoiceModeState, consumeVoiceModeThread } from '../../lib/voiceModeStore';
import VoiceRecordingModal from '../../components/chat/VoiceRecordingModal';
import { useVoiceRecording } from '../../hooks/useVoiceRecording';

// One dot of the typing indicator — a soft staggered pulse (static when the
// user has reduced motion on).
function TypingDot({ delay, color, reducedMotion }: { delay: number; color: string; reducedMotion: boolean }) {
    const pulse = useSharedValue(0.35);

    useEffect(() => {
        if (reducedMotion) return;
        pulse.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }),
                    withTiming(0.35, { duration: 360, easing: Easing.in(Easing.quad) }),
                ),
                -1,
            ),
        );
        return () => cancelAnimation(pulse);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reducedMotion, delay]);

    const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
    return <Animated.View style={[styles.typingDot, { backgroundColor: color }, style]} />;
}

function TypingReveal({
    content,
    enabled,
    children,
}: {
    content: string;
    enabled: boolean;
    children: (visibleContent: string) => React.ReactNode;
}) {
    const [visibleLength, setVisibleLength] = useState(enabled ? 0 : content.length);

    // Adjust-during-render: reset the reveal when the message or mode changes;
    // the effect below only schedules the interval.
    const [prevReveal, setPrevReveal] = useState({ content, enabled });
    if (prevReveal.content !== content || prevReveal.enabled !== enabled) {
        setPrevReveal({ content, enabled });
        setVisibleLength(enabled ? 0 : content.length);
    }

    useEffect(() => {
        if (!enabled) return;

        const interval = setInterval(() => {
            setVisibleLength((current) => {
                if (current >= content.length) {
                    clearInterval(interval);
                    return current;
                }
                return Math.min(content.length, current + 4);
            });
        }, 18);

        return () => clearInterval(interval);
    }, [content, enabled]);

    return <>{children(content.slice(0, visibleLength))}</>;
}

const OPPORTUNITY_SEARCH_PATTERNS = [
    /\b(show|find|get|recommend|list|suggest|available|matching|trending)\b.*\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b/i,
    /\b(scholarships?|opportunities?|internships?|fellowships?|grants?|jobs?)\b.*\b(show|find|get|recommend|list|suggest|available|matching|trending)\b/i,
    /\b(mastercard)\b.*\b(opportunities?|scholarships?|matches|available)\b/i,
];

const ROADMAP_PATTERNS = [
    /\broadmap\b/i,
    /\b(plan|prepare|timeline|schedule)\b.*\b(apply|application|opportunity|scholarship)\b/i,
    /\bbuild\b.*\b(plan|roadmap)\b/i,
];
const SCREEN_WIDTH = Dimensions.get('window').width;
// List padding (16) + assistant avatar (30) + row gap (10): lets the shelf
// and roadmap rails escape the message column and bleed edge-to-edge.
const CHAT_RAIL_FULL_BLEED_OFFSET = 56;

function formatOpportunityDeadline(deadline?: string | null) {
    if (!deadline) return i18n.t('chat:deadline.rolling');
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return i18n.t('chat:deadline.set');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isRoadmapConversation(text?: string | null) {
    const normalized = String(text || '').toLowerCase();
    return ROADMAP_PATTERNS.some(pattern => pattern.test(normalized));
}

function isOpportunitySearchConversation(text?: string | null) {
    const normalized = String(text || '').toLowerCase();
    if (isRoadmapConversation(normalized)) return false;
    return OPPORTUNITY_SEARCH_PATTERNS.some(pattern => pattern.test(normalized));
}

function compactOpportunityAnswer(count: number) {
    if (count <= 0) {
        return i18n.t('chat:answers.checkingOpportunities');
    }

    return i18n.t('chat:answers.matchesFound', { count });
}

function compactRoadmapAnswer(matchCount: number, loading: boolean) {
    if (loading && matchCount === 0) {
        return i18n.t('chat:answers.roadmapChecking');
    }

    if (matchCount > 0) {
        return i18n.t('chat:answers.roadmapMatchFound');
    }

    return i18n.t('chat:answers.roadmapWhichOpportunity');
}

function toChatOpportunityCard(opportunity: Opportunity): ChatOpportunityCard {
    return {
        id: opportunity.id,
        title: opportunity.title,
        organization: opportunity.organization,
        category: opportunity.category,
        location: opportunity.isRemote ? i18n.t('chat:location.remote') : opportunity.location,
        deadline: opportunity.deadline ?? null,
        summary: opportunity.aiSummary || opportunity.description,
        imageUrl: opportunity.image ?? opportunity.shareImageUrl ?? null,
        applyUrl: opportunity.applyUrl ?? null,
        matchScore: opportunity.match,
        matchReason: opportunity.matchReasons?.[0] ?? null,
    };
}

function rankFallbackOpportunities(opportunities: Opportunity[], query: string) {
    const terms = query
        .toLowerCase()
        .split(/\W+/)
        .filter(term => term.length > 2);

    const now = Date.now();

    return [...opportunities]
        .map((opportunity) => {
            const haystack = [
                opportunity.title,
                opportunity.organization,
                opportunity.category,
                opportunity.location,
                opportunity.description,
                opportunity.aiSummary,
                ...(opportunity.tags || []),
                ...(opportunity.aiTags || []),
                ...(opportunity.requirements || []),
                ...(opportunity.benefits || []),
            ].join(' ').toLowerCase();

            const keywordScore = terms.reduce((score, term) => score + (haystack.includes(term) ? 8 : 0), 0);
            const categoryScore = /scholarship|mastercard|fund/i.test(query) && opportunity.category?.toLowerCase().includes('scholar') ? 20 : 0;
            const deadlineTime = opportunity.deadline ? new Date(opportunity.deadline).getTime() : Number.POSITIVE_INFINITY;
            const deadlineScore = Number.isFinite(deadlineTime) && deadlineTime >= now ? 12 : 0;

            return {
                opportunity,
                score: keywordScore + categoryScore + deadlineScore + (opportunity.match || 0) / 5,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(item => toChatOpportunityCard(item.opportunity));
}

function getRoadmapSearchTerms(query: string) {
    return query
        .toLowerCase()
        .split(/\W+/)
        .filter(term => term.length > 2)
        .filter(term => ![
            'build',
            'roadmap',
            'plan',
            'prepare',
            'next',
            'application',
            'apply',
            'opportunity',
            'scholarship',
            'for',
            'the',
            'and',
            'with',
            'from',
            'this',
            'that',
            'my',
        ].includes(term));
}

function findRoadmapOpportunityMatches(opportunities: Opportunity[], query: string) {
    const terms = getRoadmapSearchTerms(query);
    if (terms.length === 0) return [];

    return [...opportunities]
        .map((opportunity) => {
            const haystack = [
                opportunity.title,
                opportunity.organization,
                opportunity.category,
                opportunity.location,
                opportunity.description,
                ...(opportunity.tags || []),
                ...(opportunity.aiTags || []),
            ].join(' ').toLowerCase();

            const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
            return { opportunity, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(item => item.opportunity);
}

export default function ChatScreen() {
    const { t } = useTranslation('chat');
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const reportAIContent = useReportAIContent('chat');
    const { voiceMsg, prefill } = useLocalSearchParams<{ voiceMsg?: string; prefill?: string }>();
    const { isDark, colors, reducedMotion } = useTheme();
    const insets = useSafeAreaInsets();
    // voiceMsg is an auto-sent launch prompt (e.g. from an opportunity's "Ask Edutu"),
    // not draft text — it must not sit in the composer as a raw templated dump.
    const [input, setInput] = useState('');
    // Surfaces a persuasive banner when a send fails — a rate/usage limit turns
    // into an upgrade nudge, any other failure into an inline retry. Without
    // this the optimistic bubble just vanishes and it reads as a bug.
    const [sendError, setSendError] = useState<{ type: 'limit' | 'generic'; message: string } | null>(null);
    const lastAttemptRef = useRef<string | null>(null);
    const voiceSentRef = useRef(false);
    const [isThreadsVisible, setIsThreadsVisible] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const lastBotMessageRef = useRef<string | null>(null);
    const [roadmapActionId, setRoadmapActionId] = useState<string | null>(null);
    // Composer mic = one-shot dictation on its own screen (distinct from the
    // hands-free live voice stream opened by the waveform button).
    const [voiceRecOpen, setVoiceRecOpen] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF";
    const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0";
    const inputBg = isDark ? "#1E293B" : "#F1F5F9";
    // Accent comes from the active theme pack (not a hardcoded indigo) so the
    // user's chosen theme carries through chat. accentTint is the soft wash
    // used behind icons/chips — hex + alpha suffix keeps it on-hue.
    const accentColor = colors.accent;
    const accentTint = accentColor + (isDark ? '24' : '16');

    // Keep the welcome screen light: two focused starters instead of a wall of cards.
    const quickPrompts = useMemo(() => [
        {
            text: 'Find scholarships I can apply for this month',
            title: t('quickPrompts.findScholarships.title'),
            subtitle: t('quickPrompts.findScholarships.subtitle'),
            icon: GraduationCap,
            topic: 'Scholarships',
        },
        {
            text: 'Build a roadmap for my next application',
            title: t('quickPrompts.buildRoadmap.title'),
            subtitle: t('quickPrompts.buildRoadmap.subtitle'),
            icon: Route,
            topic: 'Roadmap',
        },
    ], [t]);

    const {
        goals,
        createGoal,
        updateGoal,
    } = useGoals(supabase, user?.id || null);

    const {
        threads,
        messages,
        selectedThreadId,
        isLoadingThreads,
        isLoadingMessages,
        isSending,
        selectThread,
        sendMessage,
        loadThreads
    } = useChat({
        supabase,
        userId: user?.id || null,
        getAuthToken: getToken,
        onSessionRecorded: (topic) => { if (__DEV__) console.log('Session recorded:', topic); }
    });

    const {
        data: availableOpportunities,
        loading: isLoadingOpportunities,
    } = useOpportunities({
        supabase,
        userId: user?.id || undefined,
        getAuthToken: getToken,
    });

    // Premium neural TTS (the message play button) is a Pro perk — free users
    // fall back to the device voice. Fail-open while entitlements resolve.
    const { isPro, isLoading: proLoading } = useProStatus(supabase, user?.id || null);
    useEffect(() => {
        setPremiumVoiceEnabled(isPro || proLoading);
    }, [isPro, proLoading]);

    const {
        isSpeaking,
        speak,
        stop: stopSpeaking,
    } = useTextToSpeech({ getAuthToken: getToken });

    const voiceRec = useVoiceRecording({
        language: i18n.language?.split('-')[0] || 'en',
        getAuthToken: getToken,
        onTranscription: (text) => setVoiceTranscript(text),
    });
    const voiceRecordingState: 'idle' | 'recording' | 'processing' | 'error' =
        voiceRec.isRecording ? 'recording'
            : voiceRec.isProcessing ? 'processing'
                : voiceRec.error ? 'error'
                    : 'idle';

    const openVoiceRecorder = useCallback(() => {
        Keyboard.dismiss();
        setVoiceTranscript(null);
        setVoiceRecOpen(true);
        void voiceRec.startRecording();
    }, [voiceRec]);

    const closeVoiceRecorder = useCallback(() => {
        voiceRec.cancelRecording();
        setVoiceTranscript(null);
        setVoiceRecOpen(false);
    }, [voiceRec]);

    // Executes device-side effects the agent's tools requested (local goal
    // reminders + optional device-calendar events). Runs only for messages
    // freshly returned by sendMessage — resuming an old thread never
    // re-schedules anything.
    const runDeviceActions = useCallback(async (actions: ChatDeviceAction[]) => {
        for (const action of actions) {
            try {
                if (action.type === 'notifications.schedule') {
                    const goals = Array.isArray(action.payload?.goals) ? action.payload.goals as Array<{ id?: string; title?: string; deadline?: string }> : [];
                    for (const goal of goals) {
                        if (goal.id && goal.title && goal.deadline) {
                            await notificationService.scheduleGoalReminder(goal.id, goal.title, goal.deadline);
                        }
                    }
                } else if (action.type === 'calendar.sync') {
                    const title = typeof action.payload?.title === 'string' ? action.payload.title : 'Edutu plan';
                    const milestones = Array.isArray(action.payload?.milestones)
                        ? (action.payload.milestones as Array<{ title?: string; dueDate?: string }>).filter(m => m.title)
                        : [];
                    if (!milestones.length) continue;
                    const deadline = typeof action.payload?.deadline === 'string' ? action.payload.deadline : null;
                    Alert.alert(
                        t('deviceActions.calendarTitle', { defaultValue: 'Add to your calendar?' }),
                        t('deviceActions.calendarBody', { defaultValue: '{{count}} plan dates can be added to your device calendar.', count: milestones.length }),
                        [
                            { text: t('common:actions.cancel', { defaultValue: 'Not now' }), style: 'cancel' },
                            {
                                text: t('deviceActions.calendarCta', { defaultValue: 'Add dates' }),
                                onPress: () => {
                                    void syncMilestonesToCalendar(title, milestones as Array<{ title: string; dueDate?: string }>, deadline);
                                },
                            },
                        ],
                    );
                }
            } catch (error) {
                console.warn('Device action failed (non-fatal):', error);
            }
        }
    }, [t]);

    const handleSend = useCallback(async (overrideText?: string) => {
        const text = (overrideText || input).trim();
        if (!text) return;
        setInput('');
        setSendError(null);
        lastAttemptRef.current = text;
        lastBotMessageRef.current = null;
        try {
            const result = await sendMessage(text);
            lastAttemptRef.current = null;
            const deviceActions = result?.assistantMessage?.metadata?.deviceActions;
            if (deviceActions?.length) void runDeviceActions(deviceActions);
            // A spin result gets a celebratory buzz as the card pinwheels in.
            if (result?.assistantMessage?.metadata?.actionButtons?.some(b => b.kind === 'spin_again')) {
                void haptics.success();
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            const isLimit = err instanceof ChatRateLimitError || (err as any)?.name === 'ChatRateLimitError';
            setSendError({
                type: isLimit ? 'limit' : 'generic',
                message: isLimit ? t('limit.body') : t('limit.errorBody'),
            });
        }
    }, [input, sendMessage, runDeviceActions, t]);

    const handleRetrySend = useCallback(() => {
        const text = lastAttemptRef.current;
        if (!text) return;
        setSendError(null);
        handleSend(text);
    }, [handleSend]);

    const handleSpeakMessage = useCallback((messageId: string, content: string) => {
        if (speakingMessageId === messageId) {
            stopSpeaking();
            setSpeakingMessageId(null);
        } else {
            setSpeakingMessageId(messageId);
            speak(content);
        }
    }, [speakingMessageId, speak, stopSpeaking]);

    const handleViewOpportunity = useCallback((opportunityId: string) => {
        router.push(`/opportunities/${opportunityId}`);
    }, [router]);

    const handleShareImage = useCallback(async (image: ChatImageCard) => {
        try {
            await Share.share(
                Platform.OS === 'ios'
                    ? { url: image.url, message: image.title }
                    : { message: `${image.title}\n${image.url}` },
            );
        } catch {
            void Linking.openURL(image.url).catch(() => {});
        }
    }, []);

    // Document cards: exported files open directly; drafts route the export
    // request back through chat so the agent produces a fresh signed link.
    const handleDocumentAction = useCallback((doc: ChatDocumentCard, format?: 'pdf' | 'docx') => {
        if (doc.url && (!format || format === doc.format)) {
            void Linking.openURL(doc.url).catch(() => {
                Alert.alert(t('documents.openFailedTitle', { defaultValue: "Couldn't open the file" }), t('documents.openFailedBody', { defaultValue: 'The link may have expired — ask me to export it again.' }));
            });
            return;
        }
        void handleSend(
            t('documents.exportPrompt', {
                defaultValue: 'Export "{{title}}" as {{format}}',
                title: doc.title,
                format: (format || 'pdf').toUpperCase(),
            }),
        );
    }, [handleSend, t]);

    // One-tap chips under agent replies. Navigation kinds route directly;
    // creation kinds go back through chat so the agent runs the real tool
    // (metered, confirmed, and it can report the outcome in-conversation).
    const handleActionButton = useCallback((button: ChatActionButton) => {
        switch (button.kind) {
            case 'open_route': {
                const route = typeof button.payload?.route === 'string' ? button.payload.route : null;
                if (route) router.push(route as never);
                break;
            }
            case 'view_opportunity': {
                const id = typeof button.payload?.opportunityId === 'string' ? button.payload.opportunityId : null;
                if (id) handleViewOpportunity(id);
                break;
            }
            case 'spin_again':
                void handleSend(t('actions.spinAgainPrompt', { defaultValue: 'Spin me another opportunity!' }));
                break;
            case 'create_goals':
                void handleSend(t('actions.createGoalsPrompt', { defaultValue: 'Yes — turn those milestones into goals for me.' }));
                break;
            case 'create_roadmap': {
                const id = typeof button.payload?.opportunityId === 'string' ? button.payload.opportunityId : null;
                void handleSend(
                    id
                        ? t('actions.createRoadmapPromptFor', { defaultValue: 'Yes, build me the roadmap for that opportunity.' })
                        : t('actions.createRoadmapPrompt', { defaultValue: 'Yes, build me that roadmap.' }),
                );
                break;
            }
        }
    }, [router, handleViewOpportunity, handleSend, t]);

    const handleBuildRoadmapFromOpportunity = useCallback(async (opportunity: Opportunity) => {
        if (!user?.id) {
            Alert.alert(t('alerts.signInRequiredTitle'), t('alerts.signInRequiredMessage'));
            return;
        }

        const roadmapId = `ai-roadmap-${opportunity.id}`;
        const alreadyCreated = goals.some(goal =>
            goal.source === 'imported' &&
            (goal.roadmap_id === roadmapId ||
                goal.template_id === roadmapId ||
                goal.opportunity_title?.toLowerCase() === opportunity.title.toLowerCase())
        );

        if (alreadyCreated) {
            Alert.alert(t('alerts.roadmapExistsTitle'), t('alerts.roadmapExistsMessage'), [
                { text: t('alerts.openGoals'), onPress: () => router.push('/goals') },
                { text: t('common:actions.cancel'), style: 'cancel' },
            ]);
            return;
        }

        setRoadmapActionId(opportunity.id);
        try {
            const roadmap = generateRoadmapFromOpportunity(opportunity);
            const resourceText = roadmap.resources
                .slice(0, 4)
                .map(resource => `${resource.title}: ${resource.url || resource.description}`)
                .join('\n');
            const goalsToCreate = [
                {
                    title: t('goals.submitTitle', { title: opportunity.title }),
                    description: t('goals.submitDescription', { strategy: roadmap.winningStrategy, resources: resourceText }),
                    deadline: roadmap.submissionTargetDate,
                    priority: 'high' as const,
                },
                ...roadmap.milestones.map((milestone, index) => ({
                    title: milestone.title,
                    description: milestone.description || t('goals.milestoneDescription', { title: opportunity.title }),
                    deadline: milestone.date,
                    priority: index === roadmap.milestones.length - 1 ? 'high' as const : 'medium' as const,
                })),
                ...roadmap.dailyPlan.map((day) => ({
                    title: day.title,
                    description: t('goals.dailyDescription', { description: day.description, focus: day.focus, minutes: day.durationMinutes }),
                    deadline: day.date,
                    priority: day.focus === 'submission' || day.focus === 'writing' ? 'high' as const : 'medium' as const,
                })),
                ...roadmap.checklist.map((item) => ({
                    title: item.title,
                    description: t('goals.checklistDescription', { title: opportunity.title }),
                    deadline: undefined,
                    priority: 'low' as const,
                })),
            ];

            const createdGoals = [];
            for (const goalInput of goalsToCreate) {
                const createdGoal = await createGoal({
                    title: goalInput.title,
                    description: goalInput.description,
                    category: opportunity.title,
                    deadline: goalInput.deadline,
                    priority: goalInput.priority,
                    source: 'imported',
                    templateId: roadmapId,
                    roadmap_id: roadmapId,
                    opportunity_title: opportunity.title,
                    reminder_enabled: Boolean(goalInput.deadline),
                    reminder_date: goalInput.deadline,
                });
                createdGoals.push(createdGoal);
            }

            for (const goal of createdGoals) {
                if (!goal.deadline) continue;
                const notificationId = await notificationService.scheduleGoalReminder(
                    goal.id,
                    goal.title,
                    goal.deadline,
                );
                if (notificationId) {
                    await updateGoal(goal.id, { notification_id: notificationId });
                }
            }

            Alert.alert(
                t('alerts.roadmapCreatedTitle'),
                t('alerts.roadmapCreatedMessage', { count: createdGoals.length }),
                [
                    { text: t('alerts.openGoals'), onPress: () => router.push('/goals') },
                    { text: t('alerts.stayHere'), style: 'cancel' },
                ],
            );
        } catch (error) {
            console.error('Failed to build AI roadmap from chat:', error);
            Alert.alert(t('alerts.couldNotCreateRoadmapTitle'), t('alerts.tryAgainFromOpportunity'));
        } finally {
            setRoadmapActionId(null);
        }
    }, [createGoal, goals, router, t, updateGoal, user?.id]);

    // Adjust-during-render: clear the highlighted message once TTS stops.
    // The guard self-falsifies (speakingMessageId becomes null), so no loop.
    if (!isSpeaking && speakingMessageId) {
        setSpeakingMessageId(null);
    }

    // Auto-send a launch prompt exactly once, but only after the user (and therefore
    // sendMessage) is ready — otherwise sendMessage bails on the null userId and the
    // chat sits blank with no reply. The ref guards against a double send when the
    // param clears or the effect re-runs.
    useEffect(() => {
        if (voiceSentRef.current) return;
        if (voiceMsg && voiceMsg.trim() && user?.id) {
            voiceSentRef.current = true;
            // eslint-disable-next-line react-hooks/set-state-in-effect -- param-driven one-shot send: there is no user event to host it, handleSend's sets are the send itself (ref-guarded against re-fire), and deferring to a microtask would just hide the same work from the rule
            handleSend(voiceMsg.trim());
            router.setParams({ voiceMsg: undefined });
        }
    }, [voiceMsg, user?.id, handleSend, router]);

    // Prefill (used by proactive coach pushes): seeds the composer with a
    // ready-to-send question but NEVER auto-sends — a notification tap must
    // not spend the user's credits without an explicit send.
    // Seed during render (guard self-falsifies); the param clear stays in an
    // effect since router mutation is an external side effect.
    const [prefillSeeded, setPrefillSeeded] = useState(false);
    if (!prefillSeeded && prefill && prefill.trim()) {
        setPrefillSeeded(true);
        setInput((current) => current || prefill.trim());
    }
    useEffect(() => {
        if (prefillSeeded && prefill) {
            router.setParams({ prefill: undefined });
        }
    }, [prefillSeeded, prefill, router]);

    // Resume the most recent conversation on open so chat history is continuous
    // instead of landing on a blank thread every time. Runs once, and is skipped
    // when arriving from an opportunity's "Ask Edutu" (voiceMsg) so that question
    // starts its own fresh thread.
    const didAutoResumeRef = useRef(false);
    useEffect(() => {
        if (didAutoResumeRef.current) return;
        if (voiceMsg && voiceMsg.trim()) {
            didAutoResumeRef.current = true;
            return;
        }
        if (!selectedThreadId && !isLoadingThreads && threads.length > 0) {
            didAutoResumeRef.current = true;
            // threads come back ordered by updated_at desc, so [0] is the latest.
            selectThread(threads[0].id);
        }
    }, [voiceMsg, selectedThreadId, isLoadingThreads, threads, selectThread]);

    // When a voice-mode session ends, pull its thread into the chat so the
    // spoken exchange is right there. Runs whenever the overlay is closed:
    // covers closing it while chat is open AND landing here from the
    // overlay's chat button (the store holds the thread until consumed).
    const { visible: isVoiceModeVisible } = useVoiceModeState();
    useEffect(() => {
        if (isVoiceModeVisible) return;
        const voiceThreadId = consumeVoiceModeThread();
        if (voiceThreadId && voiceThreadId !== selectedThreadId) {
            didAutoResumeRef.current = true;
            selectThread(voiceThreadId);
            loadThreads();
        }
    }, [isVoiceModeVisible, selectedThreadId, selectThread, loadThreads]);

    const showWelcomePrompts = useMemo(() =>
        !isLoadingMessages && messages.length === 0 && !selectedThreadId,
        [isLoadingMessages, messages, selectedThreadId]
    );

    const latestAssistantMessageId = useMemo(() => {
        return [...messages].reverse().find(message => message.role === 'assistant')?.id ?? null;
    }, [messages]);

    const groupedThreadItems = useMemo(() => {
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const oneDay = 86400000;
        const groups = [
            { title: t('threads.groups.today'), items: [] as ChatThread[] },
            { title: t('threads.groups.yesterday'), items: [] as ChatThread[] },
            { title: t('threads.groups.thisWeek'), items: [] as ChatThread[] },
            { title: t('threads.groups.older'), items: [] as ChatThread[] },
        ];

        threads.forEach(thread => {
            const time = new Date(thread.updated_at).getTime();
            if (time >= startOfToday) groups[0].items.push(thread);
            else if (time >= startOfToday - oneDay) groups[1].items.push(thread);
            else if (time >= startOfToday - oneDay * 7) groups[2].items.push(thread);
            else groups[3].items.push(thread);
        });

        return groups.flatMap(group =>
            group.items.length
                ? [{ type: 'header' as const, id: group.title, title: group.title }, ...group.items.map(item => ({ type: 'thread' as const, id: item.id, item }))]
                : []
        );
    }, [threads, t]);

    const renderFormattedMessage = useCallback((content: string, isBot: boolean) => {
        const color = isBot ? textPrimary : '#FFFFFF';
        const mutedColor = isBot ? textSecondary : 'rgba(255,255,255,0.82)';
        const cleanContent = content
            .replace(/\*/g, '')
            .replace(/^#+\s*/gm, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => {
                if (!line) return true;
                if (/^-{3,}$/.test(line)) return false;
                if (/^\|?[-\s|:]+$/.test(line)) return false;
                if (/^\|.*\|$/.test(line)) return false;
                return true;
            })
            .join('\n');
        const lines = cleanContent
            .replace(/\r/g, '')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        if (lines.length <= 1) {
            return (
                <Text style={[styles.messageText, { color }]}>
                    {cleanContent}
                </Text>
            );
        }

        return (
            <View style={styles.formattedMessage}>
                {lines.map((line, index) => {
                    const numberedMatch = line.match(/^(\d+)[.)]\s+(.+)/);
                    const bulletMatch = line.match(/^[-•]\s+(.+)/);
                    const starMatch = line.match(/^(⭐|★|☆)\s*(.+)/);
                    const isLeadLine = index === 0 && !numberedMatch && !bulletMatch && !starMatch;

                    if (numberedMatch) {
                        return (
                            <View key={`${line}-${index}`} style={styles.formattedRow}>
                                <View style={[styles.numberBadge, { backgroundColor: isBot ? accentTint : 'rgba(255,255,255,0.18)' }]}>
                                    <Text style={[styles.numberBadgeText, { color }]}>{numberedMatch[1]}</Text>
                                </View>
                                <Text style={[styles.messageText, styles.formattedRowText, { color }]}>
                                    {numberedMatch[2]}
                                </Text>
                            </View>
                        );
                    }

                    if (starMatch) {
                        return (
                            <View key={`${line}-${index}`} style={styles.formattedRow}>
                                <Text style={styles.starMarker}>★</Text>
                                <Text style={[styles.messageText, styles.formattedRowText, styles.starText, { color }]}>
                                    {starMatch[2]}
                                </Text>
                            </View>
                        );
                    }

                    if (bulletMatch) {
                        return (
                            <View key={`${line}-${index}`} style={styles.formattedRow}>
                                <Text style={[styles.bulletMarker, { color: mutedColor }]}>•</Text>
                                <Text style={[styles.messageText, styles.formattedRowText, { color }]}>
                                    {bulletMatch[1]}
                                </Text>
                            </View>
                        );
                    }

                    return (
                        <Text
                            key={`${line}-${index}`}
                            style={[
                                styles.messageText,
                                isLeadLine && styles.leadLine,
                                { color: isLeadLine ? color : mutedColor },
                            ]}
                        >
                            {line}
                        </Text>
                    );
                })}
            </View>
        );
    }, [textPrimary, textSecondary, accentTint]);

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isBot = item.role === 'assistant';
        const isCurrentlySpeaking = speakingMessageId === item.id;
        const previousUserMessage = isBot
            ? stripChatContext([...messages.slice(0, index)].reverse().find(message => message.role === 'user')?.content ?? '')
            : null;
        const isRoadmapRequest = isRoadmapConversation(previousUserMessage);
        const shouldShowOpportunityCards = isBot && !isRoadmapRequest && (
            (item.metadata?.opportunities?.length ?? 0) > 0 ||
            isOpportunitySearchConversation(previousUserMessage) ||
            isOpportunitySearchConversation(item.content)
        );
        const roadmapMatches = isBot && isRoadmapRequest
            ? findRoadmapOpportunityMatches(availableOpportunities, previousUserMessage || '')
            : [];
        const shouldShowRoadmapPanel = isBot && isRoadmapRequest && (isLoadingOpportunities || roadmapMatches.length > 0);
        const fallbackCards = shouldShowOpportunityCards
            ? rankFallbackOpportunities(availableOpportunities, `${previousUserMessage || ''} ${item.content}`)
            : [];
        const opportunityCards = isBot
            ? (item.metadata?.opportunities?.length ? item.metadata.opportunities : fallbackCards)
            : [];
        const shouldTypeReveal = isBot && item.id === latestAssistantMessageId;
        const showOpportunityShelf = shouldShowOpportunityCards && (opportunityCards.length > 0 || isLoadingOpportunities);
        // "Spin" replies (single surprise pick + a Spin-again chip) get a
        // slot-machine pinwheel reveal — only on the live latest message, so
        // scrolling old threads doesn't replay it.
        const isSpinReveal =
            shouldTypeReveal &&
            opportunityCards.length === 1 &&
            (item.metadata?.actionButtons?.some((button) => button.kind === 'spin_again') ?? false);
        const displayContent = shouldShowRoadmapPanel
            ? compactRoadmapAnswer(roadmapMatches.length, isLoadingOpportunities)
            : shouldShowOpportunityCards
                ? compactOpportunityAnswer(opportunityCards.length)
                // User bubbles hide any opportunity context appended after the sentinel.
                : isBot ? item.content : stripChatContext(item.content);

        return (
            <Animated.View
                entering={FadeInDown.duration(240)}
                style={[styles.messageRow, isBot ? styles.messageRowAssistant : styles.messageRowUser]}
            >
                <View style={[
                    styles.messageContainer,
                    isBot ? styles.messageContainerAssistant : styles.messageContainerUser,
                    isBot && (showOpportunityShelf || shouldShowRoadmapPanel) && styles.messageContainerAssistantWide,
                ]}>
                    {isBot ? (
                        <View style={[styles.avatar, styles.aiAvatar, { backgroundColor: accentTint, borderColor: accentColor + '33' }]}>
                            <EdutuLogo size={24} frameless />
                        </View>
                    ) : null}
                    <View style={styles.messageStack}>
                        <View style={
                            isBot
                                ? styles.messageBlockAssistant
                                : [styles.messageBubble, styles.messageBubbleUser, { backgroundColor: accentColor }]
                        }>
                            {isBot ? (
                                <TypingReveal content={displayContent} enabled={shouldTypeReveal}>
                                    {(visibleContent) => renderFormattedMessage(visibleContent, isBot)}
                                </TypingReveal>
                            ) : renderFormattedMessage(displayContent, isBot)}

                            {isBot && (
                                <View style={styles.messageActions}>
                                    <TouchableOpacity
                                        onPress={() => handleSpeakMessage(item.id, displayContent)}
                                        style={[
                                            styles.speakBtn,
                                            isCurrentlySpeaking && { backgroundColor: 'rgba(239,68,68,0.14)' },
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={isCurrentlySpeaking
                                            ? t('messages.stopReading', { defaultValue: 'Stop reading' })
                                            : t('messages.readAloud', { defaultValue: 'Read aloud' })}
                                    >
                                        {isCurrentlySpeaking ? (
                                            <Pause size={14} color="#EF4444" />
                                        ) : (
                                            <Volume2 size={14} color={textSecondary} />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => reportAIContent(item.content, { messageId: item.id })}
                                        style={styles.speakBtn}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('common:aiReport.button')}
                                    >
                                        <Flag size={13} color={textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                        {showOpportunityShelf && (
                            <Animated.View
                                style={styles.opportunityShelf}
                                entering={isSpinReveal && !reducedMotion ? PinwheelIn.duration(700) : undefined}
                            >
                                <View style={styles.opportunityShelfHeader}>
                                    <Text style={[styles.opportunityShelfTitle, { color: textPrimary }]}>
                                        {t('messages.recommendedTitle')}
                                    </Text>
                                    <TouchableOpacity onPress={() => router.push('/opportunities')}>
                                        <Text style={[styles.opportunityShelfLink, { color: accentColor }]}>{t('messages.viewMore')}</Text>
                                    </TouchableOpacity>
                                </View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.opportunityRail}
                                    decelerationRate="fast"
                                    snapToInterval={248}
                                >
                                {opportunityCards.length === 0 ? (
                                    [0, 1, 2].map((placeholder) => (
                                        <View
                                            key={`loading-opportunity-${placeholder}`}
                                            style={[
                                                styles.opportunityCard,
                                                styles.opportunityLoadingCard,
                                                {
                                                    backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#FFFFFF',
                                                    borderColor,
                                                },
                                            ]}
                                        >
                                            <View style={[styles.opportunityLoadingImage, { backgroundColor: accentTint }]}>
                                                <ActivityIndicator size="small" color={accentColor} />
                                            </View>
                                            <View style={styles.opportunityBody}>
                                                <View style={[styles.loadingLine, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                                <View style={[styles.loadingLine, styles.loadingLineMedium, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                                <View style={[styles.loadingLine, styles.loadingLineShort, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                            </View>
                                        </View>
                                    ))
                                ) : opportunityCards.map((opportunity, cardIndex) => {
                                    const badge = getDeadlineBadge(opportunity.deadline);
                                    // First card of a ranked set gets the "Top pick" accent —
                                    // only when a real match score backs the claim.
                                    const isTopPick = cardIndex === 0 && opportunityCards.length > 1 && typeof opportunity.matchScore === 'number' && opportunity.matchScore > 0;
                                    const isRed = badge.level === 'today' || badge.level === 'critical';
                                    const isAmber = badge.level === 'tomorrow' || badge.level === 'urgent';
                                    return (
                                        <TouchableOpacity
                                            key={opportunity.id}
                                            activeOpacity={0.88}
                                            onPress={() => handleViewOpportunity(opportunity.id)}
                                            accessibilityRole="button"
                                            accessibilityLabel={opportunity.title}
                                            style={[
                                                styles.opportunityCard,
                                                {
                                                    backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#FFFFFF',
                                                    borderColor: isTopPick ? accentColor : borderColor,
                                                },
                                                isTopPick && styles.opportunityCardTop,
                                            ]}
                                        >
                                            <View style={styles.opportunityImageWrap}>
                                                {opportunity.imageUrl ? (
                                                    <Image source={{ uri: opportunity.imageUrl }} style={styles.opportunityImage} />
                                                ) : (
                                                    <View style={[styles.opportunityImage, styles.opportunityImageFallback, { backgroundColor: accentTint }]}>
                                                        <Compass size={24} color={accentColor} />
                                                    </View>
                                                )}
                                                {isTopPick ? (
                                                    <View style={[styles.imagePill, styles.imagePillTopLeft, { backgroundColor: accentColor }]}>
                                                        <Text style={styles.imagePillText}>{t('messages.topPick', { defaultValue: 'Top pick' })}</Text>
                                                    </View>
                                                ) : null}
                                                {badge.level !== 'none' ? (
                                                    <View
                                                        style={[
                                                            styles.imagePill,
                                                            styles.imagePillTopRight,
                                                            // Urgent deadlines get the shared urgency colours
                                                            // (darker red for contrast); calm ones a neutral scrim.
                                                            { backgroundColor: isRed ? '#DC2626' : isAmber ? '#F59E0B' : 'rgba(2,6,23,0.66)' },
                                                        ]}
                                                    >
                                                        <Text style={[styles.imagePillText, isAmber && { color: '#111827' }]} numberOfLines={1}>
                                                            {badge.level === 'normal' || badge.level === 'soon'
                                                                ? (badge.date ?? badge.label)
                                                                : badge.label}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                                <View style={[styles.imagePill, styles.imagePillBottomLeft, { backgroundColor: 'rgba(2,6,23,0.66)' }]}>
                                                    <Text style={styles.imagePillText} numberOfLines={1}>
                                                        {opportunity.category || t('messages.categoryFallback')}
                                                    </Text>
                                                </View>
                                            </View>

                                            <View style={styles.opportunityBody}>
                                                <Text style={[styles.opportunityTitle, { color: textPrimary }]} numberOfLines={2}>
                                                    {opportunity.title}
                                                </Text>
                                                {opportunity.organization ? (
                                                    <Text style={[styles.opportunityOrg, { color: textSecondary }]} numberOfLines={1}>
                                                        {opportunity.organization}
                                                    </Text>
                                                ) : null}
                                                <View style={styles.opportunityFooter}>
                                                    {typeof opportunity.matchScore === 'number' && opportunity.matchScore > 0 ? (
                                                        <Text style={[styles.matchBadge, { color: accentColor }]} numberOfLines={1}>
                                                            {t('messages.matchScore', { defaultValue: '{{score}}% match', score: Math.round(opportunity.matchScore) })}
                                                        </Text>
                                                    ) : (
                                                        <Text style={[styles.opportunityMeta, { color: textSecondary }]} numberOfLines={1}>
                                                            {opportunity.location || formatOpportunityDeadline(opportunity.deadline)}
                                                        </Text>
                                                    )}
                                                    <View style={[styles.opportunityGo, { backgroundColor: accentTint }]}>
                                                        <ChevronRight size={14} color={accentColor} />
                                                    </View>
                                                </View>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                                {opportunityCards.length > 0 ? (
                                    <TouchableOpacity
                                    activeOpacity={0.86}
                                    onPress={() => router.push('/opportunities')}
                                    style={[
                                        styles.viewMoreOpportunityCard,
                                        {
                                            backgroundColor: accentTint,
                                            borderColor: accentColor,
                                        },
                                    ]}
                                >
                                    <View style={[styles.viewMoreIcon, { backgroundColor: accentColor }]}>
                                        <ChevronRight size={22} color="#FFFFFF" />
                                    </View>
                                    <Text style={[styles.viewMoreTitle, { color: textPrimary }]}>{t('messages.viewMore')}</Text>
                                    <Text style={[styles.viewMoreSubtitle, { color: textSecondary }]}>
                                        {t('messages.openAllOpportunities')}
                                    </Text>
                                    </TouchableOpacity>
                                ) : null}
                                </ScrollView>
                                {opportunityCards.length > 0 ? (
                                    <View style={styles.followUpBar}>
                                        <Text style={[styles.followUpText, { color: textSecondary }]}>{t('messages.narrowBy')}</Text>
                                        {(['country', 'deadline', 'funding'] as const).map((filterKey) => (
                                            <TouchableOpacity
                                                key={filterKey}
                                                onPress={() => handleSend(`Narrow these by ${filterKey}`)}
                                                style={[styles.followUpChip, { borderColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }]}
                                            >
                                                <Text style={[styles.followUpChipText, { color: textPrimary }]}>{t(`followUp.${filterKey}`)}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : null}
                            </Animated.View>
                        )}
                        {shouldShowRoadmapPanel && (
                            <View style={styles.roadmapBuilderPanel}>
                                <View style={styles.roadmapBuilderHeader}>
                                    <Text style={[styles.roadmapBuilderTitle, { color: textPrimary }]}>
                                        {t('roadmapPanel.title')}
                                    </Text>
                                    <Text style={[styles.roadmapBuilderSubtitle, { color: textSecondary }]}>
                                        {t('roadmapPanel.subtitle')}
                                    </Text>
                                </View>

                                {isLoadingOpportunities && roadmapMatches.length === 0 ? (
                                    <View style={[styles.roadmapStatusCard, { backgroundColor: cardBg, borderColor }]}>
                                        <ActivityIndicator size="small" color={accentColor} />
                                        <Text style={[styles.roadmapStatusText, { color: textSecondary }]}>
                                            {t('roadmapPanel.searching')}
                                        </Text>
                                    </View>
                                ) : roadmapMatches.length > 0 ? (
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.roadmapMatchRail}
                                    >
                                        {roadmapMatches.map((opportunity) => {
                                            const preview = generateRoadmapFromOpportunity(opportunity);
                                            return (
                                                <TouchableOpacity
                                                    key={opportunity.id}
                                                    activeOpacity={0.88}
                                                    onPress={() => handleBuildRoadmapFromOpportunity(opportunity)}
                                                    disabled={roadmapActionId === opportunity.id}
                                                    style={[
                                                        styles.roadmapMatchCard,
                                                        { backgroundColor: cardBg, borderColor },
                                                    ]}
                                                >
                                                    <Text style={[styles.roadmapMatchMeta, { color: accentColor }]} numberOfLines={1}>
                                                        {t('roadmapPanel.matchMeta', { category: opportunity.category || t('messages.categoryFallback'), deadline: formatOpportunityDeadline(opportunity.deadline) })}
                                                    </Text>
                                                    <Text style={[styles.roadmapMatchTitle, { color: textPrimary }]} numberOfLines={3}>
                                                        {opportunity.title}
                                                    </Text>
                                                    <View style={styles.roadmapPreviewGrid}>
                                                        <Text style={[styles.roadmapPreviewText, { color: textSecondary }]}>
                                                            {t('roadmapPanel.daysLeft', { count: preview.daysUntilDeadline })}
                                                        </Text>
                                                        <Text style={[styles.roadmapPreviewText, { color: textSecondary }]}>
                                                            {t('roadmapPanel.dailySteps', { count: preview.dailyPlan.length })}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.roadmapBuildButton, { backgroundColor: accentColor }]}>
                                                        {roadmapActionId === opportunity.id ? (
                                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                                        ) : (
                                                            <Text style={styles.roadmapBuildButtonText}>{t('roadmapPanel.build')}</Text>
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                ) : null}
                            </View>
                        )}
                        {isBot && (item.metadata?.images?.length ?? 0) > 0 ? (
                            <View style={styles.imageCardStack}>
                                {(item.metadata?.images ?? []).map((image) => (
                                    <TouchableOpacity
                                        key={image.url}
                                        activeOpacity={0.9}
                                        onPress={() => handleShareImage(image)}
                                        style={[styles.imageCard, { borderColor }]}
                                    >
                                        <Image
                                            source={{ uri: image.url }}
                                            style={styles.imageCardImage}
                                            resizeMode="cover"
                                        />
                                        <View style={styles.imageCardFooter}>
                                            <Text style={[styles.imageCardHint, { color: textSecondary }]} numberOfLines={1}>
                                                {t('images.shareHint', { defaultValue: 'Tap to share' })}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : null}
                        {isBot && (item.metadata?.documents?.length ?? 0) > 0 ? (
                            <View style={styles.documentCardStack}>
                                {(item.metadata?.documents ?? []).map((doc) => (
                                    <View
                                        key={`${doc.docId}-v${doc.version}`}
                                        style={[styles.documentCard, { backgroundColor: cardBg, borderColor }]}
                                    >
                                        <View style={[styles.documentIconWrap, { backgroundColor: accentTint }]}>
                                            <FileText size={20} color={accentColor} />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text numberOfLines={1} style={[styles.documentTitle, { color: textPrimary }]}>
                                                {doc.title}
                                            </Text>
                                            <Text style={[styles.documentMeta, { color: textSecondary }]}>
                                                {t(`documents.type.${doc.type}`, { defaultValue: doc.type === 'cv' ? 'CV' : doc.type === 'sop' ? 'Statement of Purpose' : doc.type === 'cover_letter' ? 'Cover letter' : 'Essay' })}
                                                {` · v${doc.version}`}
                                                {doc.url && doc.format ? ` · ${doc.format.toUpperCase()} ${t('documents.ready', { defaultValue: 'ready' })}` : ''}
                                            </Text>
                                            <View style={styles.documentActions}>
                                                {doc.url ? (
                                                    <TouchableOpacity
                                                        onPress={() => handleDocumentAction(doc)}
                                                        style={[styles.documentBtn, { backgroundColor: accentColor }]}
                                                    >
                                                        <Text style={styles.documentBtnText}>
                                                            {t('documents.download', { defaultValue: 'Download' })}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <>
                                                        <TouchableOpacity
                                                            onPress={() => handleDocumentAction(doc, 'pdf')}
                                                            style={[styles.documentBtn, { backgroundColor: accentColor }]}
                                                        >
                                                            <Text style={styles.documentBtnText}>PDF</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            onPress={() => handleDocumentAction(doc, 'docx')}
                                                            style={[styles.documentBtnOutline, { borderColor: accentColor }]}
                                                        >
                                                            <Text style={[styles.documentBtnOutlineText, { color: accentColor }]}>DOCX</Text>
                                                        </TouchableOpacity>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                        {isBot && (item.metadata?.actionButtons?.length ?? 0) > 0 ? (
                            <View style={styles.agentActionRow}>
                                {(item.metadata?.actionButtons ?? []).map((button) => (
                                    <TouchableOpacity
                                        key={button.id}
                                        onPress={() => handleActionButton(button)}
                                        activeOpacity={0.8}
                                        style={[
                                            styles.agentActionChip,
                                            {
                                                borderColor: accentColor,
                                                backgroundColor: accentTint,
                                            },
                                        ]}
                                    >
                                        <Text style={[styles.agentActionChipText, { color: accentColor }]} numberOfLines={1}>
                                            {button.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : null}
                    </View>
                </View>
            </Animated.View>
        );
    };

    const renderThreadItem = ({ item }: { item: ChatThread }) => (
        <TouchableOpacity
            onPress={() => {
                selectThread(item.id);
                setIsThreadsVisible(false);
            }}
            style={[
                styles.threadItem,
                { backgroundColor: cardBg, borderColor },
                selectedThreadId === item.id && { backgroundColor: accentColor + '33', borderColor: accentColor }
            ]}
        >
            <View style={styles.threadContent}>
                <Text style={[styles.threadTitle, { color: textPrimary }]} numberOfLines={1}>
                    {item.title || t('threads.newConversation')}
                </Text>
                <Text style={[
                    styles.threadDate,
                    { color: textSecondary },
                    selectedThreadId === item.id && { color: '#A5B4FC' }
                ]}>
                    {new Date(item.updated_at).toLocaleDateString()}
                </Text>
            </View>
            <ChevronRight size={16} color={textSecondary} />
        </TouchableOpacity>
    );

    const renderGroupedThreadItem = ({ item }: { item: { type: 'header'; id: string; title: string } | { type: 'thread'; id: string; item: ChatThread } }) => {
        if (item.type === 'header') {
            return <Text style={[styles.threadGroupTitle, { color: textSecondary }]}>{item.title}</Text>;
        }

        return renderThreadItem({ item: item.item });
    };

    const [isKeyboardVisible, setKeyboardVisible] = useState(false);

    useEffect(() => {
        const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('header.title')}
                showBack
                right={
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            onPress={() => setIsThreadsVisible(true)}
                            style={[styles.historyBtn, { backgroundColor: cardBg }]}
                        >
                            <History size={20} color={textSecondary} />
                        </TouchableOpacity>
                    </View>
                }
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
                keyboardVerticalOffset={0}
            >
                <View style={styles.flex}>
                    {isLoadingMessages ? (
                        <View style={styles.loadingContainer}>
                            <BrandedLoader label={t('loading.conversation')} />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={(item) => item.id}
                            renderItem={renderMessage}
                            contentContainerStyle={[styles.messagesList, { paddingBottom: 20 }]}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            keyboardDismissMode="interactive"
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <View style={[styles.emptyIcon, { backgroundColor: accentTint }]}>
                                        <EdutuLogo size={48} frameless />
                                    </View>
                                    <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('empty.title')}</Text>
                                    <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                                        {t('empty.description')}
                                    </Text>
                                    <View style={styles.promptsContainer}>
                                        {quickPrompts.map((prompt) => (
                                            <TouchableOpacity
                                                key={prompt.text}
                                                onPress={() => handleSend(prompt.text)}
                                                style={[styles.promptItem, { backgroundColor: cardBg, borderColor }]}
                                            >
                                                <View style={[styles.promptIcon, { backgroundColor: accentTint }]}>
                                                    <prompt.icon size={20} color={accentColor} />
                                                </View>
                                                <View style={styles.promptCopy}>
                                                    <Text style={[styles.promptTitle, { color: textPrimary }]} numberOfLines={1}>
                                                        {prompt.title}
                                                    </Text>
                                                    <Text style={[styles.promptSubtitle, { color: textSecondary }]} numberOfLines={1}>
                                                        {prompt.subtitle}
                                                    </Text>
                                                </View>
                                                <ChevronRight size={16} color={textSecondary} />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            }
                            ListFooterComponent={
                                <>
                                    {isSending ? (
                                        <View style={styles.typingRow}>
                                            <View style={[styles.avatar, styles.aiAvatar, { backgroundColor: accentTint, borderColor: accentColor + '33' }]}>
                                                <EdutuLogo size={22} frameless />
                                            </View>
                                            <View style={styles.typingInline}>
                                                <View style={styles.typingDots}>
                                                    <TypingDot delay={0} color={accentColor} reducedMotion={reducedMotion} />
                                                    <TypingDot delay={140} color={accentColor} reducedMotion={reducedMotion} />
                                                    <TypingDot delay={280} color={accentColor} reducedMotion={reducedMotion} />
                                                </View>
                                                <Text style={[styles.typingText, { color: textSecondary }]}>{t('messages.typing')}</Text>
                                            </View>
                                        </View>
                                    ) : null}
                                    {showWelcomePrompts ? (
                                        <View style={styles.promptsContainer}>
                                            {quickPrompts.map((prompt) => (
                                                <TouchableOpacity
                                                    key={prompt.text}
                                                    onPress={() => handleSend(prompt.text)}
                                                    style={[styles.promptItem, { backgroundColor: cardBg, borderColor }]}
                                                >
                                                    <View style={[styles.promptIcon, { backgroundColor: accentTint }]}>
                                                        <prompt.icon size={20} color={accentColor} />
                                                    </View>
                                                    <View style={styles.promptCopy}>
                                                        <Text style={[styles.promptTitle, { color: textPrimary }]} numberOfLines={1}>
                                                            {prompt.title}
                                                        </Text>
                                                        <Text style={[styles.promptSubtitle, { color: textSecondary }]} numberOfLines={1}>
                                                            {prompt.subtitle}
                                                        </Text>
                                                    </View>
                                                    <ChevronRight size={16} color={textSecondary} />
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    ) : null}
                                </>
                            }
                        />
                    )}

                    {sendError ? (
                        <Animated.View
                            entering={FadeInDown.duration(260)}
                            style={[
                                styles.sendErrorBanner,
                                {
                                    backgroundColor: sendError.type === 'limit'
                                        ? accentTint
                                        : (isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2'),
                                    borderColor: sendError.type === 'limit' ? accentColor + '55' : '#EF444455',
                                },
                            ]}
                        >
                            <View style={[styles.sendErrorIcon, { backgroundColor: sendError.type === 'limit' ? accentColor + '22' : 'rgba(239,68,68,0.15)' }]}>
                                {sendError.type === 'limit'
                                    ? <Crown size={18} color={accentColor} />
                                    : <AlertCircle size={18} color="#EF4444" />}
                            </View>
                            <View style={styles.sendErrorCopy}>
                                <Text style={[styles.sendErrorTitle, { color: textPrimary }]}>
                                    {sendError.type === 'limit' ? t('limit.title') : t('limit.errorTitle')}
                                </Text>
                                <Text style={[styles.sendErrorBody, { color: textSecondary }]}>
                                    {sendError.message}
                                </Text>
                                <View style={styles.sendErrorActions}>
                                    {sendError.type === 'limit' ? (
                                        <TouchableOpacity
                                            style={[styles.sendErrorPrimary, { backgroundColor: accentColor }]}
                                            onPress={() => { setSendError(null); router.push('/paywall'); }}
                                            activeOpacity={0.85}
                                        >
                                            <Crown size={14} color="#FFFFFF" />
                                            <Text style={styles.sendErrorPrimaryText}>{t('limit.upgradeCta')}</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity
                                            style={[styles.sendErrorPrimary, { backgroundColor: accentColor }]}
                                            onPress={handleRetrySend}
                                            activeOpacity={0.85}
                                        >
                                            <RotateCcw size={14} color="#FFFFFF" />
                                            <Text style={styles.sendErrorPrimaryText}>{t('limit.retryCta')}</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity
                                        style={styles.sendErrorSecondary}
                                        onPress={() => setSendError(null)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.sendErrorSecondaryText, { color: textSecondary }]}>{t('limit.dismissCta')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Animated.View>
                    ) : null}

                    <View style={[
                        styles.inputWrapper,
                        {
                            backgroundColor,
                            paddingBottom: isKeyboardVisible ? 8 : Math.max(insets.bottom, 8),
                            paddingTop: 8,
                        }
                    ]}>
                        <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor }]}>
                            <TextInput
                                ref={inputRef}
                                style={[styles.input, { color: textPrimary }]}
                                placeholder={t('input.placeholder')}
                                placeholderTextColor={textSecondary}
                                value={input}
                                onChangeText={setInput}
                                onSubmitEditing={() => handleSend()}
                                blurOnSubmit={false}
                                returnKeyType="send"
                                multiline
                                maxLength={500}
                                onFocus={() => {
                                    setTimeout(() => {
                                        flatListRef.current?.scrollToEnd({ animated: true });
                                    }, 200);
                                }}
                            />

                            {/* Composer trailing actions: with text → Send;
                                empty → the two voice toggles (tap-to-talk
                                voice mode, hands-free live mode). */}
                            {input.trim() ? (
                                <TouchableOpacity
                                    onPress={() => handleSend()}
                                    style={[styles.iconBtn, styles.sendBtn, { backgroundColor: accentColor }]}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('input.send')}
                                >
                                    <Send size={18} color="white" />
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        onPress={openVoiceRecorder}
                                        style={[styles.iconBtn, { backgroundColor: accentTint }]}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('voiceMode.composerRecord')}
                                    >
                                        <Mic size={19} color={accentColor} strokeWidth={2.2} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => { Keyboard.dismiss(); openVoiceMode('live'); }}
                                        style={[styles.iconBtn, { backgroundColor: accentColor }]}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('voiceMode.composerLive')}
                                    >
                                        <AudioLines size={19} color="#FFFFFF" strokeWidth={2.2} />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {voiceRecOpen ? (
                <VoiceRecordingModal
                    visible={voiceRecOpen}
                    isDark={isDark}
                    recordingState={voiceRecordingState}
                    duration={voiceRec.duration}
                    transcript={voiceTranscript}
                    error={voiceRec.error}
                    onStartRecording={() => { setVoiceTranscript(null); void voiceRec.startRecording(); }}
                    onStopRecording={() => voiceRec.stopRecording()}
                    onReset={() => { setVoiceTranscript(null); voiceRec.cancelRecording(); }}
                    onSendTranscript={(text) => {
                        setVoiceRecOpen(false);
                        setVoiceTranscript(null);
                        void handleSend(text);
                    }}
                    onClose={closeVoiceRecorder}
                />
            ) : null}

            <Modal
                visible={isThreadsVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsThreadsVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textPrimary }]}>{t('threads.modalTitle')}</Text>
                            <TouchableOpacity onPress={() => setIsThreadsVisible(false)}>
                                <X size={24} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                selectThread(null);
                                setIsThreadsVisible(false);
                            }}
                            style={[styles.newConvBtn, { backgroundColor: accentTint, borderColor: accentColor + '4D' }]}
                        >
                            <Plus size={20} color={accentColor} />
                            <Text style={[styles.newConvText, { color: accentColor }]}>{t('threads.newConversation')}</Text>
                        </TouchableOpacity>

                        {isLoadingThreads ? (
                            <ActivityIndicator color={accentColor} />
                        ) : (
                            <FlatList
                                data={groupedThreadItems}
                                keyExtractor={(item) => item.id}
                                renderItem={renderGroupedThreadItem}
                                showsVerticalScrollIndicator={false}
                                ListEmptyComponent={
                                    <Text style={[styles.emptyThreads, { color: textSecondary }]}>{t('threads.empty')}</Text>
                                }
                            />
                        )}
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    historyBtn: { padding: 8, borderRadius: 8 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, fontSize: 16 },
    messagesList: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 20 },
    messageRow: { marginBottom: 14, width: '100%' },
    messageRowAssistant: { alignItems: 'flex-start' },
    messageRowUser: { alignItems: 'flex-end' },
    messageContainer: {
        flexDirection: 'row',
        maxWidth: '88%',
        gap: 10,
    },
    messageContainerAssistant: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
        maxWidth: '92%',
    },
    messageContainerAssistantWide: {
        maxWidth: '100%',
    },
    messageContainerUser: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
        maxWidth: '82%',
    },
    messageStack: {
        flexShrink: 1,
        gap: 10,
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
    },
    aiAvatar: {
        borderWidth: 1,
    },
    messageBubble: {
        paddingVertical: 11,
        paddingHorizontal: 16,
        position: 'relative',
        flexShrink: 1,
    },
    // Assistant replies read as open text on the canvas (modern AI-chat
    // grammar) — no box, so short answers stop looking like empty cards.
    messageBlockAssistant: {
        paddingTop: 4,
        flexShrink: 1,
    },
    messageBubbleUser: {
        borderRadius: 20,
        borderBottomRightRadius: 6,
    },
    messageText: {
        fontSize: 15.5,
        lineHeight: 23,
        flexWrap: 'wrap',
    },
    formattedMessage: {
        gap: 8,
    },
    formattedRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    formattedRowText: {
        flex: 1,
    },
    leadLine: {
        fontWeight: '700',
    },
    bulletMarker: {
        width: 16,
        fontSize: 16,
        lineHeight: 22,
        textAlign: 'center',
        fontWeight: '900',
    },
    starMarker: {
        width: 18,
        color: '#F59E0B',
        fontSize: 14,
        lineHeight: 22,
        textAlign: 'center',
        fontWeight: '900',
    },
    starText: {
        fontWeight: '700',
    },
    numberBadge: {
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        marginTop: 1,
    },
    numberBadgeText: {
        fontSize: 11,
        fontWeight: '900',
    },
    messageActions: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: 4,
        marginTop: 8,
    },
    speakBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    opportunityShelf: {
        width: SCREEN_WIDTH,
        marginLeft: -CHAT_RAIL_FULL_BLEED_OFFSET,
        gap: 8,
    },
    opportunityShelfHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
    },
    opportunityShelfTitle: {
        fontSize: 13,
        fontWeight: '900',
    },
    opportunityShelfLink: {
        fontSize: 12,
        fontWeight: '800',
    },
    opportunityRail: {
        gap: 12,
        paddingLeft: 16,
        paddingRight: 16,
    },
    opportunityCard: {
        width: 236,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    opportunityCardTop: {
        borderWidth: 1.5,
    },
    opportunityLoadingCard: {
        minHeight: 214,
    },
    opportunityLoadingImage: {
        width: '100%',
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingLine: {
        height: 12,
        width: '100%',
        borderRadius: 999,
    },
    loadingLineShort: {
        width: '46%',
    },
    loadingLineMedium: {
        width: '74%',
    },
    viewMoreOpportunityCard: {
        width: 132,
        minHeight: 208,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    viewMoreIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    viewMoreTitle: {
        fontSize: 15,
        fontWeight: '900',
        textAlign: 'center',
    },
    viewMoreSubtitle: {
        marginTop: 4,
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 15,
        textAlign: 'center',
    },
    opportunityImageWrap: {
        position: 'relative',
    },
    opportunityImage: {
        width: '100%',
        height: 120,
    },
    opportunityImageFallback: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Pills overlaid on the card image: category (bottom-left), deadline
    // urgency (top-right), top-pick (top-left).
    imagePill: {
        position: 'absolute',
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 4,
        maxWidth: 150,
    },
    imagePillTopLeft: { top: 8, left: 8 },
    imagePillTopRight: { top: 8, right: 8 },
    imagePillBottomLeft: { bottom: 8, left: 8 },
    imagePillText: {
        color: '#F8FAFC',
        fontSize: 10.5,
        fontWeight: '700',
    },
    opportunityBody: {
        minHeight: 94,
        padding: 12,
        gap: 4,
    },
    matchBadge: {
        fontSize: 12,
        fontWeight: '800',
        flexShrink: 1,
    },
    opportunityTitle: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 19,
    },
    opportunityOrg: {
        fontSize: 12,
        fontWeight: '600',
    },
    opportunityFooter: {
        marginTop: 'auto',
        paddingTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    opportunityGo: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    opportunityMeta: {
        fontSize: 12,
        fontWeight: '600',
        flexShrink: 1,
    },
    followUpBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 2,
        flexWrap: 'wrap',
    },
    followUpText: {
        fontSize: 12,
        fontWeight: '700',
    },
    followUpChip: {
        minHeight: 32,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followUpChipText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    roadmapBuilderPanel: {
        width: SCREEN_WIDTH,
        marginLeft: -CHAT_RAIL_FULL_BLEED_OFFSET,
        gap: 10,
    },
    roadmapBuilderHeader: {
        paddingHorizontal: 16,
    },
    roadmapBuilderTitle: {
        fontSize: 13,
        fontWeight: '900',
    },
    roadmapBuilderSubtitle: {
        marginTop: 2,
        fontSize: 12,
        fontWeight: '600',
    },
    roadmapStatusCard: {
        minHeight: 82,
        borderRadius: 16,
        borderWidth: 1,
        marginHorizontal: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    roadmapStatusText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '700',
    },
    roadmapMatchRail: {
        gap: 12,
        paddingHorizontal: 16,
    },
    roadmapMatchCard: {
        width: 210,
        minHeight: 184,
        borderRadius: 16,
        borderWidth: 1,
        padding: 12,
        justifyContent: 'space-between',
    },
    roadmapMatchMeta: {
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    roadmapMatchTitle: {
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '900',
        marginVertical: 8,
    },
    roadmapPreviewGrid: {
        gap: 4,
        marginBottom: 10,
    },
    roadmapPreviewText: {
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    roadmapBuildButton: {
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roadmapBuildButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    imageCardStack: {
        gap: 8,
        marginTop: 8,
    },
    imageCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        maxWidth: 260,
    },
    imageCardImage: {
        width: 260,
        // Share cards are Instagram 4:5 portrait (1080×1350).
        height: 325,
    },
    imageCardFooter: {
        paddingVertical: 7,
        alignItems: 'center',
    },
    imageCardHint: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    documentCardStack: {
        gap: 8,
        marginTop: 8,
    },
    documentCard: {
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
    },
    documentIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    documentTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    documentMeta: {
        fontSize: 11.5,
        marginTop: 1,
    },
    documentActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
    },
    documentBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    documentBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    documentBtnOutline: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1.5,
    },
    documentBtnOutlineText: {
        fontSize: 12,
        fontWeight: '700',
    },
    agentActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    agentActionChip: {
        borderWidth: 1.5,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    agentActionChipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 64,
        width: '100%',
    },
    emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
    emptyDesc: { fontSize: 14, textAlign: 'center', paddingHorizontal: 28, lineHeight: 20 },
    promptsContainer: {
        width: '100%',
        maxWidth: 380,
        paddingTop: 22,
        paddingBottom: 10,
        gap: 10,
    },
    promptItem: {
        width: '100%',
        minHeight: 74,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 18,
        borderWidth: 1,
    },
    promptIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    promptCopy: {
        flex: 1,
        minWidth: 0,
        marginRight: 10,
    },
    promptTitle: {
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800',
    },
    promptSubtitle: {
        marginTop: 3,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
    },
    typingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 2,
        marginBottom: 14,
        maxWidth: '88%',
    },
    typingInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
    },
    typingText: {
        fontSize: 12.5,
        fontWeight: '600',
    },
    typingDots: {
        flexDirection: 'row',
        gap: 4,
    },
    typingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    inputWrapper: {
        paddingHorizontal: 16,
    },
    sendErrorBanner: {
        flexDirection: 'row',
        gap: 12,
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
    },
    sendErrorIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendErrorCopy: { flex: 1, gap: 4 },
    sendErrorTitle: { fontSize: 14, fontWeight: '700' },
    sendErrorBody: { fontSize: 12.5, lineHeight: 18 },
    sendErrorActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    sendErrorPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 10,
    },
    sendErrorPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    sendErrorSecondary: { paddingHorizontal: 10, paddingVertical: 9 },
    sendErrorSecondaryText: { fontSize: 13, fontWeight: '600' },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        borderRadius: 24,
        padding: 8,
        borderWidth: 1,
        minHeight: 56,
    },
    input: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
    },
    iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 6,
    },
    sendBtn: {
        marginLeft: 6,
    },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, height: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    newConvBtn: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1 },
    newConvText: { fontWeight: 'bold', marginLeft: 12 },
    threadItem: { padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    threadContent: { flex: 1, marginRight: 12 },
    threadTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
    threadDate: { fontSize: 10 },
    threadGroupTitle: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginTop: 16,
        marginBottom: 8,
        marginLeft: 4,
    },
    emptyThreads: { textAlign: 'center', marginTop: 40 },
});
