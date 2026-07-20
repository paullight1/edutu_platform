import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronRight,
    User,
    MapPin,
    GraduationCap,
    Edit3,
    Target,
    CheckCircle2,
    Calendar,
    BadgeCheck,
    Briefcase,
} from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTheme } from '../../../components/context/ThemeContext';
import { supabase } from '../../../lib/supabase';
import { toSafeUUID } from '@edutu/core/src/utils/auth';
import { fetchProfile, type BackendProfile } from '@edutu/core/src/services/profile';
import { useOpportunities } from '@edutu/core/src/hooks/useOpportunities';
import { useProStatus } from '@edutu/core/src/hooks/useProStatus';
import i18n from '../../../lib/i18n';

function getUserLookupIds(userId: string): string[] {
    return Array.from(new Set([userId, toSafeUUID(userId)]));
}

function formatProfileDeadline(deadline?: string | null): string {
    if (!deadline) return i18n.t('profile:view.deadline.none');

    const dueDate = new Date(deadline);
    if (Number.isNaN(dueDate.getTime())) return i18n.t('profile:view.deadline.none');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((dueDay.getTime() - today.getTime()) / 86400000);
    if (diffDays <= 0) return i18n.t('profile:view.deadline.today');
    if (diffDays === 1) return i18n.t('profile:view.deadline.tomorrow');
    if (diffDays <= 7) return i18n.t('profile:view.deadline.days', { count: diffDays });

    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const APPLICATION_STATUS_COLORS: Record<string, string> = {
    draft: '#64748B',
    submitted: '#3B82F6',
    interview: '#8B5CF6',
    offer: '#10B981',
    rejected: '#EF4444',
    withdrawn: '#94A3B8',
};

type AppliedRow = {
    id: string;
    status: string;
    title: string;
    opportunityId: string | null;
};

function ProfileStatCard({
    title,
    value,
    icon: Icon,
    colors,
    onPress,
}: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    colors: [string, string];
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={styles.statCard}>
            <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statGradient}>
                <View style={styles.statGhostIcon}>
                    <Icon size={42} color="rgba(255,255,255,0.16)" strokeWidth={1.5} />
                </View>
                <Text style={styles.statTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
            </LinearGradient>
        </TouchableOpacity>
    );
}

/**
 * Full profile detail screen. The profile tab shows only a compact line card;
 * everything about the user — identity, quick stats, applied opportunities —
 * lives here.
 */
export default function ProfileViewScreen() {
    const { isDark, colors } = useTheme();
    const { user } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation('profile');

    const textSecondary = isDark ? '#94A3B8' : '#64748B';
    const { isPro } = useProStatus(supabase, user?.id || null);
    const [savedProfile, setSavedProfile] = useState<BackendProfile | null>(null);
    const [appliedRows, setAppliedRows] = useState<AppliedRow[]>([]);
    const [profileStats, setProfileStats] = useState({
        activeGoals: 0,
        completedGoals: 0,
        appliedOpps: 0,
        nextDeadline: formatProfileDeadline(null),
    });

    const { data: matchedOpportunities } = useOpportunities({
        supabase,
        userId: user?.id,
        getAuthToken: getToken,
    });

    const userId = user?.id;
    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            const loadSavedProfile = async () => {
                if (!userId) return;
                const data = await fetchProfile(getToken);
                if (data && !cancelled) setSavedProfile(data);
            };
            loadSavedProfile();
            return () => {
                cancelled = true;
            };
        }, [userId, getToken])
    );

    useEffect(() => {
        const fetchProfileStats = async () => {
            if (!user) return;

            try {
                const lookupIds = getUserLookupIds(user.id);
                const { data: goalRows } = await supabase
                    .from('goals')
                    .select('id, title, status, progress, deadline')
                    .in('user_id', lookupIds);

                const goals = goalRows || [];
                const activeGoals = goals.filter((goal: any) =>
                    goal.status === 'active' && Number(goal.progress || 0) < 100
                );
                const completedGoals = goals.filter((goal: any) =>
                    goal.status === 'completed' || Number(goal.progress || 0) >= 100
                );

                // Recent applications, hydrated with opportunity titles so the
                // "Applied opportunities" section reads like a real history.
                const { data: applications, count: appliedCount } = await supabase
                    .from('opportunity_applications')
                    .select('id, status, opportunity_id, updated_at', { count: 'exact' })
                    .in('user_id', lookupIds)
                    .order('updated_at', { ascending: false })
                    .limit(5);

                const applicationRows = applications || [];
                const opportunityIds = Array.from(
                    new Set(applicationRows.map((row: any) => row.opportunity_id).filter(Boolean))
                );
                let titleById = new Map<string, string>();
                if (opportunityIds.length > 0) {
                    const { data: appliedOpps } = await supabase
                        .from('opportunities')
                        .select('id, title')
                        .in('id', opportunityIds);
                    titleById = new Map((appliedOpps || []).map((opp: any) => [opp.id, opp.title]));
                }
                setAppliedRows(
                    applicationRows.map((row: any) => ({
                        id: row.id,
                        status: row.status || 'draft',
                        title: titleById.get(row.opportunity_id) || t('view.applied.untitled', { defaultValue: 'Opportunity' }),
                        opportunityId: row.opportunity_id ?? null,
                    }))
                );

                const { data: bookmarks } = await supabase
                    .from('bookmarks')
                    .select('opportunity_id')
                    .in('user_id', lookupIds);

                const uniqueBookmarkIds = Array.from(new Set(bookmarks?.map((bookmark: any) => bookmark.opportunity_id) || []));
                let nextDeadline = formatProfileDeadline(null);

                if (uniqueBookmarkIds.length > 0) {
                    const { data: opps } = await supabase
                        .from('opportunities')
                        .select('title, deadline, close_date')
                        .in('id', uniqueBookmarkIds)
                        .limit(100);

                    const nextSavedDeadline = (opps || [])
                        .map((opp: any) => ({ ...opp, due: opp.deadline || opp.close_date }))
                        .filter((opp: any) => opp.due && new Date(opp.due).getTime() >= Date.now())
                        .sort((a: any, b: any) => new Date(a.due).getTime() - new Date(b.due).getTime())[0];

                    nextDeadline = formatProfileDeadline(nextSavedDeadline?.due);
                }

                setProfileStats({
                    activeGoals: activeGoals.length,
                    completedGoals: completedGoals.length,
                    appliedOpps: appliedCount || 0,
                    nextDeadline,
                });
            } catch (error) {
                console.error('Failed to fetch profile stats:', error);
            }
        };

        fetchProfileStats();
    }, [user, t]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
            <ScreenHeader title={t('view.myProfile', { defaultValue: 'My Profile' })} showBack />
            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
            >
                {/* Identity card */}
                <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarSection}>
                            {user?.imageUrl ? (
                                <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
                            ) : (
                                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                                    <User size={40} color="#fff" />
                                </View>
                            )}
                            <TouchableOpacity
                                style={[styles.editAvatarBtn, { backgroundColor: colors.primary }]}
                                onPress={() => router.push('/profile/edit')}
                            >
                                <Edit3 size={14} color="#fff" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.userInfo}>
                            <View style={styles.userNameRow}>
                                <Text style={[styles.userName, { color: colors.foreground }]}>
                                    {user?.fullName || t('view.userFallback')}
                                </Text>
                                {isPro && (
                                    <BadgeCheck
                                        size={20}
                                        color="#FFFFFF"
                                        fill="#3B82F6"
                                        accessibilityLabel={t('view.verified')}
                                    />
                                )}
                            </View>
                            <Text style={[styles.userEmail, { color: textSecondary }]}>
                                {user?.primaryEmailAddress?.emailAddress || ''}
                            </Text>
                        </View>
                    </View>

                    <View style={[styles.infoRow, { borderTopColor: colors.border }]}>
                        <View style={styles.infoItem}>
                            <MapPin size={16} color={textSecondary} />
                            <Text style={[styles.infoText, { color: textSecondary }]}>
                                {savedProfile?.country || (user?.unsafeMetadata?.country as string) || t('view.notSet')}
                            </Text>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoItem}>
                            <GraduationCap size={16} color={textSecondary} />
                            <Text style={[styles.infoText, { color: textSecondary }]}>
                                {savedProfile?.major || savedProfile?.school || (user?.unsafeMetadata?.education as string) || t('view.studentFallback')}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.editProfileBtn, { backgroundColor: colors.primary }]}
                        onPress={() => router.push('/profile/edit')}
                    >
                        <Edit3 size={16} color="#fff" />
                        <Text style={styles.editProfileText}>{t('view.editProfile')}</Text>
                    </TouchableOpacity>
                </View>

                {/* Quick stats */}
                <View style={styles.statsSection}>
                    <View style={styles.statsGrid}>
                        <ProfileStatCard
                            title={t('view.stats.activeGoals')}
                            value={String(profileStats.activeGoals)}
                            icon={Target}
                            colors={['#3B4FE4', '#6366F1']}
                            onPress={() => router.push('/goals')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.matches')}
                            value={String(matchedOpportunities.length)}
                            icon={Target}
                            colors={['#2563eb', '#3b82f6']}
                            onPress={() => router.push('/opportunities')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.applied')}
                            value={String(profileStats.appliedOpps)}
                            icon={CheckCircle2}
                            colors={['#059669', '#10B981']}
                            onPress={() => router.push('/applied')}
                        />
                        <ProfileStatCard
                            title={t('view.stats.deadline')}
                            value={profileStats.nextDeadline}
                            icon={Calendar}
                            colors={['#D97706', '#F59E0B']}
                            onPress={() => router.push('/deadlines')}
                        />
                    </View>
                </View>

                {/* Applied opportunities */}
                <Animated.View entering={FadeInDown.duration(320)} style={styles.appliedSection}>
                    <View style={styles.appliedHeader}>
                        <Text style={[styles.groupTitle, { color: textSecondary }]}>
                            {t('view.applied.title', { defaultValue: 'Applied opportunities' })}
                        </Text>
                        {appliedRows.length > 0 && (
                            <TouchableOpacity onPress={() => router.push('/applied')} activeOpacity={0.7}>
                                <Text style={[styles.appliedViewAll, { color: colors.primary }]}>
                                    {t('view.applied.viewAll', { defaultValue: 'View all' })}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={[styles.menuCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        {appliedRows.length === 0 ? (
                            <View style={styles.appliedEmpty}>
                                <Briefcase size={20} color={textSecondary} />
                                <Text style={[styles.appliedEmptyText, { color: textSecondary }]}>
                                    {t('view.applied.empty', { defaultValue: 'Nothing tracked yet — apply to your first opportunity and it will show up here.' })}
                                </Text>
                            </View>
                        ) : (
                            appliedRows.map((row, idx) => (
                                <TouchableOpacity
                                    key={row.id}
                                    activeOpacity={0.6}
                                    onPress={() =>
                                        row.opportunityId
                                            ? router.push(`/opportunities/${row.opportunityId}` as any)
                                            : router.push('/applied')
                                    }
                                    style={[
                                        styles.appliedRow,
                                        idx < appliedRows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.appliedStatusDot,
                                            { backgroundColor: APPLICATION_STATUS_COLORS[row.status] || '#64748B' },
                                        ]}
                                    />
                                    <Text style={[styles.appliedTitle, { color: colors.foreground }]} numberOfLines={1}>
                                        {row.title}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.appliedStatus,
                                            { color: APPLICATION_STATUS_COLORS[row.status] || textSecondary },
                                        ]}
                                    >
                                        {row.status}
                                    </Text>
                                    <ChevronRight size={14} color={textSecondary} />
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: {
        paddingTop: 16,
        paddingHorizontal: 20,
    },
    profileCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
    },
    profileHeader: { alignItems: 'center' },
    avatarSection: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    editAvatarBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    userInfo: { alignItems: 'center' },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    userName: { fontSize: 22, fontWeight: '600' },
    userEmail: { fontSize: 14 },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    infoText: { fontSize: 13, marginLeft: 6 },
    infoDivider: {
        width: 1,
        height: 20,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    editProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    editProfileText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    statsSection: { marginBottom: 24 },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statCard: {
        width: '48%',
        height: 96,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    statGradient: {
        flex: 1,
        justifyContent: 'center',
        padding: 14,
        gap: 8,
    },
    statGhostIcon: {
        position: 'absolute',
        right: -10,
        bottom: -10,
        transform: [{ rotate: '-8deg' }],
    },
    statTitle: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 9,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 25,
        fontWeight: '900',
    },
    appliedSection: { marginBottom: 24 },
    appliedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    appliedViewAll: {
        fontSize: 12,
        fontWeight: '700',
    },
    groupTitle: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    menuCard: {
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
    },
    appliedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
    },
    appliedStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    appliedTitle: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
    },
    appliedStatus: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'capitalize',
    },
    appliedEmpty: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
    },
    appliedEmptyText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
    },
});
