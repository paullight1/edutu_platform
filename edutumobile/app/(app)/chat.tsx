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
    StyleSheet,
    Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Send,
    Plus,
    History,
    X,
    Sparkles,
    Brain,
    Zap,
    ChevronRight,
    Volume2,
    Pause,
    Calendar,
    BellRing,
    Route,
    ListTodo,
    ExternalLink,
    MapPin,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../components/context/ThemeContext';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { useChat } from '@edutu/core/src/hooks/useChat';
import { ChatMessage, ChatOpportunityCard, ChatThread } from '@edutu/core/src/types/chat';
import { useGoals } from '@edutu/core/src/hooks/useGoals';
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { generateRoadmapFromOpportunity } from '@edutu/core/src/services/aiRoadmapGenerator';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { EdutuLogo } from '../../components/branding/EdutuLogo';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { notificationService } from '../../lib/notifications';

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

    useEffect(() => {
        if (!enabled) {
            setVisibleLength(content.length);
            return;
        }

        setVisibleLength(0);
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
const CHAT_RAIL_FULL_BLEED_OFFSET = 54;

function formatOpportunityDeadline(deadline?: string | null) {
    if (!deadline) return 'Rolling';
    const date = new Date(deadline);
    if (Number.isNaN(date.getTime())) return 'Deadline set';
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
        return 'Checking Edutu opportunities for you.';
    }

    return `I found ${count} matches from Edutu.\nSwipe the cards or narrow the search.`;
}

function compactRoadmapAnswer(matchCount: number, loading: boolean) {
    if (loading && matchCount === 0) {
        return 'I’m checking your opportunities.\nThen I’ll build the roadmap.';
    }

    if (matchCount > 0) {
        return 'I found a possible match.\nTap Build to create goals and reminders.';
    }

    return 'Which opportunity is this for?\nSend the name or browse Opportunities.';
}

function toChatOpportunityCard(opportunity: Opportunity): ChatOpportunityCard {
    return {
        id: opportunity.id,
        title: opportunity.title,
        organization: opportunity.organization,
        category: opportunity.category,
        location: opportunity.isRemote ? 'Remote' : opportunity.location,
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
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const { voiceMsg } = useLocalSearchParams<{ voiceMsg?: string }>();
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const [input, setInput] = useState(voiceMsg || '');
    const [isThreadsVisible, setIsThreadsVisible] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);
    const lastBotMessageRef = useRef<string | null>(null);
    const [deadlineActionId, setDeadlineActionId] = useState<string | null>(null);
    const [roadmapActionId, setRoadmapActionId] = useState<string | null>(null);

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? "rgba(255,255,255,0.05)" : "#FFFFFF";
    const borderColor = isDark ? "rgba(255,255,255,0.1)" : "#E2E8F0";
    const inputBg = isDark ? "#1E293B" : "#F1F5F9";
    const accentColor = "#6366F1";

    const quickPrompts = useMemo(() => [
        {
            text: 'Find scholarships I can apply for this month',
            title: 'Find scholarships',
            subtitle: 'Available this month',
            icon: Sparkles,
            topic: 'Scholarships',
        },
        {
            text: 'What Mastercard Foundation opportunities fit me?',
            title: 'Mastercard matches',
            subtitle: 'Scholarships from Edutu',
            icon: Brain,
            topic: 'Scholarships',
        },
        {
            text: 'Build a roadmap for my next application',
            title: 'Build roadmap',
            subtitle: 'Plan my next application',
            icon: Route,
            topic: 'Roadmap',
        },
        {
            text: 'Show internships with upcoming deadlines',
            title: 'Internship deadlines',
            subtitle: 'Upcoming opportunities',
            icon: Calendar,
            topic: 'Internships',
        },
    ], []);

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
        archiveThread
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

    const {
        isSpeaking,
        speak,
        stop: stopSpeaking,
    } = useTextToSpeech();

    const handleSend = useCallback(async (overrideText?: string) => {
        const text = (overrideText || input).trim();
        if (!text) return;
        setInput('');
        lastBotMessageRef.current = null;
        try {
            await sendMessage(text);
        } catch (err) {
            console.error('Failed to send message:', err);
        }
    }, [input, sendMessage]);

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

    const handleApplyOpportunity = useCallback(async (opportunity: ChatOpportunityCard) => {
        if (opportunity.applyUrl) {
            const canOpen = await Linking.canOpenURL(opportunity.applyUrl);
            if (canOpen) {
                await Linking.openURL(opportunity.applyUrl);
                return;
            }
        }

        router.push(`/opportunities/${opportunity.id}`);
    }, [router]);

    const handleAddDeadline = useCallback(async (opportunity: ChatOpportunityCard) => {
        if (!opportunity.deadline || !user?.id) {
            Alert.alert('No deadline found', 'This opportunity does not have a saved deadline yet.');
            return;
        }

        const actionId = `deadline-${opportunity.id}`;
        if (deadlineActionId) return;

        const existingGoal = goals.find(goal =>
            goal.deadline &&
            new Date(goal.deadline).toDateString() === new Date(opportunity.deadline!).toDateString() &&
            goal.title.toLowerCase().includes(opportunity.title.toLowerCase().slice(0, 24))
        );

        if (existingGoal) {
            Alert.alert('Already tracked', 'This deadline is already in your plan.');
            router.push('/deadlines');
            return;
        }

        setDeadlineActionId(actionId);
        try {
            const createdGoal = await createGoal({
                title: `Apply: ${opportunity.title}`,
                description: `Application deadline for ${opportunity.organization || 'this opportunity'}.`,
                category: 'Opportunity',
                deadline: opportunity.deadline,
                priority: 'high',
                source: 'custom',
                opportunity_title: opportunity.title,
                reminder_enabled: true,
                reminder_date: opportunity.deadline,
            });

            const notificationId = await notificationService.scheduleGoalReminder(
                createdGoal.id,
                createdGoal.title,
                opportunity.deadline,
            );

            if (notificationId) {
                await updateGoal(createdGoal.id, { notification_id: notificationId });
            }

            Alert.alert('Deadline added', 'I added this to your plan and scheduled reminders.');
        } catch (error) {
            console.error('Failed to add opportunity deadline:', error);
            Alert.alert('Could not add deadline', 'Please try again from the opportunity page.');
        } finally {
            setDeadlineActionId(null);
        }
    }, [createGoal, deadlineActionId, goals, router, updateGoal, user?.id]);

    const handleGenerateRoadmap = useCallback((opportunityId: string) => {
        router.push(`/opportunities/${opportunityId}`);
    }, [router]);

    const handleFindRoadmap = useCallback((opportunity: ChatOpportunityCard) => {
        router.push({
            pathname: '/roadmaps',
            params: {
                q: opportunity.title,
                opportunityId: opportunity.id,
            },
        });
    }, [router]);

    const handleBuildRoadmapFromOpportunity = useCallback(async (opportunity: Opportunity) => {
        if (!user?.id) {
            Alert.alert('Sign in required', 'Please sign in to create roadmap goals.');
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
            Alert.alert('Roadmap already exists', 'This opportunity already has goals in your plan.', [
                { text: 'Open Goals', onPress: () => router.push('/goals') },
                { text: 'Cancel', style: 'cancel' },
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
                    title: `Submit ${opportunity.title}`,
                    description: `${roadmap.winningStrategy}\n\nResources:\n${resourceText}`,
                    deadline: roadmap.submissionTargetDate,
                    priority: 'high' as const,
                },
                ...roadmap.milestones.map((milestone, index) => ({
                    title: milestone.title,
                    description: milestone.description || `Milestone for ${opportunity.title}`,
                    deadline: milestone.date,
                    priority: index === roadmap.milestones.length - 1 ? 'high' as const : 'medium' as const,
                })),
                ...roadmap.dailyPlan.map((day) => ({
                    title: day.title,
                    description: `${day.description}\n\nFocus: ${day.focus}\nTime: ${day.durationMinutes} minutes`,
                    deadline: day.date,
                    priority: day.focus === 'submission' || day.focus === 'writing' ? 'high' as const : 'medium' as const,
                })),
                ...roadmap.checklist.map((item) => ({
                    title: item.title,
                    description: `Checklist item for ${opportunity.title}`,
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
                'Roadmap created',
                `${createdGoals.length} goals were added with reminders where deadlines exist.`,
                [
                    { text: 'Open Goals', onPress: () => router.push('/goals') },
                    { text: 'Stay Here', style: 'cancel' },
                ],
            );
        } catch (error) {
            console.error('Failed to build AI roadmap from chat:', error);
            Alert.alert('Could not create roadmap', 'Please try again from the opportunity page.');
        } finally {
            setRoadmapActionId(null);
        }
    }, [createGoal, goals, router, updateGoal, user?.id]);

    useEffect(() => {
        if (!isSpeaking && speakingMessageId) {
            setSpeakingMessageId(null);
        }
    }, [isSpeaking, speakingMessageId]);

    useEffect(() => {
        if (voiceMsg && voiceMsg.trim()) {
            handleSend(voiceMsg.trim());
            router.setParams({ voiceMsg: undefined });
        }
    }, [voiceMsg]);

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
            { title: 'Today', items: [] as ChatThread[] },
            { title: 'Yesterday', items: [] as ChatThread[] },
            { title: 'This Week', items: [] as ChatThread[] },
            { title: 'Older', items: [] as ChatThread[] },
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
    }, [threads]);

    const userInitial = useMemo(() => {
        const source = user?.firstName || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'U';
        return source.trim().slice(0, 1).toUpperCase() || 'U';
    }, [user?.firstName, user?.fullName, user?.primaryEmailAddress?.emailAddress]);

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
                                <View style={[styles.numberBadge, { backgroundColor: isBot ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.18)' }]}>
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
    }, [textPrimary, textSecondary]);

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isBot = item.role === 'assistant';
        const isCurrentlySpeaking = speakingMessageId === item.id;
        const previousUserMessage = isBot
            ? [...messages.slice(0, index)].reverse().find(message => message.role === 'user')?.content
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
        const displayContent = shouldShowRoadmapPanel
            ? compactRoadmapAnswer(roadmapMatches.length, isLoadingOpportunities)
            : shouldShowOpportunityCards
                ? compactOpportunityAnswer(opportunityCards.length)
                : item.content;

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
                        <View style={[styles.avatar, styles.aiAvatar, { backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF' }]}>
                            <EdutuLogo size={24} frameless />
                        </View>
                    ) : null}
                    <View style={styles.messageStack}>
                        <View style={[
                            styles.messageBubble,
                            isBot
                                ? [styles.messageBubbleAssistant, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor }]
                                : [styles.messageBubbleUser, { backgroundColor: accentColor }]
                        ]}>
                            {isBot ? (
                                <TypingReveal content={displayContent} enabled={shouldTypeReveal}>
                                    {(visibleContent) => renderFormattedMessage(visibleContent, isBot)}
                                </TypingReveal>
                            ) : renderFormattedMessage(displayContent, isBot)}

                            {isBot && (
                                <View style={styles.messageActions}>
                                    <TouchableOpacity
                                        onPress={() => handleSpeakMessage(item.id, item.content)}
                                        style={[
                                            styles.speakBtn,
                                            { backgroundColor: isCurrentlySpeaking ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.1)' }
                                        ]}
                                    >
                                        {isCurrentlySpeaking ? (
                                            <Pause size={14} color="#EF4444" />
                                        ) : (
                                            <Volume2 size={14} color={accentColor} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                        {showOpportunityShelf && (
                            <View style={styles.opportunityShelf}>
                                <View style={styles.opportunityShelfHeader}>
                                    <Text style={[styles.opportunityShelfTitle, { color: textPrimary }]}>
                                        Recommended from Opportunities
                                    </Text>
                                    <TouchableOpacity onPress={() => router.push('/opportunities')}>
                                        <Text style={[styles.opportunityShelfLink, { color: accentColor }]}>View more</Text>
                                    </TouchableOpacity>
                                </View>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.opportunityRail}
                                    decelerationRate="fast"
                                    snapToInterval={272}
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
                                            <View style={[styles.opportunityLoadingImage, { backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF' }]}>
                                                <ActivityIndicator size="small" color={accentColor} />
                                            </View>
                                            <View style={styles.opportunityBody}>
                                                <View style={[styles.loadingLine, styles.loadingLineShort, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                                <View style={[styles.loadingLine, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                                <View style={[styles.loadingLine, styles.loadingLineMedium, { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : '#E2E8F0' }]} />
                                                <View style={[styles.loadingButton, { backgroundColor: isDark ? 'rgba(99,102,241,0.24)' : '#C7D2FE' }]} />
                                            </View>
                                        </View>
                                    ))
                                ) : opportunityCards.map((opportunity) => (
                                    <TouchableOpacity
                                        key={opportunity.id}
                                        activeOpacity={0.88}
                                        onPress={() => handleViewOpportunity(opportunity.id)}
                                        style={[
                                            styles.opportunityCard,
                                            {
                                                backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#FFFFFF',
                                                borderColor,
                                            },
                                        ]}
                                    >
                                        {opportunity.imageUrl ? (
                                            <Image source={{ uri: opportunity.imageUrl }} style={styles.opportunityImage} />
                                        ) : (
                                            <View style={[styles.opportunityImageFallback, { backgroundColor: isDark ? 'rgba(99,102,241,0.16)' : '#EEF2FF' }]}>
                                                <Sparkles size={24} color={accentColor} />
                                            </View>
                                        )}

                                        <View style={styles.opportunityBody}>
                                            <View style={styles.opportunityTopRow}>
                                                <Text style={[styles.opportunityCategory, { color: accentColor }]} numberOfLines={1}>
                                                    {opportunity.category || 'Opportunity'}
                                                </Text>
                                                <Text style={[styles.opportunityMetaDot, { color: textSecondary }]}>·</Text>
                                                <Text style={[styles.opportunityDeadline, { color: textSecondary }]} numberOfLines={1}>
                                                    {formatOpportunityDeadline(opportunity.deadline)}
                                                </Text>
                                            </View>

                                            <Text style={[styles.opportunityTitle, { color: textPrimary }]} numberOfLines={3}>
                                                {opportunity.title}
                                            </Text>

                                            <View style={styles.opportunityActions}>
                                                <TouchableOpacity
                                                    onPress={() => handleViewOpportunity(opportunity.id)}
                                                    style={[styles.primaryCta, { backgroundColor: accentColor }]}
                                                >
                                                    <Text style={styles.primaryCtaText}>View</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                                {opportunityCards.length > 0 ? (
                                    <TouchableOpacity
                                    activeOpacity={0.86}
                                    onPress={() => router.push('/opportunities')}
                                    style={[
                                        styles.viewMoreOpportunityCard,
                                        {
                                            backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF',
                                            borderColor: accentColor,
                                        },
                                    ]}
                                >
                                    <View style={[styles.viewMoreIcon, { backgroundColor: accentColor }]}>
                                        <ChevronRight size={22} color="#FFFFFF" />
                                    </View>
                                    <Text style={[styles.viewMoreTitle, { color: textPrimary }]}>View more</Text>
                                    <Text style={[styles.viewMoreSubtitle, { color: textSecondary }]}>
                                        Open all opportunities
                                    </Text>
                                    </TouchableOpacity>
                                ) : null}
                                </ScrollView>
                                {opportunityCards.length > 0 ? (
                                    <View style={styles.followUpBar}>
                                        <Text style={[styles.followUpText, { color: textSecondary }]}>Narrow by:</Text>
                                        {['Country', 'Deadline', 'Funding'].map((label) => (
                                            <TouchableOpacity
                                                key={label}
                                                onPress={() => handleSend(`Narrow these by ${label.toLowerCase()}`)}
                                                style={[styles.followUpChip, { borderColor, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }]}
                                            >
                                                <Text style={[styles.followUpChipText, { color: textPrimary }]}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : null}
                            </View>
                        )}
                        {shouldShowRoadmapPanel && (
                            <View style={styles.roadmapBuilderPanel}>
                                <View style={styles.roadmapBuilderHeader}>
                                    <Text style={[styles.roadmapBuilderTitle, { color: textPrimary }]}>
                                        Build roadmap
                                    </Text>
                                    <Text style={[styles.roadmapBuilderSubtitle, { color: textSecondary }]}>
                                        Goals, deadlines, reminders
                                    </Text>
                                </View>

                                {isLoadingOpportunities && roadmapMatches.length === 0 ? (
                                    <View style={[styles.roadmapStatusCard, { backgroundColor: cardBg, borderColor }]}>
                                        <ActivityIndicator size="small" color={accentColor} />
                                        <Text style={[styles.roadmapStatusText, { color: textSecondary }]}>
                                            Searching opportunities...
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
                                                        {opportunity.category || 'Opportunity'} · due {formatOpportunityDeadline(opportunity.deadline)}
                                                    </Text>
                                                    <Text style={[styles.roadmapMatchTitle, { color: textPrimary }]} numberOfLines={3}>
                                                        {opportunity.title}
                                                    </Text>
                                                    <View style={styles.roadmapPreviewGrid}>
                                                        <Text style={[styles.roadmapPreviewText, { color: textSecondary }]}>
                                                            {preview.daysUntilDeadline} days left
                                                        </Text>
                                                        <Text style={[styles.roadmapPreviewText, { color: textSecondary }]}>
                                                            {preview.dailyPlan.length} daily steps
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.roadmapBuildButton, { backgroundColor: accentColor }]}>
                                                        {roadmapActionId === opportunity.id ? (
                                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                                        ) : (
                                                            <Text style={styles.roadmapBuildButtonText}>Build</Text>
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                ) : null}
                            </View>
                        )}
                    </View>
                    {!isBot ? (
                        <View style={[styles.avatar, { backgroundColor: isDark ? '#475569' : '#64748B' }]}>
                            {user?.imageUrl ? (
                                <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
                            ) : (
                                <Text style={styles.avatarInitial}>{userInitial}</Text>
                            )}
                        </View>
                    ) : null}
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
                selectedThreadId === item.id && { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: accentColor }
            ]}
        >
            <View style={styles.threadContent}>
                <Text style={[styles.threadTitle, { color: textPrimary }]} numberOfLines={1}>
                    {item.title || 'New Conversation'}
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
                title="AI Coach"
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
                            <BrandedLoader label="Loading conversation..." />
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
                                    <View style={styles.emptyIcon}>
                                        <EdutuLogo size={48} frameless />
                                    </View>
                                    <Text style={[styles.emptyTitle, { color: textPrimary }]}>I'm Edutu, your AI Coach</Text>
                                    <Text style={[styles.emptyDesc, { color: textSecondary }]}>
                                        Ask for real scholarships, deadlines, roadmaps, or application next steps.
                                    </Text>
                                    <View style={styles.promptsContainer}>
                                        {quickPrompts.map((prompt) => (
                                            <TouchableOpacity
                                                key={prompt.text}
                                                onPress={() => handleSend(prompt.text)}
                                                style={[styles.promptItem, { backgroundColor: cardBg, borderColor }]}
                                            >
                                                <View style={styles.promptIcon}>
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
                                            <View style={[styles.avatar, styles.aiAvatar, { backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : '#EEF2FF' }]}>
                                                <EdutuLogo size={22} frameless />
                                            </View>
                                            <View style={[styles.typingBubble, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor }]}>
                                                <Text style={[styles.typingText, { color: textSecondary }]}>Edutu is checking opportunities</Text>
                                                <View style={styles.typingDots}>
                                                    <View style={[styles.typingDot, { backgroundColor: accentColor }]} />
                                                    <View style={[styles.typingDot, { backgroundColor: accentColor, opacity: 0.7 }]} />
                                                    <View style={[styles.typingDot, { backgroundColor: accentColor, opacity: 0.45 }]} />
                                                </View>
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
                                                    <View style={styles.promptIcon}>
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
                                placeholder="Message Edutu..."
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

                            <TouchableOpacity
                                onPress={() => handleSend()}
                                disabled={!input.trim()}
                                style={[
                                    styles.iconBtn,
                                    styles.sendBtn,
                                    { backgroundColor: input.trim() ? accentColor : (isDark ? '#334155' : '#CBD5E1') }
                                ]}
                            >
                                <Send size={18} color="white" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>

            <Modal
                visible={isThreadsVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsThreadsVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textPrimary }]}>Conversations</Text>
                            <TouchableOpacity onPress={() => setIsThreadsVisible(false)}>
                                <X size={24} color={textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                selectThread(null);
                                setIsThreadsVisible(false);
                            }}
                            style={[styles.newConvBtn, { backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)' }]}
                        >
                            <Plus size={20} color={accentColor} />
                            <Text style={styles.newConvText}>New Conversation</Text>
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
                                    <Text style={[styles.emptyThreads, { color: textSecondary }]}>No recent conversations</Text>
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
        alignItems: 'flex-end',
        maxWidth: '88%',
        gap: 8,
    },
    messageContainerAssistant: {
        alignSelf: 'flex-start',
    },
    messageContainerAssistantWide: {
        maxWidth: '100%',
    },
    messageContainerUser: {
        alignSelf: 'flex-end',
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
        borderColor: 'rgba(99,102,241,0.20)',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 15,
    },
    avatarInitial: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
    },
    messageBubble: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        position: 'relative',
        flexShrink: 1,
    },
    messageBubbleAssistant: {
        borderRadius: 18,
        borderBottomLeftRadius: 6,
    },
    messageBubbleUser: {
        borderRadius: 18,
        borderBottomRightRadius: 6,
        borderColor: 'transparent',
    },
    messageText: {
        fontSize: 15,
        lineHeight: 22,
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
        justifyContent: 'flex-end',
        marginTop: 6,
    },
    speakBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
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
        width: 210,
        borderRadius: 14,
        borderWidth: 1,
        overflow: 'hidden',
    },
    opportunityLoadingCard: {
        minHeight: 228,
    },
    opportunityLoadingImage: {
        width: '100%',
        height: 104,
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
    loadingButton: {
        width: '100%',
        height: 34,
        borderRadius: 10,
        marginTop: 2,
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
    opportunityImage: {
        width: '100%',
        height: 104,
    },
    opportunityImageFallback: {
        height: 104,
        alignItems: 'center',
        justifyContent: 'center',
    },
    opportunityBody: {
        minHeight: 124,
        padding: 10,
        gap: 8,
        justifyContent: 'space-between',
    },
    opportunityTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    opportunityCategory: {
        flexShrink: 1,
        maxWidth: 112,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    opportunityMetaDot: {
        fontSize: 12,
        fontWeight: '900',
    },
    opportunityDeadline: {
        flexShrink: 0,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    matchBadge: {
        fontSize: 10,
        fontWeight: '800',
    },
    opportunityTitle: {
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 17,
    },
    opportunityMeta: {
        fontSize: 12,
        fontWeight: '600',
    },
    cardHint: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.7,
    },
    opportunitySummary: {
        fontSize: 12,
        lineHeight: 17,
    },
    opportunityFacts: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    factPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
    },
    factText: {
        fontSize: 11,
        fontWeight: '600',
        maxWidth: 150,
    },
    opportunityActions: {
        paddingTop: 0,
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
        minHeight: 30,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    followUpChipText: {
        fontSize: 12,
        fontWeight: '800',
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
    roadmapInlineButton: {
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roadmapInlineButtonText: {
        fontSize: 12,
        fontWeight: '900',
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
    smartActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        paddingTop: 1,
    },
    smartActionChip: {
        minHeight: 30,
        borderRadius: 999,
        borderWidth: 1,
        paddingHorizontal: 9,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    smartActionText: {
        fontSize: 11,
        fontWeight: '800',
    },
    secondaryCta: {
        flex: 1,
        height: 36,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryCtaText: {
        fontSize: 12,
        fontWeight: '800',
    },
    primaryCta: {
        width: '100%',
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    primaryCtaText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 64,
        width: '100%',
    },
    emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(99,102,241,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
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
        backgroundColor: 'rgba(99,102,241,0.1)',
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
        alignItems: 'flex-end',
        gap: 8,
        marginTop: 2,
        marginBottom: 14,
        maxWidth: '88%',
    },
    typingBubble: {
        minHeight: 42,
        borderRadius: 18,
        borderBottomLeftRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    typingText: {
        fontSize: 12,
        fontWeight: '700',
    },
    typingDots: {
        flexDirection: 'row',
        gap: 3,
    },
    typingDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },
    inputWrapper: {
        paddingHorizontal: 16,
    },
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
    newConvText: { color: '#6366F1', fontWeight: 'bold', marginLeft: 12 },
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
