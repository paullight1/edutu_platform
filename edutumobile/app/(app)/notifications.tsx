import React, { useMemo, useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    Image,
    ScrollView
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Bell,
    BellRing,
    Target,
    Award,
    Users,
    AlertTriangle,
    Trash2,
    Calendar,
    Settings,
    Lock,
    Newspaper,
    ChevronRight
} from 'lucide-react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { supabase } from '../../lib/supabase';
import { useNotifications } from '@edutu/core/src/hooks/useNotifications';
import { AppNotification } from '@edutu/core/src/types/notification';
import { useTheme } from '../../components/context/ThemeContext';
import { notificationService } from '../../lib/notifications';
import { BrandedLoader } from '../../components/ui/BrandedLoader';
import { useTranslation } from 'react-i18next';
import { fetchNewsPosts, EDUTU_BLOG_BASE_URL, type NewsPost } from '../../lib/news';

export default function NotificationsScreen() {
    const { t } = useTranslation('home');
    const { getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const {
        notifications,
        unreadCount,
        isLoading,
        markAsRead,
        deleteNotification
    } = useNotifications(supabase, user?.id || null, getToken);

    // Track previous unread count for haptic feedback
    const [prevUnreadCount, setPrevUnreadCount] = useState(0);

    // Trending news — published Edutu blog posts (global opportunities,
    // deadlines round-ups, tips). Best-effort: the section hides on failure.
    const [news, setNews] = useState<NewsPost[]>([]);
    useEffect(() => {
        let cancelled = false;
        fetchNewsPosts(6)
            .then(posts => { if (!cancelled) setNews(posts); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    const openNewsPost = async (url: string) => {
        await notificationService.triggerHaptic('light');
        WebBrowser.openBrowserAsync(url).catch(() => undefined);
    };

    // Trigger haptic when new notifications arrive
    useEffect(() => {
        if (unreadCount > prevUnreadCount && prevUnreadCount > 0) {
            notificationService.notify({ haptic: 'medium' });
        }
        setPrevUnreadCount(unreadCount);
    }, [unreadCount]);

    const backgroundColor = colors.background;
    const textPrimary = colors.foreground;
    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const shouldPromptForPassword = Boolean(
        user &&
        !user.passwordEnabled &&
        user.externalAccounts.some(account => ['google', 'apple'].includes(String(account.provider)))
    );

    const filteredNotifications = useMemo(() => {
        const passwordPrompt: AppNotification[] = shouldPromptForPassword ? [{
            id: 'local-password-setup',
            kind: 'system',
            title: t('notifications.passwordPromptTitle'),
            body: t('notifications.passwordPromptBody'),
            severity: 'info',
            metadata: { actionRoute: '/profile/settings' },
            createdAt: new Date().toISOString(),
            readAt: null,
        }] : [];

        return [...passwordPrompt, ...notifications].filter(n => filter === 'unread' ? !n.readAt : true);
    }, [notifications, filter, shouldPromptForPassword, t]);

    const getIcon = (kind: AppNotification['kind']) => {
        const size = 18;
        switch (kind) {
            case 'goal-reminder': return <Target size={size} color="#6366f1" />;
            case 'goal-weekly-digest': return <Calendar size={size} color="#4f46e5" />;
            case 'goal-progress': return <Award size={size} color="#10b981" />;
            case 'opportunity-highlight': return <Users size={size} color="#3b82f6" />;
            case 'opportunity-alert': return <BellRing size={size} color="#10b981" />;
            case 'admin-broadcast': return <AlertTriangle size={size} color="#f59e0b" />;
            case 'system': return <Lock size={size} color="#2563EB" />;
            default: return <Bell size={size} color="#94A3B8" />;
        }
    };

    const handleMarkAsRead = async (id: string, item?: AppNotification) => {
        if (id === 'local-password-setup') {
            router.push('/profile/settings');
            return;
        }

        await markAsRead(id);
        await notificationService.triggerHaptic('light');

        // Alert-style notifications deep-link to their target (opportunity
        // detail, saved searches) via metadata.url — same contract as push.
        const url = item?.metadata?.url;
        if (typeof url === 'string' && url.startsWith('/')) {
            router.push(url as never);
        }
    };

    const handleDelete = async (id: string) => {
        if (id === 'local-password-setup') {
            router.push('/profile/settings');
            return;
        }

        await deleteNotification(id);
        await notificationService.triggerHaptic('medium');
    };

    const renderNotification = ({ item }: { item: AppNotification }) => {
        const isUnread = !item.readAt;
        return (
            <TouchableOpacity
                onPress={() => handleMarkAsRead(item.id, item)}
                style={[
                    styles.notificationCard,
                    {
                        backgroundColor: isUnread ? 'rgba(99,102,241,0.1)' : cardBg,
                        borderColor: isUnread ? 'rgba(99,102,241,0.2)' : borderColor
                    }
                ]}
            >
                {isUnread && <View style={styles.unreadIndicator} />}

                <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                    {getIcon(item.kind)}
                </View>

                <View style={styles.contentContainer}>
                    <View style={styles.headerRow}>
                        <Text style={[styles.title, { color: isUnread ? textPrimary : textSecondary }]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text style={styles.date}>
                            {new Date(item.createdAt).toLocaleDateString()}
                        </Text>
                    </View>
                    <Text style={[styles.body, { color: isUnread ? (isDark ? '#CBD5E1' : '#475569') : textSecondary }]} numberOfLines={2}>
                        {item.body}
                    </Text>

                    <View style={styles.actions}>
                        {item.id === 'local-password-setup' ? (
                            <TouchableOpacity
                                onPress={() => router.push('/profile/settings')}
                                style={styles.actionBtn}
                            >
                                <Text style={styles.actionText}>{t('notifications.setPassword')}</Text>
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                            onPress={() => handleDelete(item.id)}
                            style={styles.deleteBtn}
                        >
                            <Trash2 size={14} color="#ef4444" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor }} edges={['top', 'left', 'right']}>
            <ScreenHeader
                title={t('notifications.title')}
                showBack
                right={
                    <TouchableOpacity
                        onPress={() => router.push('/profile/settings')}
                        style={styles.settingsBtn}
                    >
                        <Settings size={20} color={textSecondary} />
                    </TouchableOpacity>
                }
            />

            <View style={styles.container}>
                {/* Filter Tabs */}
                <View style={[styles.filterContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]}>
                    <TouchableOpacity
                        onPress={() => setFilter('all')}
                        style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                    >
                        <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                            {t('notifications.filterAll')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilter('unread')}
                        style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
                    >
                        <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
                            {t('notifications.filterUnread', { count: unreadCount })}
                        </Text>
                    </TouchableOpacity>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <BrandedLoader label={t('notifications.loading')} />
                    </View>
                ) : (
                    <FlatList
                        data={filteredNotifications}
                        keyExtractor={item => item.id}
                        renderItem={renderNotification}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContent}
                        ListHeaderComponent={
                            news.length > 0 ? (
                                <View style={styles.newsSection}>
                                    <View style={styles.newsHeader}>
                                        <View style={styles.newsHeaderLeft}>
                                            <Newspaper size={16} color="#6366F1" />
                                            <Text style={[styles.newsHeaderTitle, { color: textPrimary }]}>
                                                {t('notifications.newsTitle', { defaultValue: 'Trending news' })}
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() => void openNewsPost(EDUTU_BLOG_BASE_URL)}
                                            style={styles.newsSeeAll}
                                        >
                                            <Text style={styles.newsSeeAllText}>
                                                {t('notifications.newsSeeAll', { defaultValue: 'See all' })}
                                            </Text>
                                            <ChevronRight size={14} color="#6366F1" />
                                        </TouchableOpacity>
                                    </View>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.newsScroll}
                                    >
                                        {news.map(post => (
                                            <TouchableOpacity
                                                key={post.id}
                                                onPress={() => void openNewsPost(post.url)}
                                                activeOpacity={0.8}
                                                style={[styles.newsCard, { backgroundColor: cardBg, borderColor }]}
                                            >
                                                {post.coverImage ? (
                                                    <Image
                                                        source={{ uri: post.coverImage }}
                                                        style={styles.newsImage}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <View style={[styles.newsImage, styles.newsImageFallback]}>
                                                        <Newspaper size={22} color="#818CF8" />
                                                    </View>
                                                )}
                                                <View style={styles.newsCardBody}>
                                                    {post.category ? (
                                                        <Text style={styles.newsCategory} numberOfLines={1}>
                                                            {post.category.toUpperCase()}
                                                        </Text>
                                                    ) : null}
                                                    <Text
                                                        style={[styles.newsTitle, { color: textPrimary }]}
                                                        numberOfLines={2}
                                                    >
                                                        {post.title}
                                                    </Text>
                                                    <Text style={[styles.newsDate, { color: textSecondary }]}>
                                                        {post.publishedAt
                                                            ? new Date(post.publishedAt).toLocaleDateString()
                                                            : ''}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            ) : null
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Bell size={48} color={textSecondary} />
                                <Text style={[styles.emptyTitle, { color: textPrimary }]}>{t('notifications.emptyTitle')}</Text>
                                <Text style={[styles.emptySubtitle, { color: textSecondary }]}>{t('notifications.emptySubtitle')}</Text>
                            </View>
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 20,
    },
    settingsBtn: {
        padding: 8,
    },
    filterContainer: {
        flexDirection: 'row',
        marginVertical: 16,
        padding: 4,
        borderRadius: 12,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    filterTabActive: {
        backgroundColor: '#FFFFFF',
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    filterTextActive: {
        color: '#0F172A',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingBottom: 40,
    },
    notificationCard: {
        flexDirection: 'row',
        padding: 16,
        marginBottom: 12,
        borderRadius: 16,
        borderWidth: 1,
        position: 'relative',
    },
    unreadIndicator: {
        position: 'absolute',
        left: 0,
        top: 16,
        bottom: 16,
        width: 3,
        backgroundColor: '#6366F1',
        borderRadius: 2,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    title: {
        fontSize: 14,
        fontWeight: '700',
        flex: 1,
        marginRight: 8,
    },
    date: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '500',
    },
    body: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 8,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 10,
    },
    actionBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: '#2563EB',
    },
    actionText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
    },
    deleteBtn: {
        padding: 6,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    newsSection: {
        marginBottom: 16,
    },
    newsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    newsHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    newsHeaderTitle: {
        fontSize: 15,
        fontWeight: '800',
    },
    newsSeeAll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    newsSeeAllText: {
        color: '#6366F1',
        fontSize: 12,
        fontWeight: '700',
    },
    newsScroll: {
        gap: 12,
        paddingRight: 8,
    },
    newsCard: {
        width: 220,
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    newsImage: {
        width: '100%',
        height: 100,
    },
    newsImageFallback: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(99,102,241,0.12)',
    },
    newsCardBody: {
        padding: 12,
    },
    newsCategory: {
        color: '#6366F1',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
        marginBottom: 4,
    },
    newsTitle: {
        fontSize: 13,
        fontWeight: '700',
        lineHeight: 18,
    },
    newsDate: {
        fontSize: 11,
        marginTop: 6,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        marginTop: 8,
    },
});
