import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ImageBackground,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    ArrowLeft,
    Bell,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    Download,
    ExternalLink,
    Layers,
    MessageCircle,
    MoreHorizontal,
    Rocket,
    Send,
    Star,
    Target,
    Users,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../../../components/context/ThemeContext';
import { notificationService } from '../../../lib/notifications';
import {
    CommentReportReason,
    RoadmapTemplate,
    TemplateComment,
    TemplateResource,
    TemplateStep,
    addBlockedAuthorId,
    adoptTemplate,
    avatarColor,
    blockCommentAuthor,
    categoryMeta,
    deriveUserId,
    fetchTemplateById,
    fetchTemplateComments,
    getBlockedAuthorIds,
    getCachedTemplate,
    initialsOf,
    postTemplateComment,
    reportTemplateComment,
    resourceHost,
    resourceMeta,
    syncBlockedAuthorIds,
    timeAgo,
} from '../../../lib/roadmapTemplates';

const HERO_GRADIENT = ['rgba(2,6,23,0.25)', 'rgba(2,6,23,0.05)', 'rgba(2,6,23,0.55)', 'rgba(2,6,23,0.92)'] as const;

const buildDate = (week: number) => {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, week) * 7);
    date.setHours(9, 0, 0, 0);
    return date;
};

const formatIcsDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export default function RoadmapTemplateDetailScreen() {
    const { t } = useTranslation('goals');
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const { getToken, userId } = useAuth();
    const params = useLocalSearchParams<{ id?: string }>();
    const templateId = typeof params.id === 'string' ? params.id : '';

    // Derived id of the viewer, matched against a comment's author_id so the
    // report/block menu never appears on the viewer's own comments.
    const myAuthorId = useMemo(() => deriveUserId(userId), [userId]);

    const [template, setTemplate] = useState<RoadmapTemplate | null>(() => getCachedTemplate(templateId) || null);
    const [comments, setComments] = useState<TemplateComment[]>([]);
    const [blockedAuthors, setBlockedAuthors] = useState<string[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(true);
    // First step starts expanded so the journey never looks empty.
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => {
        const cached = getCachedTemplate(templateId);
        return cached?.steps?.[0] ? { [cached.steps[0].id]: true } : {};
    });
    const [commentDraft, setCommentDraft] = useState('');
    const [commentRating, setCommentRating] = useState(0);
    const [postingComment, setPostingComment] = useState(false);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        if (!templateId) return;
        let cancelled = false;
        // Refresh from the backend even when the list already hydrated the cache.
        fetchTemplateById(templateId)
            .then((fresh) => {
                if (!cancelled && fresh) setTemplate(fresh);
            })
            .catch(() => { /* keep cached/fallback template */ });
        fetchTemplateComments(templateId)
            .then((items) => {
                if (!cancelled) setComments(items);
            })
            .catch(() => { /* comments are best-effort */ })
            .finally(() => {
                if (!cancelled) setCommentsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [templateId]);

    // Hydrate the blocked-authors list: local cache first (instant), then the
    // server source of truth (cross-device).
    useEffect(() => {
        let cancelled = false;
        getBlockedAuthorIds().then((ids) => {
            if (!cancelled) setBlockedAuthors(ids);
        });
        getToken()
            .then((token) => {
                if (!token) return;
                return syncBlockedAuthorIds(token).then((ids) => {
                    if (!cancelled) setBlockedAuthors(ids);
                });
            })
            .catch(() => { /* keep local cache */ });
        return () => {
            cancelled = true;
        };
    }, [getToken]);

    // When the template arrives (or changes) after mount, expand its first
    // step — adjust-during-render is React's documented alternative to a
    // state-syncing effect.
    const [prevTemplateId, setPrevTemplateId] = useState(template?.id);
    if (prevTemplateId !== template?.id) {
        setPrevTemplateId(template?.id);
        if (template && Object.keys(expandedSteps).length === 0 && template.steps[0]) {
            setExpandedSteps({ [template.steps[0].id]: true });
        }
    }

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
    const subtleBg = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC';
    const meta = categoryMeta(template?.category);
    const accent = meta.color;

    const averageRating = useMemo(() => {
        if (!template) return 0;
        if (template.rating > 0) return template.rating;
        const rated = comments.filter((comment) => comment.rating);
        if (rated.length === 0) return 0;
        return rated.reduce((sum, comment) => sum + (comment.rating || 0), 0) / rated.length;
    }, [template, comments]);

    // Hide comments authored by users the viewer has blocked (Guideline 1.2).
    const visibleComments = useMemo(() => {
        if (blockedAuthors.length === 0) return comments;
        const blocked = new Set(blockedAuthors);
        return comments.filter((comment) => !blocked.has(comment.authorId));
    }, [comments, blockedAuthors]);

    const openResource = async (resource: TemplateResource) => {
        try {
            const supported = await Linking.canOpenURL(resource.url);
            if (supported) await Linking.openURL(resource.url);
        } catch {
            // Ignore malformed URLs.
        }
    };

    const exportCalendar = async (target: RoadmapTemplate) => {
        const events = target.steps.map((step) => {
            const start = buildDate(step.week);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const description = `${step.guidance}${step.deliverable ? `\\n${t('templates.deliverableLabel', { value: step.deliverable })}` : ''}`;
            return [
                'BEGIN:VEVENT',
                `UID:${target.id}-${step.id}@edutu`,
                `DTSTAMP:${formatIcsDate(new Date())}`,
                `DTSTART:${formatIcsDate(start)}`,
                `DTEND:${formatIcsDate(end)}`,
                `SUMMARY:${t('templates.icsSummary', { title: target.title, week: step.week })}`,
                `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
                'END:VEVENT',
            ].join('\n');
        });
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Edutu//Roadmap Templates//EN', ...events, 'END:VCALENDAR'].join('\n');

        if (Platform.OS === 'web') {
            Alert.alert(t('templates.calendarReadyTitle'), t('templates.calendarReadyMessage'));
            return;
        }

        const file = new File(Paths.cache, `${target.id}-roadmap.ics`);
        file.write(ics);
        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', dialogTitle: t('templates.shareDialogTitle') });
        } else {
            Alert.alert(t('templates.calendarFileCreated'), file.uri);
        }
    };

    const scheduleReminders = async (target: RoadmapTemplate) => {
        const allowed = await notificationService.requestPermissions();
        if (!allowed) {
            Alert.alert(t('templates.notificationsBlockedTitle'), t('templates.notificationsBlockedMessage'));
            return;
        }

        const scheduled = [];
        for (const step of target.steps.slice(0, 8)) {
            const date = buildDate(step.week);
            if (date.getTime() <= Date.now()) continue;
            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title: t('templates.reminderTitle', { week: step.week }),
                    body: `${target.title} - ${step.title}`,
                    data: { type: 'roadmap-template', templateId: target.id, week: step.week },
                },
                trigger: { date } as Notifications.NotificationTriggerInput,
            });
            scheduled.push(id);
        }

        Alert.alert(t('templates.remindersScheduledTitle'), t('templates.remindersScheduledMessage', { count: scheduled.length }));
    };

    const startRoadmap = async (target: RoadmapTemplate) => {
        if (starting) return;
        // Fallback templates only exist client-side; guide users to the roadmaps hub instead.
        if (target.id.startsWith('fallback-')) {
            router.push('/roadmaps' as any);
            return;
        }
        setStarting(true);
        try {
            const token = (await getToken()) || '';
            if (!token) {
                Alert.alert(t('templates.signInTitle'), t('templates.signInMessage'));
                return;
            }
            const adopted = await adoptTemplate(target.id, token);
            if (adopted) {
                Alert.alert(
                    t('templates.startedTitle'),
                    t('templates.startedMessage'),
                    [{ text: t('templates.viewMyRoadmaps'), onPress: () => router.push('/roadmaps' as any) }],
                );
            } else {
                Alert.alert(t('templates.startFailedTitle'), t('templates.startFailedMessage'));
            }
        } catch {
            Alert.alert(t('templates.startFailedTitle'), t('templates.startFailedMessage'));
        } finally {
            setStarting(false);
        }
    };

    const submitComment = async () => {
        const body = commentDraft.trim();
        if (!template || body.length < 2 || postingComment) return;
        if (template.id.startsWith('fallback-')) {
            Alert.alert(t('templates.comments.offlineTitle'), t('templates.comments.offlineMessage'));
            return;
        }
        setPostingComment(true);
        try {
            const token = (await getToken()) || '';
            if (!token) {
                Alert.alert(t('templates.signInTitle'), t('templates.signInMessage'));
                return;
            }
            const created = await postTemplateComment(template.id, token, {
                body,
                rating: commentRating > 0 ? commentRating : undefined,
            });
            if (created) {
                setComments((existing) => [created, ...existing]);
                setCommentDraft('');
                setCommentRating(0);
            }
        } catch {
            Alert.alert(t('templates.comments.failedTitle'), t('templates.comments.failedMessage'));
        } finally {
            setPostingComment(false);
        }
    };

    // ── UGC moderation: report / block (Apple Guideline 1.2) ──────────────
    const reportComment = async (comment: TemplateComment, reason: CommentReportReason) => {
        try {
            const token = (await getToken()) || '';
            if (!token) {
                Alert.alert(t('templates.signInTitle'), t('templates.signInMessage'));
                return;
            }
            const ok = await reportTemplateComment(template!.id, comment.id, token, reason);
            if (ok) {
                Alert.alert(
                    t('templates.comments.reportSubmittedTitle', { defaultValue: 'Report received' }),
                    t('templates.comments.reportSubmittedMessage', {
                        defaultValue: 'Thanks for flagging this. Our team will review it.',
                    }),
                );
            } else {
                Alert.alert(t('templates.comments.failedTitle'), t('templates.comments.failedMessage'));
            }
        } catch {
            Alert.alert(t('templates.comments.failedTitle'), t('templates.comments.failedMessage'));
        }
    };

    const blockAuthor = async (comment: TemplateComment) => {
        Alert.alert(
            t('templates.comments.blockConfirmTitle', {
                defaultValue: 'Block {{name}}?',
                name: comment.authorName,
            }),
            t('templates.comments.blockConfirmMessage', {
                defaultValue: "You won't see comments from this person anymore.",
            }),
            [
                { text: t('templates.comments.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                {
                    text: t('templates.comments.blockAction', { defaultValue: 'Block' }),
                    style: 'destructive',
                    onPress: async () => {
                        // Filter locally first so the effect is instant.
                        setBlockedAuthors((existing) =>
                            existing.includes(comment.authorId) ? existing : [...existing, comment.authorId],
                        );
                        await addBlockedAuthorId(comment.authorId);
                        try {
                            const token = (await getToken()) || '';
                            if (token) await blockCommentAuthor(comment.authorId, token);
                        } catch {
                            // Local filtering already applied; server retry on next sync.
                        }
                    },
                },
            ],
        );
    };

    const openCommentActions = (comment: TemplateComment) => {
        Alert.alert(
            t('templates.comments.actionsTitle', { defaultValue: 'Comment options' }),
            undefined,
            [
                {
                    text: t('templates.comments.reportAction', { defaultValue: 'Report comment' }),
                    onPress: () =>
                        Alert.alert(
                            t('templates.comments.reportReasonTitle', { defaultValue: 'Report this comment' }),
                            t('templates.comments.reportReasonMessage', {
                                defaultValue: 'Why are you reporting this?',
                            }),
                            [
                                {
                                    text: t('templates.comments.reasonOffensive', { defaultValue: 'Offensive or abusive' }),
                                    onPress: () => reportComment(comment, 'offensive'),
                                },
                                {
                                    text: t('templates.comments.reasonSpam', { defaultValue: 'Spam or misleading' }),
                                    onPress: () => reportComment(comment, 'spam'),
                                },
                                {
                                    text: t('templates.comments.reasonHarassment', { defaultValue: 'Harassment' }),
                                    onPress: () => reportComment(comment, 'harassment'),
                                },
                                { text: t('templates.comments.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                            ],
                        ),
                },
                {
                    text: t('templates.comments.blockAction', { defaultValue: 'Block user' }),
                    style: 'destructive',
                    onPress: () => blockAuthor(comment),
                },
                { text: t('templates.comments.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
            ],
        );
    };

    const renderStars = (value: number, size = 12) => (
        <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((position) => (
                <Star
                    key={position}
                    size={size}
                    color="#FBBF24"
                    fill={value >= position - 0.25 ? '#FBBF24' : 'transparent'}
                />
            ))}
        </View>
    );

    if (!template) {
        return (
            <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
                <View style={styles.missingWrap}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={[styles.missingText, { color: textSecondary }]}>{t('templates.loadingTemplate')}</Text>
                    <TouchableOpacity onPress={() => router.back()} style={[styles.missingBack, { borderColor }]}>
                        <Text style={[styles.missingBackText, { color: colors.foreground }]}>{t('templates.goBack')}</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    const MetaIcon = meta.icon;

    return (
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
                <ScrollView
                    style={styles.screen}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 128 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* ------------------------------------------------ hero */}
                    <ImageBackground
                        source={template.coverImage ? { uri: template.coverImage } : undefined}
                        style={[styles.hero, { backgroundColor: accent + '33', paddingTop: insets.top + 8 }]}
                    >
                        {!template.coverImage && (
                            <View style={styles.heroFallback}>
                                <MetaIcon size={64} color={accent} />
                            </View>
                        )}
                        <LinearGradient colors={HERO_GRADIENT} style={styles.heroGradient}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => router.back()}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <ArrowLeft size={20} color="#FFFFFF" />
                            </TouchableOpacity>
                            <View style={styles.heroBottom}>
                                <View style={styles.heroPills}>
                                    <View style={styles.heroPill}>
                                        <MetaIcon size={11} color="#FFFFFF" />
                                        <Text style={styles.heroPillText}>{t(`templates.categories.${meta.key}`)}</Text>
                                    </View>
                                    <View style={styles.heroPill}>
                                        <Text style={styles.heroPillText}>{template.difficulty}</Text>
                                    </View>
                                </View>
                                <Text style={styles.heroTitle}>{template.title}</Text>
                                <View style={styles.heroAuthorRow}>
                                    <View style={[styles.avatar, { backgroundColor: avatarColor(template.authorName) }]}>
                                        <Text style={styles.avatarText}>{initialsOf(template.authorName)}</Text>
                                    </View>
                                    <View style={styles.heroAuthorCopy}>
                                        <Text style={styles.heroAuthorName} numberOfLines={1}>
                                            {t('templates.curatedBy', { name: template.authorName })}
                                        </Text>
                                        {template.authorRole ? (
                                            <Text style={styles.heroAuthorRole} numberOfLines={1}>{template.authorRole}</Text>
                                        ) : null}
                                    </View>
                                </View>
                            </View>
                        </LinearGradient>
                    </ImageBackground>

                    {/* ------------------------------------------- stats strip */}
                    <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor }]}>
                        <View style={styles.statCell}>
                            <Clock3 size={15} color={accent} />
                            <Text style={[styles.statValue, { color: colors.foreground }]}>{template.duration}</Text>
                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('templates.statDuration')}</Text>
                        </View>
                        <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
                        <View style={styles.statCell}>
                            <Layers size={15} color={accent} />
                            <Text style={[styles.statValue, { color: colors.foreground }]}>{template.steps.length}</Text>
                            <Text style={[styles.statLabel, { color: textSecondary }]}>{t('templates.statSteps')}</Text>
                        </View>
                        {averageRating > 0 && (
                            <>
                                <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
                                <View style={styles.statCell}>
                                    <Star size={15} color="#FBBF24" fill="#FBBF24" />
                                    <Text style={[styles.statValue, { color: colors.foreground }]}>{averageRating.toFixed(1)}</Text>
                                    <Text style={[styles.statLabel, { color: textSecondary }]}>{t('templates.statRating')}</Text>
                                </View>
                            </>
                        )}
                        {template.learners > 0 && (
                            <>
                                <View style={[styles.statDivider, { backgroundColor: borderColor }]} />
                                <View style={styles.statCell}>
                                    <Users size={15} color={accent} />
                                    <Text style={[styles.statValue, { color: colors.foreground }]}>{template.learners}</Text>
                                    <Text style={[styles.statLabel, { color: textSecondary }]}>{t('templates.statLearners')}</Text>
                                </View>
                            </>
                        )}
                    </View>

                    {/* ------------------------------------------------ about */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('templates.aboutPath')}</Text>
                        <Text style={[styles.summary, { color: textSecondary }]}>{template.summary}</Text>
                        {template.outcomes.length > 0 && (
                            <View style={[styles.outcomesCard, { backgroundColor: subtleBg, borderColor }]}>
                                <Text style={[styles.outcomesTitle, { color: colors.foreground }]}>{t('templates.outcomes')}</Text>
                                {template.outcomes.map((outcome) => (
                                    <View key={outcome} style={styles.outcomeRow}>
                                        <CheckCircle2 size={15} color={accent} style={styles.outcomeIcon} />
                                        <Text style={[styles.outcomeText, { color: colors.foreground }]}>{outcome}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* ---------------------------------------------- journey */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('templates.journey')}</Text>
                        <Text style={[styles.sectionHint, { color: textSecondary }]}>{t('templates.journeyHint')}</Text>
                        <View style={styles.timeline}>
                            {template.steps.map((step: TemplateStep, index: number) => {
                                const expanded = Boolean(expandedSteps[step.id]);
                                const isLast = index === template.steps.length - 1;
                                return (
                                    <View key={step.id} style={styles.timelineRow}>
                                        <View style={styles.timelineRail}>
                                            <View style={[styles.stepNumber, { backgroundColor: expanded ? accent : accent + '22' }]}>
                                                <Text style={[styles.stepNumberText, { color: expanded ? '#FFFFFF' : accent }]}>
                                                    {index + 1}
                                                </Text>
                                            </View>
                                            {!isLast && <View style={[styles.railLine, { backgroundColor: accent + '33' }]} />}
                                        </View>
                                        <TouchableOpacity
                                            activeOpacity={0.85}
                                            style={[styles.stepCard, { backgroundColor: colors.card, borderColor: expanded ? accent + '55' : borderColor }]}
                                            onPress={() =>
                                                setExpandedSteps((state) => ({ ...state, [step.id]: !state[step.id] }))
                                            }
                                        >
                                            <View style={styles.stepHeader}>
                                                <View style={styles.stepHeaderCopy}>
                                                    <View style={styles.stepMetaRow}>
                                                        <Text style={[styles.stepWeek, { color: accent }]}>
                                                            {step.duration || t('templates.week', { week: step.week })}
                                                        </Text>
                                                        {step.phase ? (
                                                            <View style={[styles.phasePill, { backgroundColor: accent + '14' }]}>
                                                                <Text style={[styles.phaseText, { color: accent }]}>{step.phase}</Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                    <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                                                </View>
                                                {expanded
                                                    ? <ChevronUp size={17} color={textSecondary} />
                                                    : <ChevronDown size={17} color={textSecondary} />}
                                            </View>
                                            {expanded && (
                                                <View style={styles.stepBody}>
                                                    {step.guidance ? (
                                                        <Text style={[styles.stepGuidance, { color: textSecondary }]}>{step.guidance}</Text>
                                                    ) : null}
                                                    {step.deliverable ? (
                                                        <View style={[styles.deliverableRow, { backgroundColor: subtleBg }]}>
                                                            <Target size={13} color={accent} />
                                                            <Text style={[styles.deliverableText, { color: colors.foreground }]}>
                                                                {step.deliverable}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                    {step.resources.map((resource) => {
                                                        const resMeta = resourceMeta(resource.type);
                                                        const ResIcon = resMeta.icon;
                                                        return (
                                                            <TouchableOpacity
                                                                key={`${step.id}-${resource.id}`}
                                                                style={[styles.resourceRow, { borderColor }]}
                                                                onPress={() => openResource(resource)}
                                                            >
                                                                <View style={[styles.resourceIcon, { backgroundColor: resMeta.color + '16' }]}>
                                                                    <ResIcon size={14} color={resMeta.color} />
                                                                </View>
                                                                <View style={styles.resourceCopy}>
                                                                    <Text style={[styles.resourceTitle, { color: colors.foreground }]} numberOfLines={1}>
                                                                        {resource.title}
                                                                    </Text>
                                                                    <Text style={[styles.resourceHost, { color: textSecondary }]} numberOfLines={1}>
                                                                        {t(resMeta.labelKey)} · {resourceHost(resource.url)}
                                                                    </Text>
                                                                </View>
                                                                <ExternalLink size={13} color={textSecondary} />
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* ---------------------------------------- resource library */}
                    {template.resources.length > 0 && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                                {t('templates.resourceLibrary', { count: template.resources.length })}
                            </Text>
                            <Text style={[styles.sectionHint, { color: textSecondary }]}>{t('templates.resourceLibraryHint')}</Text>
                            <View style={styles.libraryList}>
                                {template.resources.map((resource) => {
                                    const resMeta = resourceMeta(resource.type);
                                    const ResIcon = resMeta.icon;
                                    return (
                                        <TouchableOpacity
                                            key={resource.id}
                                            style={[styles.libraryItem, { backgroundColor: colors.card, borderColor }]}
                                            onPress={() => openResource(resource)}
                                        >
                                            <View style={[styles.resourceIcon, { backgroundColor: resMeta.color + '16' }]}>
                                                <ResIcon size={15} color={resMeta.color} />
                                            </View>
                                            <View style={styles.resourceCopy}>
                                                <Text style={[styles.resourceTitle, { color: colors.foreground }]} numberOfLines={1}>
                                                    {resource.title}
                                                </Text>
                                                <Text style={[styles.resourceHost, { color: textSecondary }]} numberOfLines={1}>
                                                    {t(resMeta.labelKey)} · {resourceHost(resource.url)}
                                                </Text>
                                            </View>
                                            <ExternalLink size={13} color={textSecondary} />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    )}

                    {/* -------------------------------------------- comments */}
                    <View style={styles.section}>
                        <View style={styles.commentsHeader}>
                            <MessageCircle size={16} color={accent} />
                            <Text style={[styles.sectionTitle, styles.commentsTitle, { color: colors.foreground }]}>
                                {t('templates.comments.title', { count: visibleComments.length })}
                            </Text>
                        </View>

                        <View style={[styles.composer, { backgroundColor: colors.card, borderColor }]}>
                            <View style={styles.composerRatingRow}>
                                <Text style={[styles.composerLabel, { color: textSecondary }]}>{t('templates.comments.rateLabel')}</Text>
                                <View style={styles.starsRow}>
                                    {[1, 2, 3, 4, 5].map((position) => (
                                        <TouchableOpacity
                                            key={position}
                                            onPress={() => setCommentRating(position === commentRating ? 0 : position)}
                                            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                                        >
                                            <Star
                                                size={18}
                                                color="#FBBF24"
                                                fill={commentRating >= position ? '#FBBF24' : 'transparent'}
                                            />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                            <View style={styles.composerInputRow}>
                                <TextInput
                                    style={[styles.composerInput, { color: colors.foreground, backgroundColor: subtleBg }]}
                                    placeholder={t('templates.comments.placeholder')}
                                    placeholderTextColor={textSecondary}
                                    value={commentDraft}
                                    onChangeText={setCommentDraft}
                                    multiline
                                    maxLength={1000}
                                />
                                <TouchableOpacity
                                    style={[
                                        styles.sendButton,
                                        { backgroundColor: commentDraft.trim().length >= 2 ? accent : accent + '44' },
                                    ]}
                                    onPress={submitComment}
                                    disabled={postingComment || commentDraft.trim().length < 2}
                                >
                                    {postingComment
                                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                                        : <Send size={16} color="#FFFFFF" />}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {commentsLoading ? (
                            <ActivityIndicator style={styles.commentsLoader} color={colors.primary} />
                        ) : visibleComments.length === 0 ? (
                            <Text style={[styles.emptyComments, { color: textSecondary }]}>{t('templates.comments.empty')}</Text>
                        ) : (
                            <View style={styles.commentsList}>
                                {visibleComments.map((comment) => {
                                    const canModerate = Boolean(comment.authorId) && comment.authorId !== myAuthorId;
                                    return (
                                    <View key={comment.id} style={[styles.commentCard, { backgroundColor: colors.card, borderColor }]}>
                                        <View style={styles.commentHeader}>
                                            <View style={[styles.avatar, styles.commentAvatar, { backgroundColor: avatarColor(comment.authorName) }]}>
                                                <Text style={styles.avatarText}>{initialsOf(comment.authorName)}</Text>
                                            </View>
                                            <View style={styles.commentHeaderCopy}>
                                                <Text style={[styles.commentAuthor, { color: colors.foreground }]} numberOfLines={1}>
                                                    {comment.authorName}
                                                </Text>
                                                <Text style={[styles.commentTime, { color: textSecondary }]}>{timeAgo(comment.createdAt)}</Text>
                                            </View>
                                            {comment.rating ? renderStars(comment.rating) : null}
                                            {canModerate ? (
                                                <TouchableOpacity
                                                    style={styles.commentMenuButton}
                                                    onPress={() => openCommentActions(comment)}
                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                    accessibilityLabel={t('templates.comments.actionsTitle', { defaultValue: 'Comment options' })}
                                                >
                                                    <MoreHorizontal size={16} color={textSecondary} />
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                        <Text style={[styles.commentBody, { color: textSecondary }]}>{comment.body}</Text>
                                    </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                </ScrollView>

                {/* --------------------------------------- sticky action bar */}
                <View
                    style={[
                        styles.actionBar,
                        {
                            backgroundColor: colors.card,
                            borderTopColor: borderColor,
                            paddingBottom: Math.max(insets.bottom, 12),
                        },
                    ]}
                >
                    <TouchableOpacity
                        style={[styles.primaryAction, { backgroundColor: accent }]}
                        onPress={() => startRoadmap(template)}
                        disabled={starting}
                    >
                        {starting
                            ? <ActivityIndicator size="small" color="#FFFFFF" />
                            : <Rocket size={17} color="#FFFFFF" />}
                        <Text style={styles.primaryActionText}>{t('templates.startRoadmap')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconAction, { borderColor }]}
                        onPress={() => exportCalendar(template)}
                        accessibilityLabel={t('templates.calendar')}
                    >
                        <Download size={17} color={colors.foreground} />
                        <Text style={[styles.iconActionText, { color: colors.foreground }]}>{t('templates.calendar')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconAction, { borderColor }]}
                        onPress={() => scheduleReminders(template)}
                        accessibilityLabel={t('templates.reminders')}
                    >
                        <Bell size={17} color={colors.foreground} />
                        <Text style={[styles.iconActionText, { color: colors.foreground }]}>{t('templates.reminders')}</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    missingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
    missingText: { fontSize: 14, fontWeight: '600' },
    missingBack: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
    missingBackText: { fontSize: 13, fontWeight: '800' },
    hero: { minHeight: 328 },
    heroFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    // paddingBottom clears the stats card that floats up over the hero
    // (statsCard marginTop: -24) so a two-line title + author row never sit
    // underneath it.
    heroGradient: { flex: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, justifyContent: 'space-between' },
    backButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(2,6,23,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 36,
    },
    heroBottom: { gap: 9 },
    heroPills: { flexDirection: 'row', gap: 8 },
    heroPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(2,6,23,0.55)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    heroPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
    heroTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900', lineHeight: 28 },
    heroAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    heroAuthorCopy: { flex: 1 },
    heroAuthorName: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
    heroAuthorRole: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 1 },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
    statsCard: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: -24,
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: 13,
        shadowColor: '#020617',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
    },
    statCell: { flex: 1, alignItems: 'center', gap: 3 },
    statDivider: { width: 1, marginVertical: 4 },
    statValue: { fontSize: 13, fontWeight: '900' },
    statLabel: { fontSize: 10, fontWeight: '700' },
    section: { paddingHorizontal: 16, marginTop: 26 },
    sectionTitle: { fontSize: 17, fontWeight: '900' },
    sectionHint: { fontSize: 12, lineHeight: 17, marginTop: 4 },
    summary: { fontSize: 13.5, lineHeight: 20, marginTop: 8 },
    outcomesCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14, gap: 9 },
    outcomesTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
    outcomeRow: { flexDirection: 'row', gap: 8 },
    outcomeIcon: { marginTop: 2 },
    outcomeText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
    timeline: { marginTop: 16 },
    timelineRow: { flexDirection: 'row', gap: 11 },
    timelineRail: { alignItems: 'center', width: 32 },
    stepNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepNumberText: { fontSize: 13, fontWeight: '900' },
    railLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1 },
    stepCard: {
        flex: 1,
        borderWidth: 1,
        borderRadius: 18,
        padding: 13,
        marginBottom: 14,
    },
    stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    stepHeaderCopy: { flex: 1 },
    stepMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    stepWeek: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },
    phasePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
    phaseText: { fontSize: 9.5, fontWeight: '900' },
    stepTitle: { fontSize: 14.5, fontWeight: '900', lineHeight: 19 },
    stepBody: { marginTop: 10, gap: 9 },
    stepGuidance: { fontSize: 13, lineHeight: 20 },
    deliverableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    deliverableText: { flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    resourceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 9,
    },
    resourceIcon: {
        width: 32,
        height: 32,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resourceCopy: { flex: 1 },
    resourceTitle: { fontSize: 12.5, fontWeight: '800' },
    resourceHost: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    libraryList: { marginTop: 14, gap: 9 },
    libraryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 11,
    },
    commentsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    commentsTitle: { flex: 1 },
    composer: { borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 14 },
    composerRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
    composerLabel: { fontSize: 12, fontWeight: '700' },
    composerInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
    composerInput: {
        flex: 1,
        minHeight: 42,
        maxHeight: 110,
        borderRadius: 13,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
    },
    sendButton: {
        width: 42,
        height: 42,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    starsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    commentsLoader: { marginTop: 18 },
    emptyComments: { fontSize: 12.5, lineHeight: 18, marginTop: 14 },
    commentsList: { marginTop: 14, gap: 10 },
    commentCard: { borderWidth: 1, borderRadius: 16, padding: 12 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    commentAvatar: { width: 30, height: 30, borderRadius: 15 },
    commentHeaderCopy: { flex: 1 },
    commentAuthor: { fontSize: 12.5, fontWeight: '800' },
    commentTime: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
    commentMenuButton: { paddingLeft: 6, paddingVertical: 2 },
    commentBody: { fontSize: 12.5, lineHeight: 19, marginTop: 8 },
    actionBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    primaryAction: {
        flex: 1,
        minHeight: 48,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryActionText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
    iconAction: {
        minHeight: 48,
        borderWidth: 1,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 13,
        gap: 2,
    },
    iconActionText: { fontSize: 9.5, fontWeight: '800' },
});
