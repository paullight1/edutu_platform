import React, { useMemo, useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Bell,
    Target,
    Award,
    Users,
    AlertTriangle,
    Trash2,
    Calendar,
    Settings,
    Lock
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

export default function NotificationsScreen() {
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
            title: 'Add a password to your account',
            body: 'You signed in with Google or Apple. Add a password so you can also sign in with email if you forget which option you used.',
            severity: 'info',
            metadata: { actionRoute: '/profile/settings' },
            createdAt: new Date().toISOString(),
            readAt: null,
        }] : [];

        return [...passwordPrompt, ...notifications].filter(n => filter === 'unread' ? !n.readAt : true);
    }, [notifications, filter, shouldPromptForPassword]);

    const getIcon = (kind: AppNotification['kind']) => {
        const size = 18;
        switch (kind) {
            case 'goal-reminder': return <Target size={size} color="#6366f1" />;
            case 'goal-weekly-digest': return <Calendar size={size} color="#4f46e5" />;
            case 'goal-progress': return <Award size={size} color="#10b981" />;
            case 'opportunity-highlight': return <Users size={size} color="#3b82f6" />;
            case 'admin-broadcast': return <AlertTriangle size={size} color="#f59e0b" />;
            case 'system': return <Lock size={size} color="#2563EB" />;
            default: return <Bell size={size} color="#94A3B8" />;
        }
    };

    const handleMarkAsRead = async (id: string) => {
        if (id === 'local-password-setup') {
            router.push('/profile/settings');
            return;
        }

        await markAsRead(id);
        await notificationService.triggerHaptic('light');
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
                onPress={() => handleMarkAsRead(item.id)}
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
                                <Text style={styles.actionText}>Set password</Text>
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
                title="Notifications"
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
                            All
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilter('unread')}
                        style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
                    >
                        <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
                            Unread ({unreadCount})
                        </Text>
                    </TouchableOpacity>
                </View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <BrandedLoader label="Loading notifications..." />
                    </View>
                ) : (
                    <FlatList
                        data={filteredNotifications}
                        keyExtractor={item => item.id}
                        renderItem={renderNotification}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Bell size={48} color={textSecondary} />
                                <Text style={[styles.emptyTitle, { color: textPrimary }]}>No Notifications</Text>
                                <Text style={[styles.emptySubtitle, { color: textSecondary }]}>You're all caught up!</Text>
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
